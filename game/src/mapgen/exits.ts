import { REGION } from '../data/region';
import { EXITS, TERRAIN } from '../data/terrain';
import { ROAD_INDEX } from '../sim/road-index';
import { siteGap } from '../sim/sites';
import { startPose } from '../sim/start-pose';
import { BUILT_CANAL, BUILT_DITCH, BUILT_OLD_ROAD, BUILT_PAD, BUILT_TRACK, type BakedProp } from '../sim/terrain';
import { dist, segmentDist, type Vec } from '../sim/vec';
import { zoneWeight } from '../sim/zones';
import { tileSteepness, type MapDraft } from './bake';
import { trailOut } from './trails';

export type Escape = { size: number; drivable: Uint8Array; floor: Uint8Array; dist: Int32Array; heights: Float32Array; ravine: Int32Array };
type Ramp = { from: Vec; to: Vec; low: number; high: number; ravine: number };

const FAR = 2 ** 30;
const KEPT_SITES = [...REGION.towns, ...REGION.locations];
const PROP_CELL = 32;
const TRUCK_BLOCKS = [[0, 0], [-1, 0], [0, -1], [-1, -1]];
const CORNER_TILES = TRUCK_BLOCKS;
const LAID = new Set([BUILT_OLD_ROAD, BUILT_TRACK, BUILT_PAD]);
const RAMP_GRADE = EXITS.climb * TERRAIN.drive.maxSlope;

export function exitLayer(d: MapDraft): MapDraft {
  let out = exitPass(d);
  for (let pass = 1; pass < EXITS.passes && trappedFloors(out).length > 0; pass++) out = exitPass(out);
  return trailsOut(out);
}

function trailsOut(d: MapDraft): MapDraft {
  const e = ravineEscape(d);
  for (const pit of trappedGroups(e)) {
    const target = exitTargets(e, pit[0])[0];
    if (target !== undefined) trailOut(d, tileCenter(e.size, pit[0]), tileCenter(e.size, target));
  }
  const onTrail = (p: BakedProp): boolean => d.built[Math.floor(p.pos.y) * d.size + Math.floor(p.pos.x)] === BUILT_TRACK;
  return { ...d, props: d.props.filter((p) => !(EXITS.clearKinds.includes(p.kind) && onTrail(p))) };
}

function exitPass(d: MapDraft): MapDraft {
  const e = ravineEscape(d);
  const props = propGrid(d.props);
  const given = new Uint8Array(e.dist.length);
  const removed = new Set<BakedProp>();
  for (let k = 0; k < e.dist.length; k++) {
    if (needsExit(e, given, k) && !openExit(d, e, props, removed, k)) markDisc(given, e.size, tileCenter(e.size, k), carveAt(e, k) / 2);
  }
  const out = { ...d, props: d.props.filter((p) => !removed.has(p)) };
  for (let round = 0; round < EXITS.fillRounds; round++) fillPits(out);
  return out;
}

function needsExit(e: Escape, given: Uint8Array, k: number): boolean {
  return e.floor[k] === 1 && e.dist[k] > carveAt(e, k) && given[k] === 0;
}

function fillPits(d: MapDraft): void {
  const left = ravineEscape(d);
  for (const pit of trappedGroups(left)) {
    const inside = new Set(pit);
    const buried = d.props.filter((p) => inside.has(Math.floor(p.pos.y) * d.size + Math.floor(p.pos.x)));
    if (pit.length > EXITS.fillMax || !buried.every((p) => EXITS.clearKinds.includes(p.kind))) continue;
    fillPit(d, left, pit);
    d.props = d.props.filter((p) => !buried.includes(p));
  }
}

export function trappedFloors(d: Pick<MapDraft, 'size' | 'heights' | 'props' | 'built'>): Vec[] {
  const e = ravineEscape(d);
  return trappedGroups(e).map((tiles) => tileCenter(e.size, tiles[0]));
}

function trappedGroups(e: Escape): number[][] {
  const seen = new Uint8Array(e.dist.length);
  const out: number[][] = [];
  for (let k = 0; k < e.dist.length; k++) {
    if (seen[k] || !trapped(e, k)) continue;
    const tiles = gather(e, seen, k);
    if (tiles.length >= EXITS.minFloor) out.push(tiles);
  }
  return out;
}

