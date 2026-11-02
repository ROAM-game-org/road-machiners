import { describe, expect, it } from 'vitest';
import budgetFile from '../../scripts/perf-budgets.json';
import { budgetsFor, bundleProblems, checkBudgets, compare, fixNext, notes, summary, trustProblems } from '../../scripts/perf-report.mjs';

const SYSTEMS = ['terrain', 'props', 'vehicles', 'lights', 'effects', 'overlays', 'other'];
const IDS = ['town-day', 'town-day-far', 'town-night', 'town-night-far', 'fight', 'drive'];

const stats = (median: number, p99: number, over33 = 0, over100 = 0) => ({ median, p99, worst: p99 * 1.2, over33, over100, frames: 1200 });
const emptyStats = { median: 0, p99: 0, worst: 0, over33: 0, over100: 0, frames: 0 };
const pass = (real: ReturnType<typeof stats>, gpu: ReturnType<typeof stats> | null = null) => ({ real, tickCpu: stats(2, 4), renderCpu: stats(3, 6), gpu });

function draws(propDraws: number) {
  const count = (n: number) => ({ draws: n, triangles: n * 100 });
  const bySystem = Object.fromEntries(SYSTEMS.map((s) => [s, { main: count(s === 'props' ? propDraws : 10), shadow: count(5) }]));
  const total = SYSTEMS.reduce((sum, s) => sum + (s === 'props' ? propDraws : 10) + 5, 0);
  return { total, rendererCalls: total, byPass: { main: count(1), shadow: count(1) }, bySystem, other: {} };
}

function scene(id: string, over: Record<string, unknown> = {}) {
  const real = stats(8, 12);
  return {
    id,
    passes: [pass(real), pass(stats(8 * 1.02, 12 * 1.02))],
    frame: pass(real, stats(6, 9)),
    spread: 0.02,
    bound: 'cpu',
    longTasks: 0,
    draws: draws(100),
    slowFrames: { count: 0, renderMs: 0, tickRestMs: 0, timers: {}, uploadBytes: 0, chunkBuilds: 0, over100WithChunkBuild: 0 },
    savings: null,
    check: { name: 'props drawn', passed: true, detail: 'ok' },
    ...over,
  };
}

function benchReport(over: Record<string, unknown> = {}) {
  return {
    schema: 1,
    version: 'test',
    renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)',
    viewport: { width: 1600, height: 1000 },
    pixelRatio: 2,
    renderScale: 1,
    gpuTimer: true,
    town: 'Sorgut',
    scenes: IDS.map((id) => scene(id)),
    turns: { waitMs: stats(40, 60), workerTurnMs: stats(30, 50), previewMs: stats(20, 30), steps: { move: { total: 300, calls: 10, max: 40 }, fight: { total: 100, calls: 10, max: 15 } } },
    bootMs: 1500,
    ...over,
  };
}

function wrap(bench = benchReport(), run: Record<string, unknown> = {}) {
  return { bench, run: { commit: 'abc1234', machine: 'mac', cores: 12, loadStart: 1, loadEnd: 1.5, startedAt: '2026-11-02T10:00:00Z', frameCapOff: true, untrusted: [] as string[], ...run } };
}

const budget = budgetsFor(budgetFile, 'mac');
const withScene = (id: string, over: Record<string, unknown>, extra: Record<string, unknown> = {}) => benchReport({ scenes: IDS.map((s) => (s === id ? scene(s, over) : scene(s))), ...extra });
const lineOf = (lines: ReturnType<typeof checkBudgets>, sceneId: string, label: string) => lines.find((l) => l.scene === sceneId && l.label === label)!;

