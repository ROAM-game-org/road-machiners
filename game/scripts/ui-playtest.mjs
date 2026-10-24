import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gpuArgs } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/ui-playtest.mjs <dev-server-url>');
const browser = await chromium.launch({ args: process.env.CPU ? [] : gpuArgs() });

function doRectsOverlap(a, b) {
  return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
}

async function checkVisibleReadouts(page) {
  for (const label of ['money', 'fuel', 'supplies', 'driver']) {
    assert(await page.locator(`[data-resource="${label}"]`).isVisible(), `${label} must remain visible`);
  }
  assert(await page.locator('.log').isVisible(), 'Event log must remain visible');
  const boxes = await page.locator('.modal:visible,.instruments,.log').evaluateAll(nodes => nodes.map(node => ({
    name: node.className, rect: node.getBoundingClientRect().toJSON(),
  })));
  const modal = boxes.find(box => box.name.includes('modal'));
  for (const box of boxes.filter(box => box !== modal)) {
    assert(!doRectsOverlap(modal.rect, box.rect), `${box.name} must not cover the modal: ${JSON.stringify([modal.rect, box.rect])}`);
  }
}

async function checkCoins(page, where) {
  const result = await page.evaluate(where => {
    const titlePattern = /^−?\d{1,3}(,\d{3})* M('s)?$/;
    const coinSizeProblem = (text, coin, amount) => {
      if (!coin) return [`${text}: no coin`];
      const size = parseFloat(getComputedStyle(amount).fontSize);
      const height = coin.getBoundingClientRect().height;
      const sized = Math.abs(height / size - 1.15) <= 0.02;
      const fits = height <= amount.getBoundingClientRect().height + 1;
      return [sized ? '' : `${text}: coin ${height}px beside ${size}px text`, fits ? '' : `${text}: coin taller than its line`];
    };
    const titleProblems = (text, amount) => [
      amount.querySelector('[title]') ? `${text}: a nested title shadows the amount` : '',
      titlePattern.test(amount.title) ? '' : `${text}: bad title "${amount.title}"`,
      amount.getAttribute('aria-label') === amount.title ? '' : `${text}: aria-label differs from title`,
    ];
    const letterProblem = (text, coin) => {
      if (!coin) return [];
      const ratio = coin.querySelector('path').getBBox().height / coin.querySelector('circle').getBBox().height;
      return [ratio >= 0.25 && ratio <= 0.32 ? '' : `${text}: M is ${ratio.toFixed(2)} of the coin`];
    };
    const hsl = hex => {
      const [r, g, b] = hex.match(/\d+/g).slice(0, 3).map(part => Number(part) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
      return { s, l };
    };
    const colourProblems = (text, coin) => {
      if (!coin) return [];
      return ['circle', 'path'].map(tag => {
        const colour = getComputedStyle(coin.querySelector(tag)).stroke;
        const { s, l } = hsl(colour);
        return s <= 0.45 && l <= 0.7 ? '' : `${text}: ${tag} colour ${colour} is too vivid`;
      });
    };
    const amountProblems = amount => {
      const text = amount.innerText.trim();
      const coin = [...amount.children].find(child => child.classList.contains('coin'));
      return [...coinSizeProblem(text, coin, amount), ...letterProblem(text, coin), ...colourProblems(text, coin), ...titleProblems(text, amount)];
    };
    const hudProblems = where === 'HUD' ? (() => {
      const balance = document.querySelector('[data-resource="money"]');
      if (!balance) return ['HUD: no balance readout'];
      return [
        balance.querySelector('small') ? 'HUD balance shows a label' : '',
        balance.innerText.includes("M's") ? 'HUD balance shows the word M\'s' : '',
        (balance.getAttribute('aria-label') ?? '').startsWith("M's: ") ? '' : 'HUD balance lost its aria-label',
      ];
    })() : [];
    const shown = [...document.querySelectorAll('.amount')].filter(node => node.offsetParent !== null);
    const icons = [...document.querySelectorAll('.icon[title="M\'s"]')].map(icon => `icon says M's: ${icon.outerHTML.slice(0, 60)}`);
    return { problems: [...shown.flatMap(amountProblems), ...hudProblems, ...icons].filter(Boolean), count: shown.length };
  }, where);
  assert.deepEqual(result.problems, [], `Coin check failed (${where})`);
  return result.count;
}

async function checkCoinSizes(page, where) {
  const ratios = await page.evaluate(() => {
    const ratio = selector => {
      const coin = document.querySelector(selector);
      return coin && coin.getBoundingClientRect().height / parseFloat(getComputedStyle(coin.parentElement).fontSize);
    };
    return { hud: ratio('.resource .amount > .coin'), market: ratio('.modal .amount > .coin') };
  });
  assert(ratios.hud && ratios.market, `Coin sizes (${where}) need a HUD and a market coin`);
  assert(Math.abs(ratios.hud - ratios.market) <= 0.05, `HUD coin ${ratios.hud}em and market coin ${ratios.market}em differ (${where})`);
}

async function checkSpeedTip(page, width) {
  await page.focus('.speed-max');
  assert(await page.locator('#speed-breakdown').isVisible(), 'Focusing max speed must open the tooltip');
  const tip = await page.evaluate(() => {
    const node = document.querySelector('.speed-tip');
    return {
      lines: [...node.querySelectorAll('.speed-line')].map(line => ({ label: line.children[0].textContent, value: line.children[1].textContent })),
      nested: node.querySelectorAll('table, td, .speed-row, .total').length,
      text: node.innerText,
      rect: node.getBoundingClientRect().toJSON(),
      view: { w: window.innerWidth, h: window.innerHeight },
    };
  });
  assert(tip.lines.length >= 1, 'The tooltip must show a line');
  const value = /^([+\u2212]?\d+ km\/h|crawl( \d+ km\/h)?|max \d+ km\/h)$/;
  for (const line of tip.lines) assert(value.test(line.value) && !/[:%\u00b7|]/.test(line.label), `Tooltip line must be short: ${JSON.stringify(line)}`);
  assert.equal(tip.nested, 0, 'The tooltip must hold no table cells');
  assert(!/%|Guns draw/.test(tip.text), `The tooltip must hold no percent or paragraph: ${tip.text}`);
  assert(tip.rect.x >= 0 && tip.rect.y >= 0 && tip.rect.right <= tip.view.w && tip.rect.bottom <= tip.view.h, `The tooltip must lie on screen: ${JSON.stringify(tip.rect)}`);
  await page.screenshot({ path: `.playtest/speed-tip-${width}.png`, timeout: 120000 });
  await page.evaluate(() => document.activeElement?.blur());
}

function checkClockSpan(m) {
  const span = `clock ${m.clock.x}-${m.clock.right} vs cells ${m.clockCells.x}-${m.clockCells.right}`;
  assert(Math.abs(m.clock.x - m.clockCells.x) <= 1 && Math.abs(m.clock.right - m.clockCells.right) <= 1, `Clock must span the two right cells of row 1: ${span}`);
}

async function moneyCellWidth(page, whole) {
  await page.evaluate(async whole => {
    const { UNITS } = await import('/src/data/units.ts');
    const game = window.__ROAM__;
    const world = structuredClone(game.state);
    world.player.money = whole * UNITS.centsPerM;
    game.apply(world);
  }, whole);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.evaluate(() => document.querySelector('.resource[data-resource="money"]').getBoundingClientRect().width);
}

async function checkMoneyCellFixed(page) {
  const original = await page.evaluate(() => window.__ROAM__.state.player.money);
  const poor = await moneyCellWidth(page, 0);
  const rich = await moneyCellWidth(page, 9999);
  await page.evaluate(async original => {
    const game = window.__ROAM__;
    const world = structuredClone(game.state);
    world.player.money = original;
    game.apply(world);
  }, original);
  assert(Math.abs(poor - rich) <= 1, `The money cell must not depend on the money: ${poor} vs ${rich}`);
}

async function checkInstruments(page) {
  const clock = page.locator('.instrument-clock');
  assert(await clock.isVisible(), 'Clock strip must be visible');
  const m = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const visibleRect = selector => {
      const node = document.querySelector(selector);
      return node && node.offsetParent !== null ? node.getBoundingClientRect().toJSON() : null;
    };
    return {
      panel: rect('.instruments'), clock: rect('.instrument-clock'), dial: rect('.truck-instrument'), readouts: rect('.readouts'), money: rect('.resource[data-resource="money"]'),
      log: visibleRect('.log'), weapons: visibleRect('.weapons'),
      clockText: document.querySelector('.instrument-clock').innerText,
      panelText: document.querySelector('.instruments').innerText,
      actionsText: document.querySelector('.instrument-actions').innerText,
      speedoText: document.querySelector('.speedometer').innerText,
      heights: [...document.querySelectorAll('.instrument-actions > button, .weapon-head > .switch')].filter(node => node.offsetParent !== null).map(node => node.getBoundingClientRect().height),
      lines: [...document.querySelectorAll('.instrument-actions > button, .weapon-head > .switch')].filter(node => node.offsetParent !== null).every(node => node.scrollHeight <= node.clientHeight + 1),
      horn: [...document.querySelectorAll('.instrument-actions > button')].some(node => node.textContent.trim() === 'Horn' && node.offsetParent !== null),
      buttonHeight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--btn-h-s')),
      clockCells: (() => {
        const cells = [...document.querySelectorAll('.instruments .resource')].map(node => node.getBoundingClientRect().toJSON());
        const lower = cells.filter(cell => cell.y > document.querySelector('.instrument-clock').getBoundingClientRect().bottom - 1).sort((a, b) => a.x - b.x);
        return { x: lower[2].x, right: Math.max(...cells.map(cell => cell.right)) };
      })(),
      dayGap: (() => { const day = document.querySelector('.clock-day').getBoundingClientRect(); const time = document.querySelector('.clock-time').getBoundingClientRect(); return time.x - day.right; })(),
      lcdGap: parseFloat(getComputedStyle(document.querySelector('.instrument-clock')).columnGap),
    };
  });
  const { panel } = m;
  assert(m.clock.x >= panel.x && m.clock.right <= panel.right && m.clock.y >= panel.y && m.clock.bottom <= panel.bottom, 'Clock must lie inside the instruments');
  checkClockSpan(m);
  assert(/D\s*\d+\s*\d+:\d\d/.test(m.clockText), `Clock must show day and time, got ${m.clockText}`);
  assert(m.dayGap <= m.lcdGap + 4, `Day and time must sit together: ${m.dayGap}px apart`);
  assert.equal(m.panelText.match(/D\s*\d+\s*\d+:\d\d/g).length, 1, 'Time must show once');
  assert(!m.actionsText.includes('broken'), 'No broken badge in the action row');
  assert(!/km\/h|\u00b7/.test(m.speedoText), 'No unit text under the dial');
  assert(m.heights.every(h => Math.abs(h - m.buttonHeight) <= 1), `Instrument buttons must be ${m.buttonHeight}px high: ${m.heights}`);
  assert(m.lines, 'Instrument button contents must sit on one line');
  assert(!m.horn, 'Horn is for touch only');
  await checkMoneyCellFixed(page);
  for (const other of [m.log, m.weapons].filter(Boolean)) {
    assert(!doRectsOverlap(panel, other), `Instruments must not overlap the log or weapons: ${JSON.stringify([panel, other])}`);
  }
  await checkSpeedTip(page, page.viewportSize().width);
}

