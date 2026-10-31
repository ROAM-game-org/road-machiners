
import { REGION } from '../../data/region';
import { NPC_BEHAVIOR } from '../../data/npcs';
import { BREAKABLE } from '../../data/rules';
import { TERRAIN, TERRAIN_TYPES, type TerrainTypeId } from '../../data/terrain';
import { timed } from '../../perf';
import { atlasOf, atlasSites } from '../atlas';
import { nearRailBox, type DeckSet } from '../bridge';
import { blockingBoxes, boxDistance, isBreakable, isDriveObstacle, propKey, propReach, type PosedBox } from '../mapgen';
import { isCliff, tileSlope, type Terrain } from '../terrain';
import { hashRandom } from '../rng';
import type { Obstacle, Vehicle, World } from '../types';
import { isTerritory, siteGap, type Site } from '../sites';
import { dist, type Vec } from '../vec';
import { ObstacleBuckets, type Blocker } from './buckets';
import { ObstacleCache } from './obstacle-cache';

export const CELL = 0.5;
export const CLEARANCE = 0.4;

export type TerrainNav = {
  size: number;
  n: number;
  cliffTile: Uint8Array;
  tileCost: Float64Array;
  flatCost: Float64Array;
  roadTile: Uint8Array;
  openTile: Uint8Array;
  roadShy: Float32Array;
  slow: Float32Array;
  steep: Float32Array;
  decks: DeckSet;
  climbShares: Map<number, Float32Array>;
};

export const COARSE = 8;

export type CoarseGrid = {
  n: number;
  region: Int32Array;
  block: Int32Array;
  x: Float32Array;
  y: Float32Array;
  slow: Float32Array;
  comp: Int32Array;
  edgeStart: Int32Array;
  edges: Int32Array;
};

export type NavLayer = TerrainNav & {
  id: number;
  radius: number;
  blocked: Uint8Array;
  coarse: CoarseGrid;
};

export type StaticSet = { key: string; solidKey: string; solid: Blocker[]; costly: Blocker[]; buckets: ObstacleBuckets; solidBuckets: ObstacleBuckets };

export function isTransientWreck(o: Obstacle): boolean {
  return o.kind === 'wreck' && o.id.startsWith('wreck');
}

type SolidGrid = { blocked: Uint8Array; coarse: CoarseGrid };
type LayerBase = { layer: NavLayer; solidKey: string; costly: Map<string, Blocker[]>; cover: Uint16Array };
type TerrainEntry = { nav: TerrainNav; cellCliff: Map<number, Uint8Array>; solidGrids: Map<string, SolidGrid>; layers: Map<string, NavLayer>; bases: Map<number, LayerBase> };
const terrains = new WeakMap<Terrain, TerrainEntry>();
const LAYERS_MAX = 16;
const COVER_MAX = 0xffff;
let nextLayerId = 1;

function terrainEntry(t: Terrain) {
  let e = terrains.get(t);
  if (!e) {
    const n = Math.ceil(t.size / CELL);
    const tiles = tileLayers(t);
    const slow = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) slow[y * n + x] = tiles.tileCost[tileIndex(t.size, (x + 0.5) * CELL, (y + 0.5) * CELL)];
    e = { nav: { size: t.size, n, ...tiles, slow, decks: atlasOf(t).decks, climbShares: new Map() }, cellCliff: new Map(), solidGrids: new Map(), layers: new Map(), bases: new Map() };
    terrains.set(t, e);
  }
  return e;
}

function tileLayers(t: Terrain): Pick<TerrainNav, 'cliffTile' | 'tileCost' | 'flatCost' | 'roadTile' | 'openTile' | 'roadShy' | 'steep'> {
  const cliffTile = new Uint8Array(t.size * t.size);
  const tileCost = new Float64Array(t.size * t.size);
  const flatCost = new Float64Array(t.size * t.size);
  const roadTile = new Uint8Array(t.size * t.size);
  const openTile = new Uint8Array(t.size * t.size);
  const steep = new Float32Array(t.size * t.size);
  const sites = atlasSites(atlasOf(t)).filter((s) => !isTerritory(s));
  for (let i = 0; i < t.size * t.size; i++) {
    cliffTile[i] = isCliff(t, i) ? 1 : 0;
    const slope = tileSlope(t, i);
    steep[i] = Math.hypot(slope.x, slope.y);
    const bySite = nearSite(sites, (i % t.size) + 0.5, Math.floor(i / t.size) + 0.5);
    flatCost[i] = routeCost(t.types[i], bySite);
    tileCost[i] = flatCost[i] * slopeCost(t, i);
    roadTile[i] = t.types[i] === 'road' && !bySite ? 1 : 0;
    openTile[i] = t.types[i] !== 'road' && !bySite ? 1 : 0;
  }
  return { cliffTile, tileCost, flatCost, roadTile, openTile, steep, roadShy: roadShyField(t.size, roadTile) };
}

