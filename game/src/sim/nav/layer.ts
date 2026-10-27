
import { REGION } from '../../data/region';
import { BREAKABLE } from '../../data/rules';
import { TERRAIN, TERRAIN_TYPES, type TerrainTypeId } from '../../data/terrain';
import { atlasOf, atlasSites } from '../atlas';
import { nearRail, type DeckSet } from '../bridge';
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
  roadShy: Float32Array;
  slow: Float32Array;
  steep: Float32Array;
  decks: DeckSet;
  climbShares: Map<number, Float32Array>;
};

export const COARSE = 8;

export type RegionGrid = { length: number; n: number; local: Uint8Array; first: Int32Array; at: (cell: number) => number };

export type CoarseGrid = {
  n: number;
  region: RegionGrid;
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
  marks: Uint8Array | null;
  blocked: Uint8Array;
  coarse: CoarseGrid;
};

export type StaticSet = { id: number; solidId: number; solid: Blocker[]; costly: Blocker[]; costlyKeys: Set<string>; buckets: ObstacleBuckets; solidBuckets: ObstacleBuckets; costlyBuckets: ObstacleBuckets };

export function isTransientWreck(o: Obstacle): boolean {
  return o.kind === 'wreck' && o.id.startsWith('wreck');
}

type SolidGrid = { blocked: Uint8Array; coarse: CoarseGrid };
type CachedLayer = { layer: NavLayer; statics: StaticSet };
type TerrainEntry = { nav: TerrainNav; cellCliff: Map<number, Uint8Array>; solidGrids: Map<string, SolidGrid>; layers: Map<string, CachedLayer> };
const terrains = new WeakMap<Terrain, TerrainEntry>();
const LAYERS_MAX = 16;
let nextLayerId = 1;

function terrainEntry(t: Terrain) {
  let e = terrains.get(t);
  if (!e) {
    const n = Math.ceil(t.size / CELL);
    const tiles = tileLayers(t);
    const slow = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) slow[y * n + x] = tiles.tileCost[tileIndex(t.size, (x + 0.5) * CELL, (y + 0.5) * CELL)];
    e = { nav: { size: t.size, n, ...tiles, slow, decks: atlasOf(t).decks, climbShares: new Map() }, cellCliff: new Map(), solidGrids: new Map(), layers: new Map() };
    terrains.set(t, e);
  }
  return e;
}

function tileLayers(t: Terrain): Pick<TerrainNav, 'cliffTile' | 'tileCost' | 'flatCost' | 'roadTile' | 'roadShy' | 'steep'> {
  const cliffTile = new Uint8Array(t.size * t.size);
  const tileCost = new Float64Array(t.size * t.size);
  const flatCost = new Float64Array(t.size * t.size);
  const roadTile = new Uint8Array(t.size * t.size);
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
  }
  return { cliffTile, tileCost, flatCost, roadTile, steep, roadShy: roadShyField(t.size, roadTile) };
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
  const costly = all.filter((_, i) => breakable[i]);
  return {
    id: keyId(blockerKey(all)),
    solidId: keyId(blockerKey(solid)),
    solid,
    costly,
    costlyKeys: new Set(costly.map(blockerKey1)),
    buckets: new ObstacleBuckets(all, terrain.size),
    solidBuckets: new ObstacleBuckets(solid, terrain.size),
    costlyBuckets: new ObstacleBuckets(costly, terrain.size),
  };
}

const KEY_IDS_KEPT = 16;
const keyIds = new Map<string, number>();
let nextKeyId = 1;

function keyId(key: string): number {
  const hit = keyIds.get(key);
  if (hit !== undefined) {
    keyIds.delete(key);
    keyIds.set(key, hit);
    return hit;
  }
  if (keyIds.size >= KEY_IDS_KEPT) keyIds.delete(keyIds.keys().next().value!);
  const id = nextKeyId++;
  keyIds.set(key, id);
  return id;
}