describe('budgets', () => {
  it('lets a machine block override the default and rejects a missing budget', () => {
    expect(budgetsFor({ ...budgetFile, machines: { slow: { frameP99Ms: 33 } } }, 'slow').frameP99Ms).toBe(33);
    expect(budgetsFor(budgetFile, 'other').frameP99Ms).toBe(16.7);
    expect(() => budgetsFor({ default: {}, machines: {} }, 'mac')).toThrow('frameP99Ms');
  });

  it('passes a report inside every budget', () => {
    const lines = checkBudgets(benchReport(), budget);
    expect(lines.every((l) => l.pass && !l.missing)).toBe(true);
    expect(lines.filter((l) => l.scene === 'drive')).toHaveLength(4);
  });

  it('measures a p99 miss by how far it is over the limit', () => {
    const lines = checkBudgets(withScene('town-night', { frame: pass(stats(20, 33.4)) }), budget);
    const line = lineOf(lines, 'town-night', 'frame p99');
    expect(line.pass).toBe(false);
    expect(line.miss).toBeCloseTo(16.7);
    expect(line.severity).toBeCloseTo(16.7 / 16.7);
  });

  it('counts stutter that a good median hides', () => {
    const lines = checkBudgets(withScene('fight', { frame: pass(stats(5, 12, 6, 0)) }), budget);
    expect(lineOf(lines, 'fight', 'frame p99').pass).toBe(true);
    const slow = lineOf(lines, 'fight', 'frames over 33.3 ms per 1000');
    expect(slow.value).toBeCloseTo(5);
    expect(slow.pass).toBe(false);
  });

  it('counts drive frames that built a chunk on their own line', () => {
    const slowFrames = { ...scene('drive').slowFrames, count: 3, over100WithChunkBuild: 2 };
    const lines = checkBudgets(withScene('drive', { frame: pass(stats(8, 12, 3, 3)), slowFrames }), budget);
    expect(lineOf(lines, 'drive', 'frames over 100 ms').value).toBe(1);
    expect(lineOf(lines, 'drive', 'frames over 100 ms that built a chunk').value).toBe(2);
  });

  it('rejects more chunk frames than frames over 100 ms', () => {
    const slowFrames = { ...scene('drive').slowFrames, over100WithChunkBuild: 1 };
    expect(() => checkBudgets(withScene('drive', { slowFrames }), budget)).toThrow('drive');
  });

  it('marks a measure with no frames as not measured and never as 0', () => {
    const bench = withScene('fight', { frame: pass(emptyStats) }, { turns: { ...benchReport().turns, previewMs: emptyStats }, bootMs: null });
    const lines = checkBudgets(bench, budget);
    const p99 = lineOf(lines, 'fight', 'frame p99');
    expect(p99).toMatchObject({ value: null, missing: true, pass: false });
    expect(lineOf(lines, 'turns', 'plan preview p99')).toMatchObject({ value: null, missing: true });
    expect(lineOf(lines, 'boot', 'boot')).toMatchObject({ value: null, missing: true });
    const text = summary(wrap(bench), lines);
    expect(text).toContain('NOT MEASURED');
    expect(fixNext(bench, lines).map((e) => e.scene)).not.toContain('boot');
  });
});

describe('trust', () => {
  it('trusts a quiet run', () => {
    expect(trustProblems(wrap())).toEqual([]);
  });

  it('rejects a machine busy at start, but not the load the bench itself left at the end', () => {
    expect(trustProblems(wrap(benchReport(), { loadStart: 6.5 }))).toHaveLength(1);
    expect(trustProblems(wrap(benchReport(), { loadEnd: 7 }))).toEqual([]);
  });

  it('does not trust a load it could not read, and says so', () => {
    const quiet = wrap(benchReport(), { loadStart: null, loadEnd: null });
    expect(trustProblems(quiet)).toEqual([]);
    expect(notes(quiet).join(' ')).toContain('load not measured');
  });

  it('rejects a noisy scene, a software renderer, a frame cap and a failed check', () => {
    const noisy = withScene('fight', { spread: 0.11, check: { name: 'shots fired', passed: false, detail: 'no shots' } }, { renderer: 'Google SwiftShader' });
    const problems = trustProblems(wrap(noisy, { frameCapOff: false })).join('\n');
    expect(problems).toContain('fight passes disagree');
    expect(problems).toContain('software');
    expect(problems).toContain('frame cap is on');
    expect(problems).toContain('no shots');
  });

  it('rejects counted draws that differ from the renderer calls', () => {
    const bad = { ...draws(100), rendererCalls: 999 };
    expect(trustProblems(wrap(withScene('drive', { draws: bad }))).join('')).toContain('drive counted');
  });

  it('names a missing GPU timer', () => {
    expect(notes(wrap(benchReport({ gpuTimer: false }))).join('\n')).toContain('GPU timer missing');
    expect(notes(wrap())).toEqual([]);
  });
});