function roadShyField(size: number, roadTile: Uint8Array): Float32Array {
  const { roadShyCost, roadShyBand } = REGION.navigation;
  const far = size * 2;
  const d = new Float32Array(size * size);
  for (let i = 0; i < d.length; i++) d[i] = roadTile[i] === 1 ? 0 : far;
  const relax = (i: number, j: number, step: number): void => { if (d[j] + step < d[i]) d[i] = d[j] + step; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) {
        relax(i, i - size, 1);
        if (x > 0) relax(i, i - size - 1, Math.SQRT2);
        if (x < size - 1) relax(i, i - size + 1, Math.SQRT2);
      }
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      if (x < size - 1) relax(i, i + 1, 1);
      if (y < size - 1) {
        relax(i, i + size, 1);
        if (x < size - 1) relax(i, i + size + 1, Math.SQRT2);
        if (x > 0) relax(i, i + size - 1, Math.SQRT2);
      }
    }
  }
  const shy = new Float32Array(size * size);
  for (let i = 0; i < shy.length; i++) shy[i] = 1 + (roadShyCost - 1) * Math.max(0, 1 - d[i] / (roadShyBand + 1));
  return shy;
}

function routeCost(type: TerrainTypeId, bySite: boolean): number {
  return (type === 'road' || bySite ? 1 : REGION.navigation.offRoadCost) / TERRAIN_TYPES[type].speed;
}

function slopeCost(t: Terrain, tile: number): number {
  const s = tileSlope(t, tile);
  return 1 + REGION.navigation.slopeCost * (Math.hypot(s.x, s.y) / TERRAIN.drive.maxSlope) ** 2;
}

function nearSite(sites: readonly Site[], x: number, y: number): boolean {
  return sites.some((s) => siteGap(s, { x, y }) < REGION.roadWidth);
}

export function terrainNav(t: Terrain): TerrainNav {
  return terrainEntry(t).nav;
}

export function onRouteRoad(nav: TerrainNav, x: number, y: number): boolean {
  return nav.roadTile[tileIndex(nav.size, x, y)] === 1;
}

