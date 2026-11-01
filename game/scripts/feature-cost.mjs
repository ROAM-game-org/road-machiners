import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { launchChromium } from './gpu.mjs';
import { playUrl } from './game-url.mjs';

const USAGE = 'Usage: node scripts/feature-cost.mjs --url <dev server> [--base-url <dev server of the baseline build>] [--zoom 1.15,0.35] [--hour 10,23] [--toggles <name,name>] [--rounds 2] [--sample-ms 2500] [--settle-ms 1500] [--out <file.json>]';
const SEED = 1337;
const GAME_VIEWPORT = { width: 1600, height: 1000 };
const PIXEL_DENSITY = 2;
const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

const TOGGLES = {
  pixelRatio1: () => {
    const r = window.__ROAM__.renderer;
    const was = r.getPixelRatio();
    r.setPixelRatio(1);
    window.__UNDO__ = () => r.setPixelRatio(was);
  },
  pixelRatio15: () => {
    const r = window.__ROAM__.renderer;
    const was = r.getPixelRatio();
    r.setPixelRatio(1.5);
    window.__UNDO__ = () => r.setPixelRatio(was);
  },
  noShadowMaps: () => {
    const g = window.__ROAM__;
    const refresh = () => g.scene.traverse((o) => { for (const m of [o.material].flat()) if (m) m.needsUpdate = true; });
    g.renderer.shadowMap.enabled = false;
    refresh();
    window.__UNDO__ = () => { g.renderer.shadowMap.enabled = true; refresh(); };
  },
  lampShadowsOff: () => {
    const g = window.__ROAM__;
    const changed = [];
    g.scene.traverse((o) => { if (o.isSpotLight && o.castShadow) { o.castShadow = false; changed.push(o); } });
    const refresh = () => g.scene.traverse((o) => { for (const m of [o.material].flat()) if (m) m.needsUpdate = true; });
    refresh();
    window.__UNDO__ = () => { changed.forEach((o) => { o.castShadow = true; }); refresh(); };
  },
  noLampLights: () => {
    const hidden = [];
    window.__ROAM__.scene.traverse((o) => { if ((o.isSpotLight || o.isPointLight) && o.visible) { o.visible = false; hidden.push(o); } });
    window.__UNDO__ = () => hidden.forEach((o) => { o.visible = true; });
  },
  propShadowsOff: () => {
    const changed = [];
    window.__ROAM__.props.traverse((o) => { if (o.isMesh && o.castShadow) { o.castShadow = false; changed.push(o); } });
    window.__UNDO__ = () => changed.forEach((o) => { o.castShadow = true; });
  },
  shadowsFrozen: () => {
    const sm = window.__ROAM__.renderer.shadowMap;
    sm.autoUpdate = false;
    sm.needsUpdate = true;
    window.__UNDO__ = () => { sm.autoUpdate = true; };
  },
  noOutlines: () => {
    const hidden = [];
    window.__ROAM__.scene.traverse((o) => { if (o.userData?.outline && o.visible) { o.visible = false; hidden.push(o); } });
    window.__UNDO__ = () => hidden.forEach((o) => { o.visible = true; });
  },
  noSilhouettes: () => {
    const hidden = [];
    const writesStencil = (o) => [o.material].flat().some((m) => m?.stencilFunc === 517 && m.stencilWrite);
    window.__ROAM__.scene.traverse((o) => { if (o.isMesh && o.visible && writesStencil(o)) { o.visible = false; hidden.push(o); } });
    window.__UNDO__ = () => hidden.forEach((o) => { o.visible = true; });
  },
  noShadeOverlay: () => {
    const m = window.__ROAM__.shade.mesh;
    m.visible = false;
    window.__UNDO__ = () => { m.visible = true; };
  },
  noProps: () => {
    const p = window.__ROAM__.props;
    p.visible = false;
    window.__UNDO__ = () => { p.visible = true; };
  },
  noGround: () => {
    const p = window.__ROAM__.ground;
    p.visible = false;
    window.__UNDO__ = () => { p.visible = true; };
  },
  noTrucks: () => {
    const roots = [...window.__ROAM__.trucks.views.values()].map((v) => v.root).filter((r) => r.visible);
    roots.forEach((r) => { r.visible = false; });
    window.__UNDO__ = () => roots.forEach((r) => { r.visible = true; });
  },
};

function readFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Bad argument ${name}. ${USAGE}`);
    flags[name.slice(2)] = value;
  }
  return flags;
}

function numberList(text, name) {
  const values = text.split(',').map(Number);
  if (values.some((v) => !Number.isFinite(v))) throw new Error(`--${name} takes numbers, got ${text}. ${USAGE}`);
  return values;
}

function positiveInteger(text, name) {
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive whole number, got ${text}. ${USAGE}`);
  return value;
}

