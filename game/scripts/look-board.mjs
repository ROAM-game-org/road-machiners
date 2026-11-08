import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';
import { startNewGame } from './night-ground.mjs';

const VIEWPORT = { width: 1440, height: 900 };
const BOOT_MS = 240000;
const SETTLE_MS = 4500;
const DIFF_LEVEL = 8;
const DIFF_GAIN = 8;
const FLAT_SPREAD = 4;
const LABEL_H = 40;
const NIGHT_HOUR = 23;
const LIT_TRUCKS = 6;
const HIGHWAY_SEED = 1;

const ROAMING = [
  { name: 'mud', at: [1544.5, 511.5], zoom: 1.15, hour: 13 },
  { name: 'scrub', at: [128.5, 251.5], zoom: 1.15, hour: 13 },
  { name: 'ravine', at: [366, 1395], heading: -2.8, speed: 3, zoom: 1.6, hour: 14 },
  { name: 'mud-far', at: [1544.5, 511.5], zoom: 0.71, hour: 13 },
  { name: 'truck', at: 'start', zoom: 2, hour: 13 },
  { name: 'mud-evening', at: [1544.5, 511.5], zoom: 1.15, hour: 19 },
  { name: 'mud-night', at: [1544.5, 511.5], zoom: 1.15, hour: NIGHT_HOUR },
  { name: 'town-night', at: 'start', zoom: 1.15, hour: 22, lamps: true },
];
const HIGHWAY = [
  { name: 'highway-day', zoom: 1.15, hour: 13 },
  { name: 'highway-night', zoom: 1.15, hour: NIGHT_HOUR, lamps: true },
];

function flag(args, name) {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? null : args[at + 1];
}

function required(args, name) {
  const value = flag(args, name);
  if (value === null) throw new Error(`look-board needs --${name}`);
  return value;
}

async function openGame(browser, url) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.setDefaultTimeout(BOOT_MS);
  page.on('pageerror', (e) => console.log(`pageerror before the next shot: ${e.message.slice(0, 300)}`));
  await page.goto(playUrl(url));
  await waitForPlay(page);
  return page;
}

async function waitForPlay(page) {
  await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: BOOT_MS });
  await page.waitForSelector('#boot', { state: 'detached', timeout: BOOT_MS });
  await clearQuestScreens(page);
  await page.evaluate(() => {
    const big = [...document.querySelectorAll('canvas')].sort((p, q) => q.clientWidth * q.clientHeight - p.clientWidth * p.clientHeight)[0];
    big.dataset.lookMain = '1';
  });
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas[data-look-main] { visibility: visible !important; }' });
}

async function clearQuestScreens(page) {
  for (let i = 0; i < 60; i++) {
    if (!(await page.locator('.quest-screen:visible').count())) return;
    await page.waitForTimeout(400);
    const next = page.locator('.quest-next, .quest-choice').first();
    if ((await next.count()) === 0) await page.mouse.click(VIEWPORT.width / 2, 700);
    else await next.click({ timeout: 8000 }).catch(() => page.mouse.click(VIEWPORT.width / 2, 700));
  }
  throw new Error('a quest screen stayed up');
}

function stage(page, shot, start) {
  return page.evaluate(async ({ shot, start }) => {
    const g = window.__ROAM__;
    const cheats = await import('/src/sim/cheats.ts');
    const world = await import('/src/sim/world.ts');
    const damage = await import('/src/sim/damage.ts');
    g.apply(cheats.skipToHour(g.state, shot.hour));
    if (shot.at) g.apply(cheats.teleport(g.state, shot.at === 'start' ? start : { x: shot.at[0], y: shot.at[1] }));
    if (shot.heading !== undefined) g.apply(world.update(g.state, (draft) => { const me = damage.playerVehicle(draft); me.heading = shot.heading; me.speed = shot.speed; }));
    g.apply({ ...g.state, player: { ...g.state.player, headlights: Boolean(shot.lamps) } });
    g.rig.setZoom(shot.zoom);
  }, { shot, start });
}