const DOCK_VIEWPORTS = [[1920, 1080], [1280, 720], [1100, 700], [1280, 656], [1024, 656], [900, 656], [800, 656], [700, 800]];
const DOCK_PANELS = ['.instruments', '.weapons', '.truck-condition', '.log', '.turn-control', '.recenter', '.info'];

async function loadHeavyHud(page) {
  await page.evaluate(async () => {
    const { runCommand } = await import('/src/ui/console.ts');
    const game = window.__ROAM__;
    const run = line => { const r = runCommand(game.state, line); if (r.world) game.apply(r.world); };
    let guns = 0;
    for (let i = 0; i < 40 && guns < 6; i++) {
      run('randomkit 5');
      guns = document.querySelectorAll('.weapon-pick').length;
    }
    game.hud.showRecenter(true);
    run('spawn buggy');
    run('weather storm');
    run('weather heatwave');
    const world = structuredClone(game.state);
    world.player.engineHeat = 0.5;
    world.player.supplies = Math.max(world.player.supplies, 10);
    game.apply(world);
    const other = game.state.vehicles.find(v => v.id !== game.state.player.vehicleId);
    game.hovered = other.id;
    game.refreshInfo();
    if (getComputedStyle(document.querySelector('.info')).display === 'none') {
      game.hovered = game.state.player.vehicleId;
      game.refreshInfo();
    }
    document.head.append(Object.assign(document.createElement('style'), { textContent: '#ui .tip { display: none !important }' }));
    return { guns, other: other.id, seen: getComputedStyle(document.querySelector('.info')).display, hov: game.hovered };
  }).then(r => console.log(JSON.stringify(r)));
}