function parseToggles(flags) {
  const toggles = flags.toggles === undefined ? [] : flags.toggles.split(',');
  for (const t of toggles) if (!TOGGLES[t]) throw new Error(`Unknown toggle ${t}. Known: ${Object.keys(TOGGLES).join(', ')}`);
  if (toggles.length === 0 && !flags['base-url']) throw new Error(`Give --toggles or --base-url, or there is nothing to compare. ${USAGE}`);
  return toggles;
}

const DEFAULT_FLAGS = { zoom: '1.15,0.35', hour: '10,23', rounds: '2', 'sample-ms': '2500', 'settle-ms': '1500' };

function parseArgs(argv) {
  const flags = { ...DEFAULT_FLAGS, ...readFlags(argv) };
  if (!flags.url) throw new Error(`--url is required. ${USAGE}`);
  return {
    url: flags.url,
    baseUrl: flags['base-url'],
    zooms: numberList(flags.zoom, 'zoom'),
    hours: numberList(flags.hour, 'hour'),
    toggles: parseToggles(flags),
    rounds: positiveInteger(flags.rounds, 'rounds'),
    sampleMs: positiveInteger(flags['sample-ms'], 'sample-ms'),
    settleMs: positiveInteger(flags['settle-ms'], 'settle-ms'),
    out: flags.out,
  };
}

async function openGame(browser, base) {
  const page = await browser.newPage({ viewport: GAME_VIEWPORT, deviceScaleFactor: PIXEL_DENSITY });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const seeded = new URL(base);
  seeded.searchParams.set('seed', String(SEED));
  await page.goto(playUrl(seeded.href));
  await page.waitForFunction(() => window.__ROAM__ && window.__ROAM_PERF__, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.evaluate(installProbe);
  return { page, errors };
}

function installProbe() {
  const g = window.__ROAM__;
  const r = g.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const probe = { cpu: [], gpu: [], pending: [], calls: 0, triangles: 0, idle: false };
  window.__COST__ = probe;
  const render = r.render.bind(r);
  const begin = () => {
    if (!ext || probe.pending.length >= 4) return null;
    const query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    return query;
  };
  const end = (query) => {
    if (!query) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    probe.pending.push(query);
  };
  const settle = (query, still) => {
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) { still.push(query); return; }
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) probe.gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(query);
  };
  const collect = () => {
    const still = [];
    for (const query of probe.pending) settle(query, still);
    probe.pending = still;
  };
  r.render = (scene, camera) => {
    if (probe.idle && scene === g.scene) return;
    const query = begin();
    const t0 = performance.now();
    render(scene, camera);
    probe.cpu.push(performance.now() - t0);
    end(query);
    probe.calls = r.info.render.calls;
    probe.triangles = r.info.render.triangles;
    collect();
  };
}

async function townOf(page) {
  return page.evaluate(async () => {
    const { REGION } = await import('/src/data/region.ts');
    const { sitePads } = await import('/src/sim/sites.ts');
    const t = REGION.towns[0];
    return { x: t.pos.x, y: t.pos.y, pad: sitePads(t)[0] };
  });
}

async function goTown(page, town, hour, zoom) {
  await page.evaluate(async ({ town, hour, zoom }) => {
    const g = window.__ROAM__;
    const w = { ...g.state, vehicles: g.state.vehicles.map((v) => (v.id === g.state.player.vehicleId ? { ...v, pos: town.pad, order: null } : v)) };
    g.apply((await import('/src/sim/cheats.ts')).skipToHour(w, hour));
    g.debugView(town.x, town.y, zoom);
  }, { town, hour, zoom });
}

async function setIdle(page, idle) {
  await page.evaluate((flag) => { window.__COST__.idle = flag; }, idle);
}

function readSample(ms) {
  const g = window.__ROAM__;
  const probe = window.__COST__;
  probe.cpu = [];
  probe.gpu = [];
  const frameTimes = () => new Promise((done) => {
    const out = [];
    const f = (t) => {
      out.push(t);
      if (t - out[0] < ms) requestAnimationFrame(f);
      else done(out);
    };
    requestAnimationFrame(f);
  });
  const shown = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const casters = () => {
    let n = 0;
    g.scene.traverse((o) => { if (o.isMesh && o.castShadow && shown(o)) n += o.isInstancedMesh ? o.count : 1; });
    return n;
  };
  const shadowLights = () => {
    let n = 0;
    g.scene.traverse((o) => { if (o.isLight && o.castShadow && o.visible && o.intensity > 0) n++; });
    return n;
  };
  return frameTimes().then((ts) => ({
    gaps: ts.slice(1).map((t, i) => t - ts[i]),
    cpu: probe.cpu,
    gpu: probe.gpu,
    calls: probe.calls,
    triangles: probe.triangles,
    casters: casters(),
    shadowLights: shadowLights(),
    programs: g.renderer.info.programs.length,
  }));
}