function playerPos(page) {
  return page.evaluate(async () => {
    const damage = await import('/src/sim/damage.ts');
    const { pos } = damage.playerVehicle(window.__ROAM__.state);
    return { x: pos.x, y: pos.y };
  });
}

async function shootAll(page, shots, out, start) {
  for (const shot of shots) {
    await stage(page, shot, start);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: path.join(out, `${shot.name}.png`) });
    console.log(`shot ${shot.name}`);
  }
}

function picked(shots, only) {
  return only ? shots.filter((s) => only.includes(s.name)) : shots;
}

async function shoot(args) {
  const out = required(args, 'out');
  const url = withExtra(required(args, 'url'), flag(args, 'url-extra'));
  const only = flag(args, 'only')?.split(',') ?? null;
  mkdirSync(out, { recursive: true });
  const { browser } = await launchChromium(chromium, { executablePath: process.env.ROAM_CHROME });
  try {
    const page = await openGame(browser, url);
    const start = await playerPos(page);
    await shootAll(page, picked(ROAMING, only), out, start);
    const highway = picked(HIGHWAY, only);
    if (highway.length) await shootHighway(page, url, highway, out);
  } finally {
    await browser.close();
  }
  await checkNotFlat(out, only);
}

async function shootHighway(page, url, shots, out) {
  await page.goto(playUrl(withExtra(url, `seed=${HIGHWAY_SEED}`)));
  await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: BOOT_MS });
  await startNewGame(page, 'chaosHighway', BOOT_MS);
  await waitForPlay(page);
  await shootAll(page, shots, out, null);
}

function withExtra(url, extra) {
  const page = new URL(url);
  for (const [key, value] of new URLSearchParams(extra ?? '')) page.searchParams.set(key, value);
  return page.href;
}

async function withDecoder(work) {
  const browser = await chromium.launch({ executablePath: process.env.ROAM_CHROME });
  try {
    const page = await browser.newPage();
    return await work(page);
  } finally {
    await browser.close();
  }
}

function dataUrl(file) {
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
}

async function checkNotFlat(dir, only) {
  const names = readdirSync(dir).filter((f) => f.endsWith('.png') && (!only || only.includes(f.slice(0, -4))));
  const flat = await withDecoder(async (page) => {
    const found = [];
    for (const name of names) if ((await page.evaluate(spreadOf, dataUrl(path.join(dir, name)))) < FLAT_SPREAD) found.push(name);
    return found;
  });
  if (flat.length) throw new Error(`flat shots, a blank canvas or a covered screen: ${flat.join(', ')}`);
}

async function spreadOf(src) {
  const image = await createImageBitmap(await (await fetch(src)).blob());
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i + 1];
    squares += data[i + 1] * data[i + 1];
  }
  const n = data.length / 4;
  return Math.sqrt(squares / n - (sum / n) ** 2);
}

async function diffSheet({ before, after, level, gain, labelH }) {
  const load = async (src) => createImageBitmap(await (await fetch(src)).blob());
  const [a, b] = [await load(before), await load(after)];
  const pixels = (image) => {
    const ctx = new OffscreenCanvas(a.width, a.height).getContext('2d');
    ctx.drawImage(image, 0, 0, a.width, a.height);
    return ctx.getImageData(0, 0, a.width, a.height);
  };
  const [pa, pb] = [pixels(a), pixels(b)];
  const diff = new ImageData(a.width, a.height);
  let largest = 0;
  let over = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    let most = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(pa.data[i + c] - pb.data[i + c]);
      most = Math.max(most, d);
      diff.data[i + c] = Math.min(255, d * gain);
    }
    diff.data[i + 3] = 255;
    largest = Math.max(largest, most);
    if (most > level) over++;
  }
  const sheet = new OffscreenCanvas(a.width * 3 + 20, a.height + labelH);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = 'black';
  ctx.font = '28px sans-serif';
  ctx.drawImage(a, 0, labelH);
  ctx.drawImage(b, a.width + 10, labelH, a.width, a.height);
  ctx.putImageData(diff, a.width * 2 + 20, labelH);
  [['BEFORE', 0], ['AFTER', a.width + 10], [`DIFF x${gain}`, a.width * 2 + 20]].forEach(([label, x]) => ctx.fillText(label, x + 10, 30));
  const blob = await sheet.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { largest, share: over / (pa.data.length / 4), png: btoa(binary) };
}

