import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import { sheetUrl } from './args.mjs';
const server = await startServer();
const out = new URL('./', import.meta.url).pathname;
const only = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 900 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/\/out\/[a-z]+\/meta\.json/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
await page.goto(sheetUrl(server));
try { await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 20000 }); }
catch { console.error('sheet never became ready:', errors.join(' | ')); await browser.close(); server.close(); process.exit(1); }
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
if (!only.length || only.includes('full')) await page.locator('#full').screenshot({ path: out + 'check-full.png' });
const names = await page.$$eval('#rows h3', (hs) => hs.map((h) => h.textContent));
const pairs = page.locator('#rows .pair');
for (let i = 0; i < names.length; i++) if (!only.length || only.includes(names[i])) await pairs.nth(i).screenshot({ path: out + `check-${names[i]}.png` });
await browser.close(); server.close();
if (errors.length) { console.error('errors: ' + errors.join(' | ')); process.exit(1); }
console.log('no errors');