async function trimGuns(page, count) {
  await page.evaluate(async count => {
    const game = window.__ROAM__;
    const { partDef } = await import('/src/data/parts.ts');
    const { mountedItems } = await import('/src/sim/grid.ts');
    const trimmed = structuredClone(game.state);
    const me = trimmed.vehicles.find(v => v.id === trimmed.player.vehicleId);
    const drop = new Set(mountedItems(me, 'weapon').slice(count).map(it => it.part.id));
    me.items = me.items.filter(it => !(it.kind === 'part' && partDef(it.part.defId).kind === 'weapon' && drop.has(it.part.id)));
    game.apply(trimmed);
  }, count);
  assert.equal(await page.locator('.weapon-pick').count(), count, `The truck must carry ${count} guns`);
}

function assertNoOverlaps(rects, width, height) {
  const names = Object.keys(rects).filter(name => width > 720 || name !== '.info');
  for (const a of names) {
    for (const b of names.filter(name => name > a)) {
      assert(!doRectsOverlap(rects[a], rects[b]), `${a} must not overlap ${b} at ${width}x${height}`);
    }
  }
}

const inside = (r, box, tol = 1) => r.x >= box.x - tol && r.right <= box.right + tol && r.y >= box.y - tol && r.bottom <= box.bottom + tol;

function assertStack(rects, at) {
  const log = rects['.log'], turn = rects['.turn-control'];
  if (!log || !turn) return;
  assert(near(turn.y - log.bottom, 8), `The log must sit one HUD gap above End turn ${at}, got ${turn.y - log.bottom}`);
  assert(near(log.right, turn.right), `The log and End turn must share a right edge ${at}, got ${log.right} and ${turn.right}`);
}

async function settleLayers(page, width) {
  await page.waitForFunction(width => {
    const ui = document.querySelector('#ui').classList;
    return ui.contains('narrow') === (width <= 720) && ui.contains('compact') === (width <= 1100);
  }, width);
}

