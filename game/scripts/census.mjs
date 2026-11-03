import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { chromium } from 'playwright';
import { installCensus, readCensus } from './census-page.mjs';
import { censusLines, workerSteps } from './census-report.mjs';
import { launchChromium } from './gpu.mjs';

const SCENES = ['town-day', 'town-night', 'fight', 'drive'];
const KNOWN_SCENES = new Set(['town-day', 'town-day-far', 'town-night', 'town-night-far', 'fight', 'drive']);
const FLAGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--mute-audio', '--enable-precise-memory-info'];
const CATEGORIES = ['disabled-by-default-v8.cpu_profiler'];
const POLL_MS = 250;
const SERVER_TIMEOUT_MS = 60000;
const GAME_TIMEOUT_MS = 300000;
const BENCH_TIMEOUT_MS = 900000;
const TRACE_MAX_BYTES = 600 * 1024 * 1024;
const USAGE = 'Usage: npm run census [-- --scenes <id,id>]';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function parseArgs(argv) {
  if (argv.length === 0) return SCENES;
  if (argv.length !== 2 || argv[0] !== '--scenes') throw new Error(USAGE);
  const scenes = argv[1].split(',').filter(Boolean);
  const unknown = scenes.filter((scene) => !KNOWN_SCENES.has(scene));
  if (unknown.length || scenes.length === 0) throw new Error(`Unknown scenes ${unknown.join(', ')}. ${USAGE}`);
  return scenes;
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

async function answers(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function startDevServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  process.on('exit', () => child.kill());
  const url = `http://127.0.0.1:${port}/`;
  for (const deadline = Date.now() + SERVER_TIMEOUT_MS; Date.now() < deadline; await sleep(POLL_MS)) {
    if (child.exitCode !== null) throw new Error(`vite exited with code ${child.exitCode}`);
    if (await answers(url)) return { url, stop: () => child.kill() };
  }
  child.kill();
  throw new Error(`vite did not answer at ${url} in ${SERVER_TIMEOUT_MS / 1000} s`);
}

async function until(page, errors, what, timeoutMs, read) {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(POLL_MS)) {
    if (errors.length) throw new Error(`Page failed: ${errors.join('\n')}`);
    const value = await page.evaluate(read);
    if (value) return value;
  }
  throw new Error(`${what} did not happen in ${timeoutMs / 1000} s`);
}

const gameReady = () => Boolean(window.__ROAM__?.rig);
const benchState = () => {
  const state = window.__ROAM_BENCH__;
  if (state?.error) throw new Error(`Bench failed: ${state.error}`);
  return state?.done ? true : null;
};

function readTrace(path) {
  const bytes = statSync(path).size;
  if (bytes > TRACE_MAX_BYTES) throw new Error(`The trace ${path} is ${Math.round(bytes / 1e6)} MB, too big to read`);
  const trace = JSON.parse(readFileSync(path, 'utf8'));
  rmSync(path);
  return trace;
}

async function censusOf(browser, base, scene, tracePath) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('crash', () => errors.push('the page crashed'));
  await browser.startTracing(page, { path: tracePath, screenshots: false, categories: CATEGORIES });
  await page.goto(`${base}?bench&scenes=${scene}`, { waitUntil: 'commit', timeout: GAME_TIMEOUT_MS });
  await until(page, errors, 'The game boot', GAME_TIMEOUT_MS, gameReady);
  const systems = await page.evaluate(installCensus);
  console.log(`${scene}: census wrapped ${systems} systems, bench playing`);
  await until(page, errors, 'The bench', BENCH_TIMEOUT_MS, benchState);
  const census = await page.evaluate(readCensus);
  await browser.stopTracing();
  await page.close();
  return { census, rules: workerSteps(readTrace(tracePath)) };
}

async function runScene(base, scene, commit) {
  const { browser, software, renderer } = await launchChromium(chromium, { headless: true, args: FLAGS });
  try {
    if (software) throw new Error(`The census got the software renderer ${renderer}. It needs a GPU.`);
    const name = `perf-reports/census-${os.hostname().replace(/[^\w.-]/g, '_')}-${commit}-${scene}`;
    const { census, rules } = await censusOf(browser, base, scene, `${name}.trace.json`);
    writeFileSync(`${name}.json`, `${JSON.stringify({ scene, commit, renderer, census, rules }, null, 2)}\n`);
    console.log(`\n${censusLines(scene, census, rules).join('\n')}\n\nreport ${name}.json\n`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const scenes = parseArgs(process.argv.slice(2));
  const commit = git('rev-parse', '--short', 'HEAD');
  mkdirSync('perf-reports', { recursive: true });
  const server = await startDevServer();
  try {
    for (const scene of scenes) await runScene(server.url, scene, commit);
  } finally {
    server.stop();
  }
}

await main();