function blockerKey1(o: Blocker): string {
  return o.prop ? o.prop.key : `${o.pos.x},${o.pos.y},${o.r}`;
}

const transientWrecks = new WeakMap<Obstacle[], { length: number; terrain: Terrain; blockers: Blocker[] }>();

export function dynamicBlockers(obstacles: Obstacle[], terrain: Terrain, extra: Blocker[]): Blocker[] {
  let kept = transientWrecks.get(obstacles);
  if (!kept || kept.length !== obstacles.length || kept.terrain !== terrain) {
    kept = { length: obstacles.length, terrain, blockers: obstacles.filter((o) => isDriveObstacle(o) && isTransientWreck(o)).map((o) => driveBlocker(o, terrain)) };
    transientWrecks.set(obstacles, kept);
  }
  return [...kept.blockers, ...extra];
}

function driveBlocker(o: Obstacle, terrain: Terrain): Blocker {
  if (o.kind === 'site') return { pos: o.pos, r: o.r };
  return { pos: o.pos, r: propReach(o), prop: { key: propKey(o), boxes: blockingBoxes(o, terrain) } };
}

export function blockerKey(blockers: Blocker[]): string {
  return blockers.map(blockerKey1).join('|');
}

export function navLayer(terrain: Terrain, obstacles: Obstacle[], radius: number): NavLayer {
  const e = terrainEntry(terrain);
  const statics = staticSet(obstacles, terrain);
  const key = `${statics.id}:${radius}`;
  const hit = e.layers.get(key);
  if (hit) return hit.layer;
  const layer = patchedLayer(e, statics, radius) ?? builtLayer(e, statics, radius);
  e.layers.set(key, { layer, statics });
  dropSuperseded(e.layers);
  return layer;
}

function dropSuperseded(cache: Map<string, CachedLayer>): void {
  const newest = new Map<number, string>();
  for (const [key, { layer }] of cache) newest.set(layer.radius, key);
  const kept = new Set(newest.values());
  for (const key of [...cache.keys()]) if (cache.size > LAYERS_MAX && !kept.has(key)) cache.delete(key);
  while (cache.size > LAYERS_MAX) cache.delete(cache.keys().next().value!);
}

function keepWithin<T>(cache: Map<string, T>, current: string): void {
  if (cache.size < LAYERS_MAX) return;
  for (const key of [...cache.keys()]) if (!key.startsWith(current)) cache.delete(key);
  if (cache.size >= LAYERS_MAX) cache.delete(cache.keys().next().value!);
}

function builtLayer(e: TerrainEntry, statics: StaticSet, radius: number): NavLayer {
  const nav = e.nav;
  const cliff = cliffCells(e, radius);
  const solid = solidGrid(e, cliff, statics, radius);
  const marks = costlyMarks(nav, statics.costly, radius);
  const layer: NavLayer = { ...nav, marks, id: nextLayerId++, radius, blocked: solid.blocked, coarse: solid.coarse };
  return marks === null ? layer : { ...layer, coarse: withRegionSlow(solid.coarse, nav.slow, marks) };
}

export function warmLayers(terrain: Terrain, obstacles: Obstacle[], radii: number[]): void {
  const e = terrainEntry(terrain);
  const statics = staticSet(obstacles, terrain);
  const missing = radii.filter((r) => !e.layers.has(`${statics.id}:${r}`) && !e.solidGrids.has(`${statics.solidId}:${r}`));
  const blocked = missing.map((r) => cliffCells(e, r).slice());
  stampEveryRadius(e.nav.n, statics.solid, missing, blocked);
  missing.forEach((r, i) => {
    keepWithin(e.solidGrids, `${statics.solidId}:`);
    e.solidGrids.set(`${statics.solidId}:${r}`, { blocked: blocked[i], coarse: coarseGrid(e.nav.n, blocked[i], e.nav.slow) });
  });
  for (const r of radii) navLayer(terrain, obstacles, r);
}