function fillPit(d: MapDraft, e: Escape, pit: number[]): void {
  const rim = pitRim(e, pit);
  if (rim === null || (rim - Math.min(...pit.map((k) => e.heights[k]))) / RAMP_GRADE > EXITS.rimReach) return;
  const n = d.size + 1;
  const centers = pit.map((k) => tileCenter(e.size, k));
  const reach = EXITS.rimReach + 1;
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  for (let y = Math.max(0, Math.floor(Math.min(...ys) - reach)); y <= Math.min(d.size, Math.ceil(Math.max(...ys) + reach)); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs) - reach)); x <= Math.min(d.size, Math.ceil(Math.max(...xs) + reach)); x++) {
      const gap = Math.max(0, Math.min(...centers.map((c) => Math.hypot(c.x - x, c.y - y))) - Math.SQRT1_2);
      d.heights[y * n + x] = Math.max(d.heights[y * n + x], rim - RAMP_GRADE * gap);
    }
  }
}

function pitRim(e: Escape, pit: number[]): number | null {
  const floor = Math.max(...pit.map((k) => e.heights[k]));
  const near = new Set<number>();
  for (const k of pit) {
    for (let dy = -EXITS.rimReach; dy <= EXITS.rimReach; dy++) for (let dx = -EXITS.rimReach; dx <= EXITS.rimReach; dx++) near.add(k + dy * e.size + dx);
  }
  const rims = [...near].filter((m) => e.dist[m] === 0 && e.heights[m] >= floor).map((m) => e.heights[m]);
  return rims.length > 0 ? Math.min(...rims) : null;
}

export function ravineEscape(d: Pick<MapDraft, 'size' | 'heights' | 'props' | 'built'>): Escape {
  const size = d.size;
  const heights = tileHeights(d);
  const drivable = Uint8Array.from({ length: size * size }, (_, k) => Number(tileSteepness(d.heights, size, k) <= TERRAIN.drive.maxSlope));
  const main = reachedFrom(size, drivable, startPose().pos);
  const access = fallenInto(size, heights, drivable, main);
  const floor = floorTiles(size, heights, drivable, main).map((f, k) => f & access[k] & Number(d.built[k] !== BUILT_TRACK));
  for (const p of d.props) if (p.r >= EXITS.blockRadius) markDisc(floor, size, p.pos, p.r, 0);
  const e = { size, drivable, floor, dist: new Int32Array(size * size).fill(FAR), heights, ravine: ravineLabels(size, floor) };
  const queue = [...main.keys()].filter((k) => main[k] && !floor[k]);
  for (const k of queue) e.dist[k] = 0;
  relax(e, queue);
  return e;
}

function ravineLabels(size: number, floor: Uint8Array): Int32Array {
  const label = new Int32Array(size * size).fill(-1);
  for (let k = 0; k < label.length; k++) {
    if (!floor[k] || label[k] >= 0) continue;
    label[k] = k;
    const queue = [k];
    for (let q = 0; q < queue.length; q++) {
      for (const m of sides(size, queue[q]).filter((t) => floor[t] && label[t] < 0)) {
        label[m] = k;
        queue.push(m);
      }
    }
  }
  return label;
}

function fallenInto(size: number, heights: Float32Array, drivable: Uint8Array, main: Uint8Array): Uint8Array {
  const access = Uint8Array.from(main);
  const queue = [...main.keys()].filter((k) => main[k]);
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    for (const m of sides(size, k).filter((t) => !access[t] && reachesFrom(heights, drivable, k, t))) {
      access[m] = 1;
      queue.push(m);
    }
  }
  return access;
}

function reachesFrom(heights: Float32Array, drivable: Uint8Array, from: number, to: number): boolean {
  return heights[to] < heights[from] || (drivable[from] === 1 && drivable[to] === 1);
}

function floorTiles(size: number, heights: Float32Array, drivable: Uint8Array, main: Uint8Array): Uint8Array {
  const closed = windowFilter(windowFilter(heights, size, EXITS.closeRadius, Math.max), size, EXITS.closeRadius, Math.min);
  return Uint8Array.from({ length: size * size }, (_, k) => Number(fitsTruck(size, drivable, k) && (closed[k] - heights[k] >= EXITS.depth || !main[k])));
}

function fitsTruck(size: number, drivable: Uint8Array, k: number): boolean {
  const x = k % size;
  return TRUCK_BLOCKS.some(([dx, dy]) => {
    const at = k + dy * size + dx;
    return x + dx >= 0 && x + dx + 1 < size && at >= 0 && at + size + 1 < drivable.length && drivable[at] + drivable[at + 1] + drivable[at + size] + drivable[at + size + 1] === 4;
  });
}

