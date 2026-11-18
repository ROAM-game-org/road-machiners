import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
try { await page.waitForFunction(() => window.bakeReady === true, null, { timeout: 30000 }); }
catch { console.error('bake page never became ready', errors); await browser.close(); process.exit(1); }
const MAX_PX = 8192, MAX_AREA = 30e6;
let meta, best = 1;
for (const scale of [1, 2, 3, 4]) {
  const probe = scale === 1 ? null : meta;
  if (probe && (probe.width * scale > MAX_PX || probe.height * scale > MAX_PX || probe.width * probe.height * scale * scale > MAX_AREA)) continue;
  const result = await page.evaluate((s) => window.bake(s), scale);
  for (const [name, url] of Object.entries(result.files)) writeFileSync(`${out}/${name}@${scale}x.png`, Buffer.from(url.split(',')[1], 'base64'));
  if (scale === 1) meta = result.meta;
  best = scale;
}
meta.bestScale = best;
writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 1));
if (errors.length) console.log('console:', errors.join('\n'));
await browser.close();
console.log('baked to', out);