export function tileIndex(size: number, x: number, y: number): number {
  const tx = Math.min(size - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(size - 1, Math.max(0, Math.floor(y)));
  return ty * size + tx;
}

export function nearCliff(nav: TerrainNav, x: number, y: number, reach: number): boolean {
  const c = nav.cliffTile;
  const s = nav.size;
  return c[tileIndex(s, x, y)] === 1 || c[tileIndex(s, x + reach, y)] === 1 || c[tileIndex(s, x - reach, y)] === 1 || c[tileIndex(s, x, y + reach)] === 1 || c[tileIndex(s, x, y - reach)] === 1;
}

const staticSets = new ObstacleCache<StaticSet>(4);

export function staticSet(obstacles: Obstacle[], terrain: Terrain): StaticSet {
  return staticSets.get(obstacles, terrain, () => buildStaticSet(obstacles, terrain));
}

function buildStaticSet(obstacles: Obstacle[], terrain: Terrain): StaticSet {
  const statics = obstacles.filter((o) => isDriveObstacle(o) && !isTransientWreck(o));
  const all = [...statics.map((o) => driveBlocker(o, terrain)), ...atlasOf(terrain).hazards.map((z) => ({ pos: z.pos, r: z.radius }))];
  const breakable = statics.map(isBreakable);
  const solid = all.filter((_, i) => !breakable[i]);
  return {
    key: blockerKey(all),
    solidKey: blockerKey(solid),
    solid,
    costly: all.filter((_, i) => breakable[i]),
    buckets: new ObstacleBuckets(all, terrain.size),
    solidBuckets: new ObstacleBuckets(solid, terrain.size),
  };
}

export function dynamicBlockers(obstacles: Obstacle[], terrain: Terrain, extra: Blocker[]): Blocker[] {
  return [...obstacles.filter((o) => isDriveObstacle(o) && isTransientWreck(o)).map((o) => driveBlocker(o, terrain)), ...extra];
}

function driveBlocker(o: Obstacle, terrain: Terrain): Blocker {
  if (o.kind === 'site') return { pos: o.pos, r: o.r };
  return { pos: o.pos, r: propReach(o), prop: { key: propKey(o), boxes: blockingBoxes(o, terrain) } };
}

export function blockerKey(blockers: Blocker[]): string {
  return blockers.map((o) => (o.prop ? o.prop.key : `${o.pos.x},${o.pos.y},${o.r}`)).join('|');
}

export function navLayer(terrain: Terrain, obstacles: Obstacle[], radius: number): NavLayer {
  const e = terrainEntry(terrain);
  const statics = staticSet(obstacles, terrain);
  const key = `${radius}:${statics.key}`;
  const hit = e.layers.get(key);
  if (hit) return hit;
  if (e.layers.size >= LAYERS_MAX) e.layers.clear();
  const made = madeLayer(e, statics, radius);
  if (statics.costly.length > 0) e.bases.set(radius, made);
  e.layers.set(key, made.layer);
  return made.layer;
}

function madeLayer(e: TerrainEntry, statics: StaticSet, radius: number): LayerBase {
  const base = e.bases.get(radius);
  if (base && base.solidKey === statics.solidKey && base.costly.size > 0 && statics.costly.length > 0) return timed('nav-layer-patch', () => patchedLayer(e, base, statics, radius));
  return timed('nav-layer-build', () => builtLayer(e, statics, radius));
}

function builtLayer(e: TerrainEntry, statics: StaticSet, radius: number): LayerBase {
  const nav = e.nav;
  const solid = solidGrid(e, cliffCells(e, radius), statics, radius);
  const cover = costlyCover(nav.n, statics.costly, radius);
  const slow = statics.costly.length === 0 ? nav.slow : slowFromCover(nav, cover);
  const coarse = statics.costly.length === 0 ? solid.coarse : withRegionSlow(solid.coarse, slow);
  const layer: NavLayer = { ...nav, slow, id: nextLayerId++, radius, blocked: solid.blocked, coarse };
  return { layer, solidKey: statics.solidKey, costly: costlyOf(statics), cover };
}

function patchedLayer(e: TerrainEntry, base: LayerBase, statics: StaticSet, radius: number): LayerBase {
  const nav = e.nav;
  const solid = solidGrid(e, cliffCells(e, radius), statics, radius);
  const costly = costlyOf(statics);
  const { removed, added } = costlyDiff(base.costly, costly);
  const slow = base.layer.slow.slice();
  const cover = base.cover.slice();
  const touched = new Set<number>();
  recover(nav, slow, cover, removed, -1, radius, touched);
  recover(nav, slow, cover, added, 1, radius, touched);
  const mean = base.layer.coarse.slow.slice();
  regionSlowIn(solid.coarse, slow, mean, touched, nav.n);
  const layer: NavLayer = { ...nav, slow, id: nextLayerId++, radius, blocked: solid.blocked, coarse: { ...solid.coarse, slow: mean } };
  return { layer, solidKey: statics.solidKey, costly, cover };
}

function cliffCells(e: TerrainEntry, radius: number): Uint8Array {
  const cached = e.cellCliff.get(radius);
  if (cached) return cached;
  if (e.cellCliff.size >= LAYERS_MAX) e.cellCliff.clear();
  const cliff = markCliffCells(e.nav, radius + CLEARANCE);
  e.cellCliff.set(radius, cliff);
  return cliff;
}

function markCliffCells(nav: TerrainNav, reach: number): Uint8Array {
  const n = nav.n;
  const cliff = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (nearCliff(nav, (x + 0.5) * CELL, (y + 0.5) * CELL, reach)) cliff[y * n + x] = 1;
  }
  for (const box of nav.decks.boxes) {
    const x0 = Math.max(0, Math.floor((box.minX - reach) / CELL) - 1);
    const x1 = Math.min(n - 1, Math.ceil((box.maxX + reach) / CELL) + 1);
    const y0 = Math.max(0, Math.floor((box.minY - reach) / CELL) - 1);
    const y1 = Math.min(n - 1, Math.ceil((box.maxY + reach) / CELL) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (cliff[y * n + x] === 0 && nearRailBox(box, (x + 0.5) * CELL, (y + 0.5) * CELL, reach)) cliff[y * n + x] = 1;
    }
  }
  return cliff;
}