function trapped(e: Escape, k: number): boolean {
  return e.floor[k] === 1 && e.dist[k] > spacingAt(e.size, k);
}

function spacingAt(size: number, k: number): number {
  return EXITS.spacing + (EXITS.mountainSpacing - EXITS.spacing) * zoneWeight('mountains', (k % size) + 0.5, Math.floor(k / size) + 0.5);
}

function carveAt(e: Escape, k: number): number {
  return spacingAt(e.size, k) * EXITS.carveShare;
}

function gather(e: Escape, seen: Uint8Array, start: number): number[] {
  const tiles = [start];
  seen[start] = 1;
  for (let q = 0; q < tiles.length; q++) {
    for (const m of sides(e.size, tiles[q])) {
      if (seen[m] || !trapped(e, m)) continue;
      seen[m] = 1;
      tiles.push(m);
    }
  }
  return tiles;
}

function tileHeights(d: Pick<MapDraft, 'size' | 'heights'>): Float32Array {
  const n = d.size + 1;
  const out = new Float32Array(d.size * d.size);
  for (let k = 0; k < out.length; k++) out[k] = tileHeight(d.heights, d.size, n, k);
  return out;
}

function tileHeight(h: ArrayLike<number>, size: number, n: number, k: number): number {
  const v = Math.floor(k / size) * n + (k % size);
  return (h[v] + h[v + 1] + h[v + n] + h[v + n + 1]) / 4;
}

function windowFilter(src: Float32Array, size: number, r: number, pick: (a: number, b: number) => number): Float32Array {
  return windowPass(windowPass(src, size, r, pick, 1, size), size, r, pick, size, 1);
}

function windowPass(src: Float32Array, size: number, r: number, pick: (a: number, b: number) => number, step: number, line: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let row = 0; row < size; row++) {
    for (let i = 0; i < size; i++) {
      let best = src[row * line + i * step];
      for (let t = Math.max(0, i - r); t <= Math.min(size - 1, i + r); t++) best = pick(best, src[row * line + t * step]);
      out[row * line + i * step] = best;
    }
  }
  return out;
}

function reachedFrom(size: number, drivable: Uint8Array, from: Vec): Uint8Array {
  const reached = new Uint8Array(size * size);
  const start = Math.floor(from.y) * size + Math.floor(from.x);
  const queue = [start];
  reached[start] = 1;
  for (let q = 0; q < queue.length; q++) {
    for (const m of sides(size, queue[q])) {
      if (reached[m] || !drivable[m]) continue;
      reached[m] = 1;
      queue.push(m);
    }
  }
  return reached;
}

function relax(e: Escape, queue: number[]): void {
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    for (const m of sides(e.size, k)) {
      if (!e.drivable[m] || e.dist[m] <= e.dist[k] + 1) continue;
      e.dist[m] = e.dist[k] + 1;
      queue.push(m);
    }
  }
}

function sides(size: number, k: number): number[] {
  const x = k % size;
  const out: number[] = [];
  if (x > 0) out.push(k - 1);
  if (x < size - 1) out.push(k + 1);
  if (k >= size) out.push(k - size);
  if (k < size * (size - 1)) out.push(k + size);
  return out;
}

function tileCenter(size: number, k: number): Vec {
  return { x: (k % size) + 0.5, y: Math.floor(k / size) + 0.5 };
}

function openExit(d: MapDraft, e: Escape, props: Map<number, BakedProp[]>, removed: Set<BakedProp>, k: number): boolean {
  for (const ramp of exitRamps(e, k)) {
    if (cutRamp(d, e, props, removed, ramp) && e.dist[k] <= carveAt(e, k)) return true;
  }
  return false;
}

function cutRamp(d: MapDraft, e: Escape, props: Map<number, BakedProp[]>, removed: Set<BakedProp>, ramp: Ramp): boolean {
  if (!coreClear(ramp)) return false;
  const cuts = planCut(d, e, ramp);
  const hit = cutProps(d, props, ramp, cuts);
  if (hit === null) return false;
  for (const p of hit) removed.add(p);
  for (const [v, h] of cuts) d.heights[v] = h;
  refresh(d, e, ramp);
  return true;
}

function exitRamps(e: Escape, k: number): Ramp[] {
  const out: Ramp[] = [];
  for (const t of exitTargets(e, k)) {
    const foot = wallFoot(e, k, t);
    const ramp = { from: tileCenter(e.size, foot), to: tileCenter(e.size, t), low: e.heights[foot], high: e.heights[t], ravine: e.ravine[foot] };
    if (dist(ramp.from, ramp.to) * RAMP_GRADE < Math.abs(ramp.high - ramp.low)) continue;
    out.push(ramp);
    if (out.length >= EXITS.tries) break;
  }
  return out;
}