async function sample(page, args) {
  await page.bringToFront();
  await setIdle(page, false);
  await page.waitForTimeout(args.settleMs);
  const raw = await page.evaluate(readSample, args.sampleMs);
  await setIdle(page, true);
  return raw;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function summarize(runs) {
  const gaps = runs.flatMap((r) => r.gaps).sort((a, b) => a - b);
  const last = runs[runs.length - 1];
  return {
    frames: gaps.length,
    frameMean: mean(gaps),
    frameP95: percentile(gaps, 0.95),
    frameP99: percentile(gaps, 0.99),
    renderCpu: mean(runs.flatMap((r) => r.cpu)),
    gpu: mean(runs.flatMap((r) => r.gpu)),
    calls: last.calls,
    triangles: last.triangles,
    casters: last.casters,
    shadowLights: last.shadowLights,
    programs: last.programs,
  };
}

function fixed(value, width) {
  return value === null ? '-'.padStart(width) : value.toFixed(1).padStart(width);
}

function print(label, side, s) {
  console.log(`${label.padEnd(44)} ${side.padEnd(8)} frame ${fixed(s.frameMean, 5)} p95 ${fixed(s.frameP95, 5)} p99 ${fixed(s.frameP99, 5)}  cpu ${fixed(s.renderCpu, 5)} gpu ${fixed(s.gpu, 5)}  calls ${String(s.calls).padStart(5)}  casters ${String(s.casters).padStart(6)}  shadow lights ${s.shadowLights}`);
}

async function sampleVariant(page, name, args) {
  if (name) await page.evaluate(TOGGLES[name]);
  const run = await sample(page, args);
  if (name) await page.evaluate(() => window.__UNDO__());
  return run;
}

async function measureVariant(args, sides, scene, name) {
  const runs = { a: [], b: [] };
  for (let round = 0; round < args.rounds; round++) {
    runs.a.push(await sample(sides.a.page, args));
    runs.b.push(await sampleVariant(sides.b.page, name, args));
  }
  const baseline = summarize(runs.a);
  const variant = summarize(runs.b);
  print(scene, 'baseline', baseline);
  print(scene, name ?? 'build', variant);
  return { scene, toggle: name, baseline, variant };
}

async function sweepScene(args, sides, scene) {
  const rows = [];
  for (const name of args.toggles.length ? args.toggles : [null]) rows.push(await measureVariant(args, sides, scene, name));
  return rows;
}

async function openSides(browser, args) {
  const variant = await openGame(browser, args.url);
  const baseline = args.baseUrl ? await openGame(browser, args.baseUrl) : variant;
  return { a: baseline, b: variant };
}

async function sweepAll(args, sides) {
  const town = await townOf(sides.b.page);
  console.log(`first town at ${town.x},${town.y}, seed ${SEED}, ${GAME_VIEWPORT.width}x${GAME_VIEWPORT.height} at ${PIXEL_DENSITY}x, frame cap off`);
  const rows = [];
  for (const hour of args.hours) {
    for (const zoom of args.zooms) {
      for (const side of new Set([sides.a, sides.b])) {
        await goTown(side.page, town, hour, zoom);
        await sample(side.page, args);
      }
      rows.push(...(await sweepScene(args, sides, `town ${String(hour).padStart(2, '0')}:00 zoom ${zoom}`)));
    }
  }
  return rows;
}

function writeOut(args, renderer, rows, errors) {
  if (!args.out) return;
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify({ renderer, startedAt: new Date().toISOString(), args, rows, errors }, null, 1));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { browser, software, renderer } = await launchChromium(chromium, { args: UNCAPPED });
  if (software) throw new Error(`Software renderer ${renderer}; frame costs need the GPU`);
  console.log(`renderer ${renderer}`);
  console.log(`started ${new Date().toISOString()}`);
  const sides = await openSides(browser, args);
  const rows = await sweepAll(args, sides);
  const errors = [...new Set([sides.a, sides.b])].flatMap((side) => side.errors);
  if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  writeOut(args, renderer, rows, errors);
  await browser.close();
  if (errors.length) process.exitCode = 1;
}

await main();
