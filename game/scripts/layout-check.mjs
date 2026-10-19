import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gpuArgs, isSoftware, rendererOf } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const cpu = process.argv.includes('--cpu');
const BOOT_LIMIT_MS = process.env.TEST_TIMEOUTS === 'off' ? 0 : cpu ? 240000 : 30000;
const SEED = 4242;
const LOCALES = process.env.LAYOUT_LOCALES?.split(',').filter(Boolean) ?? ['en', 'ru', 'pseudo'];
const VIEWPORTS = [[1280, 720], [700, 800]];
const TALL = [1440, 900];
const KEY_CAPS = ['WASD', 'Shift', 'Esc'];
const OUT = 'tmp/layout';
const GLYPHS = { font: 'Fira Sans Condensed', letter: 'Ж' };

const key = (page, code) => page.evaluate((c) => window.__ROAM__.runKey(c), code);
const escape = (page) => page.keyboard.press('Escape');
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

function fillLog(page) {
  return page.evaluate(async () => {
    const g = window.__ROAM__;
    const { t } = await import('/src/text/msg.ts');
    const n = await import('/src/text/names.ts');
    const { moneyMsg } = await import('/src/ui/units.ts');
    const lines = [
      t('log.jobCancelled', { what: t('job.remove', { part: n.partName('tankHeavy'), truck: t('vehicle.npc', { profession: n.professionName('convoyGuard'), driver: n.fullName('Dmitri Tulloch') }) }) }),
      t('log.jobStarted', { what: t('job.repair', { part: n.partName('enclosedFrame') }), n: 12 }),
      t('log.escortHired', { client: t('vehicle.npc', { profession: n.professionName('convoy'), driver: n.fullName('Lorna Morozov') }), who: t('vehicle.npc', { profession: n.professionName('merc'), driver: n.fullName('Elias Drummond') }), site: n.siteName('canyon-bridge'), fee: moneyMsg(12345) }),
      t('log.contract.accepted', { what: t('contract.fetch', { part: n.partName('reinforcedCage'), site: n.siteName('salvage-yard'), n: 2 }), reward: moneyMsg(4200) }),
      t('note.hazard'),
      t('log.towDroppedYou.blocked', { who: t('vehicle.npc', { profession: n.professionName('bowlFarmer'), driver: n.fullName('Hester Kessler') }) }),
      t('log.scrapPatchFuel', { liters: 40 }),
      t('log.rankBoughtPerk', { skill: n.skillName('perception'), rank: 2 }),
    ];
    for (let i = 0; i < 5; i++) for (const line of lines) g.hud.note(g.state, line, 'dim');
  });
}

async function openInventory(page) {
  await key(page, 'KeyI');
  await page.evaluate(() => document.querySelector('.inv-item:not(.fixed)').click());
}

async function openTown(page, tab) {
  await page.evaluate(async () => {
    const g = window.__ROAM__;
    if (g.screens.town.isOpen()) return;
    const c = await import('/src/sim/cheats.ts');
    g.apply(c.teleport(g.state, c.placeSpot(g.state, 'bowl')));
    g.screens.town.open();
  });
  await page.evaluate((tab) => document.querySelector(`.town-screen [data-tab="${tab}"]`).click(), tab);
}

const closeTown = (page) => page.evaluate(() => window.__ROAM__.screens.town.close());

