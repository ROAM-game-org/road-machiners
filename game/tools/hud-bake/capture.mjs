import { chromium } from 'playwright';
import { gameUrlArg } from './args.mjs';
import { launchChromium } from '../../scripts/gpu.mjs';
import { playUrl } from '../../scripts/game-url.mjs';
import { writeFileSync } from 'node:fs';
const GAME_URL = gameUrlArg();
const out = new URL('./', import.meta.url).pathname;
const { browser } = await launchChromium(chromium);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(playUrl(GAME_URL));
await page.waitForFunction(() => document.querySelector('#ui .radio-plate')?.checkVisibility() && !document.querySelector('.boot-box')?.checkVisibility(), null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.head.append(Object.assign(document.createElement('style'), { textContent: '#ui .tip { display: none !important }' })));
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'current.png' });
const tree = await page.evaluate(() => {
  const walk = (el, depth) => {
    const r = el.getBoundingClientRect();
    const row = { tag: el.tagName.toLowerCase(), cls: el.className && typeof el.className === 'string' ? el.className : '', id: el.id, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], visible: el.checkVisibility ? el.checkVisibility() : true };
    if (depth < 3) row.kids = [...el.children].map((c) => walk(c, depth + 1)).filter((k) => k.visible && k.box[2] > 20 && k.box[3] > 20);
    return row;
  };
  return walk(document.querySelector('#ui'), 0);
});
writeFileSync(out + 'tree.json', JSON.stringify(tree, null, 1));
const PARTS = { stats: '.stats-tray', keys: '.keys-tray', drive: '.hud-drive', weapons: '.hud-weapons', radio: '.hud-radio', truck: '.truck-condition', rail: '.dash-rail' };
const boxes = {};
for (const [name, sel] of Object.entries(PARTS)) {
  const b = await page.locator('#ui ' + sel).first().boundingBox();
  const x = Math.max(0, Math.floor(b.x - 6)), y = Math.max(0, Math.floor(b.y - 6));
  const clip = { x, y, width: Math.min(1280, Math.ceil(b.x + b.width + 6)) - x, height: Math.min(720, Math.ceil(b.y + b.height + 6)) - y };
  boxes[name] = clip;
  await page.screenshot({ path: out + `current-${name}.png`, clip });
}
const FACES = { stats: '.stats-tray', keys: '.keys-tray', drive: '.drive-plate', weapons: '.weapons-plate', radio: '.radio-plate', truck: '.truck-condition', rail: '.dash-rail' };
const faces = {};
for (const [name, sel] of Object.entries(FACES)) { const b = await page.locator('#ui ' + sel).first().boundingBox(); faces[name] = [b.x, b.y, b.width, b.height].map((v) => +v.toFixed(1)); }
writeFileSync(out + 'boxes.json', JSON.stringify({ crops: boxes, faces }, null, 1));
const live = await page.evaluate((parts) => {
  const out = {};
  const textItem = (n) => {
    const text = n.textContent.trim(), el = n.parentElement;
    if (!text || !el.checkVisibility()) return null;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1) return null;
    const cs = getComputedStyle(el);
    return { text, cls: el.className, box: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)), font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, color: cs.color, shadow: cs.textShadow, spacing: cs.letterSpacing, transform: cs.textTransform, ghost: el.dataset.ghost ?? null };
  };
  for (const [name, sel] of Object.entries(parts)) {
    const rootEl = document.querySelector('#ui ' + sel);
    const items = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const item = textItem(n); if (item) items.push(item); }
    const icons = [...rootEl.querySelectorAll('img, svg, [style*="url("]')].filter((e) => e.checkVisibility()).map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), cls: typeof e.className === 'string' ? e.className : e.className.baseVal, src: e.getAttribute('src') ?? null, box: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)) }; }).filter((i) => i.box[2] > 4);
    out[name] = { items, icons };
  }
  return out;
}, PARTS);
writeFileSync(out + 'live.json', JSON.stringify(live, null, 1));
await page.evaluate((sels) => { for (const s of sels) for (const el of document.querySelectorAll('#ui ' + s)) el.style.visibility = 'hidden'; }, Object.values(PARTS));
await page.waitForTimeout(300);
await page.screenshot({ path: out + 'clean.png' });
console.log('errors', JSON.stringify(errors));
await browser.close();
