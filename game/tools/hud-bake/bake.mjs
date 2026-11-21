import { chromium } from 'playwright';
import { launchChromium } from '../../scripts/gpu.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { PARTS, PIECES } from './parts.js';

const BAKES = [...PARTS, ...PIECES];
import { sourceHash } from './source-hash.mjs';

const GAME = fileURLToPath(new URL('../../', import.meta.url));
const PICTURES = `${GAME}public/hud/baked`;
const BOXES = `${GAME}src/ui/dash/baked`;
const GPU_MAX_SIDE = 8192, GPU_MAX_AREA = 30e6;
const VIEW_SCALES = { desktop: [2, 4], flat: [2] };

const fits = (meta, s) => meta.width * s <= GPU_MAX_SIDE && meta.height * s <= GPU_MAX_SIDE && meta.width * meta.height * s * s <= GPU_MAX_AREA;

function scalesFor(meta, wanted) {
  const picked = wanted.map((w) => { let s = w; while (s > 1 && !fits(meta, s)) s--; return s; });
  return [...new Set(picked)];
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isQuad = (q) => Array.isArray(q) && q.length === 4 && q.every(isPoint);

const goodZone = (z) => isQuad(z.quad) && isPoint(z.size);
const goodSprite = (s) => s.crop.length === 4 && s.crop.every(Number.isFinite) && s.frames.length > 0;

function checkMeta(part, meta) {
  const bad = [
    ...(isQuad(meta.face) ? [] : ['face']),
    ...Object.entries(meta.zones).filter(([, z]) => !goodZone(z)).map(([name]) => `zone ${name}`),
    ...Object.entries(meta.sprites).filter(([, s]) => !goodSprite(s)).map(([name]) => `sprite ${name}`),
  ];
  if (bad.length) throw new Error(`${part}: bad box data in ${bad.join(', ')}`);
}

async function bakePart(page, url, part, view) {
  const errors = [];
  const onConsole = (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver Message')) errors.push(m.text()); };
  const onError = (e) => errors.push(String(e));
  page.on('console', onConsole); page.on('pageerror', onError);
  await page.goto(`${url}/game/tools/hud-bake/part.html?p=${part}&view=${view}`);
  await page.waitForFunction(() => window.bakeReady === true, null, { timeout: 30000 }).catch(() => { throw new Error(`${part} ${view}: bake page never became ready. ${errors.join(' | ')}`); });
  const { meta } = await page.evaluate(() => window.bake(1));
  checkMeta(part, meta);
  const scales = scalesFor(meta, VIEW_SCALES[view]);
  const dir = `${PICTURES}/${part}/${view}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (const scale of scales) {
    const { files } = await page.evaluate((s) => window.bake(s), scale);
    for (const [name, data] of Object.entries(files)) writeFileSync(`${dir}/${name}@${scale}x.webp`, Buffer.from(data.split(',')[1], 'base64'));
  }
  writeFileSync(`${BOXES}/${part}.${view}.json`, `${JSON.stringify({ ...meta, scales, source: SOURCE }, null, 1)}\n`);
  page.off('console', onConsole); page.off('pageerror', onError);
  if (errors.length) throw new Error(`${part} ${view}: ${errors.join(' | ')}`);
  console.log(`${part} ${view}: ${scales.map((s) => `${s}x`).join(' ')}`);
}

const SOURCE = sourceHash();
const asked = process.argv.slice(2);
const unknown = asked.filter((p) => !BAKES.includes(p));
if (unknown.length) throw new Error(`unknown parts: ${unknown.join(', ')}. Parts: ${BAKES.join(', ')}`);
mkdirSync(BOXES, { recursive: true });
const server = await startServer();
const { browser } = await launchChromium(chromium);
try {
  const page = await browser.newPage();
  for (const view of Object.keys(VIEW_SCALES)) for (const part of asked.length ? asked : BAKES) await bakePart(page, server.url, part, view);
} finally {
  await browser.close(); server.close();
}
