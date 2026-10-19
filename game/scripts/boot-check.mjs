import { mkdirSync } from 'node:fs';
import { chromium, firefox } from 'playwright';
import { playUrl } from './game-url.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const url = arg('url', 'http://localhost:5173');
const only = arg('only', '');
const cpu = process.argv.includes('--cpu');
const ENGINES = { chromium, firefox };
const engine = arg('browser', 'chromium');
if (!ENGINES[engine]) throw new Error(`Unknown --browser ${engine}. Use chromium or firefox.`);
const SHOT_PREFIX = engine === 'chromium' ? '.playtest/boot-' : `.playtest/boot-${engine}-`;
const timeoutsOff = process.env.TEST_TIMEOUTS === 'off';
const BOOT_LIMIT_MS = timeoutsOff ? 0 : 60000;
const SLOW_MS = 1500;
const VIEWPORTS = [
  { name: 'wide', width: 1280, height: 800 },
  { name: 'narrow', width: 390, height: 844 },
];
const FAILED_CODE_TEXT = 'The game failed to load. Check your connection and reload the page.';
const START_TEXT = {
  en: 'The game could not start in this browser. Update the browser or try another one.',
  ru: 'Игра не загрузилась. Откройте игру в другом браузере.',
};
const STALL_LIMIT_MS = 300000;

const GPU_ARGS = {
  darwin: ['--use-angle=metal'],
  linux: ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'],
};
function launchArgs() {
  if (cpu || engine !== 'chromium') return [];
  const angle = GPU_ARGS[process.platform];
  if (!angle) throw new Error(`No GPU flags for ${process.platform}. Run with --cpu.`);
  return [...angle, '--enable-gpu', '--ignore-gpu-blocklist'];
}

const problems = [];
const expect = (ok, message) => {
  if (!ok) problems.push(message);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
};

const WATCH = () => {
  window.__bootLog = [];
  const read = () => {
    const boot = document.getElementById('boot');
    if (!boot) return null;
    const bar = boot.querySelector('[role=progressbar]');
    return {
      now: bar.getAttribute('aria-valuenow'),
      max: bar.getAttribute('aria-valuemax'),
      stage: boot.querySelector('.boot-stage').textContent,
      hidden: boot.hidden,
      segments: [...boot.querySelectorAll('.boot-seg')].map((s) => s.className.replace('boot-seg ', '')),
    };
  };
  let last = '';
  const note = () => {
    const state = read();
    const key = JSON.stringify(state);
    if (key === last) return;
    last = key;
    window.__bootLog.push(state);
  };
  new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  document.addEventListener('DOMContentLoaded', note);
};

async function slow(page) {
  const delay = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    await route.continue().catch(() => {});
  };
  await page.route('**/sfx/**', delay);
  await page.route('**/maps/**', delay);
}

async function open(browser, viewport, errors) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  if (timeoutsOff) page.setDefaultTimeout(0);
  await page.addInitScript(WATCH);
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  return page;
}

async function shot(page, path) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.screenshot({ path });
    } catch (err) {
      if (attempt === 3) throw err;
      await page.waitForTimeout(1000);
    }
  }
}

const bootLog = (page) => page.evaluate(() => window.__bootLog.filter(Boolean));
const stages = (log) => log.map((s) => s.stage).join(' | ');

async function cleared(page) {
  await page.waitForFunction(() => window.__ROAM__, null, { timeout: BOOT_LIMIT_MS });
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: BOOT_LIMIT_MS });
  expect(await page.evaluate(() => document.querySelectorAll('canvas').length > 0), 'a canvas is on the page after boot');
}