function patchedLayer(e: TerrainEntry, statics: StaticSet, radius: number): NavLayer | null {
  const from = [...e.layers.entries()].reverse().find(([, c]) => c.layer.radius === radius && c.statics.solidId === statics.solidId && c.statics.costly.length > 0);
  if (!from || statics.costly.length === 0) return null;
  const { layer: old, statics: was } = from[1];
  const changed = [...was.costly.filter((o) => !statics.costlyKeys.has(blockerKey1(o))), ...statics.costly.filter((o) => !was.costlyKeys.has(blockerKey1(o)))];
  const marks = old.marks!.slice();
  const cells = restampCostly(e.nav, marks, statics, changed, radius);
  const fresh: NavLayer = { ...old, marks, id: nextLayerId++ };
  const layer: NavLayer = { ...fresh, coarse: withRegionsRedone(old.coarse, e.nav.n, (c) => slowAt(fresh, c), cells) };
  const need = climbNeeds.get(old);
  if (need) climbNeeds.set(layer, need);
  return layer;
}

function restampCostly(nav: TerrainNav, marks: Uint8Array, statics: StaticSet, changed: Blocker[], radius: number): Set<number> {
  const touched = new Set<number>();
  stampBlockers(nav.n, changed, radius, (c) => touched.add(c));
  const grow = radius + CLEARANCE;
  for (const c of touched) marks[c] = 0;
  for (const o of changed) {
    const near = statics.costlyBuckets.alongSegment(o.pos, o.pos, o.r + 2 * grow + CELL);
    stampBlockers(nav.n, near, radius, (c) => {
      if (touched.has(c)) marks[c] = 1;
    });
  }
  return touched;
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
  const s = nav.size;
  const tiles = nav.cliffTile;
  const here = cellTiles(n, s, 0);
  const ahead = cellTiles(n, s, reach);
  const behind = cellTiles(n, s, -reach);
  for (let y = 0; y < n; y++) {
    const row = here[y] * s;
    const rowAhead = ahead[y] * s;
    const rowBehind = behind[y] * s;
    for (let x = 0; x < n; x++) {
      const col = here[x];
      cliff[y * n + x] = tiles[row + col] | tiles[row + ahead[x]] | tiles[row + behind[x]] | tiles[rowAhead + col] | tiles[rowBehind + col];
    }
  }
  for (const box of nav.decks.boxes) markRailCells(nav, cliff, box, reach);
  return cliff;
}

function cellTiles(n: number, size: number, shift: number): Int32Array {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(size - 1, Math.max(0, Math.floor((i + 0.5) * CELL + shift)));
  return out;
}

function markRailCells(nav: TerrainNav, cliff: Uint8Array, box: { minX: number; maxX: number; minY: number; maxY: number }, reach: number): void {
  const n = nav.n;
  const x0 = Math.max(0, Math.floor((box.minX - reach) / CELL));
  const x1 = Math.min(n - 1, Math.ceil((box.maxX + reach) / CELL));
  const y0 = Math.max(0, Math.floor((box.minY - reach) / CELL));
  const y1 = Math.min(n - 1, Math.ceil((box.maxY + reach) / CELL));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (nearRail(nav.decks, (x + 0.5) * CELL, (y + 0.5) * CELL, reach)) cliff[y * n + x] = 1;
}

function solidGrid(e: TerrainEntry, cliff: Uint8Array, statics: StaticSet, radius: number): SolidGrid {
  const key = `${statics.solidId}:${radius}`;
  let grid = e.solidGrids.get(key);
  if (!grid) {
    keepWithin(e.solidGrids, `${statics.solidId}:`);
    const blocked = cliff.slice();
    stampBlockers(e.nav.n, statics.solid, radius, (c) => (blocked[c] = 1));
    grid = { blocked, coarse: coarseGrid(e.nav.n, blocked, e.nav.slow) };
    e.solidGrids.set(key, grid);
  }
  return grid;
}