async function checkDockLayout(page, [width, height]) {
  await page.setViewportSize({ width, height });
  await settleLayers(page, width);
  const m = await page.evaluate(([selectors, narrow]) => {
    if (narrow) document.querySelector('.info').style.visibility = 'hidden';
    const shown = node => node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
    const box = node => node.getBoundingClientRect().toJSON();
    const rects = Object.fromEntries(selectors.map(selector => [selector, document.querySelector(selector)]).filter(([, node]) => shown(node)).map(([selector, node]) => [selector, box(node)]));
    const controls = [...document.querySelectorAll('.weapons button, .weapons .weapon-pick')].map(node => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { name: node.innerText.replace(/\s+/g, ' ').slice(0, 24), hit: hit?.className, ok: node.contains(hit), box: box(node) };
    });
    const grid = document.querySelector('.weapons .weapon-slots');
    const fits = node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1;
    return {
      rects, controls, viewport: { width: innerWidth, height: innerHeight },
      slots: [...document.querySelectorAll('.weapons .weapon-slots .weapon-slot')].map(box),
      fits: { panel: fits(document.querySelector('.weapons')), grid: fits(grid) },
      text: document.querySelector('.weapons').innerText,
      icons: document.querySelectorAll('.weapon-pick .item-icon').length,
      oldIcons: document.querySelectorAll('.weapons .icon-mg, .weapons .icon-cannon').length,
      twoRows: grid.classList.contains('two-rows'),
    };
  }, [DOCK_PANELS, width <= 720]);
  m.iconLooks = await readIconLooks(page);
  const guns = m.slots.length, at = `at ${width}x${height} with ${guns} guns`;
  console.log(at, Object.entries(m.rects).map(([n, r]) => `${n}=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`).join(' '));
  await page.screenshot({ path: `.playtest/dock-${guns}g-${width}x${height}.png`, timeout: 180000 });
  assert(m.rects['.weapons'], `Weapons panel must show ${at}`);
  assertNoOverlaps(m.rects, width, height);
  assertStack(m.rects, at);
  const stacked = assertDockPlace(m, at);
  assertDockFits(m, at);
  assertDockRows(m.slots, at);
  assertDockSize(m, stacked, at);
  assertDockLevel(m, stacked, width, at);
  assertDockText(m, at);
  assertDockIcons(m.iconLooks, at);
  for (const c of m.controls) assert(c.ok, `Weapon control "${c.name}" must take the click at its center ${at}, hit ${c.hit}`);
}

function assertDockPlace(m, at) {
  const weapons = m.rects['.weapons'], instruments = m.rects['.instruments'];
  assert(near(m.viewport.height - weapons.bottom, 14), `Weapons bottom must sit 14px above the screen bottom ${at}: ${weapons.bottom} of ${m.viewport.height}`);
  const stacked = weapons.x < instruments.right - 1;
  const top = stacked ? instruments.bottom : instruments.y;
  assert(weapons.y >= top - 1, `Weapons must not rise above ${stacked ? 'the bottom of' : 'the top of'} the instruments ${at}: ${weapons.y} < ${top}`);
  return stacked;
}

function assertDockFits(m, at) {
  assert(m.fits.panel && m.fits.grid, `The weapons panel must not scroll or clip ${at}`);
  for (const c of m.controls) assert(inside(c.box, m.rects['.weapons']), `Weapon control "${c.name}" must lie inside the panel ${at}`);
}

function assertDockRows(slots, at) {
  const tops = [...new Set(slots.map(r => Math.round(r.y)))];
  assert.equal(tops.length, slots.length <= 5 ? 1 : 2, `Rows must be one up to five guns and two above ${at}: ${tops}`);
  const first = slots.filter(r => Math.round(r.y) === tops[0]).length;
  assert.equal(first, slots.length <= 5 ? slots.length : Math.ceil(slots.length / 2), `The first row must hold half the guns, or all of up to five ${at}`);
  assert(slots.length > 10 || first <= 5, `No row may hold more than five guns ${at}`);
}

function assertDockSize(m, stacked, at) {
  const weapons = m.rects['.weapons'], guns = m.slots.length;
  assert(m.slots.every(r => near(r.width, m.slots[0].width) && near(r.height, m.slots[0].height)), `All gun elements must share one size ${at}`);
  assert.equal(m.twoRows, guns > 5, `Two-row sizing must apply exactly above five guns ${at}`);
  assert(guns > 6 || weapons.height <= 150, `The weapons panel must be at most 150px tall ${at}: ${weapons.height}`);
  assert(stacked || weapons.height <= m.rects['.instruments'].height + 1, `The weapons panel must be no taller than the instruments ${at}`);
  assert(guns < 6 || weapons.width * weapons.height <= 512 * 188 / 2 || m.viewport.width !== 1280 || m.viewport.height !== 656, `Six guns must take at most half of the old panel ${at}: ${weapons.width}x${weapons.height}`);
}

function assertDockLevel(m, stacked, width, at) {
  if (width < 1280) return;
  assert(!stacked, `The weapons must sit beside the instruments ${at}`);
  assert(near(m.rects['.weapons'].bottom, m.rects['.instruments'].bottom), `Weapons and instruments bottoms must be level ${at}`);
}

function assertDockText(m, at) {
  assert(!/hold fire|no target|target unavailable/i.test(m.text), `The panel must carry no filler text ${at}: ${m.text}`);
  assert.equal(m.icons, m.slots.length, `Each gun must show one inventory icon ${at}`);
  assert.equal(m.oldIcons, 0, `No old weapon glyphs ${at}`);
}

const readIconLooks = page => page.evaluate(() => [...document.querySelectorAll('.weapon-pick .item-icon')].map(node => {
  const style = getComputedStyle(node);
  return { label: node.getAttribute('aria-label'), background: style.backgroundColor, image: style.backgroundImage, padding: style.padding };
}));

function assertDockIcons(looks, at) {
  for (const icon of looks) {
    assert.equal(icon.background, 'rgba(0, 0, 0, 0)', `Weapon icon "${icon.label}" must have no tile ${at}`);
    assert.equal(icon.image, 'none', `Weapon icon "${icon.label}" must have no background image ${at}`);
    assert.equal(icon.padding, '0px', `Weapon icon "${icon.label}" must have no padding ${at}`);
  }
}

