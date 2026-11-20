import { chromium } from 'playwright';
import { gameUrlArg } from './args.mjs';
import { launchChromium } from '../../scripts/gpu.mjs';
import { playUrl } from '../../scripts/game-url.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const GAME_URL = gameUrlArg();
const out = new URL('./', import.meta.url).pathname;
const { browser } = await launchChromium(chromium);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(playUrl(GAME_URL));
await page.waitForFunction(() => document.querySelector('#ui .radio-plate')?.checkVisibility() && !document.querySelector('.boot-box')?.checkVisibility(), null, { timeout: 90000 });
await page.waitForTimeout(1500);

const liveText = (sel) => page.evaluate((sel) => {
  const rootEl = document.querySelector(sel);
  const items = [];
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim(); const el = n.parentElement;
    if (!text || !el.checkVisibility()) continue;
    const range = document.createRange(); range.selectNodeContents(n); const r = range.getBoundingClientRect();
    if (r.width < 1) continue;
    const cs = getComputedStyle(el);
    items.push({ text, cls: typeof el.className === 'string' ? el.className : '', box: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)), font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, color: cs.color, shadow: cs.textShadow, spacing: cs.letterSpacing, transform: cs.textTransform });
  }
  const icons = [...rootEl.querySelectorAll('img, svg, [style*="url("]')].filter((e) => e.checkVisibility()).map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), cls: typeof e.className === 'string' ? e.className : e.className.baseVal, src: e.getAttribute('src') ?? null, html: e.tagName.toLowerCase() === 'svg' ? e.outerHTML.slice(0, 4000) : null, box: [r.x, r.y, r.width, r.height].map((v) => +v.toFixed(1)) }; }).filter((i) => i.box[2] > 4);
  return { items, icons };
}, sel);

const STATES = {
  tip: { open: async () => {}, sel: '.opening-tip' },
  menu: { open: () => page.locator('#ui .keys-tray button').nth(4).click(), sel: '.game-menu [role=menu]' },
  journal: { open: () => page.locator('#ui .keys-tray button').nth(1).click(), sel: '.journal, .journal-panel, [class*=journal]' },
  dialog: { open: () => page.locator('#ui .keys-tray button').nth(2).click(), sel: '.inventory-screen' },
};
const boxes = JSON.parse(readFileSync(out + 'boxes.json', 'utf8'));
const live = JSON.parse(readFileSync(out + 'live.json', 'utf8'));
boxes.scenes = {};
for (const [name, st] of Object.entries(STATES)) {
  await st.open();
  await page.waitForTimeout(1000);
  const sel = await page.evaluate((list) => list.split(', ').find((s) => [...document.querySelectorAll(s)].some((e) => e.checkVisibility() && e.getBoundingClientRect().width > 50)), st.sel);
  if (!sel) throw new Error(`${name}: nothing visible for ${st.sel}`);
  const el = await page.locator(sel).filter({ visible: true }).first().elementHandle();
  const b = await el.boundingBox();
  boxes.faces[name] = [b.x, b.y, b.width, b.height].map((v) => +v.toFixed(1));
  const x = Math.max(0, Math.floor(b.x - 6)), y = Math.max(0, Math.floor(b.y - 6));
  boxes.crops[name] = { x, y, width: Math.min(1280, Math.ceil(b.x + b.width + 6)) - x, height: Math.min(720, Math.ceil(b.y + b.height + 6)) - y };
  live[name] = await liveText(sel);
  live[name].selector = sel;
  await page.screenshot({ path: out + `state-${name}.png` });
  await page.screenshot({ path: out + `current-${name}.png`, clip: boxes.crops[name] });
  await el.evaluate((e) => { e.dataset.prevVis = e.style.visibility; e.style.visibility = 'hidden'; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + `state-${name}-clean.png` });
  await el.evaluate((e) => { e.style.visibility = e.dataset.prevVis; });
  boxes.scenes[name] = { current: `state-${name}.png`, clean: `state-${name}-clean.png` };
  if (name !== 'tip') { await page.keyboard.press('Escape'); await page.waitForTimeout(700); }
}
writeFileSync(out + 'boxes.json', JSON.stringify(boxes, null, 1));
writeFileSync(out + 'live.json', JSON.stringify(live, null, 1));
console.log(JSON.stringify(boxes.faces, null, 0));
console.log('errors', JSON.stringify(errors));
await browser.close();
