import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : (process.argv[i + 1] ?? fallback);
};
const url = arg('url', 'http://localhost:4173/');
const runs = Number(arg('runs', '5'));
const VIEWPORTS = { wide: { width: 1280, height: 800 }, narrow: { width: 390, height: 844 } };
const viewport = VIEWPORTS[arg('viewport', 'wide')];
const net = arg('net', 'none');
if (!viewport) throw new Error('--viewport is wide or narrow');
if (!['none', '4g'].includes(net)) throw new Error('--net is none or 4g');
if (!(runs >= 1)) throw new Error('--runs must be at least 1');
const FETCHES = { code: 'assets/index-', map: 'maps/', models: 'models/', sounds: 'sfx/' };
const FAST_4G = { offline: false, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8, latency: 40 };
const BOOT_KEY = `${process.env.SAVE_SCOPE ? `roam.save.${process.env.SAVE_SCOPE}` : 'roam.save'}.boot`;
const NEW_GAME = JSON.stringify({ new: { mode: 'roaming', settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } }, intro: true });

function askNewGameOnce({ key, request }) {
  if (sessionStorage.getItem('bootTime.asked')) return;
  sessionStorage.setItem('bootTime.asked', '1');
  sessionStorage.setItem(key, request);
}

function watchBoot() {
  performance.setResourceTimingBufferSize(5000);
  const log = { steps: {}, cleared: null };
  window.__BOOT_TIME__ = log;
  let adopted = false;
  new MutationObserver(() => {
    const boot = document.getElementById('boot');
    if (boot?.dataset.adopted === 'true') adopted = true;
    if (adopted && !boot && log.cleared === null) log.cleared = performance.now();
    for (const seg of document.querySelectorAll('[data-step]')) {
      const state = ['running', 'done', 'failed'].find((s) => seg.classList.contains(s));
      const entry = (log.steps[seg.dataset.step] ??= {});
      if (state && entry[state] === undefined) entry[state] = performance.now();
    }
  }).observe(document, { subtree: true, childList: true, attributes: true });
}

async function readRun(page) {
  await page.waitForFunction(() => performance.getEntriesByName('roam:ready').length > 0 && window.__BOOT_TIME__.cleared !== null, null, { timeout: 300000 });
  const sounds = await page.waitForFunction(() => performance.getEntriesByName('roam:sounds')[0]?.startTime, null, { timeout: 120000 }).then((h) => h.jsonValue(), () => null);
  const read = await page.evaluate((fetches) => {
    const log = window.__BOOT_TIME__;
    const spans = {};
    for (const [name, part] of Object.entries(fetches)) {
      const hits = performance.getEntriesByType('resource').filter((e) => e.name.includes(part));
      spans[name] = hits.length ? Math.max(...hits.map((e) => e.responseEnd)) - Math.min(...hits.map((e) => e.startTime)) : null;
    }
    const steps = {};
    for (const [step, t] of Object.entries(log.steps)) steps[step] = t.running !== undefined && (t.done ?? t.failed) !== undefined ? (t.done ?? t.failed) - t.running : null;
    return { ready: performance.getEntriesByName('roam:ready')[0].startTime, cleared: log.cleared, steps, spans, crashed: document.body.innerText.includes('The game crashed') };
  }, FETCHES);
  return { ...read, sounds };
}

const { browser, software, renderer } = await launchChromium(chromium);
if (software) {
  await browser.close();
  console.error(`FAIL\nGot the software renderer ${renderer}. It needs a GPU.`);
  process.exit(1);
}
console.log(`viewport ${viewport.width}x${viewport.height}, net ${net}, runs ${runs}`);
const results = { cold: [], warm: [] };
const errors = [];
let crashed = false;
for (let i = 0; i < runs; i++) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  await page.addInitScript(watchBoot);
  await page.addInitScript(askNewGameOnce, { key: BOOT_KEY, request: NEW_GAME });
  if (net === '4g') await (await context.newCDPSession(page)).send('Network.emulateNetworkConditions', FAST_4G);
  await page.goto(url);
  results.cold.push(await readRun(page));
  await page.waitForTimeout(1500);
  await page.evaluate((key) => sessionStorage.setItem(key, 'auto'), BOOT_KEY);
  await page.reload();
  results.warm.push(await readRun(page));
  await context.close();
}
await browser.close();

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
const sec = (ms) => (ms / 1000).toFixed(1).padStart(6);
function row(label, values) {
  const xs = values.filter((v) => v !== null && v !== undefined);
  console.log(`  ${label.padEnd(10)} median ${xs.length ? sec(median(xs)) : '     -'} s  max ${xs.length ? sec(Math.max(...xs)) : '     -'} s`);
}
for (const [path, label] of [['cold', 'Fresh game, cold cache'], ['warm', 'Saved world, warm cache']]) {
  const list = results[path];
  console.log(`\n${label}`);
  row('ready', list.map((r) => r.ready));
  row('cleared', list.map((r) => r.cleared));
  row('sounds', list.map((r) => r.sounds));
  console.log(' steps');
  for (const step of Object.keys(list[0].steps)) row(step, list.map((r) => r.steps[step]));
  console.log(' fetches');
  for (const name of Object.keys(FETCHES)) row(name, list.map((r) => r.spans[name]));
  if (list.some((r) => r.crashed)) crashed = true;
}
console.log(`\n${errors.length} page errors`);
for (const e of errors) console.log(e);
if (errors.length || crashed) {
  console.error(`FAIL\n${crashed ? 'A crash screen showed. ' : ''}${errors.length} page errors.`);
  process.exit(1);
}
