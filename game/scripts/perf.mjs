import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { budgetsFor, bundleProblems, checkBudgets, compare, LOAD_SHARE_MAX, summary, trustProblems } from './perf-report.mjs';

const CHROMIUM_FLAGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--mute-audio'];
const BUILD_TIMEOUT_MS = 300000;
const SERVER_TIMEOUT_MS = 30000;
const BENCH_TIMEOUT_MS = 900000;
const POLL_MS = 1000;
const PROGRESS_MS = 30000;
const CAP_PROBE_FRAMES = 300;
const CAP_PROBE_MAX_MEDIAN_MS = 3;
const WINDOWS_LOAD_SAMPLE_MS = 1000;
const USAGE = 'Usage: npm run perf [-- --url <served build>]\n       npm run perf -- --compare <a.json> <b.json>';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function parseArgs(argv) {
  const [first, ...rest] = argv;
  if (first === '--compare') {
    if (rest.length !== 2) throw new Error(`--compare needs two report files\n${USAGE}`);
    return { compare: rest };
  }
  if (first === '--url' && rest.length === 1) return { url: rest[0] };
  if (first === undefined) return {};
  throw new Error(`Unknown arguments ${argv.join(' ')}\n${USAGE}`);
}

function commitName() {
  const dirty = git('status', '--porcelain', '--', 'src', 'scripts', 'index.html', 'public').length > 0;
  return `${git('rev-parse', '--short', 'HEAD')}${dirty ? '-dirty' : ''}`;
}

const VITE = ['node_modules/vite/bin/vite.js'];

function buildGame(commit) {
  const outDir = `tmp/perf-dist-${commit}`;
  execFileSync(process.execPath, [...VITE, 'build', '--outDir', outDir, '--emptyOutDir', '--manifest'], { stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });
  const problems = bundleProblems(readJson(`${outDir}/.vite/manifest.json`));
  if (problems.length) throw new Error(`Bundle check failed: ${problems.join('; ')}`);
  return outDir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite preview exited with code ${child.exitCode}`);
    if (await reachable(url)) return;
    await sleep(POLL_MS / 4);
  }
  throw new Error(`vite preview did not answer at ${url} in ${SERVER_TIMEOUT_MS / 1000} s`);
}

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function startPreview(outDir) {
  const port = await freePort();
  const child = spawn(process.execPath, [...VITE, 'preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'inherit' });
  process.on('exit', () => child.kill());
  const url = `http://127.0.0.1:${port}/`;
  try {
    await waitForServer(url, child);
  } catch (error) {
    child.kill();
    throw error;
  }
  return { url, stop: () => child.kill() };
}

async function windowsBusyCores() {
  const times = () => os.cpus().map((cpu) => cpu.times);
  const before = times();
  await sleep(WINDOWS_LOAD_SAMPLE_MS);
  const after = times();
  const share = after.map((t, i) => {
    const total = Object.values(t).reduce((a, b) => a + b, 0) - Object.values(before[i]).reduce((a, b) => a + b, 0);
    return total > 0 ? 1 - (t.idle - before[i].idle) / total : 0;
  });
  return share.reduce((a, b) => a + b, 0);
}

async function machineLoad() {
  return process.platform === 'win32' ? windowsBusyCores() : os.loadavg()[0];
}

const IDLE_WAIT_MS = 180000;
const IDLE_POLL_MS = 5000;

async function idleLoad() {
  const limit = os.cpus().length * LOAD_SHARE_MAX;
  const since = Date.now();
  let load = await machineLoad();
  while (load > limit && Date.now() - since < IDLE_WAIT_MS) {
    await new Promise((done) => setTimeout(done, IDLE_POLL_MS));
    load = await machineLoad();
  }
  return { load, waitedMs: Date.now() - since };
}