function withRegionsRedone(coarse: CoarseGrid, n: number, slow: (c: number) => number, cells: Set<number>): CoarseGrid {
  const mean = coarse.slow.slice();
  const regions = new Set<number>();
  for (const c of cells) if (coarse.region.at(c) !== 0) regions.add(coarse.region.at(c));
  for (const r of regions) mean[r] = regionMean(coarse, n, slow, r);
  return { ...coarse, slow: mean };
}

function regionMean(coarse: CoarseGrid, n: number, slow: (c: number) => number, r: number): number {
  const bn = Math.ceil(n / COARSE);
  const block = coarse.block[r];
  const x0 = (block % bn) * COARSE;
  const y0 = Math.floor(block / bn) * COARSE;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < Math.min(n, y0 + COARSE); y++)
    for (let x = x0; x < Math.min(n, x0 + COARSE); x++) {
      const c = y * n + x;
      if (coarse.region.at(c) !== r) continue;
      sum += slow(c);
      count++;
    }
  return sum / count;
}

function withRegionSlow(coarse: CoarseGrid, slow: Float32Array, marks: Uint8Array): CoarseGrid {
  const sum = new Float64Array(coarse.slow.length);
  const count = new Uint32Array(coarse.slow.length);
  const { local, first, n } = coarse.region;
  const bn = coarse.n;
  const cost = BREAKABLE.routeCost;
  for (let y = 0; y < n; y++) {
    const row = Math.floor(y / COARSE) * bn;
    for (let x = 0; x < n; x++) {
      const c = y * n + x;
      if (local[c] === 0) continue;
      const r = first[row + Math.floor(x / COARSE)] + local[c] - 1;
      sum[r] += marks[c] === 1 ? Math.fround(slow[c] * cost) : slow[c];
      count[r]++;
    }
  }
  const mean = new Float32Array(coarse.slow.length);
  for (let r = 1; r < mean.length; r++) mean[r] = sum[r] / count[r];
  return { ...coarse, slow: mean };
}

function costlyMarks(nav: TerrainNav, costly: Blocker[], radius: number): Uint8Array | null {
  if (costly.length === 0) return null;
  const marks = new Uint8Array(nav.n * nav.n);
  stampBlockers(nav.n, costly, radius, (c) => (marks[c] = 1));
  return marks;
}

