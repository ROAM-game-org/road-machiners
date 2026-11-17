import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';
import { checkHudOutlineFixed } from './hud-outline.mjs';

const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/ui-playtest.mjs <dev-server-url>');
const { browser, software } = await launchChromium(chromium);

function doRectsOverlap(a, b) {
  return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
}


async function checkCoins(page, where) {
  const result = await page.evaluate(() => {
    const titlePattern = /^−?\d{1,3}(,\d{3})* M('s)?$/;
    const coinSizeProblem = (text, coin, amount) => {
      if (!coin) return [`${text}: no coin`];
      if (amount.closest('.chip')) return [];
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
    const shown = [...document.querySelectorAll('.amount')].filter(node => node.offsetParent !== null);
    const icons = [...document.querySelectorAll('.icon[title="M\'s"]')].map(icon => `icon says M's: ${icon.outerHTML.slice(0, 60)}`);
    return { problems: [...shown.flatMap(amountProblems), ...icons].filter(Boolean), count: shown.length };
  });
  assert.deepEqual(result.problems, [], `Coin check failed (${where})`);
  return result.count;
}

async function loadHeavyHud(page) {
  await page.evaluate(async () => {
    const { runCommand } = await import('/src/ui/console.ts');
    const game = window.__ROAM__;
    const run = line => { const r = runCommand(game.state, line); if (r.world) game.apply(r.world); };
    let guns = 0;
    for (let i = 0; i < 40 && guns < 6; i++) {
      run('randomkit 5');
      guns = document.querySelectorAll('.gun-cell').length;
    }
    game.hud.showRecenter(true);
    run('spawn buggy');
    run('weather storm');
    run('weather heatwave');
    const world = (await import('/src/sim/world.ts')).cloneWorld(game.state);
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
    const trimmed = (await import('/src/sim/world.ts')).cloneWorld(game.state);
    const me = trimmed.vehicles.find(v => v.id === trimmed.player.vehicleId);
    const drop = new Set(mountedItems(me, 'weapon').slice(count).map(it => it.part.id));
    me.items = me.items.filter(it => !(it.kind === 'part' && partDef(it.part.defId).kind === 'weapon' && drop.has(it.part.id)));
    game.apply(trimmed);
  }, count);
  assert.equal(await page.locator('.gun-cell').count(), count, `The truck must carry ${count} guns`);
}

async function settleLayers(page, width) {
  await page.waitForFunction(width => {
    const ui = document.querySelector('#ui').classList;
    return ui.contains('narrow') === (width <= 720) && ui.contains('compact') === (width <= 1100);
  }, width);
}

async function holdContracts(page, count) {
  await page.evaluate(async count => {
    const g = window.__ROAM__;
    const w = (await import('/src/sim/world.ts')).cloneWorld(g.state);
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

const PLATES = ['.stats-tray', '.keys-tray', '.drive-plate', '.weapons-plate', '.radio-plate'];
const HUD_TEXT_SIZES = 3;
const SMALLEST_TEXT_PX = 10;

function readHud(page) {
  return page.evaluate(plates => {
    const inner = node => {
      const r = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      const [top, right, bottom, left] = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
      return new DOMRect(r.x + left, r.y + top, r.width - left - right, r.height - top - bottom).toJSON();
    };
    const shown = node => node && node.checkVisibility({ visibilityProperty: true }) ? (node.classList.contains('hud-tray') ? inner(node) : node.getBoundingClientRect().toJSON()) : null;
    const rects = Object.fromEntries(plates.map(selector => [selector, shown(document.querySelector(`#ui ${selector}`))]));
    for (const selector of ['.truck-condition', '.contracts', '.info', '.tip']) rects[selector] = shown(document.querySelector(`#ui ${selector}`));
    const texts = [...document.querySelectorAll('#ui :is(.hud-plate, .hud-tray) *')].filter(node => !(node instanceof SVGElement) && node.checkVisibility() && [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()));
    const sizes = [...new Set(texts.map(node => parseFloat(getComputedStyle(node).fontSize)))].sort((a, b) => a - b);
    const caps = [...document.querySelectorAll('#ui .hud-system .key-cap')].filter(node => node.checkVisibility()).map(node => { const r = node.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
    const unnamed = [...document.querySelectorAll('#ui :is(.hud-plate, .hud-tray) button')].filter(node => node.checkVisibility() && !node.title && !node.getAttribute('aria-label') && !node.textContent.trim()).map(node => node.className);
    const clipped = texts.filter(node => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflow !== 'visible').map(node => `${node.className}: ${node.textContent.trim().slice(0, 30)}`);
    return { rects, sizes, caps: [...new Set(caps)], unnamed, clipped, view: { width: innerWidth, height: innerHeight } };
  }, PLATES);
}

function assertOnScreen(m, at) {
  for (const selector of PLATES) {
    const r = m.rects[selector];
    assert(r, `${selector} must show ${at}`);
    assert(r.x >= -1 && r.y >= -1 && r.right <= m.view.width + 1 && r.bottom <= m.view.height + 1, `${selector} must lie on screen ${at}: ${JSON.stringify(r)}`);
  }
}

function assertApart(m, at) {
  const names = Object.keys(m.rects).filter(name => m.rects[name]);
  for (const a of names) for (const b of names.filter(name => name > a)) {
    assert(!doRectsOverlap(m.rects[a], m.rects[b]), `${a} must not overlap ${b} ${at}: ${JSON.stringify([m.rects[a], m.rects[b]])}`);
  }
}

async function checkHud(page, at) {
  const m = await readHud(page);
  assertOnScreen(m, at);
  assertApart(m, at);
  assert(m.sizes.length <= HUD_TEXT_SIZES, `The HUD must use at most ${HUD_TEXT_SIZES} text sizes ${at}, got ${m.sizes.join(', ')}`);
  assert(m.sizes[0] >= SMALLEST_TEXT_PX, `HUD text must be at least ${SMALLEST_TEXT_PX}px ${at}, got ${m.sizes[0]}`);
  assert.equal(m.caps.length, 1, `Every top key must share one size ${at}, got ${m.caps.join(', ')}`);
  assert.deepEqual(m.unnamed, [], `Every HUD button needs a name ${at}`);
  assert.deepEqual(m.clipped, [], `No HUD text may be clipped ${at}`);
}

async function checkRockers(page) {
  const rocker = page.locator('#ui .hud-drive button.rocker').nth(1);
  const before = await rocker.getAttribute('aria-checked');
  await rocker.click();
  await page.waitForFunction(before => document.querySelectorAll('#ui .hud-drive button.rocker')[1].getAttribute('aria-checked') !== before, before);
  await page.waitForTimeout(400);
  const paddle = await rocker.evaluate(node => getComputedStyle(node.querySelector('.rocker-on')).opacity);
  await rocker.click();
  await page.waitForFunction(before => document.querySelectorAll('#ui .hud-drive button.rocker')[1].getAttribute('aria-checked') === before, before);
  await page.waitForTimeout(400);
  const after = await rocker.evaluate(node => getComputedStyle(node.querySelector('.rocker-on')).opacity);
  assert.notEqual(paddle, after, 'A rocker must light up when it is on');
}

async function checkLogWheel(page) {
  await fillLog(page);
  const read = () => page.evaluate(() => ({ top: document.querySelector('#ui .deck-log .log-lines').scrollTop, turn: document.querySelector('#ui .deck-wheel').style.getPropertyValue('--wheel-turn') }));
  await page.evaluate(() => { document.querySelector('#ui .deck-log .log-lines').scrollTop = 0; });
  const start = await read();
  const wheel = await page.locator('#ui .deck-wheel').boundingBox();
  await page.mouse.move(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);
  await page.mouse.wheel(0, 50);
  await page.waitForFunction(() => document.querySelector('#ui .deck-log .log-lines').scrollTop > 0);
  const turned = await read();
  assert(turned.top > start.top, 'The wheel must scroll the log');
  assert.notEqual(turned.turn, start.turn, 'The wheel must turn when the log scrolls');
  await page.mouse.move(0, 0);
}

async function checkKnob(page) {
  const knob = page.locator('#ui .knob-key');
  const face = () => knob.evaluate(node => ({ box: node.getBoundingClientRect().toJSON(), angle: node.firstElementChild.style.getPropertyValue('--knob') }));
  const before = await face();
  const box = await knob.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const held = await face();
  await page.mouse.up();
  await page.waitForFunction(angle => document.querySelector('#ui .knob-key').firstElementChild.style.getPropertyValue('--knob') !== angle, before.angle);
  assert.deepEqual(held.box, before.box, 'A pressed knob must not move or shrink, only turn');
  const marks = await page.locator('#ui .knob-mark.on').count();
  assert.equal(marks, 1, 'One time speed mark must be lit');
  await page.locator('#ui .knob-mark').first().click();
  await page.waitForFunction(() => document.querySelector('#ui .knob-mark').classList.contains('on'));
}

async function checkGuns(page) {
  const cells = page.locator('#ui .gun-cell');
  const count = await cells.count();
  assert(count >= 1 && count <= 6, `The gun screen must show 1 to 6 guns, got ${count}`);
  await cells.first().click();
  await page.waitForFunction(() => document.querySelector('#ui .gun-cell')?.classList.contains('picked'));
  await page.locator('#ui .all-key').click();
  await page.waitForFunction(() => !document.querySelector('#ui .gun-cell.picked'));
}

async function checkOffAir(page) {
  const original = await page.evaluate(() => structuredClone(window.__ROAM__.state));
  await page.evaluate(async () => {
    const game = window.__ROAM__;
    const world = (await import('/src/sim/world.ts')).cloneWorld(game.state);
    world.setup = { ...world.setup, mode: 'chaosHighway' };
    game.apply(world);
  });
  await page.waitForFunction(() => document.querySelector('#ui .radio-plate').classList.contains('off-air'));
  assert(!(await page.locator('#ui .radio-plate .radio-band').isVisible()), 'Chaos Highway must turn the radio band off');
  await page.evaluate(world => window.__ROAM__.apply(world), original);
  await page.waitForFunction(() => !document.querySelector('#ui .radio-plate').classList.contains('off-air'));
}

const HUD_VIEWPORTS = [[1920, 1080], [1280, 720], [1100, 700], [1280, 656], [1024, 656], [900, 656], [800, 656], [700, 800]];

async function checkHudSizes(page, label) {
  for (const [width, height] of HUD_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await settleLayers(page, width);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await checkHud(page, `${label} at ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await settleLayers(page, 1280);
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
      await page.locator('#ui .system-menu').click();
      await page.locator('[data-entry=options]').click();
      await page.waitForFunction(() => document.querySelectorAll('.options .knob').length === 4);
    };
    await openOptions();
    const values = () => page.evaluate(() => [...document.querySelectorAll('.options .knob')].map(k => k.getAttribute('aria-valuenow')));
    const muted = () => page.evaluate(() => document.querySelector('.options .sound-mute button').getAttribute('aria-pressed') ?? document.querySelector('.options .sound-mute').innerHTML);
    const game = () => page.evaluate(() => {
      const g = window.__ROAM__;
      return JSON.stringify([g.state === window.__knobState, g.rig.camera.position.toArray().map(v => Math.round(v * 1000) / 1000)]);
    });
    await page.evaluate(() => { window.__knobState = window.__ROAM__.state; });
    const box = selector => page.evaluate(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, selector);
    const cells = page.locator('.options .knob-cell');
    const rects = await cells.evaluateAll(nodes => nodes.map(n => ({ cell: n.getBoundingClientRect().toJSON(), knob: n.querySelector('.knob').getBoundingClientRect().toJSON() })));
    const mute = await box('.options .sound-mute');
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
    assert.equal(await muted(), muteBefore, `${at} M must not flip the mute switch`);
    assert.deepEqual(await values(), held, `${at} M must not change a level`);
    if (await page.locator('.character-screen:visible').count()) await page.keyboard.press('m');
    assert.equal(await game(), cameraBefore, `${at} the knob checks must leave the camera alone`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('roam-sound')).volume);
    assert.deepEqual(['music', 'sfx', 'ambient', 'ui'].map(b => String(Math.round(stored[b] * 100))), held, `${at} the stored levels must match the knobs`);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `.playtest/knobs-rest-${viewport.width}.png`, clip: await box('.options'), timeout: 120000 });
    await page.reload();
    await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: 90000 });
    await openOptions();
    assert.deepEqual(await values(), held, `${at} the levels must survive a reload`);
    assert.deepEqual(errors, [], `${at} no uncaught page errors`);
  } finally {
    await page.close();
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(software ? 180000 : 30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(playUrl(url));
  await page.waitForFunction(() => window.__ROAM__?.state && document.querySelector('#ui .radio-plate')?.checkVisibility());
  await page.evaluate(() => document.head.append(Object.assign(document.createElement('style'), { textContent: '#ui .tip { display: none !important }' })));
  await mkdir('.playtest', { recursive: true });
  assert(await page.locator('.icon').evaluateAll(nodes => nodes.every(node => node.title)), 'Every icon needs a hover name');
  await checkHud(page, 'at 1280x720');
  await checkRockers(page);
  await checkLogWheel(page);
  await checkKnob(page);
  await checkGuns(page);
  await checkOffAir(page);
  await page.screenshot({ path: '.playtest/hud-1280.png' });

  await page.keyboard.press('i');
  assert(await page.locator('.inventory-screen').isVisible(), 'I must open the inventory');
  await page.keyboard.press('Escape');
  await page.keyboard.press('i');
  const movable = page.locator('.inv-item:not(.fixed)').first();
  const name = (await movable.getAttribute('title')).split('\n')[0].split(' (')[0];
  await movable.click({ force: true });
  assert((await page.locator('.inv-inspection').innerText()).includes(name), 'Clicking a movable item must inspect it before drag/drop replaces its node');
  assert.notEqual(await page.locator('.inv-inspection .item-icon').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'Item icons outside the weapon panel must keep their tone tile');
  const inventoryBox = await page.locator('.modal:visible').boundingBox();
  assert(inventoryBox.y + inventoryBox.height <= (page.viewportSize()?.height ?? 0), 'The inventory must fit the window');
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  const characterFrame = await page.locator('.modal:visible').boundingBox();
  assert(characterFrame.y + characterFrame.height <= (page.viewportSize()?.height ?? 0), 'The character screen must fit the window');
  await page.keyboard.press('Escape');
  await page.locator('#ui .system-character').click();
  assert(await page.locator('.character-screen').isVisible(), 'The character key must open the character screen');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  assert(await page.locator('.character-screen [data-tab=map].on').count(), 'M must open the character screen on its Map tab');
  await page.keyboard.press('m');
  assert.equal(await page.locator('.modal:visible').count(), 0, 'M must close the Map tab again');
  await page.keyboard.press('k');
  assert.equal(await page.locator('.modal:visible').count(), 0, 'K must do nothing');
  await checkHudSizes(page, 'at rest');
  for (const count of [1, 3]) {
    await holdContracts(page, count);
    await hover(page, true);
    await checkHudSizes(page, `with ${count} contracts and the cursor card`);
    await hover(page, false);
  }
  await holdContracts(page, 0);
  await loadHeavyHud(page);
  await checkHudSizes(page, 'with a heavy kit');
  await checkHudOutlineFixed(page, 'with a heavy kit at 1280x720');
  for (const guns of [5, 1]) {
    await trimGuns(page, guns);
    await checkHudSizes(page, `with ${guns} guns`);
  }
  await page.screenshot({ path: '.playtest/ui-regression.png' });
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    const c = await import('/src/sim/cheats.ts');
    g.apply(c.teleport(g.state, c.placeSpot(g.state, 'bowl')));
    g.screens.town.open();
  });
  await page.waitForSelector('.town-page [data-town-go]', { timeout: 90000 });
  await page.locator('.town-page [data-town-go=market]').click();
  assert((await checkCoins(page, 'town market')) > 1, 'The town market must show amounts');
  const before = page.viewportSize();
  await page.setViewportSize({ width: 1024, height: 640 });
  await checkCoins(page, 'town market 1024');
  await page.setViewportSize(before);
  assert.deepEqual(errors, [], 'No uncaught page errors');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 700, height: 800 }]) await checkKnobs(url, viewport);
  console.log('PASS: hover names, the HUD panels on screen and apart at every size, three text sizes, one top key size, named buttons, rockers that light, the log wheel, a knob that only turns, gun picks, the radio off air in Chaos Highway, the outline under every switch and value, coins in the market, modal flows and the four sound knobs');
} finally {
  await browser.close();
}