async function checkWeaponDock(page) {
  await loadHeavyHud(page);
  await checkSpeedTip(page, 'guns');
  const most = await page.locator('.weapon-pick').count();
  assert(most >= 6, `A random kit must give six or more guns, got ${most}`);
  for (const guns of [most, 5, 1]) {
    if (guns !== most) await trimGuns(page, guns);
    if (guns !== 1) await checkWeaponIcons(page, guns, guns === most);
    for (const viewport of DOCK_VIEWPORTS) await checkDockLayout(page, viewport);
  }
}

async function checkWeaponIcons(page, guns, distinct) {
  await page.setViewportSize({ width: 1280, height: 720 });
  const shoot = suffix => page.locator('.weapons').screenshot({ path: `.playtest/weapon-icons-${guns}g${suffix}.png`, timeout: 180000 });
  const at = `in the ${guns}-gun panel`;
  const looks = await readIconLooks(page);
  assertDockIcons(looks, at);
  const labels = new Set(looks.map(icon => icon.label));
  console.log('weapon icons', [...labels].join(', '));
  if (distinct) assert(labels.size >= 2, `The panel must show at least two distinct guns, got ${[...labels]}`);
  await shoot('');
  const first = page.locator('.weapon-pick').first();
  await first.click();
  assert(await page.locator('.weapon-pick.on').count(), `A clicked gun must show as selected ${at}`);
  assertDockIcons(await readIconLooks(page), `${at} with a gun selected`);
  await shoot('-selected');
  await first.click();
}

async function fillLog(page) {
  await page.evaluate(async () => {
    const game = window.__ROAM__;
    const { verbatim } = await import('/src/text/msg.ts');
    const lines = [
      'Repair Scrap panels started: stay parked about three hours while the crew works',
      'Dust storm started and will sweep the whole valley until late in the evening',
      'Overcast started', 'Raider Bo Crane: Wheel disabled', 'Repair Wheel done',
      'W'.repeat(80), 'Discovered Old Orchard', 'Trader Mira Dawes honks back.',
      'Raider Cass Dust regains consciousness', 'Repair Wheel started: stay parked about two hours',
      'Day turns to night over the long road east of the old bridge', 'Discovered Bowl',
    ];
    for (let i = 0; i < 4; i++) for (const text of lines) game.hud.note(game.world, verbatim(text), 'dim');
  });
}

async function checkLog(page, label) {
  const m = await page.evaluate(() => {
    const box = document.querySelector('.log-lines');
    const clip = box.getBoundingClientRect();
    const button = document.querySelector('.log-expand');
    const b = button.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return {
      panel: document.querySelector('.log').getBoundingClientRect().toJSON(), box: clip.toJSON(), button: b.toJSON(),
      hitsButton: hit === button || button.contains(hit),
      scrollWidth: box.scrollWidth, clientWidth: box.clientWidth,
      rows: [...box.children].map(row => {
        const r = row.getBoundingClientRect();
        const top = Math.max(r.top, clip.top), bottom = Math.min(r.bottom, clip.bottom);
        return { text: row.innerText, left: r.left, right: r.right, top, bottom, visible: bottom > top };
      }),
    };
  });
  const { panel } = m, tol = 1;
  const inside = r => r.x >= panel.x - tol && r.right <= panel.right + tol && r.y >= panel.y - tol && r.bottom <= panel.bottom + tol;
  assert(inside(m.box), `${label}: log lines box must lie inside the log panel: ${JSON.stringify({ box: m.box, panel })}`);
  for (const row of m.rows.filter(row => row.visible)) {
    assert(row.left >= panel.x - tol && row.right <= panel.right + tol && row.top >= panel.y - tol && row.bottom <= panel.bottom + tol,
      `${label}: log row "${row.text}" must lie inside the log panel: ${JSON.stringify({ row, panel })}`);
  }
  assert(m.scrollWidth <= m.clientWidth, `${label}: log lines must not scroll sideways (${m.scrollWidth} > ${m.clientWidth})`);
  assert(inside(m.button), `${label}: expand button must lie inside the log panel: ${JSON.stringify({ button: m.button, panel })}`);
  assert(m.hitsButton, `${label}: expand button must be the hit target at its center`);
}

async function checkLogScroll(page) {
  const topRow = () => page.evaluate(() => {
    const box = document.querySelector('.log-lines');
    const clip = box.getBoundingClientRect();
    const row = [...box.children].find(r => r.getBoundingClientRect().bottom > clip.top + 1);
    return row.innerText;
  });
  await page.evaluate(() => {
    const box = document.querySelector('.log-lines');
    box.scrollTop = Math.floor((box.scrollHeight - box.clientHeight) / 2);
  });
  assert(await page.evaluate(() => document.querySelector('.log-lines').scrollTop) > 0, 'Log must have history to scroll back through');
  const before = await topRow();
  await page.evaluate(async () => { const { verbatim } = await import('/src/text/msg.ts'); const g = window.__ROAM__; g.hud.note(g.world, verbatim('A new line arrives'), 'dim'); });
  assert.equal(await topRow(), before, 'A scrolled-back log must keep its top row when a line arrives');
  const scrolled = () => page.evaluate(() => document.querySelector('.log-lines').scrollTop > 0);
  await page.locator('.log-expand').click({ force: true });
  assert(await scrolled(), 'A scrolled-back log must stay scrolled back after expanding');
  await page.locator('.log-expand').click({ force: true });
  assert(await scrolled(), 'A scrolled-back log must stay scrolled back after shrinking');
}

