import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const url = arg('url', 'http://localhost:5173');
const out = arg('out', 'tmp/pad-check');
const sizes = arg('sizes', '1280x720,1280x800,1920x1080').split(',').map((s) => s.split('x').map(Number));
const BOOT_LIMIT_MS = 300000;
const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 };
const LIGHTS_ON_RADIAL = [0.5, -0.87, 0, 0];

const FAKE_PAD = () => {
  const state = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  const pad = { id: 'pad-check', index: 0, connected: true, mapping: 'standard', timestamp: 0, vibrationActuator: null, get buttons() { return state.buttons; }, get axes() { return state.axes; } };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
  window.__PAD__ = state;
};

class PadDriver {
  constructor(page, tag, failures, size) {
    this.page = page;
    this.tag = tag;
    this.failures = failures;
    this.size = size;
  }

  fail(what) {
    this.failures.push(`${this.tag}: ${what}`);
  }

  setButton(name, down) {
    return this.page.evaluate(([i, d]) => { window.__PAD__.buttons[i] = { pressed: d, touched: d, value: d ? 1 : 0 }; }, [BUTTON[name], down]);
  }

  setAxes(axes) {
    return this.page.evaluate((a) => { window.__PAD__.axes = a; }, axes);
  }

  frames(n) {
    return this.page.evaluate((count) => new Promise((done) => {
      let seen = 0;
      const step = () => (++seen >= count ? done() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }), n);
  }

  press(name) {
    return this.page.evaluate((i) => new Promise((done) => {
      const set = (down) => { window.__PAD__.buttons[i] = { pressed: down, touched: down, value: down ? 1 : 0 }; };
      set(true);
      requestAnimationFrame(() => {
        set(false);
        requestAnimationFrame(() => requestAnimationFrame(done));
      });
    }), BUTTON[name]);
  }

  async tilt(axes, count) {
    await this.setAxes(axes);
    await this.frames(count);
    await this.setAxes([0, 0, 0, 0]);
    await this.frames(2);
  }

  reticle() {
    return this.page.evaluate(() => {
      const r = document.querySelector('.pad-reticle').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  }

  async steerTo(x, y) {
    for (let i = 0; i < 120; i++) {
      const at = await this.reticle();
      const d = Math.hypot(x - at.x, y - at.y);
      if (d < 8) break;
      const tilt = Math.min(1, Math.max(0.4, d / 120));
      await this.setAxes([((x - at.x) / d) * tilt, ((y - at.y) / d) * tilt, 0, 0]);
      await this.frames(1);
    }
    await this.setAxes([0, 0, 0, 0]);
    await this.frames(2);
  }

  reticleOn(selector) {
    return this.page.evaluate((s) => {
      const r = document.querySelector('.pad-reticle').getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(s) !== null;
    }, selector);
  }

  padMode() {
    return this.page.evaluate(() => document.documentElement.classList.contains('pad'));
  }

  world() {
    return this.page.evaluate(() => {
      const s = window.__ROAM__.state;
      const me = s.vehicles.find((v) => v.id === s.player.vehicleId);
      return { turn: s.turn, order: me.order, headlights: s.player.headlights };
    });
  }

  shot(name) {
    return this.page.screenshot({ path: `${out}/${this.tag}-${name}.png` });
  }
}

async function startsPadMode(pad) {
  await pad.tilt([0.5, 0, 0, 0], 2);
  if (!(await pad.padMode())) pad.fail('pad mode did not start on stick input');
  if (!(await pad.page.locator('.pad-reticle').isVisible())) pad.fail('the reticle is not shown');
}

async function radialSwitchesLights(pad) {
  const lights = (await pad.world()).headlights;
  await pad.setButton('y', true);
  await pad.page.waitForTimeout(700);
  await pad.frames(2);
  if (!(await pad.page.locator('.pad-radial').isVisible())) pad.fail('holding Y did not open the radial dash');
  await pad.setAxes(LIGHTS_ON_RADIAL);
  await pad.frames(2);
  await pad.shot('radial');
  await pad.setButton('y', false);
  await pad.frames(2);
  await pad.setAxes([0, 0, 0, 0]);
  await pad.frames(2);
  if ((await pad.world()).headlights === lights) pad.fail('the radial Lights entry did not switch the headlights');
}

async function yOpensInventory(pad) {
  await pad.press('y');
  await pad.frames(3);
  if (!(await pad.page.locator('.inv-grid').first().isVisible())) pad.fail('Y did not open the inventory');
  await pad.shot('inventory');
  await pad.press('b');
  await pad.frames(2);
}

async function menuReachesHelp(pad) {
  await pad.press('menu');
  await pad.frames(3);
  if (!(await pad.page.locator('.game-menu [role=menu]').isVisible())) pad.fail('Menu did not open the game menu');
  await pad.shot('menu');
  for (let i = 0; i < 8 && !(await pad.reticleOn('[data-entry=help]')); i++) await pad.press('down');
  await pad.press('a');
  await pad.frames(3);
  const help = await pad.page.locator('.help-groups').innerText().catch(() => '');
  if (!/controller|геймпад/i.test(help)) pad.fail(`the help panel does not show the Controller group: ${help.slice(0, 80)}`);
  await pad.shot('help');
  await pad.press('b');
  if (await pad.page.evaluate(() => window.__ROAM__.menu.isOpen())) pad.fail('B did not close the help panel');
}

async function openOptions(pad) {
  await pad.press('menu');
  await pad.frames(3);
  for (let i = 0; i < 10 && !(await pad.reticleOn('[data-entry=options]')); i++) await pad.press('down');
  await pad.press('a');
  await pad.frames(4);
}

async function optionsKeepsTheReticle(pad) {
  await openOptions(pad);
  if (!(await pad.reticleOn('.options'))) pad.fail('opening Options from the menu left the reticle outside Options');
  for (let i = 0; i < 4; i++) await pad.press('down');
  if (!(await pad.reticleOn('.options'))) pad.fail('the D-pad moved the reticle out of Options');
  await pad.shot('options');
  await pad.press('b');
  await pad.frames(3);
  if (await pad.page.evaluate(() => window.__ROAM__.menu.isOpen())) await pad.press('b');
}

async function aSetsRoute(pad) {
  await pad.steerTo(pad.size.width / 2 + 120, pad.size.height / 2 - 90);
  await pad.press('a');
  await pad.page.waitForTimeout(300);
  if ((await pad.world()).order === null) pad.fail('A on the ground set no order');
  await pad.shot('order');
}

async function rtPlaysTurn(pad) {
  const turn = (await pad.world()).turn;
  await pad.press('rt');
  await pad.page.waitForFunction((t) => window.__ROAM__.state.turn > t, turn, { timeout: 60000 }).catch(() => pad.fail('RT did not play a turn'));
}

async function mouseLeavesPadMode(pad) {
  await pad.page.mouse.move(pad.size.width / 3, pad.size.height / 3);
  await pad.page.waitForTimeout(200);
  if (await pad.padMode()) pad.fail('a mouse move did not leave pad mode');
}

async function menuButtonCentre(pad) {
  const box = await pad.page.locator('.system-menu').boundingBox();
  if (!box) throw new Error('no Menu button in the HUD');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function wakingPressOnlyWakes(pad) {
  await pad.tilt([0.5, 0, 0, 0], 2);
  const menu = await menuButtonCentre(pad);
  await pad.steerTo(menu.x, menu.y);
  await pad.frames(3);
  if (!(await pad.reticleOn('.system-menu'))) pad.fail(`the reticle did not land on the Menu button at ${JSON.stringify(menu)}, it is at ${JSON.stringify(await pad.reticle())} over ${await pad.page.evaluate(() => { const r = document.querySelector('.pad-reticle').getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.className; })}`);
  await pad.page.mouse.move(pad.size.width / 4, pad.size.height / 4);
  await pad.page.waitForTimeout(200);
  await pad.press('a');
  await pad.frames(3);
  if (!(await pad.padMode())) pad.fail('A did not wake pad mode');
  if (await pad.page.evaluate(() => window.__ROAM__.menu.isOpen())) pad.fail('the A press that woke pad mode also pressed the control under the reticle');
  await pad.press('a');
  await pad.frames(3);
  if (!(await pad.page.evaluate(() => window.__ROAM__.menu.isOpen()))) pad.fail('A after waking did not press the Menu button');
  await pad.press('b');
  await pad.frames(3);
}

async function leavingReleasesRt(pad) {
  await pad.tilt([0.5, 0, 0, 0], 2);
  await pad.setButton('rt', true);
  await pad.page.waitForTimeout(1200);
  await pad.page.mouse.move(pad.size.width / 3, pad.size.height / 2);
  await pad.page.waitForTimeout(200);
  const held = await pad.page.evaluate(() => window.__ROAM__.travel.isFast(performance.now()));
  await pad.setButton('rt', false);
  await pad.frames(2);
  if (held) pad.fail('leaving pad mode with RT held kept the turn key held');
}

async function heldADragsAnItem(pad) {
  await pad.press('y');
  await pad.frames(3);
  const box = await pad.page.locator('.inventory-screen .inv-item[data-item-id]:not(.fixed):not(.mounted)').first().boundingBox();
  if (!box) return pad.fail('the inventory shows no item to drag');
  await pad.steerTo(box.x + box.width / 2, box.y + box.height / 2);
  await pad.setButton('a', true);
  await pad.page.waitForTimeout(900);
  await pad.frames(2);
  if (!(await pad.page.locator('.inv-ghost').isVisible())) pad.fail('holding A on an item did not pick it up');
  await pad.tilt([0.6, 0, 0, 0], 6);
  await pad.setButton('a', false);
  await pad.frames(3);
  if (await pad.page.locator('.inv-ghost').count()) pad.fail('letting go of A did not drop the item');
  await pad.press('b');
  await pad.frames(3);
}

const STEPS = [startsPadMode, radialSwitchesLights, yOpensInventory, heldADragsAnItem, menuReachesHelp, optionsKeepsTheReticle, aSetsRoute, rtPlaysTurn, mouseLeavesPadMode, wakingPressOnlyWakes, leavingReleasesRt];

async function openGame(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(FAKE_PAD);
  await page.goto(playUrl(url));
  await page.waitForFunction(() => window.__ROAM__, null, { timeout: BOOT_LIMIT_MS });
  await page.waitForSelector('#boot', { state: 'detached', timeout: BOOT_LIMIT_MS });
  await page.waitForTimeout(1500);
  return page;
}

async function check(width, height) {
  const page = await openGame(width, height);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  const pad = new PadDriver(page, `${width}x${height}`, failures, { width, height });
  for (const step of STEPS) await step(pad);
  for (const e of errors) pad.fail(`page error: ${e.split('\n')[0]}`);
  await page.close();
}

mkdirSync(out, { recursive: true });
const failures = [];
const { browser } = await launchChromium(chromium, process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [width, height] of sizes) await check(width, height);
await browser.close();
if (failures.length > 0) {
  console.error(`FAIL\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`pad check passed at ${sizes.map((s) => s.join('x')).join(', ')}; screenshots in ${out}`);
