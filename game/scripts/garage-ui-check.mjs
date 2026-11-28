import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/garage-ui-check.mjs <dev-server-url>');
const garage = async (page, tab) => {
  if (await page.locator('.town-page [data-town-go=back]').count()) await page.locator('.town-page [data-town-go=back]').click();
  await page.locator('.town-page [data-town-go=garage]').click();
  await page.locator(`.town-page [data-garage-tab="${tab}"]`).click();
};
const { browser } = await launchChromium(chromium);

const read = (page) => page.evaluate(() => ({
  selected: [...document.querySelectorAll('.inv-item.selected')].map(n => n.title.split('\n')[0]),
  inspect: document.querySelector('.inv-inspection:not(:has(.idle))')?.innerText.split('\n')[0] ?? '',
  cards: document.querySelectorAll('.town-shop .part-row').length,
  compares: [...document.querySelectorAll('.town-shop .card-compare')].map(n => n.innerText),
  deltas: document.querySelectorAll('.town-shop .part-row .delta').length,
  chips: [...document.querySelectorAll('.town-page .ink-chips .chip')].map(n => n.title || n.innerText),
  repair: document.querySelector('.town-repair')?.innerText ?? '',
}));

const trucksLayout = (page) => page.evaluate(async () => {
  const { garageChassis } = await import('/src/sim/economy.ts');
  const { townNear } = await import('/src/sim/sites.ts');
  const shop = document.querySelector('.town-shop');
  const body = shop.querySelector('.shop-body');
  const view = body.getBoundingClientRect();
  const rows = [...document.querySelectorAll('.truck-rows .part-row')];
  const inView = (n) => {
    const b = n.getBoundingClientRect();
    return b.top >= view.top - 1 && b.bottom <= view.bottom + 1;
  };
  const scrolling = [...document.querySelectorAll('.truck-rows *')].filter((n) => /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1).map((n) => n.className);
  return {
    count: rows.length,
    lineup: garageChassis(townNear(window.__ROAM__.state).id).length,
    ids: rows.map((r) => r.dataset.partRow),
    seen: rows.filter((r) => inView(r.querySelector('.part-name b')) && (!r.querySelector('.part-line > button:not(.part-sum)') || inView(r.querySelector('.part-line > button:not(.part-sum)')))).length,
    scrolling,
    shopScroll: shop.scrollWidth, shopClient: shop.clientWidth,
    docScroll: document.documentElement.scrollWidth, innerWidth,
  };
});
const assertNoScroll = (r, spot) => {
  assert(r.shopScroll <= r.shopClient + 1, `${spot}: shop scrolls sideways (${r.shopScroll} > ${r.shopClient})`);
  assert(r.docScroll <= r.innerWidth, `${spot}: page overflows sideways (${r.docScroll} > ${r.innerWidth})`);
};
const checkTrucks = async (page, spot, tall) => {
  const r = await trucksLayout(page);
  assert(r.count > 0 && r.count === r.lineup, `${spot}: expected one row per lineup truck (${r.lineup}), got ${r.count}`);
  assert.deepEqual(r.scrolling, [], `${spot}: nothing inside a truck row may scroll`);
  if (tall) assert.equal(r.seen, r.count, `${spot}: every truck row must show without scrolling, saw ${r.seen} of ${r.count}`);
  else assert(r.seen >= Math.min(5, r.count), `${spot}: at least 5 truck rows must show, saw ${r.seen}`);
  assertNoScroll(r, `${spot} Trucks`);
};
const checkBukhanka = async (page, spot) => {
  await page.evaluate(() => { document.querySelector('.town-shop .shop-body').scrollTop = 1e6; });
  const row = page.locator('.truck-rows [data-part-row="bukhanka"]');
  await row.waitFor();
  const look = await row.evaluate((r) => {
    const view = document.querySelector('.town-shop .shop-body').getBoundingClientRect();
    const swap = r.querySelector('.part-line > button:not(.part-sum)');
    const b = swap.getBoundingClientRect();
    return { name: r.querySelector('.part-name b').innerText, swap: swap.innerText, inView: b.top >= view.top - 1 && b.bottom <= view.bottom + 1 };
  });
  assert.equal(look.name, 'Bukhanka', `${spot}: the Bukhanka row must carry its name`);
  assert(look.inView && /\d/.test(look.swap), `${spot}: the Bukhanka Swap and price must be reachable, got ${JSON.stringify(look)}`);
  await row.locator('.part-sum').click();
  await page.waitForTimeout(400);
  const open = await row.evaluate((r) => {
    const view = document.querySelector('.town-shop .shop-body').getBoundingClientRect();
    const detail = r.querySelector('.part-detail');
    const d = detail.getBoundingClientRect();
    return {
      stats: detail.querySelectorAll('.stat').length,
      parts: ['.truck-pics .chassis-portrait', '.truck-pics .chassis-map', '.chassis-feature'].map((q) => !!detail.querySelector(q)),
      inView: d.top >= view.top - 1 && d.bottom <= view.bottom + 1,
      openRows: document.querySelectorAll('.truck-rows .part-sum[aria-expanded="true"]').length,
    };
  });
  assert.equal(open.stats, 7, `${spot}: the open row must keep the full stat grid, got ${open.stats}`);
  assert(open.parts.every(Boolean) && open.inView && open.openRows === 1, `${spot}: the open Bukhanka row must show whole, got ${JSON.stringify(open)}`);
  assert.deepEqual((await trucksLayout(page)).scrolling, [], `${spot}: an open truck row must not scroll`);
  await page.evaluate(async () => {
    const { setMoney } = await import('/src/sim/cheats.ts');
    window.__ROAM__.apply(setMoney(window.__ROAM__.state, 1e6));
  });
  await page.waitForTimeout(300);
  await row.locator('.part-line > button:not(.part-sum)').click();
  await page.waitForTimeout(500);
  const own = await page.evaluate(() => {
    const w = window.__ROAM__.state;
    const mine = w.vehicles.find((v) => v.id === w.player.vehicleId);
    return { chassis: mine.chassisId, tag: document.querySelector('.truck-rows [data-part-row="bukhanka"] .part-line > .tag')?.innerText };
  });
  assert.equal(own.chassis, 'bukhanka', `${spot}: Swap on the Bukhanka row must make the player drive one`);
  assert.equal(own.tag, 'Your truck', `${spot}: the Bukhanka row must read Your truck after the swap`);
};