async function freshGame(browser, viewport) {
  const errors = [];
  const page = await open(browser, viewport, errors);
  await slow(page);
  await page.goto(playUrl(url));
  await page.waitForSelector('#boot [role=progressbar]');
  await page.waitForFunction(() => document.querySelector('#boot .boot-seg.running') && document.querySelector('[role=progressbar]').getAttribute('aria-valuenow') !== null);
  await shot(page, `${SHOT_PREFIX}${viewport.name}-loading.png`);
  const mid = await page.evaluate(() => {
    const bar = document.querySelector('#boot [role=progressbar]');
    return { now: Number(bar.getAttribute('aria-valuenow')), max: Number(bar.getAttribute('aria-valuemax')), running: document.querySelectorAll('#boot .boot-seg.running').length };
  });
  expect(mid.now < mid.max, `${viewport.name}: the bar is not full mid-boot (${mid.now} of ${mid.max})`);
  expect(mid.running > 0, `${viewport.name}: a running segment shows mid-boot`);
  await cleared(page);
  const log = await bootLog(page);
  const values = log.map((s) => Number(s.now)).filter((n) => !Number.isNaN(n));
  expect(values.every((v, i) => i === 0 || (v >= values[i - 1] && v - values[i - 1] <= 3)), `${viewport.name}: the bar never falls and rises by whole steps (${[...new Set(values)].join(",")})`);
  expect(stages(log).includes('Starting a new game'), `${viewport.name}: the fresh game reads "Starting a new game"`);
  expect(stages(log).includes('Reading the map'), `${viewport.name}: the map step shows its name`);
  expect(/Loading sounds \d+ of \d+/.test(stages(log)), `${viewport.name}: sounds show a real file count`);
  expect(await page.evaluate(() => !document.body.innerText.includes('The game crashed')), `${viewport.name}: no crash screen`);
  await shot(page, `${SHOT_PREFIX}${viewport.name}-playing.png`);
  expect(errors.length === 0, `${viewport.name}: no page errors ${errors.join('; ')}`);
  return page;
}

async function savedGame(page, viewport) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  await page.evaluate(() => (window.__bootLog = []));
  await page.reload();
  await cleared(page);
  const log = await bootLog(page);
  expect(stages(log).includes('Loading your save'), `${viewport.name}: a saved game reads "Loading your save"`);
  expect(errors.length === 0, `${viewport.name}: reload has no page errors`);
}

async function rescue(browser, viewport) {
  const errors = [];
  const page = await open(browser, viewport, errors);
  page.on('dialog', (d) => d.accept());
  await page.goto(playUrl(url));
  await cleared(page);
  await page.evaluate(async () => {
    const [{ name }] = (await indexedDB.databases()).filter((d) => d.name?.startsWith('roam'));
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ format: { major: 9999, minor: 0 }, savedAt: Date.now(), world: {} }, 'auto');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.waitForSelector('#ui .save-screen', { state: 'visible', timeout: BOOT_LIMIT_MS });
  expect(await page.evaluate(() => document.getElementById('boot').hidden), `${viewport.name}: #boot is hidden while the rescue panel waits`);
  await shot(page, `${SHOT_PREFIX}${viewport.name}-rescue.png`);
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await cleared(page);
  const log = await bootLog(page);
  expect(stages(log).includes('Starting a new game'), `${viewport.name}: #boot returns after the choice and reads "Starting a new game"`);
  expect(errors.length === 0, `${viewport.name}: rescue has no page errors ${errors.join('; ')}`);
  await page.context().close();
}

async function startMenu(browser, viewport) {
  const errors = [];
  const page = await open(browser, viewport, errors);
  page.on('dialog', (d) => d.accept());
  const continueOff = () => page.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled');
  await page.goto(url);
  await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS });
  expect(await page.evaluate(() => document.getElementById('boot').hidden), `${viewport.name}: #boot is hidden while the start menu waits`);
  expect((await continueOff()) === 'true', `${viewport.name}: Continue is off with no save`);
  await shot(page, `${SHOT_PREFIX}${viewport.name}-start-menu.png`);
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await cleared(page);
  expect(stages(await bootLog(page)).includes('Starting a new game'), `${viewport.name}: New game from the start menu reads "Starting a new game"`);
  await page.evaluate(() => (window.__bootLog = []));
  await page.reload();
  await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS });
  expect((await continueOff()) === null, `${viewport.name}: Continue is on with a save`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await cleared(page);
  expect(stages(await bootLog(page)).includes('Loading your save'), `${viewport.name}: Continue reads "Loading your save"`);
  expect(errors.length === 0, `${viewport.name}: the start menu has no page errors ${errors.join('; ')}`);
  await page.context().close();
}