function exitTargets(e: Escape, k: number): number[] {
  const fx = k % e.size;
  const fy = Math.floor(k / e.size);
  const found: { t: number; run: number }[] = [];
  for (let y = Math.max(0, fy - EXITS.reach); y <= Math.min(e.size - 1, fy + EXITS.reach); y++) {
    for (let x = Math.max(0, fx - EXITS.reach); x <= Math.min(e.size - 1, fx + EXITS.reach); x++) {
      const t = y * e.size + x;
      const run = Math.hypot(x - fx, y - fy);
      if (e.dist[t] === 0 && run <= EXITS.reach) found.push({ t, run });
    }
  }
  return found.sort((a, b) => a.run - b.run).map((f) => f.t);
}

function wallFoot(e: Escape, from: number, to: number): number {
  const a = tileCenter(e.size, from);
  const b = tileCenter(e.size, to);
  const run = dist(a, b);
  let foot = from;
  for (let s = 0.5; s < run; s += 0.5) {
    const k = Math.floor(a.y + ((b.y - a.y) * s) / run) * e.size + Math.floor(a.x + ((b.x - a.x) * s) / run);
    if (!e.drivable[k] || !e.floor[k]) return foot;
    foot = k;
  }
  return foot;
}

function coreClear(r: Ramp): boolean {
  const steps = Math.ceil(dist(r.from, r.to));
  for (let s = 0; s <= steps; s++) {
    const p = { x: r.from.x + ((r.to.x - r.from.x) * s) / steps, y: r.from.y + ((r.to.y - r.from.y) * s) / steps };
    if (keptGround(p, EXITS.width)) return false;
  }
  return true;
}

function keptGround(p: Vec, margin: number): boolean {
  if (KEPT_SITES.some((site) => siteGap(site, p) < margin)) return true;
  return ROAD_INDEX.nearestWithin(p.x, p.y, REGION.roadWidth / 2 + margin) < REGION.roadWidth / 2 + margin;
}

function planCut(d: MapDraft, e: Escape, r: Ramp): Map<number, number> {
  const n = d.size + 1;
  const box = rampBox(d.size, r);
  const cuts = new Map<number, number>();
  for (let y = box.y0; y <= box.y1 + 1; y++) {
    for (let x = box.x0; x <= box.x1 + 1; x++) {
      const h = rampHeight(d, e, r, x, y);
      if (h !== null) cuts.set(y * n + x, h);
    }
  }
  return cuts;
}

function rampHeight(d: MapDraft, e: Escape, r: Ramp, x: number, y: number): number | null {
  const off = segmentDist({ x, y }, r.from, r.to);
  if (off >= sideReach(r) || keptGround({ x, y }, 1) || onLaidGround(d, x, y)) return null;
  const along = { x: r.to.x - r.from.x, y: r.to.y - r.from.y };
  const s = Math.min(1, Math.max(0, ((x - r.from.x) * along.x + (y - r.from.y) * along.y) / (along.x * along.x + along.y * along.y)));
  const profile = r.low + (r.high - r.low) * s;
  const h = d.heights[y * (d.size + 1) + x];
  const ceiling = profile + EXITS.wall * Math.max(0, off - EXITS.width / 2);
  if (ceiling < h) return ceiling;
  return fillsLane(d, e, r, off, profile - h, x, y) ? profile : null;
}

function fillsLane(d: MapDraft, e: Escape, r: Ramp, off: number, rise: number, x: number, y: number): boolean {
  return off <= EXITS.width / 2 && rise > 0 && fillable(d, e, r, x, y);
}

function onLaidGround(d: MapDraft, x: number, y: number): boolean {
  return CORNER_TILES.some(([dx, dy]) => LAID.has(d.built[Math.min(d.size - 1, Math.max(0, y + dy)) * d.size + Math.min(d.size - 1, Math.max(0, x + dx))]));
}

function fillable(d: MapDraft, e: Escape, r: Ramp, x: number, y: number): boolean {
  return CORNER_TILES.every(([dx, dy]) => {
    const tile = Math.min(d.size - 1, Math.max(0, y + dy)) * d.size + Math.min(d.size - 1, Math.max(0, x + dx));
    return d.built[tile] !== BUILT_DITCH && d.built[tile] !== BUILT_CANAL && e.ravine[tile] !== r.ravine;
  });
}