function solidGrid(e: TerrainEntry, cliff: Uint8Array, statics: StaticSet, radius: number): SolidGrid {
  const key = `${radius}:${statics.solidKey}`;
  let grid = e.solidGrids.get(key);
  if (!grid) {
    if (e.solidGrids.size >= LAYERS_MAX) e.solidGrids.clear();
    const blocked = cliff.slice();
    stampBlockers(e.nav.n, statics.solid, radius, (c) => (blocked[c] = 1));
    grid = { blocked, coarse: coarseGrid(e.nav.n, blocked, e.nav.slow) };
    e.solidGrids.set(key, grid);
  }
  return grid;
}

function withRegionSlow(coarse: CoarseGrid, slow: Float32Array): CoarseGrid {
  const sum = new Float64Array(coarse.slow.length);
  const count = new Uint32Array(coarse.slow.length);
  for (let c = 0; c < coarse.region.length; c++) {
    const r = coarse.region[c];
    sum[r] += slow[c];
    count[r]++;
  }
  const mean = new Float32Array(coarse.slow.length);
  for (let r = 1; r < mean.length; r++) mean[r] = sum[r] / count[r];
  return { ...coarse, slow: mean };
}

function costlyCover(n: number, costly: Blocker[], radius: number): Uint16Array {
  const cover = new Uint16Array(n * n);
  stampBlockers(n, costly, radius, (c) => raiseCover(cover, c));
  return cover;
}

function raiseCover(cover: Uint16Array, c: number): void {
  if (cover[c] === COVER_MAX) throw new Error(`costly cover of cell ${c} passed ${COVER_MAX}`);
  cover[c]++;
}

function lowerCover(cover: Uint16Array, c: number, blocker: Blocker): void {
  if (cover[c] === 0) throw new Error(`costly cover of cell ${c} fell below 0 removing ${blocker.prop?.key}`);
  cover[c]--;
}

function slowFromCover(nav: TerrainNav, cover: Uint16Array): Float32Array {
  const slow = nav.slow.slice();
  for (let c = 0; c < slow.length; c++) if (cover[c] > 0) slow[c] *= BREAKABLE.routeCost;
  return slow;
}

const costlyMaps = new WeakMap<StaticSet, Map<string, Blocker[]>>();

function costlyOf(statics: StaticSet): Map<string, Blocker[]> {
  let map = costlyMaps.get(statics);
  if (!map) {
    map = costlyByKey(statics.costly);
    costlyMaps.set(statics, map);
  }
  return map;
}

function costlyByKey(costly: Blocker[]): Map<string, Blocker[]> {
  const byKey = new Map<string, Blocker[]>();
  for (const b of costly) {
    if (!b.prop) throw new Error('a costly blocker has no prop');
    const same = byKey.get(b.prop.key);
    if (same) same.push(b);
    else byKey.set(b.prop.key, [b]);
  }
  return byKey;
}

function costlyDiff(base: Map<string, Blocker[]>, next: Map<string, Blocker[]>): { removed: Blocker[]; added: Blocker[] } {
  return { removed: surplus(base, next), added: surplus(next, base) };
}

function surplus(from: Map<string, Blocker[]>, other: Map<string, Blocker[]>): Blocker[] {
  const extra: Blocker[] = [];
  for (const [key, blockers] of from) extra.push(...blockers.slice(other.get(key)?.length ?? 0));
  return extra;
}

function recover(nav: TerrainNav, slow: Float32Array, cover: Uint16Array, blockers: Blocker[], step: 1 | -1, radius: number, touched: Set<number>): void {
  const bn = Math.ceil(nav.n / COARSE);
  for (const blocker of blockers) {
    stampBlockers(nav.n, [blocker], radius, (c) => {
      if (step === 1) raiseCover(cover, c);
      else lowerCover(cover, c, blocker);
      if (cover[c] !== (step === 1 ? 1 : 0)) return;
      slow[c] = step === 1 ? nav.slow[c] * BREAKABLE.routeCost : nav.slow[c];
      touched.add(Math.floor(Math.floor(c / nav.n) / COARSE) * bn + Math.floor((c % nav.n) / COARSE));
    });
  }
}

function regionSlowIn(coarse: CoarseGrid, slow: Float32Array, mean: Float32Array, blocks: Set<number>, n: number): void {
  for (const block of blocks) {
    const x0 = (block % coarse.n) * COARSE;
    const y0 = Math.floor(block / coarse.n) * COARSE;
    const sums = new Map<number, { sum: number; count: number }>();
    for (let y = y0; y < Math.min(n, y0 + COARSE); y++) sumRow(coarse.region, slow, sums, y * n + x0, Math.min(n - x0, COARSE));
    for (const [r, acc] of sums) mean[r] = acc.sum / acc.count;
  }
}