async function failedMap(browser, viewport) {
  const page = await open(browser, viewport, []);
  await page.route('**/maps/**', (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.goto(playUrl(url));
  await page.waitForFunction(() => document.body.innerText.includes('Map file'), null, { timeout: BOOT_LIMIT_MS });
  await shot(page, `${SHOT_PREFIX}${viewport.name}-map-failed.png`);
  const state = await page.evaluate(() => ({
    mapSegment: document.querySelectorAll('#boot .boot-seg')[1]?.className,
    failed: document.getElementById('boot').classList.contains('failed'),
    running: document.querySelectorAll('#boot .boot-seg.running').length,
    animated: [...document.querySelectorAll('#boot .boot-seg.running')].some((s) => getComputedStyle(s).animationName !== 'none'),
  }));
  expect(state.mapSegment?.includes('failed'), `${viewport.name}: the map segment is failed`);
  expect(state.failed && !state.animated, `${viewport.name}: nothing animates after the map failed`);
  await page.context().close();
}

async function failedCode(browser, viewport) {
  const page = await open(browser, viewport, []);
  await page.route('**/src/three/main.ts*', (route) => route.abort());
  await page.goto(playUrl(url));
  await page.waitForSelector('#boot.failed', { timeout: BOOT_LIMIT_MS });
  await shot(page, `${SHOT_PREFIX}${viewport.name}-code-failed.png`);
  const stage = await page.textContent('#boot .boot-stage');
  const valuetext = await page.getAttribute('#boot [role=progressbar]', 'aria-valuetext');
  expect(stage === FAILED_CODE_TEXT && valuetext === FAILED_CODE_TEXT, `${viewport.name}: a failed game module shows the failure text`);
  await page.context().close();
}

async function brokenCode(browser, viewport, language) {
  const page = await open(browser, viewport, []);
  await page.addInitScript((value) => localStorage.setItem('roam.lang', value), language);
  await page.route('**/src/three/main.ts*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'let x = ;' }));
  await page.goto(playUrl(url));
  await page.waitForSelector('#boot.failed', { timeout: BOOT_LIMIT_MS });
  await shot(page, `.playtest/boot-${viewport.name}-code-broken-${language}.png`);
  const stage = await page.textContent('#boot .boot-stage');
  const detail = await page.textContent('#boot .boot-steps');
  expect(stage === START_TEXT[language], `${viewport.name}: broken game code says the game could not start (${language})`);
  expect(detail.includes('SyntaxError'), `${viewport.name}: broken game code shows the error message (${language})`);
  await page.context().close();
}

async function stalledMap(browser, viewport) {
  const page = await open(browser, viewport, []);
  const posts = [];
  page.on('request', (request) => request.method() === 'POST' && posts.push(request.url()));
  await page.route('**/maps/**', () => {});
  await page.goto(playUrl(url));
  await page.waitForSelector('.crash-screen', { timeout: timeoutsOff ? 0 : STALL_LIMIT_MS });
  await shot(page, `.playtest/boot-${viewport.name}-map-stalled.png`);
  const title = await page.textContent('.crash-title');
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  expect(title === 'Road Machiners could not download its files', `${viewport.name}: a stalled map shows the connection notice`);
  expect(focused === 'Reload', `${viewport.name}: Reload has focus after a stalled map`);
  expect(posts.length === 0, `${viewport.name}: a stalled map sends no report ${posts.join(', ')}`);
  await page.context().close();
}

async function hungSaves(browser, viewport) {
  const page = await open(browser, viewport, []);
  const warnings = [];
  page.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()));
  await page.addInitScript(() => {
    indexedDB.open = () => ({});
  });
  await page.goto(url);
  await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_LIMIT_MS });
  expect(warnings.some((text) => text.includes('Saves go to local storage')), `${viewport.name}: a silent IndexedDB open falls back to local storage`);
  await page.context().close();
}

async function droppedModel(browser, viewport) {
  const page = await open(browser, viewport, []);
  let seen = 0;
  await page.route('**/models/base_carrier.glb', (route) => (++seen <= 2 ? route.abort('failed') : route.continue()));
  await page.goto(playUrl(url));
  await cleared(page);
  const crashed = await page.locator('.crash-screen').count();
  expect(crashed === 0, `${viewport.name}: a short model drop shows no crash or load-failed screen`);
  expect(seen > 2, `${viewport.name}: the dropped model was asked for again`);
  await page.context().close();
}