describe('fix next', () => {
  const slowFrames = { count: 40, renderMs: 900, tickRestMs: 200, timers: { 'stream-build': 120, preview: 20 }, uploadBytes: 4e6, chunkBuilds: 3, over100WithChunkBuild: 0 };
  const night = { frame: pass(stats(30, 50, 40, 0)), bound: 'gpu', slowFrames, savings: { props: 9, shadowMaps: 12, terrain: 2, pixelRatio1: 4 } };
  const day = { frame: pass(stats(10, 20)), bound: 'cpu', savings: { vehicles: 1.5 } };
  const bench = benchReport({ scenes: IDS.map((id) => (id === 'town-night' ? scene(id, night) : id === 'town-day' ? scene(id, day) : scene(id))), bootMs: 3000 });
  const lines = checkBudgets(bench, budget);

  it('ranks by miss size and names the scene, bound, systems and slow frame cause', () => {
    const next = fixNext(bench, lines);
    expect(next.map((e) => e.scene)).toEqual(['town-night', 'boot', 'town-day']);
    const text = next[0].text;
    expect(text).toContain('gpu bound');
    expect(text).toContain('shadowMaps saves 12.0 ms');
    expect(text).toContain('props saves 9.0 ms (');
    expect(text).not.toContain('terrain saves');
    expect(text).toContain('render CPU 900 ms');
    expect(text).toContain('4.0 MB uploaded');
  });

  it('names the tick timer when the game tick dominates slow frames', () => {
    const tick = { ...night, slowFrames: { ...slowFrames, renderMs: 100, tickRestMs: 800 } };
    const text = fixNext(withScene('town-night', tick), checkBudgets(withScene('town-night', tick), budget))[0].text;
    expect(text).toContain('game tick 800 ms (top timer stream-build 120.0 ms)');
  });

  it('never adds savings together', () => {
    const text = summary(wrap(bench), lines);
    expect(text).not.toContain('21.0');
    expect(text).not.toContain('23.0');
    expect(text).toContain('Savings overlap');
  });

  it('says savings were not measured for a missing savings block', () => {
    const noSavings = fixNext(withScene('town-night', { ...night, savings: null }), checkBudgets(withScene('town-night', { ...night, savings: null }), budget));
    expect(noSavings[0].text).toContain('savings not measured');
  });

  it('prints one line per budget, the verdict and the fix list', () => {
    const text = summary(wrap(bench), lines);
    expect(text).toContain('MISS');
    expect(text).toContain('town-night-far');
    expect(text).toContain('FAIL');
    expect(text.split('\n').filter((l) => /^\d+\. /.test(l))).toHaveLength(3);
  });

  it('says pass for a clean trusted run', () => {
    const clean = benchReport();
    const text = summary(wrap(clean), checkBudgets(clean, budget));
    expect(text).toContain('trusted run');
    expect(text.trim().endsWith('PASS')).toBe(true);
  });

  it('prints n/a for a GPU time that is null and never 0', () => {
    const noTimer = wrap(withScene('fight', { frame: pass(stats(8, 12), null) }));
    const text = compare(noTimer, noTimer);
    expect(text).toMatch(/fight gpu median ms\s+n\/a\s+n\/a/);
    expect(text).not.toMatch(/fight gpu median ms\s+0\.00/);
  });
});

