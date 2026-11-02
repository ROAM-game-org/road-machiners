import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { allocationReport, profileReport } from './perf-profile.mjs';
import { budgetsFor, bundleProblems, checkBudgets, compare, LOAD_SHARE_MAX, OTHERS_CPU_SHARE_MAX, summary, trustProblems } from './perf-report.mjs';

const CHROMIUM_FLAGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--mute-audio'];
const BUILD_TIMEOUT_MS = 300000;
const SERVER_TIMEOUT_MS = 30000;
const BENCH_TIMEOUT_MS = 900000;
const POLL_MS = 1000;
const PROGRESS_MS = 30000;
const OTHERS_SAMPLE_MS = 5000;
const CAP_PROBE_FRAMES = 300;
const CAP_PROBE_MAX_MEDIAN_MS = 3;
const WINDOWS_LOAD_SAMPLE_MS = 1000;
const HEAP_SAMPLE_BYTES = 16384;
const PROFILE_CATEGORIES = ['disabled-by-default-v8.cpu_profiler', 'blink.user_timing'];
const TRACE_MAX_BYTES = 400 * 1024 * 1024;
const USAGE = 'Usage: npm run perf [-- --profile] [--scenes <id,id>] [--url <served build>]\n       npm run perf -- --compare <a.json> <b.json>';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function parseArgs(argv) {
  const [first, ...rest] = argv;
  if (first === '--compare') {
    if (rest.length !== 2) throw new Error(`--compare needs two report files\n${USAGE}`);
    return { compare: rest };
  }
  return runArgs(argv);
}