function sumRow(region: Int32Array, slow: Float32Array, sums: Map<number, { sum: number; count: number }>, start: number, width: number): void {
  for (let c = start; c < start + width; c++) {
    const r = region[c];
    if (r === 0) continue;
    const acc = sums.get(r) ?? { sum: 0, count: 0 };
    acc.sum += slow[c];
    acc.count++;
    sums.set(r, acc);
  }
}

export function stampBlockers(n: number, blockers: Blocker[], radius: number, mark: (cell: number) => void): void {
  const grow = radius + CLEARANCE;
  for (const o of blockers) {
    if (!o.prop) {
      const reach = o.r + grow;
      stampWithin(n, o.pos, reach, reach, (p) => dist(p, o.pos) < reach, mark);
      continue;
    }
    for (const box of o.prop.boxes) stampWithin(n, box.center, ...boxExtent(box, grow), (p) => boxDistance(box, p) < grow, mark);
  }
}

function boxExtent(box: PosedBox, grow: number): [number, number] {
  const ax = Math.abs(box.axis.x);
  const ay = Math.abs(box.axis.y);
  return [ax * box.half.x + ay * box.half.y + grow, ay * box.half.x + ax * box.half.y + grow];
}

function stampWithin(n: number, center: Vec, ex: number, ey: number, inside: (p: Vec) => boolean, mark: (cell: number) => void): void {
  const x0 = Math.max(0, Math.floor((center.x - ex) / CELL));
  const y0 = Math.max(0, Math.floor((center.y - ey) / CELL));
  const x1 = Math.min(n - 1, Math.floor((center.x + ex) / CELL));
  const y1 = Math.min(n - 1, Math.floor((center.y + ey) / CELL));
  const p = { x: 0, y: 0 };
  for (let x = x0; x <= x1; x++) {
    p.x = (x + 0.5) * CELL;
    for (let y = y0; y <= y1; y++) {
      p.y = (y + 0.5) * CELL;
      if (inside(p)) mark(y * n + x);
    }
  }
}

export function componentOf(layer: NavLayer, cell: number): number {
  const r = layer.coarse.region[cell];
  return r === 0 ? 0 : layer.coarse.comp[r];
}

export const NO_CLIMB = 255;
const STEEP_TOLERANCE = 1e-4;
const CLIMB_NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const climbNeeds = new WeakMap<NavLayer, Uint8Array | null>();

export function climbNeed(layer: NavLayer): Uint8Array {
  const need = climbNeedOnRoads(layer);
  if (need === null) throw new Error('climbNeed: the nav layer has no free road cell');
  return need;
}

export function climbNeedOnRoads(layer: NavLayer): Uint8Array | null {
  const hit = climbNeeds.get(layer);
  if (hit !== undefined) return hit;
  const need = floodClimb(layer);
  climbNeeds.set(layer, need);
  return need;
}

function stepOf(layer: NavLayer, cell: number): number {
  const n = layer.n;
  const x = (cell % n) + 0.5;
  const y = Math.floor(cell / n) + 0.5;
  const steep = layer.steep[tileIndex(layer.size, x * CELL, y * CELL)];
  return Math.min(NO_CLIMB - 1, Math.ceil(steep / REGION.navigation.climbStep - STEEP_TOLERANCE));
}

function floodClimb(layer: NavLayer): Uint8Array | null {
  const n = layer.n;
  const need = new Uint8Array(n * n).fill(NO_CLIMB);
  const buckets: number[][] = Array.from({ length: NO_CLIMB }, () => []);
  for (let c = 0; c < need.length; c++) {
    if (layer.blocked[c] === 1) continue;
    const x = ((c % n) + 0.5) * CELL;
    const y = (Math.floor(c / n) + 0.5) * CELL;
    if (layer.roadTile[tileIndex(layer.size, x, y)] !== 1) continue;
    const step = stepOf(layer, c);
    need[c] = step;
    buckets[step].push(c);
  }
  if (!buckets.some((b) => b.length > 0)) return null;
  for (let level = 0; level < NO_CLIMB; level++) {
    const queue = buckets[level];
    while (queue.length > 0) {
      const c = queue.pop() as number;
      if (need[c] !== level) continue;
      const cx = c % n;
      const cy = (c - cx) / n;
      for (const [dx, dy] of CLIMB_NEIGHBOURS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const next = ny * n + nx;
        if (layer.blocked[next] === 1) continue;
        const through = Math.max(level, stepOf(layer, next));
        if (through >= need[next]) continue;
        need[next] = through;
        buckets[through].push(next);
      }
    }
  }
  return need;
}

