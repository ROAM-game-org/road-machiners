import { chromium } from 'playwright';
import { gpuArgs } from './gpu.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : (process.argv[i + 1] ?? fallback);
};
const url = arg('url', 'http://localhost:4173/');
const breakArg = arg('break', 'all');
const tag = arg('tag', 'run');
const cpu = process.argv.includes('--cpu');
const BOOT_KEY = 'roam.save.boot';
const NEW_GAME = JSON.stringify({ new: { mode: 'roaming', settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } }, intro: true });

function askNewGameOnce({ key, request }) {
  if (sessionStorage.getItem('bootTime.asked')) return;
  sessionStorage.setItem('bootTime.asked', '1');
  sessionStorage.setItem(key, request);
}
function watchBoot() {
  window.__STEPS__ = {};
  new MutationObserver(() => {
    for (const seg of document.querySelectorAll('[data-step]')) {
      const state = ['running', 'done', 'failed'].find((s) => seg.classList.contains(s));
      if (state) window.__STEPS__[seg.dataset.step] = state;
    }
  }).observe(document, { subtree: true, childList: true, attributes: true });
}

const browser = await chromium.launch({ args: cpu ? [] : gpuArgs() });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
const lines = [];
let broken = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => lines.push(`${m.type()}: ${m.text()}`));
await page.route('**/sfx/*.ogg', async (route) => {
  const file = route.request().url().split('/').pop();
  if (breakArg !== 'all' && !breakArg.split(',').includes(file)) return route.continue();
  const res = await route.fetch();
  const length = (await res.body()).length;
  broken++;
  await route.fulfill({ status: 200, contentType: 'audio/ogg', body: Buffer.alloc(length, 0xff) });
});
await page.addInitScript(watchBoot);
await page.addInitScript(askNewGameOnce, { key: BOOT_KEY, request: NEW_GAME });
await page.goto(url);
await page.waitForTimeout(Number(arg('wait', '60000')));
const state = await page.evaluate(() => ({ steps: window.__STEPS__, crash: document.body.innerText.includes('The game crashed') || !!document.querySelector('.crash-screen'), report: (document.body.textContent.match(/Sounds failed to decode: \d+ of \d+/g) ?? []), ready: performance.getEntriesByName('roam:ready').length > 0 }));
await (await import('node:fs/promises')).mkdir('tmp/sound-decode', { recursive: true });
await page.screenshot({ path: `tmp/sound-decode/${tag}.png` });
await browser.close();
const summary = lines.filter((l) => /failed to decode/.test(l));
console.log(JSON.stringify({ broken, state, errors, summary: summary.slice(0, 6), summaryCount: summary.length }, null, 1));
const ok = state.ready && !state.crash && errors.length === 0 && state.report.length === 1;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