async function lostModel(browser, viewport) {
  const page = await open(browser, viewport, []);
  const posts = [];
  page.on('request', (request) => request.method() === 'POST' && posts.push(request.url()));
  await page.route('**/models/base_carrier.glb', (route) => route.abort('failed'));
  await page.goto(playUrl(url));
  await page.waitForSelector('.crash-screen', { timeout: BOOT_LIMIT_MS });
  await shot(page, `${SHOT_PREFIX}${viewport.name}-load-failed.png`);
  const title = await page.textContent('.crash-title');
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  const text = await page.evaluate(() => document.body.innerText);
  expect(title === 'Road Machiners could not download its files', `${viewport.name}: the load-failed title shows`);
  expect(focused === 'Reload', `${viewport.name}: Reload has focus`);
  expect(!text.includes('The game crashed'), `${viewport.name}: a lost model is not a crash`);
  expect(posts.length === 0, `${viewport.name}: a lost model sends no report ${posts.join(', ')}`);
  await page.context().close();
}

async function droppedWorker(browser, viewport) {
  const page = await open(browser, viewport, []);
  let seen = 0;
  await page.route('**/phys/turn*', (route) => (++seen <= 2 ? route.abort('failed') : route.continue()));
  await page.goto(playUrl(url));
  await cleared(page);
  await page.evaluate(() => window.__ROAM__.endTurn());
  const played = await page.waitForFunction(() => window.__ROAM__.state.turn > 1, null, { timeout: BOOT_LIMIT_MS }).then(() => true, () => false);
  expect(played, `${viewport.name}: a turn runs after the worker script dropped`);
  expect((await page.locator('.crash-screen').count()) === 0, `${viewport.name}: a short worker drop shows no crash screen`);
  expect(seen > 2, `${viewport.name}: the dropped worker script was asked for again`);
  await page.context().close();
}

async function lostWorker(browser, viewport) {
  const page = await open(browser, viewport, []);
  const posts = [];
  page.on('request', (request) => request.method() === 'POST' && posts.push(request.url()));
  await page.route('**/phys/turn*', (route) => route.abort('failed'));
  await page.goto(playUrl(url));
  await cleared(page);
  await page.evaluate(() => window.__ROAM__.endTurn());
  await page.waitForSelector('.crash-screen', { timeout: BOOT_LIMIT_MS });
  await shot(page, `${SHOT_PREFIX}${viewport.name}-worker-lost.png`);
  const title = await page.textContent('.crash-title');
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  expect(title === 'Road Machiners could not download its files', `${viewport.name}: a lost worker shows the load-failed title`);
  expect(focused === 'Reload', `${viewport.name}: Reload has focus`);
  expect(posts.length === 0, `${viewport.name}: a lost worker sends no report ${posts.join(', ')}`);
  await page.context().close();
}

mkdirSync('.playtest', { recursive: true });
async function inBrowser(run) {
  const browser = await ENGINES[engine].launch({ args: launchArgs(), headless: engine === 'chromium' });
  try {
    await run(browser);
  } finally {
    await browser.close();
  }
}

for (const viewport of VIEWPORTS) {
  if (!only) {
    await inBrowser(async (browser) => {
      const page = await freshGame(browser, viewport);
      await savedGame(page, viewport);
    });
    await inBrowser((browser) => rescue(browser, viewport));
  }
  if (!only || only === 'startMenu') await inBrowser((browser) => startMenu(browser, viewport));
  if (!only || only === 'failedMap') await inBrowser((browser) => failedMap(browser, viewport));
  if (!only || only === 'failedCode') await inBrowser((browser) => failedCode(browser, viewport));
  if (!only || only === 'brokenCode') {
    for (const language of ['en', 'ru']) await inBrowser((browser) => brokenCode(browser, viewport, language));
  }
  if (only === 'stalledMap') await inBrowser((browser) => stalledMap(browser, viewport));
  if (!only || only === 'hungSaves') await inBrowser((browser) => hungSaves(browser, viewport));
  if (!only || only === 'droppedModel') await inBrowser((browser) => droppedModel(browser, viewport));
  if (!only || only === 'lostModel') await inBrowser((browser) => lostModel(browser, viewport));
  if (!only || only === 'droppedWorker') await inBrowser((browser) => droppedWorker(browser, viewport));
  if (!only || only === 'lostWorker') await inBrowser((browser) => lostWorker(browser, viewport));
}
if (problems.length) {
  console.error(`FAIL\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('PASS');