async function enter(page, spot) {
  await page.evaluate(async (id) => {
    const g = window.__ROAM__;
    const c = await import('/src/sim/cheats.ts');
    const { setWorldVar } = await import('/src/sim/quests.ts');
    const { TOWN_SCENES } = await import('/src/data/quests.ts');
    for (const scene of TOWN_SCENES) setWorldVar(g.state, scene.gate, true);
    g.state.player.quests.session = null;
    g.state.player.quests.live = null;
    let w = c.teleport(g.state, c.placeSpot(g.state, id));
    if (id === 'nose' || id === 'bowl') {
      const guns = (x) => x.vehicles.find(v => v.id === x.player.vehicleId).items.filter(i => i.kind === 'part' && i.part.defId && /gun|cannon|rifle|turret|shotgun/i.test(i.part.defId)).length;
      for (let i = 0; i < 40 && !guns(w); i++) w = c.randomKit(w, 5);
    }
    g.apply(w);
    g.screens.town.open();
  }, spot);
  await page.waitForSelector('.town-page [data-town-go]', { timeout: 90000 });
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 730 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(playUrl(url));
  await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: 120000 });
  for (const spot of ['nose', 'bowl']) {
    await enter(page, spot);
    await garage(page, 'buyParts');
    const gun = () => page.locator('.inv-item.mounted', { hasText: /turret|rifle|cannon|shotgun|MG/i }).first();
    await gun().click();
    await page.waitForTimeout(500);
    let r = await read(page);
    assert.equal(r.selected.length, 1, `${spot}: a click must select the mounted weapon`);
    assert(r.inspect.includes(r.selected[0].split(' (')[0]), `${spot}: inspection must name the selection`);
    assert(r.cards > 0 && r.deltas > 0, `${spot}: compact rows must show deltas`);
    await page.locator('.town-shop .part-sum').first().click();
    r = await read(page);
    assert(r.compares.length === 1 && r.compares[0].includes(r.inspect), `${spot}: an opened row must compare with ${r.inspect}`);
    await page.locator('.town-shop .part-sum').first().click();
    await gun().click();
    await page.waitForTimeout(700);
    r = await read(page);
    if (/wheel/i.test(r.inspect)) {
      await gun().click();
      await page.waitForTimeout(700);
      r = await read(page);
    }
    assert.equal(r.compares.length, 0, `${spot}: clearing the selection must clear the comparison`);
    assert.equal(r.inspect, '', `${spot}: clearing must reset the inspection`);
    await gun().focus();
    r = await read(page);
    assert.equal(r.inspect, '', `${spot}: focus alone must not change the inspection`);
    assert.equal(r.compares.length, 0, `${spot}: focus alone must not compare`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    r = await read(page);
    assert(r.deltas > 0, `${spot}: Enter must select and compare`);
    assert(!r.chips.includes('Free cargo cells'), `${spot}: garage header must not show free cells`);
    assert(r.chips.includes('Mass against rated load'), `${spot}: header must keep the mass chip`);
    assert(r.chips.some(c => /^[\d,]+$/.test(c)), `${spot}: header must keep the money chip`);
    assert(!r.repair.includes('Nothing broken'), `${spot}: no idle Nothing broken label`);
    await page.evaluate(async () => {
      const g = window.__ROAM__;
      const w = (await import('/src/sim/world.ts')).cloneWorld(g.state);
      const me = w.vehicles.find(v => v.id === w.player.vehicleId) ?? w.vehicles[0];
      const part = me.items.find(i => i.kind === 'part' && i.part.hp > 0 && i.part.defId !== undefined);
      part.part.hp = 0;
      g.apply(w);
    });
    await page.waitForTimeout(300);
    r = await read(page);
    assert(/Repair basics\s+\d+\s+Repair all\s+\d+/i.test(r.repair), `${spot}: repair bar must show both prices, got ${r.repair}`);
    await page.locator('.town-repair [data-key="repairAll"]').waitFor();
    const placed = await page.evaluate(() => {
      const title = document.querySelector('.town-page .ink-head-line .quest-place').getBoundingClientRect();
      const first = document.querySelector('.town-page .ink-head .town-services .town-repair button').getBoundingClientRect();
      return { inside: !!document.querySelector('.ink-head .town-services .town-repair'), shopHas: !!document.querySelector('.town-shop .town-repair'), truckHas: !!document.querySelector('.town-truck .town-repair'), right: first.left > title.right || first.top >= title.bottom };
    });
    assert(placed.inside && !placed.shopHas && !placed.truckHas && placed.right, `${spot}: the repair bar must sit on the heading line, right of the title, got ${JSON.stringify(placed)}`);
    const chipLook = await page.evaluate(() => [...document.querySelectorAll('.town-page .ink-chips .chip')].map(n => {
      const cs = getComputedStyle(n);
      const glyph = n.querySelector('.icon, .coin')?.getBoundingClientRect().width ?? 16;
      return { pad: cs.paddingLeft === cs.paddingRight, glyph: Math.round(glyph) === 16 };
    }));
    assert(chipLook.every(c => c.pad && c.glyph), `${spot}: chips need even padding and one glyph size, got ${JSON.stringify(chipLook)}`);
    await page.evaluate(() => window.__ROAM__.screens.town.close());
  }
  await enter(page, 'nose');
  await garage(page, 'buyParts');
  await mkdir('.playtest', { recursive: true });
  const sizes = [[1920, 1080], [1600, 900], [1280, 730], [1024, 730], [800, 730]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => {
      const box = document.querySelector('.town-page').getBoundingClientRect();
      return [...document.querySelectorAll('.town-page .ink-chips .chip, .town-repair button')].filter(n => {
        const b = n.getBoundingClientRect();
        return b.x < box.x || b.right > box.right || b.bottom > box.bottom;
      }).length;
    });
    assert.equal(out, 0, `${width}: header chips and repair buttons must lie inside the town screen`);
    await page.screenshot({ path: `.playtest/garage-${width}.png` });
    for (const tab of ['Buy parts', 'Sell parts']) {
      await garage(page, tab === 'Buy parts' ? 'buyParts' : 'sellParts');
      await page.waitForTimeout(200);
      assertNoScroll(await trucksLayout(page), `${width}x${height} ${tab}`);
    }
    await garage(page, 'trucks');
    await page.waitForTimeout(300);
    await checkTrucks(page, `${width}x${height}`, height >= 1080);
    await page.screenshot({ path: `.playtest/garage-trucks-${width}.png` });
    await garage(page, 'buyParts');
  }
  await garage(page, 'trucks');
  await page.setViewportSize({ width: 1280, height: 730 });
  await page.waitForTimeout(300);
  await checkBukhanka(page, 'nose 1280x730');
  for (const [width, height] of [[1920, 1080], [800, 730]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await checkTrucks(page, `${width}x${height} after swap`, false);
  }
  assert.deepEqual(errors, [], 'No uncaught page errors');
  console.log('PASS: garage comparison follows selection, labels removed at garages only, layout holds');
} finally {
  await browser.close();
}