function cutProps(d: MapDraft, props: Map<number, BakedProp[]>, r: Ramp, cuts: Map<number, number>): BakedProp[] | null {
  const n = d.size + 1;
  const hit = nearbyProps(props, r, sideReach(r)).filter((p) => {
    for (let y = Math.floor(p.pos.y - p.r); y <= Math.ceil(p.pos.y + p.r); y++) {
      for (let x = Math.floor(p.pos.x - p.r); x <= Math.ceil(p.pos.x + p.r); x++) {
        const cut = cuts.get(y * n + x);
        if (cut !== undefined && Math.abs(d.heights[y * n + x] - cut) > EXITS.propCut) return true;
      }
    }
    return false;
  });
  return hit.every((p) => EXITS.clearKinds.includes(p.kind)) ? hit : null;
}

function refresh(d: MapDraft, e: Escape, r: Ramp): void {
  const box = rampBox(d.size, r);
  const n = d.size + 1;
  for (let y = Math.max(0, box.y0 - 1); y <= Math.min(e.size - 1, box.y1 + 1); y++) {
    for (let x = Math.max(0, box.x0 - 1); x <= Math.min(e.size - 1, box.x1 + 1); x++) {
      const k = y * e.size + x;
      e.heights[k] = tileHeight(d.heights, d.size, n, k);
      e.drivable[k] = tileSteepness(d.heights, d.size, k) <= TERRAIN.drive.maxSlope ? 1 : 0;
    }
  }
  relax(e, boxNeighbours(e, box));
}

function boxNeighbours(e: Escape, box: { x0: number; y0: number; x1: number; y1: number }): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, box.y0 - 2); y <= Math.min(e.size - 1, box.y1 + 2); y++) {
    for (let x = Math.max(0, box.x0 - 2); x <= Math.min(e.size - 1, box.x1 + 2); x++) {
      const k = y * e.size + x;
      if (e.drivable[k] && e.dist[k] < FAR) out.push(k);
    }
  }
  return out;
}

function sideReach(r: Ramp): number {
  return EXITS.width / 2 + Math.abs(r.high - r.low) / EXITS.wall + 1;
}

function rampBox(size: number, r: Ramp): { x0: number; y0: number; x1: number; y1: number } {
  const pad = sideReach(r) + 1;
  return {
    x0: Math.max(0, Math.floor(Math.min(r.from.x, r.to.x) - pad)),
    y0: Math.max(0, Math.floor(Math.min(r.from.y, r.to.y) - pad)),
    x1: Math.min(size - 1, Math.ceil(Math.max(r.from.x, r.to.x) + pad)),
    y1: Math.min(size - 1, Math.ceil(Math.max(r.from.y, r.to.y) + pad)),
  };
}

function propGrid(props: readonly BakedProp[]): Map<number, BakedProp[]> {
  const grid = new Map<number, BakedProp[]>();
  for (const p of props) {
    const key = cellKey(Math.floor(p.pos.x / PROP_CELL), Math.floor(p.pos.y / PROP_CELL));
    const list = grid.get(key);
    if (list) list.push(p);
    else grid.set(key, [p]);
  }
  return grid;
}

function cellKey(i: number, j: number): number {
  return j * 4096 + i;
}

function nearbyProps(grid: Map<number, BakedProp[]>, r: Ramp, pad: number): BakedProp[] {
  const out: BakedProp[] = [];
  const cells = Math.ceil(pad / PROP_CELL) + 1;
  const i0 = Math.floor(Math.min(r.from.x, r.to.x) / PROP_CELL) - cells;
  const i1 = Math.floor(Math.max(r.from.x, r.to.x) / PROP_CELL) + cells;
  const j0 = Math.floor(Math.min(r.from.y, r.to.y) / PROP_CELL) - cells;
  const j1 = Math.floor(Math.max(r.from.y, r.to.y) / PROP_CELL) + cells;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(...(grid.get(cellKey(i, j)) ?? []));
  return out;
}

function markDisc(out: Uint8Array, size: number, at: Vec, r: number, value = 1): void {
  for (let y = Math.max(0, Math.floor(at.y - r)); y <= Math.min(size - 1, Math.ceil(at.y + r)); y++) {
    for (let x = Math.max(0, Math.floor(at.x - r)); x <= Math.min(size - 1, Math.ceil(at.x + r)); x++) {
      if (Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y) <= r) out[y * size + x] = value;
    }
  }
}
