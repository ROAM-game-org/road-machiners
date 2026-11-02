import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const USAGE = 'Usage: node scripts/hitch-cost.mjs --url <dev server> [--turns 3] [--distance 150] [--zoom 1.15] [--hour 10] [--focus fog.ts] [--top 12] [--out <file.json>]';
const SEED = 1337;
const VIEWPORT = { width: 1600, height: 1000 };
const PIXEL_DENSITY = 2;
const SLOW_UPLOAD_MS = 4;
const SAMPLING_US = 100;
const TURN_DEADLINE_MS = 60000;

function readFlags(argv) {
  const flags = { turns: '3', distance: '150', zoom: '1.15', hour: '10', focus: 'fog.ts', top: '12' };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!name?.startsWith('--') || argv[i + 1] === undefined) throw new Error(`Bad argument ${name}. ${USAGE}`);
    flags[name.slice(2)] = argv[i + 1];
  }
  if (!flags.url) throw new Error(`--url is required. ${USAGE}`);
  return flags;
}

function installTimers(SLOW_UPLOAD_MS) {
  const g = window.__ROAM__;
  const calls = [];
  window.__HITCH__ = calls;
  for (const name of ['update', 'updateSight']) {
    const original = g.fog[name].bind(g.fog);
    g.fog[name] = (...args) => {
      const t0 = performance.now();
      try {
        return original(...args);
      } finally {
        calls.push({ name: `fog.${name}`, at: t0, ms: performance.now() - t0 });
      }
    };
  }
  const proto = WebGL2RenderingContext.prototype;
  const where = () => new Error().stack.split('\n').slice(3, 6).map((l) => l.trim().replace(/\(.*\/(.*?)\?.*:(\d+):\d+\)/, '$1:$2')).join(' < ');
  const sizeOf = (args) => {
    const data = args.find((a) => ArrayBuffer.isView(a));
    return data ? `${data.byteLength} bytes` : 'no view';
  };
  for (const name of ['texSubImage2D', 'texImage2D', 'bufferSubData', 'bufferData']) {
    const original = proto[name];
    proto[name] = function (...args) {
      const t0 = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const ms = performance.now() - t0;
        if (ms > SLOW_UPLOAD_MS) calls.push({ name: `gl.${name}`, at: t0, ms, detail: `${sizeOf(args)} ${where()}` });
      }
    };
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((t) => {
    const t0 = performance.now();
    callback(t);
    calls.push({ name: 'frame', at: t0, ms: performance.now() - t0 });
  });
}

async function orderThrough(page, distance, zoom, hour) {
  return page.evaluate(async ({ distance, zoom, hour }) => {
    const g = window.__ROAM__;
    const timed = (await import('/src/sim/cheats.ts')).skipToHour(g.state, hour);
    const w = { ...timed, vehicles: timed.vehicles.map((v) => ({ ...v })) };
    const me = w.vehicles.find((v) => v.id === w.player.vehicleId);
    if (!me) throw new Error(`Player vehicle ${w.player.vehicleId} missing`);
    const clamp = (x) => Math.max(1, Math.min(w.size - 1, x));
    me.order = { kind: 'through', dest: { x: clamp(me.pos.x + distance), y: clamp(me.pos.y) } };
    g.apply(w);
    g.debugView(me.pos.x, me.pos.y, zoom);
    return g.state.turn;
  }, { distance, zoom, hour });
}

async function playTurns(page, turn, turns) {
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.waitForFunction(({ turn, turns }) => window.__ROAM__.state.turn >= turn + turns, { turn, turns }, { timeout: TURN_DEADLINE_MS });
}

function selfTimes(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  return { byId, parent, self };
}

function label(node) {
  const f = node.callFrame;
  const file = f.url.split('/').slice(-2).join('/');
  return `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
}

function underFocus(profile, focus, top) {
  const { byId, parent, self } = selfTimes(profile);
  const rows = new Map();
  let total = 0;
  for (const [id, us] of self) {
    let inside = false;
    for (let p = id; p !== undefined; p = parent.get(p)) if (byId.get(p).callFrame.url.includes(focus)) { inside = true; break; }
    if (!inside) continue;
    const key = label(byId.get(id));
    rows.set(key, (rows.get(key) ?? 0) + us / 1000);
    total += us / 1000;
  }
  const sorted = [...rows].sort((a, b) => b[1] - a[1]).slice(0, top);
  return { total, sorted };
}

function longest(calls, name, n) {
  return calls.filter((c) => c.name === name).sort((a, b) => b.ms - a.ms).slice(0, n).map((c) => c.ms.toFixed(1)).join(' ');
}

const flags = readFlags(process.argv.slice(2));
const { browser } = await launchChromium(chromium, { args: ['--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: PIXEL_DENSITY });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const seeded = new URL(flags.url);
seeded.searchParams.set('seed', String(SEED));
await page.goto(playUrl(seeded.href));
await page.waitForFunction(() => window.__ROAM__ && window.__ROAM_PERF__, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.evaluate(installTimers, SLOW_UPLOAD_MS);
const turn = await orderThrough(page, Number(flags.distance), Number(flags.zoom), Number(flags.hour));
await page.evaluate(() => window.__ROAM_PERF__.reset());
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: SAMPLING_US });
await cdp.send('Profiler.start');
await playTurns(page, turn, Number(flags.turns));
const { profile } = await cdp.send('Profiler.stop');
const calls = await page.evaluate(() => window.__HITCH__);
const perf = await page.evaluate(() => window.__ROAM_PERF__.snapshot());
await browser.close();
if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);

const focus = underFocus(profile, flags.focus, Number(flags.top));
console.log(`turns ${flags.turns}, zoom ${flags.zoom}, hour ${flags.hour}, distance ${flags.distance}`);
console.log(`fog timer max ${perf.fog?.max.toFixed(1)}, calls ${perf.fog?.calls}; turn-frame max ${perf['turn-frame']?.max.toFixed(1)}, calls ${perf['turn-frame']?.calls}`);
console.log(`longest fog.update ms: ${longest(calls, 'fog.update', 5)}`);
console.log(`longest fog.updateSight ms: ${longest(calls, 'fog.updateSight', 5)}`);
for (const c of calls.filter((x) => x.name.startsWith('gl.')).sort((a, b) => b.ms - a.ms).slice(0, 8)) console.log(`slow ${c.name} ${c.ms.toFixed(1)} ms ${c.detail}`);
console.log(`longest frame callbacks ms: ${longest(calls, 'frame', 8)}`);
console.log(`self time under ${flags.focus}: ${focus.total.toFixed(1)} ms in total`);
for (const [key, ms] of focus.sorted) console.log(`  ${ms.toFixed(1).padStart(8)} ms  ${key}`);
if (flags.out) {
  mkdirSync(dirname(flags.out), { recursive: true });
  writeFileSync(flags.out, JSON.stringify({ perf, calls }));
}