async function shotLog(page, name) {
  await page.screenshot({ path: `.playtest/${name}.png`, clip: await page.locator('.log').boundingBox(), animations: 'allow' });
}

const dockGap = () => 8;

const near = (a, b) => Math.abs(a - b) <= 1;

async function holdContracts(page, count) {
  await page.evaluate(count => {
    const g = window.__ROAM__;
    const w = structuredClone(g.state);
    w.player.contracts = Object.values(w.shops).flatMap(shop => shop.contracts).slice(0, count);
    if (w.player.contracts.length !== count) throw new Error(`The boards hold fewer than ${count} contracts`);
    g.apply(w);
  }, count);
  await page.waitForFunction(count => (getComputedStyle(document.querySelector('.contracts')).display !== 'none') === (count > 0), count);
}

async function hover(page, on) {
  await page.evaluate(on => {
    const g = window.__ROAM__;
    g.setHovered(on ? g.state.player.vehicleId : null);
  }, on);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

const boxes = page => page.evaluate(() => {
  const visibleRect = selector => {
    const node = document.querySelector(selector);
    return node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden' ? node.getBoundingClientRect().toJSON() : null;
  };
  return {
    radio: visibleRect('.radio'), log: visibleRect('.log'), contracts: visibleRect('.contracts'), info: visibleRect('.info'),
    instruments: visibleRect('.instruments'),
    knobs: document.querySelectorAll('.radio [role=slider]').length, oldSound: document.querySelectorAll('.top-right .sound').length,
  };
});

async function checkRadio(page) {
  await page.waitForFunction(() => document.querySelector('.radio-text')?.textContent.trim(), null, { timeout: 30000 });
  const size = page.viewportSize();
  for (const count of [0, 1]) {
    await holdContracts(page, count);
    const m = await boxes(page);
    assert(m.radio, 'Radio must be visible');
    assert.equal(m.knobs, 0, 'The radio must carry no volume knobs, they live in Options');
    assert.equal(m.oldSound, 0, 'The top-right Sound panel must be gone');
    const below = count ? m.contracts : m.log;
    const gap = count ? 8 : dockGap(page);
    assert(near(below.y - m.radio.bottom, gap), `At ${size.width}x${size.height} with ${count} contracts the radio must sit ${gap}px above the ${count ? 'contracts' : 'log'}, got ${below.y - m.radio.bottom}`);
    for (const other of [m.log, m.contracts, m.instruments].filter(Boolean)) assert(!doRectsOverlap(m.radio, other), 'Radio must not overlap the log, instruments or contracts');
  }
}

async function checkRightColumn(page, radioStays) {
  const size = page.viewportSize();
  const at = `At ${size.width}x${size.height}`;
  await holdContracts(page, 1);
  await hover(page, true);
  const m = await boxes(page);
  assert(m.info, `${at} the hover panel must show`);
  assert(m.contracts, `${at} the contracts must show`);
  assert(near(m.log.y - m.contracts.bottom, dockGap(page)), `${at} the contracts must sit ${dockGap(page)}px above the log, got ${m.log.y - m.contracts.bottom}`);
  assert(!doRectsOverlap(m.log, m.info), `${at} the hover panel must stop above the log`);
  const old = { ...m.contracts, y: m.log.y - dockGap(page) - m.contracts.height, bottom: m.log.y - dockGap(page) };
  if (!doRectsOverlap(old, m.info)) assert(!doRectsOverlap(m.contracts, m.info), `${at} the hover panel must not cover the contracts`);
  if (m.radio) assert(!doRectsOverlap(m.radio, m.info), `${at} the hover panel must not cover the radio`);
  if (radioStays !== null) assert.equal(Boolean(m.radio), radioStays, `${at} the radio must ${radioStays ? 'stay' : 'step away'} during the hover`);
  await hover(page, false);
  assert((await boxes(page)).radio, `${at} the radio must come back once the hover panel hides`);
}

const KNOB_BUSES = ['Music', 'Effects', 'Wind', 'Interface'];

async function checkKnobs(url, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(playUrl(url));
    await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector('.radio-text')?.textContent.trim(), null, { timeout: 90000 });
    const at = `At ${viewport.width}x${viewport.height}`;
    const openOptions = async () => {
      await page.locator('.menu-button').click();
      await page.locator('[data-entry=options]').click();
      await page.waitForFunction(() => document.querySelectorAll('.options .knob').length === 4);
    };
    await openOptions();
    const values = () => page.evaluate(() => [...document.querySelectorAll('.options .knob')].map(k => k.getAttribute('aria-valuenow')));
    const muted = () => page.evaluate(() => document.querySelector('.options .radio-mute button').getAttribute('aria-pressed') ?? document.querySelector('.options .radio-mute').innerHTML);
    const game = () => page.evaluate(() => {
      const g = window.__ROAM__;
      return JSON.stringify([g.state === window.__knobState, g.rig.camera.position.toArray()]);
    });
    await page.evaluate(() => { window.__knobState = window.__ROAM__.state; });
    const box = selector => page.evaluate(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, selector);
    const cells = page.locator('.options .knob-cell');
    const rects = await cells.evaluateAll(nodes => nodes.map(n => ({ cell: n.getBoundingClientRect().toJSON(), knob: n.querySelector('.knob').getBoundingClientRect().toJSON() })));
    const mute = await box('.options .radio-mute');
    assert.equal(rects.length, 4, `${at} Options must carry four knob columns`);
    rects.forEach((r, i) => {
      assert(r.cell.width >= 24 && r.cell.height >= 40, `${at} ${KNOB_BUSES[i]} column must be at least 24x40, got ${r.cell.width}x${r.cell.height}`);
      assert(!doRectsOverlap(r.cell, { x: mute.x, y: mute.y, right: mute.x + mute.width, bottom: mute.y + mute.height }), `${at} the columns must clear the mute switch`);
      if (i) assert(!doRectsOverlap(rects[i - 1].cell, r.cell), `${at} the columns must not overlap`);
    });
    for (let i = 0; i < 4; i++) {
      const { cell, knob } = rects[i];
      const x = cell.x + 2, y = cell.bottom - 2;
      assert(x < knob.x || x > knob.right || y > knob.bottom, `${at} the grab point must lie outside the ${KNOB_BUSES[i]} dial`);
      const before = await values();
      const focusBefore = await page.evaluate(() => document.activeElement?.className);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 200, { steps: 10 });
      await page.mouse.up();
      assert.equal((await values())[i], '0', `${at} a drag down must silence ${KNOB_BUSES[i]}`);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 80, { steps: 10 });
      const mid = await page.evaluate(i => {
        const cell = document.querySelectorAll('.options .knob-cell')[i];
        const readout = cell.querySelector('.knob-readout');
        const hidden = [...document.querySelectorAll('.options .knob-readout')].filter(r => getComputedStyle(r).visibility !== 'hidden');
        return { now: Number(cell.querySelector('.knob').getAttribute('aria-valuenow')), turning: cell.classList.contains('turning'), text: readout.textContent, valuetext: cell.querySelector('.knob').getAttribute('aria-valuetext'), shown: hidden.length === 1 && hidden[0] === readout };
      }, i);
      assert(Math.abs(mid.now - 50) <= 1, `${at} 80px up must give about 50, got ${mid.now}`);
      assert(mid.turning && mid.shown, `${at} only the turned column must show its level`);
      assert.equal(mid.text, mid.valuetext, `${at} the readout must match aria-valuetext`);
      assert.equal(mid.text, `${mid.now}%`);
      if (i === 0) await page.screenshot({ path: `.playtest/knobs-${viewport.width}.png`, clip: await box('.options'), timeout: 120000 });
      await page.mouse.move(x, y - 200, { steps: 10 });
      await page.mouse.up();
      const after = await values();
      assert.equal(after[i], '100', `${at} a drag up must open ${KNOB_BUSES[i]} fully`);
      assert.deepEqual(after.filter((_, j) => j !== i), before.filter((_, j) => j !== i), `${at} no other knob may change`);
      assert.equal(await page.evaluate(() => document.activeElement?.className), focusBefore, `${at} a drag must not move focus`);
      await page.keyboard.press('ArrowLeft');
      assert.deepEqual(await values(), after, `${at} ArrowLeft after a drag must not turn a knob`);
      await page.mouse.move(x + 100, y - 100, { steps: 5 });
      assert.deepEqual(await values(), after, `${at} moving after release must not turn a knob`);
      assert.equal(await game(), JSON.stringify([true, JSON.parse(await game())[1]]), `${at} a drag must leave the game state alone`);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 200, { steps: 5 });
      await page.mouse.up();
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(i => document.querySelectorAll('.options .knob')[i].getAttribute('aria-valuenow') === '5', i, { timeout: 60000 });
    }
    const cameraBefore = await game();
    const knobs = page.locator('.options .knob');
    await knobs.first().focus();
    const base = Number((await values())[0]);
    await page.keyboard.press('ArrowUp');
    assert.equal(Number((await values())[0]), base + 5, `${at} ArrowUp on a focused knob must raise it 5`);
    assert(await page.locator('.options .knob-readout').first().isVisible(), `${at} a focused knob must show its level`);
    await knobs.first().blur();
    await page.keyboard.press('ArrowUp');
    assert.equal(Number((await values())[0]), base + 5, `${at} ArrowUp must not turn a blurred knob`);
    const held = await values();
    const muteBefore = await muted();
    await page.keyboard.press('m');
    assert.notEqual(await muted(), muteBefore, `${at} M must flip the mute switch`);
    assert.deepEqual(await values(), held, `${at} M must not change a level`);
    assert.equal(await game(), cameraBefore, `${at} the knob checks must leave the camera alone`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('roam-sound')).volume);
    assert.deepEqual(['music', 'sfx', 'ambient', 'ui'].map(b => String(Math.round(stored[b] * 100))), held, `${at} the stored levels must match the knobs`);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `.playtest/knobs-rest-${viewport.width}.png`, clip: await box('.options'), timeout: 120000 });
    await page.reload();
    await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: 90000 });
    await openOptions();
    assert.deepEqual(await values(), held, `${at} the levels must survive a reload`);
    assert.equal(await page.locator('.speedometer [role=slider], .speedometer .knob').count(), 0, `${at} the speedometer must hold no knob`);
    assert.deepEqual(errors, [], `${at} no uncaught page errors`);
  } finally {
    await page.close();
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(process.env.CPU ? 180000 : 30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(playUrl(url));
  await page.waitForFunction(() => window.__ROAM__?.state);
  assert(await page.locator('.icon').evaluateAll(nodes => nodes.every(node => node.title)), 'Every icon needs a hover name');
  assert(await page.locator('#ui *').evaluateAll(nodes => nodes.filter(node => !node.closest('button.switch, .radio-next')).every(node => !getComputedStyle(node).backgroundImage.includes('gradient'))), 'UI must use flat surfaces, apart from the metal switches and the radio button');
  if (process.env.DOCK_ONLY) {
    await checkWeaponDock(page);
    assert.deepEqual(errors, [], 'No uncaught page errors');
    console.log('PASS: weapons dock');
    process.exit(0);
  }
  await mkdir('.playtest', { recursive: true });
  await checkInstruments(page);
  await fillLog(page);
  await shotLog(page, 'log-compact');
  await checkLog(page, 'compact');
  await page.locator('.log-expand').click({ force: true });
  assert(await page.locator('.log.expanded').count(), 'Expand button must expand the log');
  await shotLog(page, 'log-expanded');
  await checkLog(page, 'expanded');
  await checkLogScroll(page);
  await page.locator('.log-expand').click({ force: true });
  await checkLog(page, 'compact again');

  await checkRadio(page);
  await page.keyboard.press('i');
  await checkVisibleReadouts(page);
  await checkLog(page, 'modal');
  await page.keyboard.press('Escape');
  await page.keyboard.press('i');
  const movable = page.locator('.inv-item:not(.fixed)').first();
  const name = (await movable.getAttribute('title')).split('\n')[0].split(' (')[0];
  await movable.click({ force: true });
  assert((await page.locator('.inv-inspection').innerText()).includes(name), 'Clicking a movable item must inspect it before drag/drop replaces its node');
  assert.notEqual(await page.locator('.inv-inspection .item-icon').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'Item icons outside the weapon panel must keep their tone tile');
  const inventoryFrame = await page.locator('.modal:visible').boundingBox();
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await checkVisibleReadouts(page);
  assert.deepEqual(await page.locator('.modal:visible').boundingBox(), inventoryFrame, 'Character and inventory must share one frame');
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await checkCoins(page, 'HUD');
  if (await page.locator('.modal:visible').count()) {
    await checkVisibleReadouts(page);
    assert.deepEqual(await page.locator('.modal:visible').boundingBox(), inventoryFrame, 'Town and inventory must share one frame');
  } else {
    await page.keyboard.press('i');
    await checkVisibleReadouts(page);
  }
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    const c = await import('/src/sim/cheats.ts');
    g.apply(c.teleport(g.state, c.placeSpot(g.state, 'bowl')));
    g.screens.town.open();
  });
  await page.waitForSelector('.town-shop .tabs button', { timeout: 90000 });
  assert((await checkCoins(page, 'town market')) > 1, 'The town market must show amounts');
  await checkCoinSizes(page, 'market 1600');
  const before = page.viewportSize();
  await page.setViewportSize({ width: 1024, height: 640 });
  await checkCoins(page, 'town market 1024');
  await checkCoinSizes(page, 'market 1024');
  await page.setViewportSize(before);
  await page.keyboard.press('Escape');
  await page.keyboard.press('i');
  for (const width of [1024, 800, 700]) {
    await page.setViewportSize({ width, height: 800 });
    await settleLayers(page, width);
    await checkVisibleReadouts(page);
    await checkInstruments(page);
    await checkLog(page, `compact ${width}`);
    if (width === 700) await shotLog(page, 'log-narrow');
    await page.locator('.log-expand').click({ force: true });
    await checkLog(page, `expanded ${width}`);
    await page.locator('.log-expand').click({ force: true });
  }
  await page.keyboard.press('Escape');
  for (const [width, height] of [[1280, 768], [700, 800]]) {
    await page.setViewportSize({ width, height });
    await settleLayers(page, width);
    await checkRadio(page);
  }
  for (const [width, height, radioStays] of [[1280, 720, true], [1366, 768, true], [1280, 800, true], [1440, 860, true], [1440, 900, true], [700, 800, true], [700, 940, true], [700, 1060, true]]) {
    await page.setViewportSize({ width, height });
    await settleLayers(page, width);
    await checkRightColumn(page, radioStays);
  }
  await page.keyboard.press('Escape');
  await mkdir('.playtest', { recursive: true });
  await checkWeaponDock(page);
  assert.deepEqual(errors, [], 'No uncaught page errors');
  await mkdir('.playtest', { recursive: true });
  for (const viewport of [{ width: 1280, height: 720 }, { width: 700, height: 800 }]) await checkKnobs(url, viewport);
  assert.deepEqual(errors, [], 'No uncaught page errors');
  await page.screenshot({ path: '.playtest/ui-regression.png' });
  console.log('PASS: hover names, coins sized by their text with one hover amount, flat surfaces, persistent resources/log, the radio above the log and contracts and clear of the hover panel, the contracts in their old spot, stable modal frames, movable-item inspection, and laptop/narrow layouts, clock strip, speedometer and action row, and the four radio knobs turned by a real mouse drag, wheel and keys');
} finally {
  await browser.close();
}