export function slowAt(layer: NavLayer, c: number): number {
  return layer.marks !== null && layer.marks[c] === 1 ? Math.fround(layer.slow[c] * BREAKABLE.routeCost) : layer.slow[c];
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

function stampEveryRadius(n: number, blockers: Blocker[], radii: number[], marks: Uint8Array[]): void {
  const grows = radii.map((r) => r + CLEARANCE);
  const most = Math.max(...grows);
  for (const o of blockers) {
    if (!o.prop) {
      const reaches = grows.map((g) => o.r + g);
      stampMeasured(n, o.pos, o.r + most, o.r + most, (p) => dist(p, o.pos), (c, d) => markUnder(marks, reaches, c, d));
      continue;
    }
    for (const box of o.prop.boxes) stampMeasured(n, box.center, ...boxExtent(box, most), (p) => boxDistance(box, p), (c, d) => markUnder(marks, grows, c, d));
  }
}

function markUnder(marks: Uint8Array[], limits: number[], cell: number, d: number): void {
  for (let i = 0; i < limits.length; i++) if (d < limits[i]) marks[i][cell] = 1;
}

function stampMeasured(n: number, center: Vec, ex: number, ey: number, measure: (p: Vec) => number, mark: (cell: number, d: number) => void): void {
  const x0 = Math.max(0, Math.floor((center.x - ex) / CELL));
  const y0 = Math.max(0, Math.floor((center.y - ey) / CELL));
  const x1 = Math.min(n - 1, Math.floor((center.x + ex) / CELL));
  const y1 = Math.min(n - 1, Math.floor((center.y + ey) / CELL));
  const p = { x: 0, y: 0 };
  for (let x = x0; x <= x1; x++) {
    p.x = (x + 0.5) * CELL;
    for (let y = y0; y <= y1; y++) {
      p.y = (y + 0.5) * CELL;
      mark(y * n + x, measure(p));
    }
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
  const r = layer.coarse.region.at(cell);
  return r === 0 ? 0 : layer.coarse.comp[r];
}

export const NO_CLIMB = 255;
const STEEP_TOLERANCE = 1e-4;
const CLIMB_NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const climbNeeds = new WeakMap<NavLayer, Uint8Array>();

export function climbNeed(layer: NavLayer): Uint8Array {
  const hit = climbNeeds.get(layer);
  if (hit) return hit;
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

function floodClimb(layer: NavLayer): Uint8Array {
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
  if (!buckets.some((b) => b.length > 0)) throw new Error('climbNeed: the nav layer has no free road cell');
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
  return { n: bn, region: compactRegions(n, bn, region, blockOf), block: Int32Array.from(blockOf), x: cx, y: cy, slow: mean, comp: components(count, edgeStart, edges), edgeStart, edges };
}

function compactRegions(n: number, bn: number, region: Int32Array, blockOf: readonly number[]): RegionGrid {
  const first = new Int32Array(bn * bn);
  for (let r = blockOf.length - 1; r >= 1; r--) first[blockOf[r]] = r;
  const local = new Uint8Array(n * n);
  for (let c = 0; c < region.length; c++) if (region[c] !== 0) local[c] = region[c] - first[blockOf[region[c]]] + 1;
  const at = (c: number): number => {
    const l = local[c];
    if (l === 0) return 0;
    const x = c % n;
    return first[Math.floor((c - x) / n / COARSE) * bn + Math.floor(x / COARSE)] + l - 1;
  };
  return { length: n * n, n, local, first, at };
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

export type Taste = { seed: number; side: number; values: Float32Array | null; shy: Float32Array | null; night: Float32Array | null; size: number; climb: number; steep: Float32Array | null; shares: Float32Array | null };

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
  return { seed, side, values, shy: null, night: null, size, climb: Infinity, steep: null, shares: null };
}

export function offRoadTaste(taste: Taste, nav: TerrainNav): Taste {
  return { ...taste, shy: nav.roadShy, size: nav.size };
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

export function climbTaste(taste: Taste | null, nav: TerrainNav, climb: number): Taste | null {
  if (climb >= TERRAIN.drive.maxSlope) return taste;
  const base = taste ?? { seed: 0, side: 0, values: null, shy: null, night: null, size: nav.size, climb: Infinity, steep: null, shares: null };
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
  const c = cost * tasteAt(t, x, y) * (t.night ? t.night[tileIndex(t.size, x, y)] : 1);
  return t.shy ? c * t.shy[tileIndex(t.size, x, y)] : c;
}

export function tasted(t: Taste | null, cost: number, x: number, y: number): number {
  if (!t) return cost;
  const c = noisy(t, cost, x, y);
  return t.steep && t.steep[tileIndex(t.size, x, y)] > t.climb ? c * REGION.navigation.overClimbCost : c;
}

export function tastedCoarse(t: Taste | null, cost: number, x: number, y: number, blockA: number, blockB: number): number {
  if (!t) return cost;
  const c = noisy(t, cost, x, y) * coarseShy(t, x, y);
  if (!t.shares) return c;
  return c * (1 + Math.max(t.shares[blockA], t.shares[blockB]) * (REGION.navigation.overClimbCost - 1));
}

function coarseShy(t: Taste, x: number, y: number): number {
  if (!t.shy) return 1;
  const shy = t.shy[tileIndex(t.size, x, y)];
  return shy >= REGION.navigation.roadShyCost ? shy : 1;
}

export function tasteKey(t: Taste | null): string {
  if (!t) return 'plain';
  const noise = t.values ? (t.shy ? `${t.seed}:off` : String(t.seed)) : 'flat';
  const styled = t.night ? `${noise}:n` : noise;
  return t.steep ? `${styled}:c${t.climb}` : styled;
}

function smooth(f: number): number {
  return f * f * (3 - 2 * f);
}