function coarseGrid(n: number, blocked: Uint8Array, slow: Float32Array): CoarseGrid {
  const bn = Math.ceil(n / COARSE);
  const region = new Int32Array(n * n);
  const queue = new Int32Array(COARSE * COARSE);
  const blockOf: number[] = [0];
  const sumX: number[] = [0];
  const sumY: number[] = [0];
  const sumSlow: number[] = [0];
  const size: number[] = [0];
  for (let by = 0; by < bn; by++)
    for (let bx = 0; bx < bn; bx++) {
      const x0 = bx * COARSE;
      const y0 = by * COARSE;
      const w = Math.min(n, x0 + COARSE) - x0;
      const h = Math.min(n, y0 + COARSE) - y0;
      if (allFree(blocked, n, x0, y0, w, h)) {
        const id = blockOf.length;
        blockOf.push(by * bn + bx);
        let ts = 0;
        for (let ly = 0; ly < h; ly++)
          for (let lx = 0; lx < w; lx++) {
            const c = (y0 + ly) * n + x0 + lx;
            region[c] = id;
            ts += slow[c];
          }
        sumX.push((x0 + (w - 1) / 2) * w * h);
        sumY.push((y0 + (h - 1) / 2) * w * h);
        sumSlow.push(ts);
        size.push(w * h);
        continue;
      }
      for (let sy = 0; sy < h; sy++)
        for (let sx = 0; sx < w; sx++) {
          const seed = (y0 + sy) * n + x0 + sx;
          if (blocked[seed] || region[seed]) continue;
          const id = blockOf.length;
          blockOf.push(by * bn + bx);
          let tx = 0;
          let ty = 0;
          let ts = 0;
          region[seed] = id;
          let tail = 0;
          queue[tail++] = sy * COARSE + sx;
          for (let i = 0; i < tail; i++) {
            const lx = queue[i] % COARSE;
            const ly = (queue[i] - lx) / COARSE;
            tx += x0 + lx;
            ty += y0 + ly;
            ts += slow[(y0 + ly) * n + x0 + lx];
            const ya = ly > 0 ? ly - 1 : 0;
            const yb = ly < h - 1 ? ly + 1 : ly;
            const xa = lx > 0 ? lx - 1 : 0;
            const xb = lx < w - 1 ? lx + 1 : lx;
            for (let ny = ya; ny <= yb; ny++)
              for (let nx = xa; nx <= xb; nx++) {
                const c = (y0 + ny) * n + x0 + nx;
                if (blocked[c] || region[c]) continue;
                region[c] = id;
                queue[tail++] = ny * COARSE + nx;
              }
          }
          sumX.push(tx);
          sumY.push(ty);
          sumSlow.push(ts);
          size.push(tail);
        }
    }
  const count = blockOf.length;
  const links: number[][] = Array.from({ length: count }, () => []);
  let lastA = 0;
  let lastB = 0;
  const link = (a: number, b: number) => {
    if (a === 0 || b === 0 || a === b || (a === lastA && b === lastB)) return;
    lastA = a;
    lastB = b;
    if (links[a].includes(b)) return;
    links[a].push(b);
    links[b].push(a);
  };
  for (let k = COARSE; k < n; k += COARSE) {
    for (let i = 0; i < n; i++) {
      const left = region[i * n + k - 1];
      if (left === 0) continue;
      if (i > 0) link(left, region[(i - 1) * n + k]);
      link(left, region[i * n + k]);
      if (i < n - 1) link(left, region[(i + 1) * n + k]);
    }
    for (let i = 0; i < n; i++) {
      const top = region[(k - 1) * n + i];
      if (top === 0) continue;
      if (i > 0) link(top, region[k * n + i - 1]);
      link(top, region[k * n + i]);
      if (i < n - 1) link(top, region[k * n + i + 1]);
    }
  }
  const edgeStart = new Int32Array(count + 1);
  for (let r = 0; r < count; r++) edgeStart[r + 1] = edgeStart[r] + links[r].length;
  const edges = new Int32Array(edgeStart[count]);
  for (let r = 0; r < count; r++) edges.set(links[r], edgeStart[r]);
  const cx = new Float32Array(count);
  const cy = new Float32Array(count);
  const mean = new Float32Array(count);
  for (let r = 1; r < count; r++) {
    cx[r] = sumX[r] / size[r];
    cy[r] = sumY[r] / size[r];
    mean[r] = sumSlow[r] / size[r];
  }
  return { n: bn, region, block: Int32Array.from(blockOf), x: cx, y: cy, slow: mean, comp: components(count, edgeStart, edges), edgeStart, edges };
}

