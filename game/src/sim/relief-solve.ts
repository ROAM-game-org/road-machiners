import { REGION } from '../data/region';
import { RELIEF_SOLVE, TERRAIN, UPLIFT, type ZoneKind } from '../data/terrain';
import { newHeap, popHeap, pushHeap, type Heap } from './heap';
import { hash, noise2, smooth } from './noise';
import { ROAD_INDEX } from './road-index';
import { zoneUplift, zoneWeight } from './zones';
import { clamp, dist, polylineDist, type Vec } from './vec';

export type ReliefGrid = { n: number; cell: number; heights: Float32Array };
export type SolveInput = { n: number; uplift: Float32Array; base: Uint8Array };
export type SolveRules = { steps: number; dt: number; erosion: number; areaExponent: number; diffusion: number; baseLevel: number; jitter: number; jitterSeed: number };

const HOLD_SITES = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== 'territory' || l.id === 'fallen-sun')];

let solved: { seed: number; grid: ReliefGrid } | undefined;

export function reliefGrid(seed: number): ReliefGrid {
  if (solved?.seed === seed) return solved.grid;
  const cell = RELIEF_SOLVE.cell;
  const n = Math.ceil(REGION.size / cell) + 1;
  const input = basinInput(seed, n, cell);
  const roadGap = (x: number, y: number): number => ROAD_INDEX.nearestWithin(x, y, RELIEF_SOLVE.roadBed.width);
  const grid = { n, cell, heights: smoothRoadBeds({ n, cell, heights: solveRelief(input, RELIEF_SOLVE) }, roadGap) };
  solved = { seed, grid };
  return grid;
}

export function macroHeight(seed: number, x: number, y: number): number {
  return heldHeight(reliefGrid(seed), HOLD_SITES, x, y);
}

export function heldHeight(g: ReliefGrid, sites: readonly { pos: Vec; radius: number }[], x: number, y: number): number {
  let h = sampleGrid(g, x, y);
  for (const site of sites) {
    const gap = dist(site.pos, { x, y }) - site.radius;
    const margin = RELIEF_SOLVE.hold.margin;
    if (gap >= margin) continue;
    const share = gap <= 0 ? 1 : 1 - smooth(gap / margin);
    h += (sampleGrid(g, site.pos.x, site.pos.y) - h) * share;
  }
  return h;
}

export function basinInput(seed: number, n: number, cell: number): SolveInput {
  const uplift = new Float32Array(n * n);
  const base = new Uint8Array(n * n);
  const channels = [TERRAIN.features.dryRiver, TERRAIN.features.canyon];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = { x: i * cell, y: j * cell };
    const k = j * n + i;
    if (channels.some((c) => polylineDist(p, c.path) <= c.width + cell)) base[k] = 1;
    uplift[k] = upliftAt(seed, p);
  }
  return { n, uplift, base };
}

export function upliftAt(seed: number, p: Vec): number {
  return UPLIFT.floor * zoneUplift(p.x, p.y) + rimLift(p) + rangeLift(seed, p);
}

export function smoothRoadBeds(g: ReliefGrid, roadGap: (x: number, y: number) => number): Float32Array {
  const { width, passes } = RELIEF_SOLVE.roadBed;
  const { n, cell, heights } = g;
  const low = blurred(heights, n, Math.round(width / cell), passes);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const share = 1 - smooth(clamp(roadGap(i * cell, j * cell) / width, 0, 1));
    heights[k] += (low[k] - heights[k]) * share;
  }
  return heights;
}

function blurred(heights: Float32Array, n: number, reach: number, passes: number): Float32Array {
  let out = heights;
  for (let p = 0; p < passes; p++) out = boxPass(boxPass(out, n, reach, true), n, reach, false);
  return out;
}

function boxPass(src: Float32Array, n: number, reach: number, across: boolean): Float32Array {
  const out = new Float32Array(src.length);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let t = -reach; t <= reach; t++) sum += src[shifted(n, i, j, t, across)];
    out[j * n + i] = sum / (2 * reach + 1);
  }
  return out;
}

function shifted(n: number, i: number, j: number, t: number, across: boolean): number {
  return across ? j * n + clamp(i + t, 0, n - 1) : clamp(j + t, 0, n - 1) * n + i;
}

function rimLift(p: Vec): number {
  const { width, rate, gaps, flatUnder } = UPLIFT.rim;
  const edge = Math.min(p.x, p.y, REGION.size - p.x, REGION.size - p.y);
  const rim = 1 - smooth(clamp(edge / width, 0, 1));
  const open = Math.max(0, ...gaps.map((g) => 1 - smooth(clamp(dist(p, g.at) / g.width, 0, 1))));
  const flat = Math.max(...(Object.entries(flatUnder) as [ZoneKind, number][]).map(([kind, share]) => share * zoneWeight(kind, p.x, p.y)));
  return rate * rim * (1 - open) * (1 - flat);
}

function rangeLift(seed: number, p: Vec): number {
  const { spine, width, rate, crestNoise, crestFrequency } = UPLIFT.range;
  const share = 1 - smooth(clamp(polylineDist(p, spine) / width, 0, 1));
  if (share === 0) return 0;
  const crest = 1 - crestNoise + crestNoise * noise2(p.x * crestFrequency, p.y * crestFrequency, seed + UPLIFT.seedOffset);
  return rate * share * crest;
}

