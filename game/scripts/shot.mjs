import { mkdirSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { gpuArgs, rendererOf } from './gpu.mjs';

const USAGE = 'Usage: npm run shot -- [<scene.shot.ts>] [--model a,b] [--truck <chassis> --hp 100,50,0] [--camera quarter|game|front|back|top|left|right|bottom|all] [--zoom 1] [--hour 12] [--out tmp/shots] [--cpu]';
const LIMIT_MS = 180000;
const FLAGS = ['model', 'truck', 'hp', 'camera', 'zoom', 'hour'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return null;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value. ${USAGE}`);
  return value;
}

function sceneUrl() {
  const scene = process.argv[2];
  if (!scene || scene.startsWith('--')) return null;
  const path = resolve(scene);
  if (!existsSync(path)) throw new Error(`No scene file at ${path}`);
  return `/@fs${path}`;
}

function query() {
  const params = new URLSearchParams();
  const scene = sceneUrl();
  if (scene) params.set('scene', scene);
  for (const name of FLAGS) {
    const value = arg(name);
    if (value !== null) params.set(name, value);
  }
  if (!['scene', 'model', 'truck'].some((name) => params.has(name))) throw new Error(USAGE);
  return params;
}

const params = query();
const cpu = process.argv.includes('--cpu');
const outDir = arg('out') ?? 'tmp/shots';
const server = await createServer({ server: { port: 5195, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: cpu ? [] : gpuArgs() });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}shot.html?${params}`);
  await page.waitForFunction(() => window.__SHOT__ || window.__SHOT_ERROR__, null, { timeout: LIMIT_MS });
  const { shot, failed } = await page.evaluate(() => ({ shot: window.__SHOT__, failed: window.__SHOT_ERROR__ }));
  if (failed) throw new Error(failed);
  if (errors.length > 0) throw new Error(`Page errors:\n${errors.join('\n')}`);
  if (!cpu) console.log(`renderer: ${await rendererOf(page)}`);
  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}/${shot.name}.png`;
  writeFileSync(`${file}.tmp`, Buffer.from(shot.png.slice(shot.png.indexOf(',') + 1), 'base64'));
  renameSync(`${file}.tmp`, file);
  console.log(file);
} finally {
  await browser.close();
  await server.close();
}