function allFree(blocked: Uint8Array, n: number, x0: number, y0: number, w: number, h: number): boolean {
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++) if (blocked[(y0 + ly) * n + x0 + lx]) return false;
  return true;
}

function components(count: number, edgeStart: Int32Array, edges: Int32Array): Int32Array {
  const comp = new Int32Array(count);
  const queue = new Int32Array(count);
  let next = 0;
  for (let seed = 1; seed < count; seed++) {
    if (comp[seed]) continue;
    const id = ++next;
    comp[seed] = id;
    let tail = 0;
    queue[tail++] = seed;
    for (let i = 0; i < tail; i++) {
      const cur = queue[i];
      for (let e = edgeStart[cur]; e < edgeStart[cur + 1]; e++) {
        const r = edges[e];
        if (comp[r]) continue;
        comp[r] = id;
        queue[tail++] = r;
      }
    }
  }
  return comp;
}

export type Berth = { x: number; y: number; r: number };

export type Taste = { seed: number; side: number; values: Float32Array | null; shy: Float32Array | null; night: Float32Array | null; cut: Float32Array | null; size: number; climb: number; steep: Float32Array | null; shares: Float32Array | null; berths: Berth[] | null };

const TASTES_MAX = 256;
const tastes = new Map<string, Taste>();

export function tasteOf(world: World, v: Pick<Vehicle, "id" | "brain"> | undefined): Taste | null {
  if (!v?.brain) return null;
  const chars = Array.from(v.id, (ch) => ch.charCodeAt(0));
  const seed = Math.floor(hashRandom(world.seed, ...chars) * 0x100000000) | 0;
  const key = `${seed}:${world.size}`;
  let taste = tastes.get(key);
  if (!taste) {
    if (tastes.size >= TASTES_MAX) tastes.clear();
    taste = makeTaste(seed, world.size);
    tastes.set(key, taste);
  }
  return taste;
}

export function makeTaste(seed: number, size: number): Taste {
  const { scale, strength } = REGION.navigation.taste;
  const side = Math.ceil(size / scale) + 2;
  const values = new Float32Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) values[y * side + x] = 1 + strength * (hashRandom(seed, x, y) - 0.5);
  return { seed, side, values, shy: null, night: null, cut: null, size, climb: Infinity, steep: null, shares: null, berths: null };
}

export function offRoadTaste(taste: Taste, nav: TerrainNav): Taste {
  return { ...taste, shy: nav.roadShy, size: nav.size };
}

const cutMasks = new WeakMap<TerrainNav, Float32Array>();

export function cutTaste(taste: Taste, nav: TerrainNav): Taste {
  let mask = cutMasks.get(nav);
  if (!mask) {
    mask = cutMask(nav);
    cutMasks.set(nav, mask);
  }
  return { ...taste, cut: mask, size: nav.size };
}

function cutMask(nav: TerrainNav): Float32Array {
  const open = REGION.navigation.shortcutCost / REGION.navigation.offRoadCost;
  const mask = new Float32Array(nav.size * nav.size);
  for (let i = 0; i < mask.length; i++) mask[i] = nav.openTile[i] === 1 ? open : 1;
  return mask;
}

export type NightZone = { center: Vec; reach: number; cost: number; inside: (x: number, y: number) => boolean };

const nightMasks = new WeakMap<TerrainNav, Float32Array>();

export function nightTaste(taste: Taste, nav: TerrainNav, zone: NightZone): Taste {
  let mask = nightMasks.get(nav);
  if (!mask) {
    mask = nightMask(nav, zone);
    nightMasks.set(nav, mask);
  }
  return { ...taste, night: mask, size: nav.size };
}

function nightMask(nav: TerrainNav, zone: NightZone): Float32Array {
  const mask = new Float32Array(nav.size * nav.size).fill(1);
  const lo = (v: number) => Math.max(0, Math.floor(v - zone.reach));
  const hi = (v: number) => Math.min(nav.size - 1, Math.ceil(v + zone.reach));
  for (let y = lo(zone.center.y); y <= hi(zone.center.y); y++) for (let x = lo(zone.center.x); x <= hi(zone.center.x); x++) if (zone.inside(x + 0.5, y + 0.5)) mask[y * nav.size + x] = zone.cost;
  return mask;
}