export function solveRelief(input: SolveInput, rules: SolveRules): Float32Array {
  const { n, base } = input;
  if (rules.dt * rules.diffusion > STABLE_DIFFUSION) throw new Error(`Relief diffusion ${rules.dt * rules.diffusion} per step is above the stable ${STABLE_DIFFUSION}`);
  const h = startHeights(input, rules);
  const flow = newFlow(n, h);
  for (let step = 0; step < rules.steps; step++) {
    route(flow, h, base);
    accumulate(flow);
    lift(h, input, rules.dt);
    erode(flow, h, base, rules);
    diffuse(h, base, n, rules.dt * rules.diffusion);
  }
  if (flow.order.includes(-1)) throw new Error('Relief solve left a cell no outlet reaches');
  return Float32Array.from(h);
}

function startHeights(input: SolveInput, rules: SolveRules): Float64Array {
  const { n, uplift, base } = input;
  const h = new Float64Array(n * n).fill(rules.baseLevel);
  for (let k = 0; k < h.length; k++) if (!base[k]) h[k] += uplift[k] + hash(k % n, Math.floor(k / n), rules.jitterSeed) * rules.jitter;
  return h;
}

function lift(h: Float64Array, input: SolveInput, dt: number): void {
  for (let k = 0; k < h.length; k++) if (!input.base[k]) h[k] += dt * input.uplift[k];
}

type Flow = { n: number; order: Int32Array; receiver: Int32Array; area: Float64Array; heap: Heap; seen: Uint8Array; next: Int32Array };

function newFlow(n: number, h: Float64Array): Flow {
  return { n, order: new Int32Array(n * n), receiver: new Int32Array(n * n), area: new Float64Array(n * n), heap: newHeap(n * n, h), seen: new Uint8Array(n * n), next: neighbourTable(n) };
}

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const FILL_STEP = 1e-4;
const STABLE_DIFFUSION = 0.125;

function route(f: Flow, h: Float64Array, base: Uint8Array): void {
  f.seen.fill(0);
  f.order.fill(-1);
  f.heap.count = 0;
  for (let k = 0; k < base.length; k++) if (base[k]) claim(f, k, k);
  for (let count = 0; f.heap.count > 0; count++) {
    const k = popHeap(f.heap);
    f.order[count] = k;
    for (let q = k * STEPS.length; q < (k + 1) * STEPS.length; q++) visit(f, h, k, f.next[q]);
  }
}

function visit(f: Flow, h: Float64Array, k: number, m: number): void {
  if (m >= 0 && !f.seen[m]) fillFrom(f, h, k, m);
}

function claim(f: Flow, k: number, receiver: number): void {
  f.seen[k] = 1;
  f.receiver[k] = receiver;
  pushHeap(f.heap, k);
}

function fillFrom(f: Flow, h: Float64Array, k: number, m: number): void {
  if (h[m] <= h[k]) h[m] = h[k] + FILL_STEP;
  claim(f, m, k);
}

function neighbourTable(n: number): Int32Array {
  const next = new Int32Array(n * n * STEPS.length);
  for (let k = 0; k < n * n; k++) {
    const x = k % n;
    const y = (k - x) / n;
    STEPS.forEach(([dx, dy], q) => (next[k * STEPS.length + q] = onGrid(n, x + dx, y + dy) ? (y + dy) * n + x + dx : -1));
  }
  return next;
}

function runOf(n: number, k: number, r: number): number {
  const across = k % n !== r % n;
  const along = Math.floor(k / n) !== Math.floor(r / n);
  return across && along ? Math.SQRT2 : 1;
}

function onGrid(n: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < n && y < n;
}

function accumulate(f: Flow): void {
  f.area.fill(1);
  for (let q = f.order.length - 1; q >= 0; q--) {
    const k = f.order[q];
    const r = f.receiver[k];
    if (r !== k) f.area[r] += f.area[k];
  }
}

function erode(f: Flow, h: Float64Array, base: Uint8Array, rules: SolveRules): void {
  for (let q = 0; q < f.order.length; q++) {
    const k = f.order[q];
    if (base[k]) continue;
    const r = f.receiver[k];
    const factor = (rules.dt * rules.erosion * f.area[k] ** rules.areaExponent) / runOf(f.n, k, r);
    h[k] = (h[k] + factor * h[r]) / (1 + factor);
  }
}

function diffuse(h: Float64Array, base: Uint8Array, n: number, rate: number): void {
  const next = Float64Array.from(h);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const k = y * n + x;
    if (base[k]) continue;
    next[k] = h[k] + rate * (h[k - 1] + h[k + 1] + h[k - n] + h[k + n] - 4 * h[k]);
  }
  h.set(next);
}

export function sampleGrid(g: ReliefGrid, x: number, y: number): number {
  const gx = clamp(x / g.cell, 0, g.n - 1.001);
  const gy = clamp(y / g.cell, 0, g.n - 1.001);
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const rows = [-1, 0, 1, 2].map((dj) => cubic(...([-1, 0, 1, 2].map((di) => cellAt(g, i + di, j + dj)) as Quad), gx - i));
  return cubic(...(rows as Quad), gy - j);
}

type Quad = [number, number, number, number];

function cellAt(g: ReliefGrid, i: number, j: number): number {
  return g.heights[clamp(j, 0, g.n - 1) * g.n + clamp(i, 0, g.n - 1)];
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
