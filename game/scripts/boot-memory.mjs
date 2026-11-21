import { chromium, webkit } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { launchChromium } from './gpu.mjs';

const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/boot-memory.mjs <url> [runs] [width] [height] [menuWaitMs]');
const runs = Number(process.argv[3] ?? 3);
const width = Number(process.argv[4] ?? 390);
const height = Number(process.argv[5] ?? 669);
const MENU_WAIT_MS = Number(process.argv[6] ?? process.env.BOOT_MEMORY_MENU_WAIT_MS ?? 20000);
const WEBKIT_BUDGET_MB = Number(process.env.BOOT_MEMORY_WEBKIT_MB ?? 2000);
const TURNS = 3;
const SAMPLE_MS = 200;
const BOOT_TIMEOUT_MS = 400000;
const TURN_TIMEOUT_MS = 120000;
const GONE_WAIT_MS = 8000;

const PROCESS = {
  webkit: /(WebKit|WPE)(Web|GPU|Network)Process/,
  chromium: /chrom/i,
};

function processes(engine) {
  const found = [];
  for (const pid of readdirSync('/proc').filter((dir) => /^\d+$/.test(dir))) {
    try {
      const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!PROCESS[engine].test(command)) continue;
      const rss = Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024;
      const kind = engine === 'webkit' ? /WebProcess/.test(command) : /--type=renderer/.test(command);
      found.push({ pid, rss, page: kind });
    } catch {}
  }
  return found;
}

function pagePeak(engine) {
  return Math.max(0, ...processes(engine).filter((p) => p.page).map((p) => p.rss));
}

async function launch(engine) {
  if (engine === 'webkit') return { browser: await webkit.launch() };
  return launchChromium(chromium, {});
}

async function playTurns(page) {
  for (let turn = 0; turn < TURNS; turn++) {
    const end = page.locator('#ui .turn-control .end-turn:not(.auto)');
    await end.waitFor({ state: 'attached', timeout: TURN_TIMEOUT_MS });
    await page.waitForFunction(() => !document.querySelector('#ui .turn-control .end-turn:not(.auto)')?.disabled, null, { timeout: TURN_TIMEOUT_MS });
    await end.dispatchEvent('click');
    await page.waitForFunction(() => document.querySelector('#ui .turn-control .end-turn:not(.auto)')?.disabled === true, null, { timeout: TURN_TIMEOUT_MS }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('#ui .turn-control .end-turn:not(.auto)')?.disabled, null, { timeout: TURN_TIMEOUT_MS });
  }
}

async function oneRun(engine) {
  const { browser } = await launch(engine);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  let loads = 0;
  page.on('load', () => loads++);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)));
  page.on('crash', () => errors.push('PAGE CRASHED'));
  await page.goto(url);
  await page.waitForSelector('#ui .start-menu', { state: 'visible', timeout: BOOT_TIMEOUT_MS });
  await page.waitForTimeout(MENU_WAIT_MS);
  const menuMb = pagePeak(engine);
  let stage = 'new game';
  let peak = 0;
  const peaks = {};
  const samples = [];
  const marks = new Map();
  const timer = setInterval(() => {
    const rss = pagePeak(engine);
    samples.push({ at: Date.now(), rss });
    peak = Math.max(peak, rss);
    peaks[stage] = Math.max(peaks[stage] ?? 0, Math.round(rss));
  }, SAMPLE_MS);
  const stageTimer = setInterval(async () => {
    try {
      stage = await page.evaluate(() => document.querySelector('#boot .boot-stage')?.textContent?.replace(/\d+ of \d+/, '').trim().slice(0, 24) || 'playing');
      const mark = await page.evaluate(() => {
        for (const key of Object.keys(window.sessionStorage)) if (key.endsWith('.boot-mark')) return window.sessionStorage.getItem(key);
        return null;
      });
      const parsed = mark ? JSON.parse(mark) : null;
      if (parsed && typeof parsed === 'object') marks.set(parsed.startedAt, parsed.step);
    } catch {}
  }, 300);
  try {
    await page.locator('#ui .start-menu').getByText('New game').click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('boot') === null, null, { timeout: BOOT_TIMEOUT_MS });
    stage = 'playing';
    await playTurns(page);
  } catch (error) {
    errors.push(error.message.slice(0, 200));
  }
  clearInterval(timer);
  clearInterval(stageTimer);
  await browser.close();
  return { menuMb: Math.round(menuMb), peakMb: Math.round(peak), peaks, stepPeaks: stepPeaksOf(samples, marks), loads, errors };
}

function stepPeaksOf(samples, marks) {
  const starts = [...marks.keys()].sort((a, b) => a - b);
  const peaks = {};
  for (const { at, rss } of samples) {
    const started = starts.filter((start) => start <= at).pop();
    if (started === undefined) continue;
    const step = marks.get(started);
    peaks[step] = Math.max(peaks[step] ?? 0, Math.round(rss));
  }
  return peaks;
}

async function gone(engine, before) {
  const deadline = Date.now() + GONE_WAIT_MS;
  while (Date.now() < deadline) {
    const left = processes(engine).filter((p) => !before.has(p.pid));
    if (left.length === 0) return [];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return processes(engine).filter((p) => !before.has(p.pid));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const problems = [];
for (const engine of ['webkit', 'chromium']) {
  const before = new Set(processes(engine).map((p) => p.pid));
  const results = [];
  for (let run = 0; run < runs; run++) {
    const result = await oneRun(engine);
    console.log(engine, `run ${run + 1}`, JSON.stringify(result));
    results.push(result);
    const left = await gone(engine, before);
    if (left.length > 0) problems.push(`${engine} left ${left.length} processes running after run ${run + 1}`);
  }
  const peak = median(results.map((r) => r.peakMb));
  const bootPeak = median(results.map((r) => Math.max(0, ...Object.entries(r.peaks).filter(([step]) => step !== 'playing').map(([, mb]) => mb))));
  console.log(`${engine} median peak before the first turn (boot steps only): ${bootPeak} MB`);
  console.log(`${engine} median peak from New game to ${TURNS} turns: ${peak} MB (menu ${median(results.map((r) => r.menuMb))} MB)`);
  for (const result of results) {
    if (result.errors.length > 0) problems.push(`${engine}: ${result.errors.join(' | ')}`);
    if (result.loads !== 1) problems.push(`${engine}: the page loaded ${result.loads} times, so New game reloaded it`);
  }
  if (engine === 'webkit' && peak > WEBKIT_BUDGET_MB) problems.push(`webkit median peak ${peak} MB is over the ${WEBKIT_BUDGET_MB} MB budget`);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('boot memory within budget');