export function berthTaste(taste: Taste, berths: Berth[]): Taste {
  return berths.length === 0 ? taste : { ...taste, berths };
}

export function climbTaste(taste: Taste | null, nav: TerrainNav, climb: number): Taste | null {
  if (climb >= TERRAIN.drive.maxSlope) return taste;
  const base = taste ?? { seed: 0, side: 0, values: null, shy: null, night: null, cut: null, size: nav.size, climb: Infinity, steep: null, shares: null, berths: null };
  return { ...base, climb, steep: nav.steep, shares: blockOverClimb(nav, climb) };
}

function blockOverClimb(nav: TerrainNav, climb: number): Float32Array {
  const cached = nav.climbShares.get(climb);
  if (cached) return cached;
  if (nav.climbShares.size >= LAYERS_MAX) nav.climbShares.clear();
  const span = COARSE * CELL;
  const side = Math.ceil(nav.size / span);
  const shares = new Float32Array(side * side);
  for (let i = 0; i < nav.steep.length; i++) {
    if (nav.steep[i] <= climb) continue;
    const bx = Math.floor((i % nav.size) / span);
    const by = Math.floor(Math.floor(i / nav.size) / span);
    shares[by * side + bx] += 1 / (span * span);
  }
  nav.climbShares.set(climb, shares);
  return shares;
}

export function tasteAt(t: Taste, x: number, y: number): number {
  if (!t.values) return 1;
  const scale = REGION.navigation.taste.scale;
  const gx = Math.max(0, x / scale);
  const gy = Math.max(0, y / scale);
  const ix = Math.min(t.side - 2, Math.floor(gx));
  const iy = Math.min(t.side - 2, Math.floor(gy));
  const fx = smooth(Math.min(1, gx - ix));
  const fy = smooth(Math.min(1, gy - iy));
  const i = iy * t.side + ix;
  const v = t.values;
  const top = v[i] + (v[i + 1] - v[i]) * fx;
  const bottom = v[i + t.side] + (v[i + t.side + 1] - v[i + t.side]) * fx;
  return top + (bottom - top) * fy;
}

function noisy(t: Taste, cost: number, x: number, y: number): number {
  const c = cost * tasteAt(t, x, y) * (t.night ? t.night[tileIndex(t.size, x, y)] : 1) * (t.cut ? t.cut[tileIndex(t.size, x, y)] : 1) * (t.berths && inBerth(t.berths, x, y) ? NPC_BEHAVIOR.berthCost : 1);
  return t.shy ? c * t.shy[tileIndex(t.size, x, y)] : c;
}

function inBerth(berths: Berth[], x: number, y: number): boolean {
  for (const b of berths) if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) return true;
  return false;
}

function berthKey(berths: Berth[]): string {
  return berths.map((b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.r)}`).join(';');
}

export function tasted(t: Taste | null, cost: number, x: number, y: number): number {
  if (!t) return cost;
  const c = noisy(t, cost, x, y);
  return t.steep && t.steep[tileIndex(t.size, x, y)] > t.climb ? c * REGION.navigation.overClimbCost : c;
}

export function tastedCoarse(t: Taste | null, cost: number, x: number, y: number, blockA: number, blockB: number): number {
  if (!t) return cost;
  const c = noisy(t, cost, x, y);
  if (!t.shares) return c;
  return c * (1 + Math.max(t.shares[blockA], t.shares[blockB]) * (REGION.navigation.overClimbCost - 1));
}

function noiseKey(t: Taste): string {
  if (!t.values) return 'flat';
  return t.shy ? `${t.seed}:off` : String(t.seed);
}

function withSuffix(key: string, on: boolean, suffix: string): string {
  return on ? `${key}:${suffix}` : key;
}

export function tasteKey(t: Taste | null): string {
  if (!t) return 'plain';
  const styled = withSuffix(withSuffix(noiseKey(t), t.night !== null, 'n'), t.cut !== null, 'cut');
  const berthed = t.berths ? `${styled}:b${berthKey(t.berths)}` : styled;
  return t.steep ? `${berthed}:c${t.climb}` : berthed;
}

function smooth(f: number): number {
  return f * f * (3 - 2 * f);
}
