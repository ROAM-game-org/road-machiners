import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { launchChromium } from './gpu.mjs';

const BUILD_LIMIT_MS = 600000;
const PICTURES = 'public/survey';
const MANIFEST = 'src/data/survey-pictures.json';
const SHEET = 'tmp/survey-pictures/sheet.png';

function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
}

function bytesOf(url) {
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

const server = await createServer({ server: { port: 5192, strictPort: false }, logLevel: 'error' });
await server.listen();
const { browser } = await launchChromium(chromium);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}survey-pictures.html`);
  await page.waitForFunction(() => window.__SURVEY_PICTURES__ || window.__SURVEY_PICTURES_ERROR__, null, { timeout: BUILD_LIMIT_MS });
  const failure = await page.evaluate(() => window.__SURVEY_PICTURES_ERROR__);
  if (failure) throw new Error(`The survey pictures page failed:\n${failure}`);
  if (errors.length) throw new Error(`The survey pictures page logged errors:\n${errors.join('\n')}`);
  const result = await page.evaluate(() => window.__SURVEY_PICTURES__);
  const ids = Object.keys(result.files);
  mkdirSync(PICTURES, { recursive: true });
  for (const name of readdirSync(PICTURES, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).filter((n) => n.endsWith('.webp') && !ids.includes(n.slice(0, -5)))) rmSync(`${PICTURES}/${name}`);
  for (const [id, url] of Object.entries(result.files)) {
    const path = `${PICTURES}/${id}.webp`;
    writeAtomic(path, bytesOf(url));
    console.log(`${path}: ${(statSync(path).size / 1024).toFixed(1)} KB`);
  }
  writeAtomic(MANIFEST, `${JSON.stringify(result.manifest, null, 2)}\n`);
  writeAtomic(SHEET, bytesOf(result.sheet));
  console.log(`${MANIFEST}: ${ids.length} sites of map ${result.manifest.mapHash}; contact sheet ${SHEET}`);
} finally {
  await browser.close();
  await server.close();
}