async function openCall(page, node) {
  await page.evaluate(async (node) => {
    const g = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    let w = g.state;
    let npc = w.vehicles.find((v) => v.brain && v.brain.templateId === 'trader');
    if (!npc) {
      w = runCommand(w, 'spawn trader').world;
      npc = w.vehicles.find((v) => v.brain && v.brain.templateId === 'trader');
    }
    const next = structuredClone(w);
    const way = node === 'directions' ? await longestDirections(w) : null;
    const deal = { deal: { kind: 'deal', deal: 'ownParts', patcher: 'player', price: 1250, parts: 3, turns: 4 } };
    next.player.call = node === 'hub'
      ? { with: npc.id, topic: null, node: 'hub', vars: {}, line: { line: 'whatDoYouWant', vars: {} } }
      : node === 'directions'
      ? { with: npc.id, topic: 'directions', node: 'answer', vars: way.vars, line: { line: way.line, vars: way.vars } }
      : { with: npc.id, topic: 'patchRequest', node: 'terms', vars: deal, line: { line: 'dealTerms', vars: deal } };
    g.apply(next);
    async function longestDirections(world) {
      const { directionsTo } = await import('/src/sim/directions.ts');
      const { REGION } = await import('/src/data/region.ts');
      const sites = [...REGION.towns, ...REGION.locations];
      let best = null;
      for (let x = 30; x < 600; x += 140) {
        for (let y = 40; y < 560; y += 130) {
          for (const site of sites) {
            const steps = directionsTo(world, { x, y }, { kind: 'site', id: site.id });
            const length = steps.reduce((sum, step) => sum + (step.do === 'turn' ? 2 : 1), 0);
            if (!best || length > best.length) best = { length, site, steps };
          }
        }
      }
      const town = REGION.towns.some((t) => t.id === best.site.id) ? 'town' : 'site';
      return { line: town === 'town' ? 'townWay' : 'siteWay', vars: { [town]: { kind: town, id: best.site.id }, way: { kind: 'directions', steps: best.steps } } };
    }
  }, node);
}

const hangUp = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  const next = structuredClone(g.state);
  next.player.call = null;
  g.apply(next);
});

const chooseMenuItem = (page, entry) => page.evaluate((entry) => {
  document.querySelector('#ui .game-menu .menu-button').click();
  document.querySelector(`#ui .game-menu [data-entry=${entry}]`).click();
}, entry);

const openHelp = (page) => chooseMenuItem(page, 'help');
const closeHelp = (page) => page.evaluate(() => document.querySelector('#ui .help .close').click());

const openSaves = (page) => chooseMenuItem(page, 'save');
const openOptions = (page) => chooseMenuItem(page, 'options');
const setMinimap = async (page, on) => {
  await openOptions(page);
  await page.evaluate((at) => document.querySelectorAll('#ui .minimap-switch > button')[at].click(), on ? 1 : 0);
  await escape(page);
};

function faultsIn(page, locale) {
  return page.evaluate(async ({ locale, names, glyphs }) => {
    const { findLayoutFaults } = await import('/src/ui/dom.ts');
    const allow = [...names, 'WOT RADIO', 'FM', 'DAY', 'English'];
    return findLayoutFaults(document.getElementById('ui'), { locale, allow, glyphs });
  }, { locale, names: KEY_CAPS, glyphs: GLYPHS });
}

function frameFaults(page) {
  return page.evaluate(async () => {
    const { questFrameFits } = await import('/src/ui/quest-screen.ts');
    const screen = document.querySelector('#ui .quest-screen.quest-page');
    const frame = screen?.querySelector('.quest-frame');
    if (!frame) return [];
    const { width, height } = frame.getBoundingClientRect();
    const stacked = screen.classList.contains('stacked') || document.getElementById('ui').classList.contains('phone');
    if (questFrameFits(width, height, stacked)) return [];
    return [{ kind: 'quest-frame-shape', path: '.quest-frame', text: `${Math.round(width)}x${Math.round(height)} stacked=${stacked}`, sizes: '' }];
  });
}

async function probe(page, locale) {
  const found = await page.evaluate(async ({ locale, glyphs }) => {
    const { findLayoutFaults } = await import('/src/ui/dom.ts');
    const button = Object.assign(document.createElement('button'), { textContent: 'An overflowing probe label' });
    button.style.cssText = 'position:fixed;left:8px;top:300px;width:40px;white-space:nowrap;overflow:hidden;z-index:99999';
    const holder = document.createElement('div');
    holder.append(button);
    document.getElementById('ui').append(holder);
    const faults = findLayoutFaults(holder, { locale, allow: [], glyphs });
    holder.remove();
    return faults.some((f) => f.kind === 'clipped-text' && f.text === 'An overflowing probe label');
  }, { locale, glyphs: GLYPHS });
  if (!found) throw new Error(`The layout checker did not report the planted overflowing button (${locale})`);
}