function takeValue(argv, flag) {
  const at = argv.indexOf(flag);
  if (at === -1) return { value: null, rest: argv };
  const value = argv[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value\n${USAGE}`);
  return { value, rest: [...argv.slice(0, at), ...argv.slice(at + 2)] };
}

function runArgs(argv) {
  const profile = argv.includes('--profile');
  const scenes = takeValue(argv.filter((arg) => arg !== '--profile'), '--scenes');
  const url = takeValue(scenes.rest, '--url');
  if (url.rest.length > 0) throw new Error(`Unknown arguments ${url.rest.join(' ')}\n${USAGE}`);
  return { profile, scenes: scenes.value, url: url.value };
}

function commitName() {
  const dirty = git('status', '--porcelain', '--', 'src', 'scripts', 'index.html', 'public').length > 0;
  return `${git('rev-parse', '--short', 'HEAD')}${dirty ? '-dirty' : ''}`;
}

const VITE = ['node_modules/vite/bin/vite.js'];

function buildGame(commit, profile) {
  const outDir = `tmp/perf-dist-${commit}${profile ? '-profile' : ''}`;
  const unminified = profile ? ['--minify', 'false'] : [];
  execFileSync(process.execPath, [...VITE, 'build', '--outDir', outDir, '--emptyOutDir', '--manifest', ...unminified], { stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });
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

const IDLE_WAIT_MS = 600000;
const IDLE_POLL_MS = 5000;

async function busyCoresOver(ms) {
  const before = busySeconds();
  await sleep(ms);
  return (busySeconds() - before) / (ms / 1000);
}

async function quiet() {
  const cores = os.cpus().length;
  const busy = process.platform === 'win32' ? null : await busyCoresOver(IDLE_POLL_MS);
  const load = await machineLoad();
  return { load, quiet: load <= cores * LOAD_SHARE_MAX && (busy === null || busy <= cores * OTHERS_CPU_SHARE_MAX) };
}

async function idleLoad() {
  const since = Date.now();
  let state = await quiet();
  while (!state.quiet && Date.now() - since < IDLE_WAIT_MS) state = await quiet();
  return { load: state.load, waitedMs: Date.now() - since };
}

function cpuSeconds(clock) {
  const [days, time] = clock.includes('-') ? clock.split('-') : ['0', clock];
  return Number(days) * 86400 + time.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
}

function ownCpuByPid(rootPid) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,time='], { encoding: 'utf8' }).trim().split('\n').map((line) => line.trim().split(/\s+/));
  const children = new Map();
  const cpu = new Map();
  for (const [pid, ppid, clock] of rows) {
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
    cpu.set(pid, cpuSeconds(clock));
  }
  const own = new Map();
  for (const stack = [String(rootPid)]; stack.length > 0; ) {
    const pid = stack.pop();
    own.set(pid, cpu.get(pid) ?? 0);
    stack.push(...(children.get(pid) ?? []));
  }
  return own;
}

const busySeconds = () => os.cpus().reduce((sum, { times }) => sum + times.user + times.nice + times.sys + times.irq, 0) / 1000;

class OthersCpu {
  constructor() {
    this.measured = process.platform !== 'win32';
    this.othersSeconds = 0;
    this.started = Date.now();
    this.last = this.snapshot();
  }

  snapshot() {
    return this.measured ? { busy: busySeconds(), own: ownCpuByPid(process.pid) } : null;
  }

  sample() {
    const now = this.snapshot();
    if (!now) return;
    let ownSeconds = 0;
    for (const [pid, seconds] of now.own) ownSeconds += seconds - (this.last.own.get(pid) ?? 0);
    this.othersSeconds += Math.max(0, now.busy - this.last.busy - ownSeconds);
    this.last = now;
  }

  cores() {
    return this.measured ? this.othersSeconds / ((Date.now() - this.started) / 1000) : null;
  }
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

function benchUrl(base, budget, profile, scenes) {
  const url = new URL(base);
  url.searchParams.set('bench', '');
  if (profile) url.searchParams.set('profile', '');
  if (scenes) url.searchParams.set('scenes', scenes);
  url.searchParams.set('savingsAbove', String(budget.frameP99Ms));
  return url.href;
}

async function benchState(page, errors) {
  const state = await page.evaluate(() => window.__ROAM_BENCH__ ?? null).catch((error) => {
    errors.push(`could not read the bench state: ${error.message}`);
    return null;
  });
  const found = [...(state?.error ? [`Bench failed: ${state.error}`] : []), ...errors.map((error) => `Page failed: ${error}`)];
  if (found.length) throw new Error(found.join('\n'));
  return state;
}

function noteTick(tick, started, others) {
  if (tick % (OTHERS_SAMPLE_MS / POLL_MS) === 0) others.sample();
  if (tick % (PROGRESS_MS / POLL_MS) === 0) console.log(`bench running, ${Math.round((Date.now() - started) / 1000)} s`);
}

async function pollBench(page, errors, others) {
  const started = Date.now();
  for (let tick = 1; Date.now() - started < BENCH_TIMEOUT_MS; tick++) {
    const state = await benchState(page, errors);
    if (state?.done) return state.report;
    noteTick(tick, started, others);
    await sleep(POLL_MS);
  }
  throw new Error(`The bench did not finish in ${BENCH_TIMEOUT_MS / 1000} s`);
}

async function startHeapSampling(page, on) {
  if (!on) return null;
  const heap = await page.context().newCDPSession(page);
  await heap.send('HeapProfiler.startSampling', { samplingInterval: HEAP_SAMPLE_BYTES, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  return heap;
}

async function stopHeapSampling(heap) {
  return heap ? (await heap.send('HeapProfiler.stopSampling')).profile : null;
}

async function playBench(base, budget, tracePath, scenes) {
  const others = new OthersCpu();
  const { browser, software, renderer } = await launchChromium(chromium, { headless: true, args: CHROMIUM_FLAGS });
  try {
    if (software) throw new Error(`Perf got the software renderer ${renderer}. It needs a GPU.`);
    const errors = [];
    const { width, height, scale } = budget.viewport;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
    page.on('crash', () => errors.push('the page crashed'));
    const frameCapOff = await frameCapIsOff(page);
    if (tracePath) await browser.startTracing(page, { path: tracePath, screenshots: false, categories: PROFILE_CATEGORIES });
    const heap = await startHeapSampling(page, Boolean(tracePath));
    await page.goto(benchUrl(base, budget, Boolean(tracePath), scenes));
    const report = await pollBench(page, errors, others);
    others.sample();
    const sampling = await stopHeapSampling(heap);
    if (tracePath) await browser.stopTracing();
    return { report, frameCapOff, othersCores: others.cores(), sampling };
  } finally {
    await browser.close();
  }
}

function reportBase(machine, commit, startedAt) {
  mkdirSync('perf-reports', { recursive: true });
  return `perf-reports/${machine.replace(/[^\w.-]/g, '_')}-${commit}-${startedAt.replace(/[:.]/g, '-')}`;
}

function readTrace(path) {
  const bytes = statSync(path).size;
  if (bytes > TRACE_MAX_BYTES) throw new Error(`The trace ${path} is ${Math.round(bytes / 1e6)} MB, too big to read`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function measure(base, budget, commit, { profile, scenes }) {
  const idle = profile ? { load: await machineLoad(), waitedMs: 0 } : await idleLoad();
  const startedAt = new Date().toISOString();
  const path = reportBase(os.hostname(), commit, startedAt);
  const tracePath = profile ? `${path}.trace.json` : null;
  const { report, frameCapOff, othersCores, sampling } = await playBench(base, budget, tracePath, scenes);
  const loadEnd = await machineLoad();
  const run = { commit, machine: os.hostname(), cores: os.cpus().length, loadStart: idle.load, idleWaitMs: idle.waitedMs, loadEnd, othersCores, startedAt, frameCapOff, untrusted: [] };
  const wrapped = { bench: report, run };
  run.untrusted = trustProblems(wrapped);
  if (tracePath) wrapped.profile = { ...profileReport(readTrace(tracePath)), allocations: allocationReport(sampling) };
  return { wrapped, path: `${path}.json` };
}

async function servedBase(args, commit) {
  if (args.url) return { base: args.url, stop: () => {} };
  const preview = await startPreview(buildGame(commit, args.profile));
  return { base: preview.url, stop: preview.stop };
}

async function perf(args) {
  const commit = commitName();
  const budget = budgetsFor(readJson(new URL('./perf-budgets.json', import.meta.url)), os.hostname());
  const served = await servedBase(args, commit);
  try {
    const { wrapped, path } = await measure(served.base, budget, commit, args);
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
