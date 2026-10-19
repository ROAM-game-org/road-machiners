import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gpuArgs, isSoftware, rendererOf } from './gpu.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const url = arg('url', 'http://localhost:5173');
const only = arg('only', '');
const cpu = process.argv.includes('--cpu');
const fast = process.argv.includes('--fast');
const uiSizeArg = arg('ui-size', '');
const BOOT_LIMIT_MS = process.env.TEST_TIMEOUTS === 'off' ? 0 : cpu ? 240000 : 60000;
const STEP_LIMIT_MS = process.env.TEST_TIMEOUTS === 'off' ? 0 : cpu ? 120000 : 30000;
const SEED = 4242;
const OUT = 'tmp/mobile';
const SIZES = { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 }, phone: { width: 798, height: 375 } };
const UI_SIZE_KEY = 'roam.uiSize';
const SMALL_PHONE_SIZE = 0.8;
const FAULT_OPTIONS = {
  primary: ['.end-turn', '.game-menu .menu-button', '.drawer-tabs .selected', '.modal .close', '.help .close'],
  minTarget: 32,
  sidewaysOk: ['.inv-body', '.inv-grid', '.truck-shell', '.log-lines'],
  smallOk: ['a[href]', '.inv-item', '.condition-part', '[role=slider]', 'input[type=range]', '.knob'],
};
const GLYPHS = { font: 'Fira Sans Condensed', letter: 'Ж' };

const failures = [];
const lines = [];
let shotNumber = 0;

function report(orientation, name, ok, detail) {
  const line = `${ok ? 'PASS' : 'FAIL'} ${orientation} ${name}${detail ? `: ${detail}` : ''}`;
  lines.push(line);
  console.log(line);
  if (!ok) failures.push(line);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function frames(page) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    } catch (err) {
      if (attempt >= 20 || !/destroyed|navigation/.test(err.message)) throw err;
      await sleep(500);
    }
  }
}

class Touch {
  constructor(page, cdp) {
    this.page = page;
    this.cdp = cdp;
  }