async function boot() {
  const browser = await chromium.launch({ args: cpu ? [] : gpuArgs() });
  const context = await browser.newContext({ viewport: { width: VIEWPORTS[0][0], height: VIEWPORTS[0][1] } });
  const page = await context.newPage();
  page.setDefaultTimeout(BOOT_LIMIT_MS);
  const renderer = await rendererOf(page);
  if (!cpu && isSoftware(renderer)) throw new Error(`The layout check got the software renderer ${renderer}. Run with --cpu on a machine without a GPU.`);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(playUrl(`${url}/?seed=${SEED}`));
  await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: BOOT_LIMIT_MS });
  await page.addStyleTag({ content: '#game { display: none !important }' });
  return { browser, page, errors };
}

async function inspectNpc(page, armed) {
  await page.evaluate(async (armed) => {
    const g = window.__ROAM__;
    const { runCommand } = await import('/src/ui/console.ts');
    const { partDef } = await import('/src/data/parts.ts');
    const world = structuredClone(runCommand(g.state, 'spawn gunwagon hostile').world);
    const npc = world.vehicles.filter((v) => v.brain).at(-1);
    if (!armed) npc.items = npc.items.filter((it) => !(it.kind === 'part' && partDef(it.part.defId).kind === 'weapon'));
    g.apply(world);
    g.hovered = npc.id;
    g.refreshInfo();
    g.hitCard.show();
  }, armed);
}

const clearInspect = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  g.hovered = null;
  g.refreshInfo();
});

const INSPECT_VIEWPORTS = [...VIEWPORTS, TALL];

const openStartMenu = (page) => page.evaluate(async () => {
  for (const node of document.querySelectorAll('#ui > *')) {
    node.dataset.layoutDisplay = node.style.display;
    node.style.display = 'none';
  }
  const { chooseStart } = await import('/src/ui/save-screen.ts');
  const saves = [{ slot: 'slot2', savedAt: 900, turn: 120, mode: 'roaming' }, { slot: 'auto', savedAt: 500, turn: 40, mode: 'furyRoad' }];
  void chooseStart(saves, { requestBoot: () => {}, reload: () => {}, confirm: () => false });
});

const openStartLoad = async (page) => {
  await openStartMenu(page);
  await page.locator('.start-menu .btn-l').nth(1).click();
  await page.evaluate(() => { document.querySelector('.start-menu .start-buttons').style.visibility = 'hidden'; });
};

const closeStartMenu = (page) => page.evaluate(() => {
  document.querySelector('#ui .save-panel')?.remove();
  document.querySelector('#ui .start-menu')?.remove();
  for (const node of document.querySelectorAll('#ui > [data-layout-display]')) {
    node.style.display = node.dataset.layoutDisplay;
    delete node.dataset.layoutDisplay;
  }
});

const openQuestPage = (page) => page.evaluate(async () => {
  const g = window.__ROAM__;
  const q = await import('/src/sim/quests.ts');
  const world = structuredClone(g.state);
  q.openQuest(world, q.QUESTS, 'intro_arrival', 'start');
  g.apply(world);
});

const closeQuestPage = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  const world = structuredClone(g.state);
  world.player.quests.session = null;
  world.player.quests.live = null;
  g.apply(world);
});

const STATES = {
  menu: { setup: () => undefined },
  log: { setup: fillLog },
  inventory: { setup: openInventory, teardown: escape },
  'quest-page': { setup: openQuestPage, teardown: closeQuestPage },
  shop: { setup: (page) => openTown(page, 'buyParts'), teardown: closeTown },
  trade: { setup: (page) => openTown(page, 'market'), teardown: closeTown },
  charts: { setup: (page) => openTown(page, 'charts'), teardown: closeTown },
  'world-map': { setup: (page) => key(page, 'KeyK'), teardown: escape },
  minimap: { setup: (page) => setMinimap(page, true), teardown: (page) => setMinimap(page, false) },
  garage: { setup: (page) => openTown(page, 'trucks'), teardown: closeTown },
  'call-hub': { setup: (page) => openCall(page, 'hub'), teardown: hangUp },
  'call-directions': { setup: (page) => openCall(page, 'directions'), teardown: hangUp },
  'call-deal': { setup: (page) => openCall(page, 'deal'), teardown: hangUp },
  help: { setup: openHelp, teardown: closeHelp },
  character: { setup: (page) => key(page, 'KeyC'), teardown: escape },
  saves: { setup: openSaves, teardown: escape },
  options: { setup: openOptions, teardown: escape },
  'start-menu': { setup: openStartMenu, teardown: closeStartMenu },
  'start-load': { setup: openStartLoad, teardown: closeStartMenu },
  inspect: { setup: (page) => inspectNpc(page, true), teardown: clearInspect, viewports: INSPECT_VIEWPORTS },
  'inspect-unarmed': { setup: (page) => inspectNpc(page, false), teardown: clearInspect, viewports: INSPECT_VIEWPORTS },
};

