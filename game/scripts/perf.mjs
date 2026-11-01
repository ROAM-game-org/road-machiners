import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing --${name}`);
  return process.argv[i + 1];
};
const url = arg('url');
const seamsOnly = process.argv.includes('--seams-only');
const budgets = JSON.parse(readFileSync(new URL('./perf-budgets.json', import.meta.url), 'utf8'));

const TURNS = 5;
const TRAVEL_TURNS = 6;
const TURN_WAIT_MS = 2600;
const ORDER_OFFSETS = [[12, 4], [40, 25], [-30, 60], [150, 150]];
const VIEW_ZOOM = 0.35;
const SETTLE_MS = 800;
const SAMPLE_MS = 2000;
const SEAM_SEED = 1337;
const SEAM_TURNS = 8;
const SEAM_ORDER_TILES = 30;
const SEAM_SETTLE_MS = 600;
const PREVIEW_WAIT_MS = 30000;

const { browser, software, renderer } = await launchChromium(chromium);
if (software) {
  await browser.close();
  console.error(`FAIL\nPerf got the software renderer ${renderer}. It needs a GPU.`);
  process.exit(1);
}
const errors = [];
const page = await openPage(browser);

async function openPage(owner) {
  const opened = await owner.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  opened.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  opened.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return opened;
}

function seamUrl() {
  const seeded = new URL(url);
  seeded.searchParams.set('seed', String(SEAM_SEED));
  return playUrl(seeded.href);
}

async function measureSeams() {
  const context = await browser.newContext();
  const seamPage = await openPage(context);
  await seamPage.addInitScript(() => {
    window.__SEAM__ = { frames: [], longTasks: [] };
    const frame = (t) => {
      window.__SEAM__.frames.push(t);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__SEAM__.longTasks.push({ start: e.startTime, ms: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
  await seamPage.goto(seamUrl());
  await seamPage.waitForFunction(() => window.__ROAM__ && window.__ROAM_PERF__, null, { timeout: 120000 });
  const ready = await seamPage.evaluate(() => {
    const mark = performance.getEntriesByName('roam:ready')[0];
    if (!mark) throw new Error('No roam:ready performance mark');
    return mark.startTime;
  });
  const turns = [];
  for (let i = 0; i < SEAM_TURNS; i++) turns.push(await seamPage.evaluate(playSeam, { tiles: SEAM_ORDER_TILES, settle: SEAM_SETTLE_MS, previewWait: PREVIEW_WAIT_MS }));
  const trace = await seamPage.evaluate(() => window.__SEAM__);
  await context.close();
  return { ready, turns, trace };
}

async function playSeam({ tiles, settle, previewWait }) {
  const g = window.__ROAM__;
  const perf = window.__ROAM_PERF__;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const previewCalls = () => perf.snapshot().preview?.calls ?? 0;
  const waitFor = async (done, what) => {
    const deadline = performance.now() + previewWait;
    while (!done()) {
      if (performance.now() > deadline) throw new Error(`${what} did not happen in ${previewWait / 1000} s`);
      await nextFrame();
    }
  };
  const player = () => g.state.vehicles.find((v) => v.id === g.state.player.vehicleId);
  if (!player().order) {
    const w = { ...g.state, vehicles: g.state.vehicles.map((v) => ({ ...v })) };
    const me = w.vehicles.find((v) => v.id === w.player.vehicleId);
    if (!me) throw new Error(`Player vehicle ${w.player.vehicleId} missing`);
    const clamp = (x) => Math.max(1, Math.min(w.size - 1, x));
    me.order = { kind: 'stopAt', dest: { x: clamp(me.pos.x + tiles * Math.cos(me.heading)), y: clamp(me.pos.y + tiles * Math.sin(me.heading)) } };
    perf.reset();
    g.apply(w);
    await waitFor(() => previewCalls() > 0, 'A preview after a move order');
  }
  await sleep(settle);
  perf.reset();
  const turn = g.state.turn;
  const start = performance.now();
  g.endTurn();
  await waitFor(() => g.state.turn !== turn, 'The turn');
  const moved = performance.now();
  const expectsPreview = () => !g.anim && (player().order || player().speed > 0);
  await waitFor(() => previewCalls() > 0 || (!g.anim && !expectsPreview()), 'A preview after the turn');
  await sleep(settle);
  const s = perf.snapshot();
  return { start, end: performance.now(), wait: moved - start, turnMs: s.turn?.last ?? null, previewMs: s.preview?.last ?? null, previewCalls: s.preview?.calls ?? 0, routeCalls: s.route?.calls ?? 0 };
}

function frameGapsIn(frames, from, to) {
  const gaps = [];
  for (let i = 1; i < frames.length; i++) if (frames[i] > from && frames[i] <= to) gaps.push(frames[i] - frames[i - 1]);
  return gaps.sort((a, b) => a - b);
}

function longTasksIn(longTasks, from, to) {
  const inside = longTasks.filter((t) => t.start >= from && t.start < to).map((t) => t.ms.toFixed(0));
  return inside.length ? inside.join(' ') : 'none';
}

function printSeams({ ready, turns, trace }) {
  const bootGaps = frameGapsIn(trace.frames, ready, turns[0].start);
  console.log(`seam seed ${SEAM_SEED}, boot window ${(turns[0].start - ready).toFixed(0)} ms: frame max ${(bootGaps.at(-1) ?? 0).toFixed(1)}, long tasks ms ${longTasksIn(trace.longTasks, ready, turns[0].start)}`);
  turns.forEach((t, i) => {
    const gaps = frameGapsIn(trace.frames, t.start, t.end);
    const fixed = (x) => (x === null ? '-' : x.toFixed(1));
    console.log(`seam turn ${i + 1}: wait ${t.wait.toFixed(0)}, worker turn ${fixed(t.turnMs)}, preview ${fixed(t.previewMs)} x${t.previewCalls}, routes ${t.routeCalls}, frame p95 ${fixed(gaps[Math.floor(gaps.length * 0.95)] ?? null)} max ${fixed(gaps.at(-1) ?? null)}, long tasks ms ${longTasksIn(trace.longTasks, t.start, t.end)}`);
  });
}

printSeams(await measureSeams());
if (seamsOnly) {
  await browser.close();
  if (errors.length) {
    console.error(`\nFAIL\n${errors.join('\n')}`);
    process.exit(1);
  }
  process.exit(0);
}

await page.goto(playUrl(url));
await page.waitForFunction(() => window.__ROAM__ && window.__ROAM_PERF__, null, { timeout: 60000 });
await page.waitForTimeout(1000);
const results = {};

results.bootMs = await page.evaluate(() => {
  const mark = performance.getEntriesByName('roam:ready')[0];
  if (!mark) throw new Error('No roam:ready performance mark');
  return mark.startTime;
});

await page.evaluate(() => window.__ROAM_PERF__.reset());
const turnMs = [];
for (let i = 0; i < TURNS; i++) {
  const before = await page.evaluate(() => {
    const g = window.__ROAM__;
    const turn = g.state.turn;
    g.endTurn();
    return turn;
  });
  await page.waitForFunction((turn) => window.__ROAM__.state.turn === turn + 1, before, { timeout: 30000 });
  turnMs.push(await page.evaluate(() => {
    const s = window.__ROAM_PERF__.snapshot().turn;
    if (!s) throw new Error('No turn timer recorded');
    return s.last;
  }));
  await page.waitForTimeout(TURN_WAIT_MS);
}
results.turnMs = Math.max(...turnMs);

const previewMs = [];
for (const offset of ORDER_OFFSETS) {
  previewMs.push(await page.evaluate(async ([dx, dy, wait]) => {
    const g = window.__ROAM__;
    const w = { ...g.state, vehicles: g.state.vehicles.map((v) => ({ ...v })) };
    const me = w.vehicles.find((v) => v.id === w.player.vehicleId);
    if (!me) throw new Error(`Player vehicle ${w.player.vehicleId} missing`);
    const clamp = (x) => Math.max(1, Math.min(w.size - 1, x));
    me.order = { kind: 'stopAt', dest: { x: clamp(me.pos.x + dx), y: clamp(me.pos.y + dy) } };
    window.__ROAM_PERF__.reset();
    g.apply(w);
    const deadline = performance.now() + wait;
    while (!window.__ROAM_PERF__.snapshot().preview) {
      if (performance.now() > deadline) throw new Error(`No preview after a move order in ${wait / 1000} s`);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return window.__ROAM_PERF__.snapshot().preview.last;
  }, [...offset, PREVIEW_WAIT_MS]));
}
results.previewMs = Math.max(...previewMs);

const travel = await page.evaluate(async () => {
  const g = window.__ROAM__;
  const w = { ...g.state, vehicles: g.state.vehicles.map((v) => ({ ...v })) };
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId);
  if (!me) throw new Error(`Player vehicle ${w.player.vehicleId} missing`);
  const clamp = (x) => Math.max(1, Math.min(w.size - 1, x));
  me.order = { kind: 'through', dest: { x: clamp(me.pos.x + 150), y: clamp(me.pos.y) } };
  g.apply(w);
  return { turn: g.state.turn };
});
await page.evaluate(() => window.__ROAM_PERF__.reset());
await page.keyboard.down('Space');
await page.keyboard.up('Space');
const gaps = await page.evaluate(async ({ turn, turns }) => {
  const out = [];
  const deadline = performance.now() + 30000;
  await new Promise((done, fail) => {
    const f = (t) => {
      out.push(t);
      if (window.__ROAM__.state.turn >= turn + turns) done();
      else if (performance.now() > deadline) fail(new Error('Automatic travel did not play the turns in 30 s'));
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  return out.slice(1).map((t, i) => t - out[i]);
}, { turn: travel.turn, turns: TRAVEL_TURNS });
const turnFrame = await page.evaluate(() => window.__ROAM_PERF__.snapshot()['turn-frame']);
if (!turnFrame) throw new Error('No turn-frame timer recorded during travel');
results.travelFrameMs = turnFrame.max;
const stream = await page.evaluate(() => window.__ROAM_PERF__.snapshot());
if (stream['stream-block']) errors.push(`auto travel waited on ${stream['stream-block'].calls} map cells that were not built in time`);
console.log(`stream build ms per frame during travel: max ${(stream['stream-build']?.max ?? 0).toFixed(1)}, calls ${stream['stream-build']?.calls ?? 0}`);
const sortedGaps = [...gaps].sort((a, b) => a - b);

const towns = await page.evaluate(async () => {
  if (typeof window.__ROAM__.debugView !== 'function') throw new Error('Game.debugView is missing, so frame time cannot be measured over the towns');
  const { REGION } = await import('/src/data/region.ts');
  const { sitePads } = await import('/src/sim/sites.ts');
  return REGION.towns.map((t) => ({ name: t.name, x: t.pos.x, y: t.pos.y, pad: sitePads(t)[0] }));
});
async function townFrameP95(night) {
  const out = [];
  for (const t of towns) {
    out.push(await page.evaluate(async ({ x, y, pad, zoom, settle, sample, night }) => {
      const g = window.__ROAM__;
      let w = { ...g.state, vehicles: g.state.vehicles.map((v) => (v.id === g.state.player.vehicleId ? { ...v, pos: pad, order: null } : v)) };
      if (night) w = (await import('/src/sim/cheats.ts')).skipToHour(w, 23);
      g.apply(w);
      g.debugView(x, y, zoom);
      await new Promise((r) => setTimeout(r, settle));
      if (night) {
        let shadowed = 0;
        g.scene.traverse((o) => { if (o.isSpotLight && o.castShadow && o.intensity > 0) shadowed++; });
        if (!shadowed) throw new Error('No shadowed headlight beam at night, so frame time does not measure beam shadows');
      }
      const ts = await new Promise((done) => {
        const out = [];
        const f = (t) => {
          out.push(t);
          if (t - out[0] < sample) requestAnimationFrame(f);
          else done(out);
        };
        requestAnimationFrame(f);
      });
      const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
      return d[Math.floor(d.length * 0.95)];
    }, { x: t.x, y: t.y, pad: t.pad, zoom: VIEW_ZOOM, settle: SETTLE_MS, sample: SAMPLE_MS, night }));
  }
  return out;
}
const frameP95 = await townFrameP95(false);
const nightP95 = await townFrameP95(true);
results.frameP95Ms = Math.max(...frameP95, ...nightP95);

const crashed = await page.evaluate(() => document.querySelector('.crash-screen') !== null);
await browser.close();

console.log(`turn ms per call: ${turnMs.map((x) => x.toFixed(1)).join(', ')}`);
console.log(`preview ms per order: ${previewMs.map((x) => x.toFixed(1)).join(', ')}`);
console.log(`frame p95 ms per town: ${towns.map((t, i) => `${t.name} ${frameP95[i].toFixed(1)}`).join(', ')}`);
console.log(`night frame p95 ms per town: ${towns.map((t, i) => `${t.name} ${nightP95[i].toFixed(1)}`).join(', ')}`);
console.log(`travel frame gap ms: longest ${sortedGaps[sortedGaps.length - 1].toFixed(1)}, p99 ${sortedGaps[Math.floor(sortedGaps.length * 0.99)].toFixed(1)}`);
console.log('');
console.log(`${'metric'.padEnd(12)}${'value'.padStart(10)}${'budget'.padStart(10)}  ok`);
const problems = [...errors];
for (const [key, budget] of Object.entries(budgets)) {
  if (!(key in results)) throw new Error(`Budget ${key} has no measurement`);
  const ok = results[key] <= budget;
  if (!ok) problems.push(`${key} ${results[key].toFixed(1)} over budget ${budget}`);
  console.log(`${key.padEnd(12)}${results[key].toFixed(1).padStart(10)}${String(budget).padStart(10)}  ${ok ? 'yes' : 'no'}`);
}
if (crashed) problems.push('crash screen shown');
if (problems.length > 0) {
  console.error(`\nFAIL\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('\nPASS');