  send(type, points) {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1 })) });
  }

  async tap(x, y) {
    await this.page.touchscreen.tap(x, y);
    await frames(this.page);
  }

  async tapOn(selector, which = 0) {
    const box = await this.box(selector, which);
    await this.tap(box.x + box.width / 2, box.y + box.height / 2);
  }

  async box(selector, which = 0) {
    const locator = this.page.locator(selector).nth(which);
    await locator.waitFor({ state: 'visible', timeout: STEP_LIMIT_MS });
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`No box for ${selector}`);
    return box;
  }

  async drag(from, to, steps = 8) {
    const sends = [this.send('touchStart', [from])];
    for (let i = 1; i <= steps; i++) {
      sends.push(this.send('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]));
    }
    sends.push(this.send('touchEnd', []));
    await Promise.all(sends);
    await frames(this.page);
  }

  async hold(x, y, ms) {
    await this.send('touchStart', [{ x, y }]);
    await sleep(ms);
    await frames(this.page);
    await this.send('touchEnd', []);
    await frames(this.page);
  }

  async pinch(center, from, to, steps = 8) {
    const at = (r) => [{ x: center.x - r, y: center.y, id: 1 }, { x: center.x + r, y: center.y, id: 2 }];
    const sends = [this.send('touchStart', at(from))];
    for (let i = 1; i <= steps; i++) sends.push(this.send('touchMove', at(from + ((to - from) * i) / steps)));
    sends.push(this.send('touchEnd', []));
    await Promise.all(sends);
    await frames(this.page);
  }
}

const faultsIn = (page, scope = '#ui') =>
  page.evaluate(
    async ({ options, glyphs, scope }) => {
      const { findLayoutFaults, findMobileFaults } = await import('/src/ui/dom.ts');
      const root = document.querySelector(scope);
      return [...findLayoutFaults(root, { locale: 'en', allow: ['WOT RADIO', 'FM', 'DAY', 'English'], glyphs }), ...findMobileFaults(root, { ...options, viewportWidth: window.screen.width })];
    },
    { options: FAULT_OPTIONS, glyphs: GLYPHS, scope },
  );

async function wideElementCheck(ctx) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${url}/ui.html`);
    const faults = await page.evaluate(async (options) => {
      const { findMobileFaults } = await import('/src/ui/dom.ts');
      const root = document.createElement('div');
      document.body.append(root);
      const wide = Object.assign(document.createElement('div'), { textContent: 'planted wide element' });
      wide.style.cssText = 'position:fixed;left:0;top:200px;width:600px;height:24px;z-index:99998';
      root.append(wide);
      return findMobileFaults(root, { ...options, viewportWidth: window.screen.width });
    }, FAULT_OPTIONS);
    if (!faults.some((f) => f.kind === 'sideways-overflow')) throw new Error('The mobile check did not report the planted wide element');
  } finally {
    await page.close();
  }
}

async function selfCheck(session, orientation) {
  const { page, touch, ctx } = session;
  await page.evaluate(() => {
    const cover = Object.assign(document.createElement('div'), { id: 'planted-cover' });
    cover.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent';
    document.body.append(cover);
  });
  const faults = await faultsIn(page);
  const covered = faults.some((f) => f.kind === 'covered-control' && f.path.includes('end-turn'));
  const before = await page.evaluate(() => JSON.stringify(window.__ROAM__.state.vehicles.find((v) => v.faction === 'player').order));
  await touch.tap(SIZES[orientation].width * 0.7, SIZES[orientation].height * 0.5);
  const after = await page.evaluate(() => JSON.stringify(window.__ROAM__.state.vehicles.find((v) => v.faction === 'player').order));
  await page.evaluate(() => document.getElementById('planted-cover')?.remove());
  if (!covered) throw new Error('The mobile check did not report the planted cover over End turn');
  if (before !== after) throw new Error('A tap through the planted cover still gave an order, so the input check is blind');
  await wideElementCheck(ctx);
  report(orientation, 'self-check catches a planted cover, a blocked tap and a planted wide element', true);
}

async function context(browser, orientation, storageState, uiSize = uiSizeArg) {
  const { width, height } = SIZES[orientation];
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: fast ? 1 : 2, storageState });
  if (uiSize !== '') await ctx.addInitScript(([key, pct]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, String(Number(pct) / 100)); }, [UI_SIZE_KEY, String(uiSize)]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(STEP_LIMIT_MS);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('dialog', (d) => d.accept());
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, errors, touch: new Touch(page, cdp) };
}

async function hideCanvasForSpeed(page) {
  if (fast) await page.addStyleTag({ content: '#game canvas { opacity: 0 }' });
}

function stepper(session, orientation) {
  const { page, errors } = session;
  return async function step(name, action, check, options = {}) {
    shotNumber += 1;
    const label = `${String(shotNumber).padStart(2, '0')}-${name}`;
    let ok = true;
    let detail = '';
    try {
      await action();
      await frames(page);
      let outcome = check ? await check() : true;
      for (let retry = 0; outcome !== true && retry < 10 && options.settle !== false; retry++) {
        await sleep(300);
        await frames(page);
        outcome = await check();
      }
      if (outcome !== true) {
        ok = false;
        detail = String(outcome);
      }
      await game(page, () => document.fonts.ready);
      await page.screenshot({ path: `${OUT}/${orientation}-${label}.png` });
      if (!options.skipFaults) {
        const faults = await faultsIn(page, options.scope);
        if (faults.length > 0) {
          ok = false;
          detail += `${detail ? '; ' : ''}${faults.length} layout faults: ${faults.slice(0, 4).map((f) => `${f.kind} ${f.path} ${JSON.stringify(f.text)} ${f.sizes}`).join(' | ')}`;
        }
      }
      if (errors.length > 0) {
        ok = false;
        detail += `${detail ? '; ' : ''}page error: ${errors.splice(0).join(' / ').slice(0, 300)}`;
      }
      if (await game(page, () => document.body.innerText.includes('The game crashed'))) {
        ok = false;
        detail += `${detail ? '; ' : ''}crash screen`;
      }
    } catch (err) {
      ok = false;
      detail += `${detail ? '; ' : ''}${err.message.split('\n')[0]}`;
    }
    report(orientation, label, ok, detail);
    return ok;
  };
}

async function game(page, fn, arg) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await page.evaluate(fn, arg);
    } catch (err) {
      if (attempt >= 20 || !/destroyed|navigation/.test(err.message)) throw err;
      await sleep(500);
    }
  }
}
const playerOf = () => window.__ROAM__.state.vehicles.find((v) => v.faction === 'player');

async function waitGame(page) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction(() => window.__ROAM__?.state && !document.getElementById('boot'), null, { timeout: BOOT_LIMIT_MS || undefined });
      break;
    } catch (err) {
      if (attempt >= 5 || !/destroyed|navigation/.test(err.message)) throw err;
    }
  }
  await page.waitForTimeout(1500);
}

async function dismissIntro(page, touch) {
  for (let i = 0; i < 80; i++) {
    const open = await game(page, () => window.__ROAM__.screens.quest.isOpen());
    if (!open) return;
    const choices = page.locator('#ui button.quest-choice:visible');
    if ((await choices.count()) > 0) {
      const box = await choices.first().boundingBox();
      await touch.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      const text = await page.locator('#ui .quest-text').first().boundingBox();
      await touch.tap(text.x + text.width / 2, text.y + Math.min(text.height / 2, 80));
    }
    await sleep(400);
  }
  await page.screenshot({ path: `${OUT}/debug-intro.png` });
  throw new Error('The opening quest page did not close by touch');
}

async function freshStart(session, orientation, step) {
  const { page, touch } = session;
  await step('boot-menu', async () => {
    await page.goto(`${url}/?seed=${SEED}`);
    await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS || undefined });
  }, null);
  await step('new-game', () => touch.tapOn('#ui .start-menu >> text=New game'), () => page.locator('#ui .mode-list').isVisible(), { scope: '#ui .new-game' });
  await step('skip-intro', () => touch.tapOn('#ui .new-game .intro-toggle'), async () => ((await page.locator('#ui .intro-toggle').getAttribute('aria-checked')) === 'true' ? true : 'intro not skipped'), { scope: '#ui .new-game' });
  await step('start', async () => {
    await touch.tapOn('#ui .new-game .start');
    await sleep(1500);
    await waitGame(page);
    await hideCanvasForSpeed(page);
    await dismissIntro(page, touch);
  }, () => game(page, () => window.__ROAM__.state.turn >= 0));
}

const INIT = () => {
  window.__me = () => window.__ROAM__.state.vehicles.find((v) => v.faction === 'player');
};

const orderKind = (page) => game(page, () => window.__me().order?.kind ?? null);
const open = (page, selector) => page.locator(selector).first().isVisible();

async function tabTap(touch, drawer) {
  await touch.tapOn(`.drawer-tabs [data-tab=${drawer}]`);
}

async function openDrawer(page, touch, drawer) {
  if ((await game(page, () => document.getElementById('ui').dataset.drawer ?? null)) !== drawer) await tabTap(touch, drawer);
}

async function closeDrawer(page, touch) {
  const open = await game(page, () => document.getElementById('ui').dataset.drawer ?? null);
  if (open !== null) await tabTap(touch, open);
}

async function spawnHostile(page) {
  return game(page, async () => {
    const g = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    const world = structuredClone(runCommand(g.state, 'spawn gunwagon hostile').world);
    const npc = world.vehicles.filter((v) => v.brain).at(-1);
    g.apply(world);
    g.rig.setZoom(1);
    return npc.id;
  });
}

async function screenOfVehicle(page, id) {
  return game(page, (id) => {
    const g = window.__ROAM__;
    const frame = g.frames[id];
    return frame ? g.rig.screenOf(frame.pos) : null;
  }, id);
}

async function freeCanvasPoint(page, size, vx, vy) {
  return game(page, ({ size, vx, vy }) => {
    for (const fy of [0.72, 0.62, 0.52, 0.42, 0.32]) {
      for (const fx of [0.5, 0.2, 0.8, 0.35, 0.65]) {
        const start = { x: size.width * fx, y: size.height * fy };
        const end = { x: start.x + vx, y: start.y + vy };
        const inside = end.x > 5 && end.x < size.width - 5 && end.y > 5 && end.y < size.height - 5;
        if (inside && document.elementFromPoint(start.x, start.y)?.tagName === 'CANVAS') return start;
      }
    }
    return null;
  }, { size, vx, vy });
}

async function bringIntoView(page, touch, id, size) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const at = await screenOfVehicle(page, id);
    if (at.x > 25 && at.x < size.width * 0.28 && at.y > size.height * 0.25 && at.y < size.height * 0.75) return at;
    const vx = size.width * 0.14 - at.x;
    const vy = size.height * 0.5 - at.y;
    const start = await freeCanvasPoint(page, size, vx, vy);
    if (!start) throw new Error(`No free map point to drag the truck from ${JSON.stringify(at)}`);
    await touch.drag(start, { x: start.x + vx, y: start.y + vy });
    await frames(page);
  }
  return screenOfVehicle(page, id);
}

async function inspectAndAim(session, step, orientation) {
  const { page, touch } = session;
  const npcId = await spawnHostile(page);
  await game(page, () => window.__ROAM__.follow.recenter());
  await page.waitForTimeout(1200);
  await step('pick-gun', async () => {
    await openDrawer(page, touch, 'guns');
    await touch.tapOn('.weapons .weapon-pick');
    await closeDrawer(page, touch);
  }, async () => ((await game(page, () => window.__ROAM__.selected)) ? true : 'no weapon selected'));
  let at = await screenOfVehicle(page, npcId);
  await step('tap-truck-pins', async () => {
    at = await bringIntoView(page, touch, npcId, SIZES[orientation]);
    await touch.tap(at.x, at.y);
  }, async () => {
    const [pin, aimed] = await game(page, (id) => [window.__ROAM__.pin.id, Object.keys(window.__me().weaponOrders).length], npcId);
    return pin === npcId && aimed === 0 ? true : `pin ${pin}, aims ${aimed}`;
  });
  await step('tap-truck-aims', async () => {
    await sleep(600);
    at = await bringIntoView(page, touch, npcId, SIZES[orientation]);
    await touch.tap(at.x, at.y);
  }, async () => {
    const aimed = await game(page, () => Object.keys(window.__me().weaponOrders).length);
    if (aimed > 0) return true;
    return `no aim after the second tap: ${JSON.stringify(await game(page, ({ x, y }) => ({ pin: window.__ROAM__.pin.id, selected: window.__ROAM__.selected, anim: !!window.__ROAM__.anim, hit: document.elementFromPoint(x, y)?.tagName, log: window.__ROAM__.hud.logTexts().slice(-2), orders: JSON.stringify(window.__me().weaponOrders), auto: window.__ROAM__.state.player.autoFire }), at))}`;
  });
  await step('card-unpin', () => touch.tapOn('.info .info-touch button[aria-label]'), async () => ((await game(page, () => window.__ROAM__.pin.id)) === null ? true : 'still pinned'));
  void orientation;
}

async function townAndShop(session, step) {
  const { page, touch } = session;
  const { pad, inside } = await game(page, async () => {
    const g = window.__ROAM__;
    const c = await import('/src/sim/cheats.ts');
    const { REGION } = await import('/src/data/region.ts');
    const town = REGION.towns.find((t) => t.id === 'bowl');
    const pad = c.placeSpot(g.state, 'bowl');
    const length = Math.hypot(pad.x - town.pos.x, pad.y - town.pos.y);
    const dir = { x: (pad.x - town.pos.x) / length, y: (pad.y - town.pos.y) / length };
    g.apply(c.teleport(g.state, { x: pad.x + dir.x * 6, y: pad.y + dir.y * 6 }));
    g.rig.setZoom(0.6);
    g.follow.recenter();
    return { pad, inside: { x: town.pos.x + dir.x * (town.radius - 3), y: town.pos.y + dir.y * (town.radius - 3) } };
  });
  await page.waitForFunction(() => {
    const g = window.__ROAM__;
    const frame = g.frames[window.__me().id];
    if (!frame) return false;
    const at = g.rig.screenOf(frame.pos);
    return Math.hypot(at.x - window.innerWidth / 2, at.y - window.innerHeight / 2) < 25;
  }, null, { timeout: STEP_LIMIT_MS });
  const spot = await game(page, async (center) => {
    const g = window.__ROAM__;
    const f = await import('/src/phys/frames.ts');
    return g.rig.screenOf(f.groundPoint(g.state.terrain, center));
  }, inside);
  await step('tap-town', () => touch.tap(spot.x, spot.y), async () => {
    const order = await game(page, () => window.__me().order);
    return order?.kind === 'stopAt' ? true : `order ${JSON.stringify(order)} at ${JSON.stringify(spot)} hit ${await game(page, ({ x, y }) => document.elementFromPoint(x, y)?.tagName, spot)} pin ${await game(page, () => window.__ROAM__.pin.id)}`;
  });
  await step('open-town', async () => {
    await game(page, async (pad) => {
      const g = window.__ROAM__;
      const c = await import('/src/sim/cheats.ts');
      g.apply(c.teleport(g.state, pad));
    }, pad);
    await page.waitForTimeout(800);
    await touch.tapOn('.action button:not(.cycle)');
  }, () => game(page, () => window.__ROAM__.screens.town.isOpen() || 'the town did not open'));
  const money = await game(page, () => window.__ROAM__.state.player.money);
  await step('buy-one', async () => {
    await touch.tapOn('.town-screen [data-tab=market]');
    await touch.tapOn('.town-screen .trade.buy button:not([aria-disabled=true]):not([disabled])');
  }, async () => {
    const now = await game(page, () => window.__ROAM__.state.player.money);
    return now < money ? true : `money ${money} -> ${now}`;
  });
  await step('leave-town', () => touch.tapOn('.town-screen .close'), () => game(page, () => !window.__ROAM__.screens.town.isOpen() || 'the town is still open'));
}

async function inventoryByTouch(session, step) {
  const { page, touch } = session;
  await step('open-inventory', async () => {
    await openDrawer(page, touch, 'truck');
    await touch.tapOn('.truck-instrument');
  }, () => game(page, () => window.__ROAM__.screens.inventory.isOpen() || 'the inventory did not open'));
  const geometry = async () => {
    const storage = await touch.box('[data-drop=storage]');
    const rotateBox = await touch.box('#ui .modal h3 button.touch-only');
    const gun = await game(page, async () => {
      const { vehicleStats } = await import('/src/sim/stats.ts');
      const { playerVehicle } = await import('/src/sim/damage.ts');
      const me = playerVehicle(window.__ROAM__.state);
      const partId = vehicleStats(window.__ROAM__.state, me).weapons[0].part.id;
      return me.items.find((it) => it.kind === 'part' && it.part.id === partId).id;
    });
    const itemBox = await touch.box(`.inv-item[data-item-id="${gun}"]`);
    return {
      rotate: { x: rotateBox.x + rotateBox.width / 2, y: rotateBox.y + rotateBox.height / 2 },
      from: { x: itemBox.x + itemBox.width / 2, y: itemBox.y + itemBox.height / 2 },
      target: { x: storage.x + storage.width / 2, y: storage.y + 15 },
    };
  };
  let from = null;
  let target = null;
  let rotate = null;
  const storedBefore = await game(page, () => window.__ROAM__.state.player.storage.length);
  let rotatedFrom = null;
  let rotatedTo = null;
  await step('hold-rotate-drag', async () => {
    ({ from, target, rotate } = await geometry());
    if (process.env.MOBILE_TRACE) {
      page.on('console', (m) => m.text().startsWith('TRACE') && console.log(m.text()));
      await game(page, () => { for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'contextmenu', 'scroll']) window.addEventListener(t, (e) => console.log('TRACE ' + t + ' ' + e.pointerId + ' ' + (e.target.className || e.target.tagName)), true); });
    }
    await touch.send('touchStart', [{ ...from, id: 1 }]);
    await sleep(500);
    await frames(page);
    rotatedFrom = await game(page, () => { const d = window.__ROAM__.screens.inventory.view.drag; return d ? String(d.item.rot ?? 0) : null; });
    const second = { x: rotate.x, y: rotate.y, id: 2 };
    await touch.send('touchStart', [{ ...from, id: 1 }, second]);
    await sleep(120);
    await touch.send('touchEnd', [second]);
    await frames(page);
    rotatedTo = await game(page, () => { const d = window.__ROAM__.screens.inventory.view.drag; return d ? String(d.item.rot ?? 0) : null; });
    for (let i = 1; i <= 8; i++) {
      await touch.send('touchMove', [{ x: from.x + ((target.x - from.x) * i) / 8, y: from.y + ((target.y - from.y) * i) / 8, id: 1 }]);
      await sleep(16);
    }
    await touch.send('touchEnd', [{ ...target, id: 1 }]);
    await frames(page);
  }, async () => {
    const stored = await game(page, () => window.__ROAM__.state.player.storage.length);
    if (rotatedFrom === null || rotatedTo === rotatedFrom) return `Rotate did not turn the held item: ${rotatedFrom} -> ${rotatedTo}; from ${JSON.stringify(from)}; ${JSON.stringify(await game(page, ({ x, y }) => { const v = window.__ROAM__.screens.inventory.view; const e = document.elementFromPoint(x, y); return { drag: !!v.drag, press: !!v.press, holdId: v.holdId, hit: e?.tagName + '.' + e?.className }; }, from))}`;
    return stored > storedBefore ? true : `storage ${storedBefore} -> ${stored}, rotation ${rotatedFrom} -> ${rotatedTo}, item at ${JSON.stringify(from)} hit ${await game(page, ({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.tagName + '.' + e?.className; }, from)}`;
  });
  await step('close-inventory', () => touch.tapOn('.modal .close'), () => game(page, () => !window.__ROAM__.screens.inventory.isOpen() || 'still open'));
}

async function drawersAndMenus(session, step) {
  const { page, touch } = session;
  await closeDrawer(page, touch);
  for (const d of ['truck', 'guns', 'radio', 'log']) {
    await step(`drawer-${d}`, () => openDrawer(page, touch, d), async () => {
      const open = await game(page, () => document.getElementById('ui').dataset.drawer);
      return open === d ? true : `open drawer ${open}`;
    });
  }
  await closeDrawer(page, touch);
  await step('log-strip', () => touch.tapOn('.log-strip'), async () => {
    const open = await game(page, () => document.getElementById('ui').dataset.drawer);
    const tall = await page.locator('.log-strip').evaluate((node) => node.getBoundingClientRect().height >= 32);
    if (open !== 'log') return `the log strip opened drawer ${open}`;
    return tall ? true : 'the log strip is under 32px high';
  });
  await closeDrawer(page, touch);
  await step('menu-open', () => touch.tapOn('.game-menu .menu-button'), async () => ((await page.locator('.game-menu [role=menu]').isVisible()) ? true : 'menu list is not shown'));
  await step('help-open', () => touch.tapOn('.game-menu [data-entry=help]'), async () => ((await page.locator('#ui .help').isVisible()) ? true : 'help is not shown'));
  await step('help-close', () => touch.tapOn('#ui .help .close'), async () => ((await page.locator('#ui .help').count()) === 0 ? true : 'help is still shown'));
  await step('options-open', async () => {
    await touch.tapOn('.game-menu .menu-button');
    await touch.tapOn('.game-menu [data-entry=options]');
  }, async () => {
    if (!(await page.locator('#ui .options-language').isVisible())) return 'options are not shown';
    if ((await page.locator('#ui .options .knob').count()) !== 4) return 'Options does not hold the four volume knobs';
    return (await page.locator('#ui .options .knob').last().isVisible()) ? true : 'the Sound section is not reachable';
  });
  await step('options-close', () => touch.tapOn('#ui .options-language >> xpath=../button[contains(@class,"close")]'), async () => ((await page.locator('#ui .options-language').count()) === 0 ? true : 'options are still shown'));
}

async function longPressReason(session, step) {
  const { page, touch } = session;
  await openDrawer(page, touch, 'truck');
  const disabled = page.locator('#ui .instrument-actions [aria-disabled="true"]').first();
  const box = await disabled.boundingBox();
  const reason = await disabled.evaluate((el) => el.getAttribute('data-reason') ?? el.getAttribute('title'));
  await step('long-press-reason', () => touch.hold(box.x + box.width / 2, box.y + box.height / 2, 800), async () => {
    const shown = await page.locator('#ui .touch-tip').textContent().catch(() => null);
    return shown && shown.includes(reason.slice(0, 8)) ? true : `tip ${JSON.stringify(shown)} for reason ${JSON.stringify(reason)}`;
  });
  await closeDrawer(page, touch);
}

async function saveAndContinue(session, step, orientation) {
  const { page, touch } = session;
  const saved = await game(page, () => ({ turn: window.__ROAM__.state.turn, pos: window.__me().pos }));
  await step('save', async () => {
    await touch.tapOn('.game-menu .menu-button');
    await touch.tapOn('.game-menu [data-entry=save]');
    await touch.tapOn('.save-panel .save-row');
    await page.waitForTimeout(1500);
  }, async () => ((await page.locator('.save-panel .save-row').count()) > 0 ? true : 'no save slots'));
  await touch.tapOn('.save-panel .close');
  await step('reload-continue', async () => {
    await page.reload();
    await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS || undefined });
    await touch.tapOn('#ui .start-menu >> text=Continue');
    await sleep(1500);
    await waitGame(page);
    await hideCanvasForSpeed(page);
  }, async () => {
    const now = await game(page, () => ({ turn: window.__ROAM__.state.turn, pos: window.__me().pos }));
    return now.turn === saved.turn && Math.abs(now.pos.x - saved.pos.x) < 0.01 && Math.abs(now.pos.y - saved.pos.y) < 0.01 ? true : `saved ${JSON.stringify(saved)}, loaded ${JSON.stringify(now)}`;
  });
  void orientation;
}

async function portraitJourney(browser) {
  const orientation = 'portrait';
  const session = await context(browser, orientation);
  const { page, touch } = session;
  await page.addInitScript(INIT);
  const step = stepper(session, orientation);
  const size = SIZES[orientation];
  await freshStart(session, orientation, step);
  await selfCheck(session, orientation);
  const mid = { x: size.width / 2, y: size.height * 0.5 };

  const focusBefore = await game(page, () => JSON.stringify(window.__ROAM__.rig.focus()));
  await step('drag-map', () => touch.drag({ x: mid.x, y: mid.y }, { x: mid.x, y: mid.y - 120 }), async () => {
    const [following, focus] = await game(page, () => [window.__ROAM__.follow.isFollowing(), JSON.stringify(window.__ROAM__.rig.focus())]);
    return following === false && focus !== focusBefore ? true : `follow ${following}, focus moved ${focus !== focusBefore}`;
  });
  await step('recenter', () => touch.tapOn('.recenter button'), async () => ((await game(page, () => window.__ROAM__.follow.isFollowing())) ? true : 'follow is still off'));
  const zoomBefore = await game(page, () => window.__ROAM__.rig.zoom);
  await step('pinch-zoom', () => touch.pinch(mid, 40, 110), async () => {
    const zoom = await game(page, () => window.__ROAM__.rig.zoom);
    return zoom > zoomBefore ? true : `zoom ${zoomBefore} -> ${zoom}`;
  });
  await step('tap-ground', () => touch.tap(size.width * 0.7, size.height * 0.4), async () => ((await orderKind(page)) === 'through' ? true : `order ${await orderKind(page)}`));
  await step('hold-ground', () => touch.hold(size.width * 0.3, size.height * 0.4, 800), async () => ((await orderKind(page)) === 'stopAt' ? true : `order ${await orderKind(page)}`));
  const turn = await game(page, () => window.__ROAM__.state.turn);
  await step('end-turn', async () => {
    await touch.tapOn('.end-turn');
    await page.waitForFunction((t) => window.__ROAM__.state.turn > t, turn, { timeout: STEP_LIMIT_MS });
    await page.waitForFunction(() => !window.__ROAM__.anim, null, { timeout: STEP_LIMIT_MS });
  }, async () => ((await game(page, () => window.__ROAM__.state.turn)) > turn ? true : 'turn did not grow'));
  await inspectAndAim(session, step, orientation);
  await townAndShop(session, step);
  await inventoryByTouch(session, step);
  await drawersAndMenus(session, step);
  await longPressReason(session, step);
  await saveAndContinue(session, step, orientation);
  void open;
  const state = await session.ctx.storageState({ indexedDB: true });
  await session.ctx.close();
  return state;
}

async function continueSaved(session, step) {
  const { page, touch } = session;
  await step('boot-continue', async () => {
    await page.goto(`${url}/?seed=${SEED}`);
    await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS || undefined });
    await touch.tapOn('#ui .start-menu >> text=Continue');
    await sleep(1500);
    await waitGame(page);
    await hideCanvasForSpeed(page);
  }, () => game(page, () => window.__ROAM__.state.turn >= 0), { skipFaults: true });
}

async function seedSave(browser) {
  const orientation = 'portrait';
  const session = await context(browser, orientation);
  await session.page.addInitScript(INIT);
  const step = stepper(session, orientation);
  await freshStart(session, orientation, step);
  await saveAndContinue(session, step, orientation);
  const state = await session.ctx.storageState({ indexedDB: true });
  await session.ctx.close();
  return state;
}

async function landscapeJourney(browser, storage, orientation = 'landscape', uiSize = uiSizeArg) {
  shotNumber = 0;
  const session = await context(browser, orientation, storage, uiSize);
  const { page, touch } = session;
  await page.addInitScript(INIT);
  const step = stepper(session, orientation);
  const size = SIZES[orientation];
  await continueSaved(session, step);
  const mid = { x: size.width / 2, y: size.height * 0.62 };
  const focusBefore = await game(page, () => JSON.stringify(window.__ROAM__.rig.focus()));
  await step('drag-map', () => touch.drag({ x: mid.x, y: mid.y }, { x: mid.x - 120, y: mid.y }), async () => {
    const [following, focus] = await game(page, () => [window.__ROAM__.follow.isFollowing(), JSON.stringify(window.__ROAM__.rig.focus())]);
    return following === false && focus !== focusBefore ? true : `follow ${following}, focus moved ${focus !== focusBefore}`;
  });
  await step('recenter', () => touch.tapOn('.recenter button'), async () => ((await game(page, () => window.__ROAM__.follow.isFollowing())) ? true : 'follow is still off'));
  const turn = await game(page, () => window.__ROAM__.state.turn);
  await step('end-turn', async () => {
    await touch.tapOn('.end-turn');
    await page.waitForFunction((t) => window.__ROAM__.state.turn > t, turn, { timeout: STEP_LIMIT_MS * 4 });
    await page.waitForFunction(() => !window.__ROAM__.anim, null, { timeout: STEP_LIMIT_MS * 4 });
  }, async () => ((await game(page, () => window.__ROAM__.state.turn)) > turn ? true : 'turn did not grow'));
  await step('open-inventory', async () => {
    await openDrawer(page, touch, 'truck');
    await touch.tapOn('.truck-instrument');
  }, () => game(page, () => window.__ROAM__.screens.inventory.isOpen() || 'the inventory did not open'));
  await step('close-inventory', () => touch.tapOn('.modal .close'), () => game(page, () => !window.__ROAM__.screens.inventory.isOpen() || 'still open'));
  await drawersAndMenus(session, step);
  await openDrawer(page, touch, 'truck');
  await step('rotate-to-portrait', async () => {
    await page.setViewportSize(SIZES.portrait);
    await sleep(800);
  }, async () => ((await game(page, () => window.innerHeight > window.innerWidth)) ? true : 'the window did not turn'));
  await step('drawer-after-turn', () => openDrawer(page, touch, 'guns'), async () => (((await game(page, () => document.getElementById('ui').dataset.drawer)) === 'guns') ? true : 'the drawer did not open after the turn'));
  await closeDrawer(page, touch);
  await step('end-turn-after-turn', async () => {
    const before = await game(page, () => window.__ROAM__.state.turn);
    await touch.tapOn('.end-turn');
    await page.waitForFunction((t) => window.__ROAM__.state.turn > t, before, { timeout: STEP_LIMIT_MS * 4 });
    await page.waitForFunction(() => !window.__ROAM__.anim, null, { timeout: STEP_LIMIT_MS * 4 });
  }, null);
  await session.ctx.close();
}

const appliedSize = (page) => game(page, async () => (await import('/src/ui/ui-size.ts')).uiSize().applied());

async function uiSizeJourney(browser, storage) {
  const orientation = 'phone';
  shotNumber = 100;
  const session = await context(browser, orientation, storage, '');
  const { page, touch } = session;
  await page.addInitScript(INIT);
  const step = stepper(session, orientation);
  await step('size-boot-menu', async () => {
    await page.goto(`${url}/?seed=${SEED}`);
    await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS || undefined });
  }, async () => ((await appliedSize(page)) === 1 ? true : 'the default size is not 100%'));
  await step('size-continue', async () => {
    await touch.tapOn('#ui .start-menu >> text=Continue');
    await sleep(1500);
    await waitGame(page);
    await hideCanvasForSpeed(page);
  }, async () => ((await game(page, () => window.__ROAM__.state.turn >= 0)) ? true : 'no game'));
  await step('size-options-open', async () => {
    await touch.tapOn('.game-menu .menu-button');
    await touch.tapOn('.game-menu [data-entry=options]');
  }, async () => ((await page.locator('#ui .ui-size-switch').isVisible()) ? true : 'the UI size row is not shown'));
  await step('size-pick-90', () => touch.tapOn('#ui .ui-size-switch > :nth-child(2)'), async () => {
    const applied = await appliedSize(page);
    return applied === 0.9 ? true : `applied ${applied}`;
  });
  await step('size-off-reason', () => touch.tapOn('#ui .ui-size-switch > :nth-child(5)'), async () => {
    const shown = await page.locator('#ui .touch-tip').textContent().catch(() => null);
    const applied = await appliedSize(page);
    return shown && shown.includes('Too big') && applied === 0.9 ? true : `tip ${JSON.stringify(shown)}, applied ${applied}`;
  });
  await step('size-options-close', () => touch.tapOn('#ui .options .close'), async () => ((await page.locator('#ui .options').count()) === 0 ? true : 'options are still shown'));
  await step('size-guns-drawer', () => openDrawer(page, touch, 'guns'), async () => (((await game(page, () => document.getElementById('ui').dataset.drawer)) === 'guns') ? true : 'the drawer did not open'));
  await closeDrawer(page, touch);
  await step('size-reload-keeps', async () => {
    await page.reload();
    await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS || undefined });
  }, async () => {
    const applied = await appliedSize(page);
    return applied === 0.9 ? true : `applied ${applied} after the reload`;
  });
  await session.ctx.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ args: cpu ? [] : gpuArgs() });
  try {
    const orientations = only ? [only] : ['portrait', 'landscape', 'phone', 'size'];
    let storage;
    if (orientations.includes('portrait')) storage = await portraitJourney(browser);
    if (orientations.includes('landscape')) await landscapeJourney(browser, storage ?? (await seedSave(browser)));
    if (orientations.includes('phone')) {
      storage ??= await seedSave(browser);
      await landscapeJourney(browser, storage, 'phone', uiSizeArg === '' ? String(SMALL_PHONE_SIZE * 100) : uiSizeArg);
    }
    if (orientations.includes('size')) await uiSizeJourney(browser, storage ?? (await seedSave(browser)));
  } finally {
    await browser.close();
  }
  console.log('touch emulation in Chromium, not a real device');
  process.exit(failures.length > 0 ? 1 : 0);
}

void playerOf;
void isSoftware;
void rendererOf;
await main();
