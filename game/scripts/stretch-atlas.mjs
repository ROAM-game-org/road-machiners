import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { launchChromium } from './gpu.mjs';

const USAGE = 'Usage: npm run stretch:atlas -- [--seed 1] [--from 1] [--to 10] [--roll 1] [--growth 1]';
const BUILD_LIMIT_MS = 600000;
const KEYS = ['seed', 'from', 'to', 'roll', 'growth'];

const argv = process.argv.slice(2).filter((a) => a !== '--');
const query = new URLSearchParams();
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i].replace(/^--/, '');
  if (!KEYS.includes(key) || argv[i + 1] === undefined) throw new Error(`Unknown or empty argument ${argv[i]}. ${USAGE}`);
  query.set(key, argv[i + 1]);
}
const name = ['seed', 'from', 'to', 'roll', 'growth'].filter((k) => query.has(k)).map((k) => `${k}-${query.get(k)}`).join('_') || 'default';
const out = `tmp/stretch-atlas/${name}.png`;

const server = await createServer({ server: { port: 5194, strictPort: false }, logLevel: 'error' });
await server.listen();
const { browser } = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${server.resolvedUrls.local[0]}stretch-atlas.html?${query}`);
  await page.waitForFunction(() => window.__STRETCH_ATLAS__ || window.__STRETCH_ATLAS_ERROR__, null, { timeout: BUILD_LIMIT_MS });
  const failure = await page.evaluate(() => window.__STRETCH_ATLAS_ERROR__);
  if (failure) throw new Error(`The stretch atlas page failed:\n${failure}`);
  if (errors.length) throw new Error(`The stretch atlas page logged errors:\n${errors.join('\n')}`);
  const done = await page.evaluate(() => window.__STRETCH_ATLAS__);
  mkdirSync('tmp/stretch-atlas', { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
  console.log(`${out}: ${done.stretches} stretches, ${done.trucks} trucks`);
} finally {
  await browser.close();
  await server.close();
}