const ONLY = process.env.LAYOUT_STATES?.split(',');
const PICKED = Object.entries(STATES).filter(([name]) => !ONLY || name === 'log' || ONLY.includes(name));

const WINDOWS = [...new Set(PICKED.flatMap(([, state]) => state.viewports ?? VIEWPORTS))];

const started = Date.now();
const seconds = () => Math.round((Date.now() - started) / 1000);
const report = [];
let captures = 0;

async function capture(page, locale, [width, height], [name, state], size = 1) {
  await state.setup(page);
  await page.evaluate(() => document.fonts.ready);
  await frames(page);
  const label = size === 1 ? `${width}x${height}` : `${width}x${height}-ui${Math.round(size * 100)}`;
  await page.screenshot({ path: `${OUT}/${name}-${locale}-${label}.png` });
  for (const f of [...await faultsIn(page, locale), ...await frameFaults(page)]) report.push({ state: name, locale, viewport: label, ...f });
  captures++;
  console.log(`${name} ${locale} ${label} at ${seconds()} s`);
  if (state.teardown) await state.teardown(page);
  await frames(page);
}

async function checkLocale(page, locale) {
  await page.evaluate((l) => window.__ROAM__.language.set(l), locale);
  await probe(page, locale);
  for (const viewport of WINDOWS) {
    await page.setViewportSize({ width: viewport[0], height: viewport[1] });
    for (const entry of PICKED.filter(([, state]) => (state.viewports ?? VIEWPORTS).includes(viewport))) await capture(page, locale, viewport, entry);
  }
}

const SIZE_STATES = ['menu', 'inventory', 'shop', 'options'];
const SIZE_PASSES = [[[1280, 720], 1.3], [[1280, 720], 0.8], [[640, 360], 1]];

const setUiSize = (page, size) => page.evaluate(async (s) => (await import('/src/ui/ui-size.ts')).uiSize().set(s), size);

async function checkUiSizes(page) {
  await page.evaluate((l) => window.__ROAM__.language.set(l), 'en');
  for (const [viewport, size] of SIZE_PASSES) {
    await page.setViewportSize({ width: viewport[0], height: viewport[1] });
    await setUiSize(page, size);
    const applied = await page.evaluate(async () => (await import('/src/ui/ui-size.ts')).uiSize().applied());
    if (applied !== size) report.push({ state: '-', locale: 'en', viewport: viewport.join('x'), kind: 'size-not-applied', path: '', text: `asked ${size}, applied ${applied}`, sizes: '' });
    for (const entry of Object.entries(STATES).filter(([name]) => SIZE_STATES.includes(name))) await capture(page, 'en', viewport, entry, size);
  }
  await setUiSize(page, 1);
}

await mkdir(OUT, { recursive: true });
const { browser, page, errors } = await boot();
console.log(`booted at ${seconds()} s`);
try {
  for (const locale of LOCALES) await checkLocale(page, locale);
  if (!ONLY) await checkUiSizes(page);
} finally {
  await browser.close();
}
for (const e of errors) report.push({ state: '-', locale: '-', viewport: '-', kind: 'page-error', path: '', text: e, sizes: '' });
await writeFile(`${OUT}/faults.json`, JSON.stringify(report, null, 1));
for (const f of report) console.log(`${f.state} ${f.locale} ${f.viewport} ${f.kind} ${f.path}: ${JSON.stringify(f.text)} ${f.sizes}`);
console.log(`${captures} captures, ${report.length} faults, ${seconds()} s. Screens in ${OUT}/.`);
process.exit(report.length > 0 ? 1 : 0);