async function frameCapIsOff(page) {
  const median = await page.evaluate((frames) => new Promise((done) => {
    const canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = 2000;
    canvas.style.cssText = 'width:1600px;height:1000px;position:fixed;left:0;top:0';
    document.body.append(canvas);
    const gl = canvas.getContext('webgl2');
    const times = [];
    const frame = (t) => {
      gl.clearColor(times.length % 2, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      times.push(t);
      if (times.length < frames) return requestAnimationFrame(frame);
      canvas.remove();
      const gaps = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b);
      done(gaps[Math.floor(gaps.length / 2)]);
    };
    requestAnimationFrame(frame);
  }), CAP_PROBE_FRAMES);
  console.log(`frame cap probe: median frame gap ${median.toFixed(2)} ms`);
  return median < CAP_PROBE_MAX_MEDIAN_MS;
}

function benchUrl(base, budget) {
  const url = new URL(base);
  url.searchParams.set('bench', '');
  url.searchParams.set('savingsAbove', String(budget.frameP99Ms));
  return url.href;
}

async function benchState(page, errors) {
  if (errors.length) throw new Error(`Page failed: ${errors[0]}`);
  const state = await page.evaluate(() => window.__ROAM_BENCH__ ?? null);
  if (state?.error) throw new Error(`Bench failed: ${state.error}`);
  return state;
}

async function pollBench(page, errors) {
  const started = Date.now();
  for (let tick = 1; Date.now() - started < BENCH_TIMEOUT_MS; tick++) {
    const state = await benchState(page, errors);
    if (state?.done) return state.report;
    if (tick % (PROGRESS_MS / POLL_MS) === 0) console.log(`bench running, ${Math.round((Date.now() - started) / 1000)} s`);
    await sleep(POLL_MS);
  }
  throw new Error(`The bench did not finish in ${BENCH_TIMEOUT_MS / 1000} s`);
}

async function playBench(base, budget) {
  const { browser, software, renderer } = await launchChromium(chromium, { headless: true, args: CHROMIUM_FLAGS });
  try {
    if (software) throw new Error(`Perf got the software renderer ${renderer}. It needs a GPU.`);
    const errors = [];
    const { width, height, scale } = budget.viewport;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
    page.on('crash', () => errors.push('the page crashed'));
    const frameCapOff = await frameCapIsOff(page);
    await page.goto(benchUrl(base, budget));
    return { report: await pollBench(page, errors), frameCapOff };
  } finally {
    await browser.close();
  }
}

function reportPath(machine, commit, startedAt) {
  mkdirSync('perf-reports', { recursive: true });
  return `perf-reports/${machine.replace(/[^\w.-]/g, '_')}-${commit}-${startedAt.replace(/[:.]/g, '-')}.json`;
}

async function measure(base, budget, commit) {
  const idle = await idleLoad();
  const startedAt = new Date().toISOString();
  const { report, frameCapOff } = await playBench(base, budget);
  const loadEnd = await machineLoad();
  const run = { commit, machine: os.hostname(), cores: os.cpus().length, loadStart: idle.load, idleWaitMs: idle.waitedMs, loadEnd, startedAt, frameCapOff, untrusted: [] };
  const wrapped = { bench: report, run };
  run.untrusted = trustProblems(wrapped);
  return wrapped;
}

async function servedBase(args, commit) {
  if (args.url) return { base: args.url, stop: () => {} };
  const preview = await startPreview(buildGame(commit));
  return { base: preview.url, stop: preview.stop };
}

async function perf(args) {
  const commit = commitName();
  const budget = budgetsFor(readJson(new URL('./perf-budgets.json', import.meta.url)), os.hostname());
  const served = await servedBase(args, commit);
  try {
    const wrapped = await measure(served.base, budget, commit);
    const path = reportPath(wrapped.run.machine, commit, wrapped.run.startedAt);
    writeFileSync(path, `${JSON.stringify(wrapped, null, 2)}\n`);
    const lines = checkBudgets(wrapped.bench, budget);
    console.log(`\n${summary(wrapped, lines)}\n\nreport ${path}`);
    return lines.every((line) => line.pass) && wrapped.run.untrusted.length === 0 ? 0 : 1;
  } finally {
    served.stop();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.compare) {
    console.log(compare(readJson(args.compare[0]), readJson(args.compare[1])));
    return 0;
  }
  return perf(args);
}

process.exitCode = await main().catch((error) => {
  console.error(`FAIL\n${error.message}`);
  return 1;
});
