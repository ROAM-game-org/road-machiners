import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { gpuArgs } from './gpu.mjs';

const BUILD_LIMIT_MS = 600000;
const SPRITES = 'public/sim-sprites';
const MANIFEST = `${SPRITES}/manifest.json`;
const cpu = process.argv.includes('--cpu');

function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
}

function bytesOf(url) {
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

const server = await createServer({ server: { port: 5193, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: cpu ? [] : gpuArgs() });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}sim-sprites.html`);
  await page.waitForFunction(() => window.__SIM_SPRITES__ || window.__SIM_SPRITES_ERROR__, null, { timeout: BUILD_LIMIT_MS });
  const failure = await page.evaluate(() => window.__SIM_SPRITES_ERROR__);
  if (failure) throw new Error(`The sim sprites page failed:\n${failure}`);
  if (errors.length) throw new Error(`The sim sprites page logged errors:\n${errors.join('\n')}`);
  const result = await page.evaluate(() => window.__SIM_SPRITES__);
  const names = Object.keys(result.files);
  mkdirSync(SPRITES, { recursive: true });
  for (const name of readdirSync(SPRITES).filter((n) => n.endsWith('.webp') && !names.includes(n))) rmSync(`${SPRITES}/${name}`);
  let total = 0;
  for (const [name, url] of Object.entries(result.files)) {
    const path = `${SPRITES}/${name}`;
    writeAtomic(path, bytesOf(url));
    total += statSync(path).size;
  }
  writeAtomic(MANIFEST, `${JSON.stringify(result.manifest, null, 1)}\n`);
  console.log(`${SPRITES}: ${names.length} sheets, ${(total / 1024).toFixed(0)} KB, manifest ${MANIFEST}`);
} finally {
  await browser.close();
  await server.close();
}