describe('compare', () => {
  const changed = (text: string) => text.split('\n').filter((l) => l.endsWith('CHANGED'));

  it('flags nothing for two equal runs', () => {
    expect(changed(compare(wrap(), wrap()))).toEqual([]);
  });

  it('flags a frame change over the larger spread and not one inside it', () => {
    const slower = (median: number) => wrap(withScene('town-day', { frame: pass(stats(median, 12)) }));
    expect(changed(compare(wrap(), slower(8.1))).join('')).not.toContain('town-day real ms median');
    expect(changed(compare(wrap(), slower(9))).join('\n')).toContain('town-day real ms median');
  });

  it('signs a change by the numbers, not by their text', () => {
    const fast = wrap(withScene('town-day', { frame: pass(stats(8, 12)) }));
    const slow = wrap(withScene('town-day', { frame: pass(stats(16, 24)) }));
    const medianOf = (text: string) => text.split('\n').find((l) => l.startsWith('town-day real ms median'))!;
    expect(medianOf(compare(fast, slow))).toContain('+100.0%');
    expect(medianOf(compare(slow, fast))).toContain('-100.0%');
  });

  it('uses the larger spread of the two runs', () => {
    const noisy = wrap(withScene('town-day', { frame: pass(stats(9, 12)), passes: [pass(stats(8, 12)), pass(stats(9.6, 14.4))], spread: 0.2 }));
    expect(changed(compare(wrap(), noisy)).join('')).not.toContain('town-day real ms median');
  });

  it('judges a p99 change against the p99 noise between passes, not the median noise', () => {
    const tail = (p99: number, second: number) => wrap(withScene('town-day', { frame: pass(stats(8, p99)), passes: [pass(stats(8, p99)), pass(stats(8, second))] }));
    const p99Of = (text: string) => text.split('\n').find((l) => l.startsWith('town-day real ms p99'))!;
    expect(p99Of(compare(tail(30, 40), tail(36, 36)))).not.toContain('CHANGED');
    expect(p99Of(compare(tail(30, 31), tail(40, 41)))).toContain('CHANGED');
  });

  it('flags every draw count change', () => {
    const other = wrap(withScene('fight', { draws: draws(101) }));
    const lines = changed(compare(wrap(), other));
    expect(lines.some((l) => l.includes('fight props main draws/triangles'))).toBe(true);
    expect(lines.some((l) => l.includes('fight draws counted'))).toBe(true);
  });

  it('warns when machine, viewport or pixel ratio differ', () => {
    const other = wrap(benchReport({ pixelRatio: 1, viewport: { width: 1280, height: 800 } }), { machine: 'ally' });
    const text = compare(wrap(), other);
    expect(text).toContain('warning: machine differs');
    expect(text).toContain('warning: viewport differs');
    expect(text).toContain('warning: pixel ratio differs');
  });

  it('shows null on one side as n/a and flags it', () => {
    const noTimer = wrap(withScene('fight', { frame: pass(stats(8, 12), null) }));
    const gpu = wrap(withScene('fight', { frame: pass(stats(8, 12), stats(6, 9)) }));
    const line = changed(compare(noTimer, gpu)).find((l) => l.includes('fight gpu median'))!;
    expect(line).toContain('n/a');
  });
});

describe('bundle', () => {
  const manifest = {
    'index.html': { isEntry: true, imports: ['src/three/main.ts'], dynamicImports: ['src/bench/bench.ts'] },
    'src/three/main.ts': { imports: [] as string[] },
    'src/bench/bench.ts': { imports: ['src/three/main.ts'] },
  };

  it('accepts a bench chunk that only loads on demand', () => {
    expect(bundleProblems(manifest)).toEqual([]);
  });

  it('rejects a bench chunk that loads with the game', () => {
    const eager = { ...manifest, 'index.html': { ...manifest['index.html'], imports: ['src/three/main.ts', 'src/bench/bench.ts'] } };
    expect(bundleProblems(eager)).toEqual(['src/bench/bench.ts loads with the game']);
  });

  it('rejects a build with no bench chunk', () => {
    const { 'src/bench/bench.ts': _gone, ...rest } = manifest;
    expect(bundleProblems(rest)).toEqual(['the build has no bench chunk']);
  });
});