async function compare(args) {
  const before = required(args, 'before');
  const after = required(args, 'after');
  const out = required(args, 'out');
  mkdirSync(out, { recursive: true });
  const names = readdirSync(after).filter((f) => f.endsWith('.png'));
  const changed = await withDecoder(async (page) => {
    const found = [];
    for (const name of names) {
      const result = await page.evaluate(diffSheet, { before: dataUrl(path.join(before, name)), after: dataUrl(path.join(after, name)), level: DIFF_LEVEL, gain: DIFF_GAIN, labelH: LABEL_H });
      writeFileSync(path.join(out, name), Buffer.from(result.png, 'base64'));
      console.log(`${name.padEnd(20)} largest ${String(result.largest).padStart(3)}  over ${DIFF_LEVEL}: ${(result.share * 100).toFixed(3)}%`);
      if (result.largest > 0) found.push(name);
    }
    return found;
  });
  console.log(changed.length ? `changed: ${changed.join(', ')}` : 'all shots match');
}

function lightUp(page) {
  return page.evaluate(async ({ hour, trucks }) => {
    const g = window.__ROAM__;
    const cheats = await import('/src/sim/cheats.ts');
    const { NPCS } = await import('/src/data/npcs.ts');
    const kinds = Object.keys(NPCS);
    let w = cheats.skipToHour(g.state, hour);
    for (let i = 0; i < trucks; i++) w = cheats.spawnNear(w, kinds[i % kinds.length], false);
    g.apply({ ...w, player: { ...w.player, headlights: true } });
  }, { hour: NIGHT_HOUR, trucks: LIT_TRUCKS });
}

function mostSamplers(page) {
  return page.evaluate(() => {
    const g = window.__ROAM__;
    const gl = g.renderer.getContext();
    const kinds = new Set([gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW]);
    const units = (program) => {
      let n = 0;
      for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
        const u = gl.getActiveUniform(program, i);
        if (kinds.has(u.type)) n += u.size;
      }
      return n;
    };
    const counted = g.renderer.info.programs.map((p) => ({ units: units(p.program), key: p.cacheKey.slice(p.cacheKey.lastIndexOf('}') + 1) || p.name }));
    return counted.sort((a, b) => b.units - a.units).slice(0, 3);
  });
}

async function samplers(args) {
  const url = required(args, 'url');
  const { browser } = await launchChromium(chromium, { executablePath: process.env.ROAM_CHROME });
  try {
    const page = await openGame(browser, url);
    await page.waitForTimeout(SETTLE_MS);
    console.log('roaming day', JSON.stringify(await mostSamplers(page)));
    await lightUp(page);
    await page.waitForTimeout(SETTLE_MS);
    console.log('roaming', JSON.stringify(await mostSamplers(page)));
    await startNewGame(page, 'chaosHighway', BOOT_MS);
    await lightUp(page);
    await page.waitForTimeout(SETTLE_MS);
    console.log('highway', JSON.stringify(await mostSamplers(page)));
  } finally {
    await browser.close();
  }
}

const COMMANDS = { shoot, compare, samplers };
const [command, ...rest] = process.argv.slice(2);
if (!COMMANDS[command]) throw new Error(`look-board command must be one of ${Object.keys(COMMANDS).join(', ')}`);
await COMMANDS[command](rest);
