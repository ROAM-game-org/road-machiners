
import { CHASSIS } from '../../data/chassis';
import { REGION } from '../../data/region';
import { timed } from '../../perf';
import { BREAKABLE } from '../../data/rules';
import { TERRAIN, TERRAIN_TYPES, type TerrainTypeId } from '../../data/terrain';
import { atlasOf, atlasSites } from '../atlas';
import { nearRail, type DeckSet } from '../bridge';
import { blockingBoxes, boxDistance, isBreakable, isDriveObstacle, propKey, propReach, type PosedBox } from '../mapgen';
import { isCliff, tileSlope, TYPE_IDS, type BakedMap, type Terrain } from '../terrain';
import { hashId, hashRandom } from '../rng';
import type { Obstacle, Vehicle, World } from '../types';
import { isTerritory, siteGap, type Site } from '../sites';
import type { Vec } from '../vec';
import { ObstacleBuckets, type Blocker } from './buckets';
import { buildPieces, cellOfFine, cellWindow, ensureAll, ensureCell, ensureFine, loadPieces, newGrid, pieceTable, regionAt, type CellGrid, type CellSource, type PieceTable, type Window } from './cells';
import { ObstacleCache } from './obstacle-cache';

export const CELL = 0.5;
export const CLEARANCE = 0.4;
const SIDE = REGION.navigation.cellTiles / CELL;
const MAX_GROW = Math.max(...Object.values(CHASSIS).map((c) => c.radius)) + CLEARANCE;

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

export type NavLayer = TerrainNav & {
  id: number;
  radius: number;
  marks: Uint8Array;
  blocked: Uint8Array;
  grid: CellGrid;
  cells: CellSource;
  statics: StaticSet;
};

export type StaticSet = { id: number; solidId: number; solid: Blocker[]; costly: Blocker[]; costlyKeys: Set<string>; buckets: ObstacleBuckets; solidBuckets: ObstacleBuckets; costlyBuckets: ObstacleBuckets; solidBins: Blocker[][]; costlyBins: Blocker[][]; solidKeys: Uint32Array };

export function isTransientWreck(o: Obstacle): boolean {
  return o.kind === 'wreck' && o.id.startsWith('wreck');
}

type TerrainEntry = { nav: TerrainNav; layers: Map<string, NavLayer>; tileKeys: Uint32Array | null; summary: RouteSummary | null };
const terrains = new WeakMap<Terrain, TerrainEntry>();
let nextLayerId = 1;

function terrainEntry(t: Terrain) {
  let e = terrains.get(t);
  if (!e) {
    const n = Math.ceil(t.size / CELL);
    const tiles = tileLayers(t);
    const slow = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) slow[y * n + x] = tiles.tileCost[tileIndex(t.size, (x + 0.5) * CELL, (y + 0.5) * CELL)];
    e = { nav: { size: t.size, n, ...tiles, slow, decks: atlasOf(t).decks, climbShares: new Map() }, layers: new Map(), tileKeys: null, summary: t.routes ? readSummary(t, t.routes) : null };
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
  const bySite = bySiteTiles(t.size, atlasSites(atlasOf(t)).filter((s) => !isTerritory(s)));
  for (let i = 0; i < t.size * t.size; i++) {
    cliffTile[i] = isCliff(t, i) ? 1 : 0;
    const slope = tileSlope(t, i);
    const grade = Math.hypot(slope.x, slope.y);
    steep[i] = grade;
    flatCost[i] = routeCost(t.types[i], bySite[i] === 1);
    tileCost[i] = flatCost[i] * slopeCost(grade);
    roadTile[i] = t.types[i] === 'road' && bySite[i] === 0 ? 1 : 0;
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

function slopeCost(grade: number): number {
  return 1 + REGION.navigation.slopeCost * (grade / TERRAIN.drive.maxSlope) ** 2;
}

function bySiteTiles(size: number, sites: readonly Site[]): Uint8Array {
  const near = new Uint8Array(size * size);
  const p = { x: 0, y: 0 };
  for (const s of sites) {
    const box = siteBox(s, REGION.roadWidth + 1);
    for (let y = Math.max(0, box.y0); y <= Math.min(size - 1, box.y1); y++)
      for (let x = Math.max(0, box.x0); x <= Math.min(size - 1, box.x1); x++) {
        p.x = x + 0.5;
        p.y = y + 0.5;
        if (siteGap(s, p) < REGION.roadWidth) near[y * size + x] = 1;
      }
  }
  return near;
}

function siteBox(s: Site, grow: number): { x0: number; y0: number; x1: number; y1: number } {
  const points = 'outline' in s && s.outline ? s.outline : [{ x: -s.radius, y: -s.radius }, { x: s.radius, y: s.radius }];
  const xs = points.map((q) => s.pos.x + q.x);
  const ys = points.map((q) => s.pos.y + q.y);
  return { x0: Math.floor(Math.min(...xs) - grow), y0: Math.floor(Math.min(...ys) - grow), x1: Math.ceil(Math.max(...xs) + grow), y1: Math.ceil(Math.max(...ys) + grow) };
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
  const m = cellsPerSide(terrain.size);
  const solidBins = binned(solid, m);
  return {
    id: keyId(blockerKey(all)),
    solidId: keyId(blockerKey(solid)),
    solid,
    costly,
    costlyKeys: new Set(costly.map(blockerKey1)),
    buckets: new ObstacleBuckets(all, terrain.size),
    solidBuckets: new ObstacleBuckets(solid, terrain.size),
    costlyBuckets: new ObstacleBuckets(costly, terrain.size),
    solidBins,
    costlyBins: binned(costly, m),
    solidKeys: Uint32Array.from(solidBins, (bin) => bin.reduce((sum, o) => (sum + hash32(blockerKey1(o))) >>> 0, 0)),
  };
}

function cellsPerSide(size: number): number {
  return Math.ceil(Math.ceil(size / CELL) / SIDE);
}

function binned(blockers: Blocker[], m: number): Blocker[][] {
  const bins: Blocker[][] = Array.from({ length: m * m }, () => []);
  const span = SIDE * CELL;
  const at = (v: number) => Math.min(m - 1, Math.max(0, Math.floor(v / span)));
  for (const o of blockers) {
    const box = reachBox(o);
    for (let y = at(box.y0); y <= at(box.y1); y++) for (let x = at(box.x0); x <= at(box.x1); x++) bins[y * m + x].push(o);
  }
  return bins;
}

function reachBox(o: Blocker): Window {
  if (!o.prop) return { x0: o.pos.x - o.r - MAX_GROW, y0: o.pos.y - o.r - MAX_GROW, x1: o.pos.x + o.r + MAX_GROW, y1: o.pos.y + o.r + MAX_GROW };
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const b of o.prop.boxes) {
    const [ex, ey] = boxExtent(b, MAX_GROW);
    box.x0 = Math.min(box.x0, b.center.x - ex);
    box.y0 = Math.min(box.y0, b.center.y - ey);
    box.x1 = Math.max(box.x1, b.center.x + ex);
    box.y1 = Math.max(box.y1, b.center.y + ey);
  }
  return box;
}

function hash32(text: string): number {
  return Math.floor(hashId(text) * 0x100000000) >>> 0;
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
  const key = `${statics.solidId}:${radius}`;
  const hit = e.layers.get(key);
  if (hit) {
    e.layers.delete(key);
    e.layers.set(key, hit);
    if (hit.statics !== statics) timed('nav-sync', () => restampCostly(hit, statics));
    return hit;
  }
  const layer = timed('nav-layer', () => newLayer(e, terrain, statics, radius));
  e.layers.set(key, layer);
  if (e.layers.size > LAYERS_KEPT) e.layers.delete(e.layers.keys().next().value!);
  return layer;
}

const LAYERS_KEPT = 16;

function newLayer(e: TerrainEntry, terrain: Terrain, statics: StaticSet, radius: number): NavLayer {
  if (radius + CLEARANCE > MAX_GROW) throw new Error(`Radius ${radius} is wider than the widest chassis the route cells hold`);
  const nav = e.nav;
  const grid = newGrid(nav.n, SIDE, COARSE);
  const blocked = new Uint8Array(nav.n * nav.n);
  const layer: NavLayer = { ...nav, id: nextLayerId++, radius, blocked, marks: new Uint8Array(nav.n * nav.n), grid, statics, cells: { grid, blocked, slowOf: () => 0, fill: () => {} } };
  layer.cells = { grid, blocked, slowOf: (c) => markedSlow(layer, c), fill: (cell) => fillCell(layer, cell) };
  const baked = e.summary?.pieces.get(radius);
  if (!baked) {
    buildPieces(layer.cells, Array.from({ length: grid.m * grid.m }, (_, cell) => cell));
    return layer;
  }
  loadPieces(grid, baked);
  const dirty = changedCells(cellKeys(e, terrain, statics), e.summary!.keys);
  if (dirty.length > 0) buildPieces(layer.cells, dirty);
  return layer;
}

function changedCells(now: Uint32Array, then: Uint32Array): number[] {
  if (now.length !== then.length) throw new Error(`Route cell keys cover ${now.length} cells, the summary covers ${then.length}`);
  const out: number[] = [];
  for (let i = 0; i < now.length; i++) if (now[i] !== then[i]) out.push(i);
  return out;
}

function fillCell(layer: NavLayer, cell: number): void {
  const w = cellWindow(layer.grid, cell);
  const n = layer.n;
  for (let y = w.y0; y <= w.y1; y++) {
    layer.blocked.fill(0, y * n + w.x0, y * n + w.x1 + 1);
    layer.marks.fill(0, y * n + w.x0, y * n + w.x1 + 1);
  }
  const reach = layer.radius + CLEARANCE;
  markCliffCells(layer, reach, w);
  for (const box of layer.decks.boxes) markRailCells(layer, box, reach, w);
  stampBlockers(n, layer.statics.solidBins[cell], layer.radius, (c) => (layer.blocked[c] = 1), w);
  stampBlockers(n, layer.statics.costlyBins[cell], layer.radius, (c) => (layer.marks[c] = 1), w);
}

function restampCostly(layer: NavLayer, statics: StaticSet): void {
  const was = layer.statics;
  layer.statics = statics;
  layer.id = nextLayerId++;
  const changed = [...was.costly.filter((o) => !statics.costlyKeys.has(blockerKey1(o))), ...statics.costly.filter((o) => !was.costlyKeys.has(blockerKey1(o)))];
  if (changed.length === 0) return;
  const touched = remark(layer, statics, changed);
  const regions = new Set([...touched].map((c) => regionAt(layer.grid, c)).filter((r) => r !== 0));
  for (const r of regions) layer.grid.regions.slow[r] = regionMean(layer, r);
}

function remark(layer: NavLayer, statics: StaticSet, changed: Blocker[]): Set<number> {
  const g = layer.grid;
  const touched = new Set<number>();
  stampBlockers(layer.n, changed, layer.radius, (c) => g.built[cellOfFine(g, c)] === 1 && touched.add(c));
  const grow = layer.radius + CLEARANCE;
  for (const c of touched) layer.marks[c] = 0;
  for (const o of changed) {
    const near = statics.costlyBuckets.alongSegment(o.pos, o.pos, o.r + 2 * grow + CELL);
    stampBlockers(layer.n, near, layer.radius, (c) => touched.has(c) && (layer.marks[c] = 1));
  }
  return touched;
}

function regionMean(layer: NavLayer, r: number): number {
  const g = layer.grid;
  const block = g.regions.block[r];
  const x0 = (block % g.bn) * COARSE;
  const y0 = Math.floor(block / g.bn) * COARSE;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < Math.min(layer.n, y0 + COARSE); y++)
    for (let x = x0; x < Math.min(layer.n, x0 + COARSE); x++) {
      const c = y * layer.n + x;
      if (regionAt(g, c) !== r) continue;
      sum += markedSlow(layer, c);
      count++;
    }
  return sum / count;
}

function markCliffCells(layer: NavLayer, reach: number, w: Window): void {
  const s = layer.size;
  const tiles = layer.cliffTile;
  const tile = (i: number, shift: number) => Math.min(s - 1, Math.max(0, Math.floor((i + 0.5) * CELL + shift)));
  for (let y = w.y0; y <= w.y1; y++) {
    const row = tile(y, 0) * s;
    const rowAhead = tile(y, reach) * s;
    const rowBehind = tile(y, -reach) * s;
    for (let x = w.x0; x <= w.x1; x++) {
      const col = tile(x, 0);
      layer.blocked[y * layer.n + x] = tiles[row + col] | tiles[row + tile(x, reach)] | tiles[row + tile(x, -reach)] | tiles[rowAhead + col] | tiles[rowBehind + col];
    }
  }
}

function markRailCells(layer: NavLayer, box: { minX: number; maxX: number; minY: number; maxY: number }, reach: number, w: Window): void {
  const x0 = Math.max(w.x0, Math.floor((box.minX - reach) / CELL));
  const x1 = Math.min(w.x1, Math.ceil((box.maxX + reach) / CELL));
  const y0 = Math.max(w.y0, Math.floor((box.minY - reach) / CELL));
  const y1 = Math.min(w.y1, Math.ceil((box.maxY + reach) / CELL));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (nearRail(layer.decks, (x + 0.5) * CELL, (y + 0.5) * CELL, reach)) layer.blocked[y * layer.n + x] = 1;
}

const KEY_MARGIN = Math.ceil(MAX_GROW) + 1;

function cellKeys(e: TerrainEntry, terrain: Terrain, statics: StaticSet): Uint32Array {
  const tiles = tileKeys(e, terrain);
  return tiles.map((k, i) => (Math.imul(k, 31) + statics.solidKeys[i]) >>> 0);
}

function tileKeys(e: TerrainEntry, t: Terrain): Uint32Array {
  if (e.tileKeys) return e.tileKeys;
  const m = cellsPerSide(t.size);
  const span = SIDE * CELL;
  const code = new Map(TYPE_IDS.map((id, i) => [id, i]));
  const types = Uint8Array.from(t.types, (id) => code.get(id)!);
  const corners = t.size + 1;
  const keys = new Uint32Array(m * m);
  for (let cy = 0; cy < m; cy++)
    for (let cx = 0; cx < m; cx++) {
      const x0 = Math.max(0, cx * span - KEY_MARGIN);
      const x1 = Math.min(t.size - 1, (cx + 1) * span - 1 + KEY_MARGIN);
      let h = 2166136261;
      for (let y = Math.max(0, cy * span - KEY_MARGIN); y <= Math.min(t.size - 1, (cy + 1) * span - 1 + KEY_MARGIN); y++)
        for (let x = x0; x <= x1; x++) {
          h = Math.imul(h ^ types[y * t.size + x], 16777619);
          h = Math.imul(h ^ Math.round(t.heights[y * corners + x] * 1024), 16777619);
        }
      keys[cy * m + cx] = h >>> 0;
    }
  e.tileKeys = keys;
  return keys;
}

type RouteSummary = { keys: Uint32Array; pieces: Map<number, PieceTable> };
type SummaryHeader = { version: number; map: string; size: number; atlas: string; rules: number; radii: number[]; cells: number };
const SUMMARY_VERSION = 2;

function rulesKey(t: Terrain): number {
  const atlas = atlasOf(t);
  const nav = REGION.navigation;
  const sites = atlasSites(atlas).map((s) => [s.id, s.pos.x, s.pos.y, s.radius]);
  return hash32(JSON.stringify({ CELL, CLEARANCE, COARSE, SIDE, MAX_GROW, nav: [nav.offRoadCost, nav.slopeCost], road: REGION.roadWidth, terrain: TERRAIN, types: TERRAIN_TYPES, cost: BREAKABLE.routeCost, sites, decks: atlas.decks.boxes }));
}

function summaryHeader(t: Terrain, map: string, radii: number[]): SummaryHeader {
  return { version: SUMMARY_VERSION, map, size: t.size, atlas: JSON.stringify(t.atlas), rules: rulesKey(t), radii, cells: cellsPerSide(t.size) ** 2 };
}

function headerOf(bytes: Uint8Array): { header: SummaryHeader; headerBytes: number } {
  const headerBytes = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  return { header: JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerBytes))) as SummaryHeader, headerBytes };
}

export function withRoutes(map: BakedMap, bytes: Uint8Array): BakedMap {
  const { header } = headerOf(bytes);
  if (header.map !== map.hash) throw new Error(`The route summary was baked for map ${header.map}, this map is ${map.hash}. Run npm run routes:bake.`);
  return { ...map, terrain: Object.freeze({ ...map.terrain, routes: bytes }) };
}

function readSummary(t: Terrain, bytes: Uint8Array): RouteSummary {
  const buffer = bytes.slice().buffer;
  const view = new DataView(buffer);
  const { header, headerBytes } = headerOf(bytes);
  const want = summaryHeader(t, header.map, header.radii);
  for (const key of ['version', 'size', 'atlas', 'rules', 'cells'] as const) if (header[key] !== want[key]) throw new Error(`The route summary was baked for another ${key}. Run npm run routes:bake.`);
  let at = aligned(4 + headerBytes);
  const take = <T extends Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array>(Kind: { new (b: ArrayBuffer, o: number, l: number): T; BYTES_PER_ELEMENT: number }, length: number): T => {
    const out = new Kind(buffer, at, length);
    at = aligned(at + length * Kind.BYTES_PER_ELEMENT);
    return out;
  };
  const keys = take(Uint32Array, header.cells);
  const pieces = new Map<number, PieceTable>();
  for (const radius of header.radii) {
    const [portals, tri] = [view.getUint32(at, true), view.getUint32(at + 4, true)];
    at += 8;
    pieces.set(radius, { counts: take(Uint16Array, header.cells), a: take(Int32Array, portals), b: take(Int32Array, portals), ra: take(Uint16Array, portals), rb: take(Uint16Array, portals), x: take(Float32Array, portals), y: take(Float32Array, portals), tri: take(Float32Array, tri) });
  }
  if (at !== buffer.byteLength) throw new Error(`The route summary has ${buffer.byteLength - at} bytes left over`);
  return { keys, pieces };
}

function aligned(at: number): number {
  return Math.ceil(at / 4) * 4;
}

export function bakeRouteSummary(map: BakedMap, obstacles: Obstacle[], radii: number[]): Uint8Array {
  const plain: Terrain = { ...map.terrain, routes: undefined };
  const e = terrainEntry(plain);
  const parts: ArrayBufferView[] = [cellKeys(e, plain, staticSet(obstacles, plain))];
  for (const radius of radii) {
    const table = pieceTable(navLayer(plain, obstacles, radius).grid);
    e.layers.clear();
    parts.push(Uint32Array.of(table.a.length, table.tri.length), table.counts, table.a, table.b, table.ra, table.rb, table.x, table.y, table.tri);
  }
  const header = new TextEncoder().encode(JSON.stringify(summaryHeader(plain, map.hash, radii)));
  const sizes = parts.map((p) => aligned(p.byteLength));
  const out = new Uint8Array(aligned(4 + header.length) + sizes.reduce((a, b) => a + b, 0));
  new DataView(out.buffer).setUint32(0, header.length, true);
  out.set(header, 4);
  let at = aligned(4 + header.length);
  parts.forEach((p, i) => {
    out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), at);
    at += sizes[i];
  });
  return out;
}

export function slowAt(layer: NavLayer, c: number): number {
  ensureFine(layer.cells, c);
  return markedSlow(layer, c);
}

function markedSlow(layer: NavLayer, c: number): number {
  return layer.marks[c] === 1 ? Math.fround(layer.slow[c] * BREAKABLE.routeCost) : layer.slow[c];
}

export function stampBlockers(n: number, blockers: Blocker[], radius: number, mark: (cell: number) => void, w: Window = { x0: 0, y0: 0, x1: n - 1, y1: n - 1 }): void {
  const grow = radius + CLEARANCE;
  for (const o of blockers) {
    if (!o.prop) {
      stampCircle(w, n, o.pos, o.r + grow, mark);
      continue;
    }
    for (const box of o.prop.boxes) stampWithin(w, n, box.center, ...boxExtent(box, grow), (p) => boxDistance(box, p) < grow, mark);
  }
}

function stampCircle(w: Window, n: number, center: Vec, reach: number, mark: (cell: number) => void): void {
  const x0 = Math.max(w.x0, Math.floor((center.x - reach) / CELL));
  const y0 = Math.max(w.y0, Math.floor((center.y - reach) / CELL));
  const x1 = Math.min(w.x1, Math.floor((center.x + reach) / CELL));
  const y1 = Math.min(w.y1, Math.floor((center.y + reach) / CELL));
  for (let x = x0; x <= x1; x++) {
    const dx = center.x - (x + 0.5) * CELL;
    for (let y = y0; y <= y1; y++) if (Math.hypot(dx, center.y - (y + 0.5) * CELL) < reach) mark(y * n + x);
  }
}

function boxExtent(box: PosedBox, grow: number): [number, number] {
  const ax = Math.abs(box.axis.x);
  const ay = Math.abs(box.axis.y);
  return [ax * box.half.x + ay * box.half.y + grow, ay * box.half.x + ax * box.half.y + grow];
}

function stampWithin(w: Window, n: number, center: Vec, ex: number, ey: number, inside: (p: Vec) => boolean, mark: (cell: number) => void): void {
  const x0 = Math.max(w.x0, Math.floor((center.x - ex) / CELL));
  const y0 = Math.max(w.y0, Math.floor((center.y - ey) / CELL));
  const x1 = Math.min(w.x1, Math.floor((center.x + ex) / CELL));
  const y1 = Math.min(w.y1, Math.floor((center.y + ey) / CELL));
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
  ensureFine(layer.cells, cell);
  const r = regionAt(layer.grid, cell);
  return r === 0 ? 0 : layer.grid.pieces.comp[layer.grid.regions.piece[r]];
}

export function blockedAt(layer: NavLayer, cell: number): boolean {
  ensureFine(layer.cells, cell);
  return layer.blocked[cell] === 1;
}

export function prepareRouteTerrain(terrain: Terrain): void {
  tileKeys(terrainEntry(terrain), terrain);
}

export function buildEveryCell(layer: NavLayer): void {
  ensureAll(layer.cells);
}

export function buildCellsAround(terrain: Terrain, center: Vec, until: number): boolean {
  const layers = terrains.get(terrain)?.layers;
  if (!layers) return false;
  for (const layer of layers.values()) if (!buildNearest(layer, center, until)) return true;
  return false;
}

function buildNearest(layer: NavLayer, center: Vec, until: number): boolean {
  const g = layer.grid;
  const span = SIDE * CELL;
  const cx = Math.min(g.m - 1, Math.max(0, Math.floor(center.x / span)));
  const cy = Math.min(g.m - 1, Math.max(0, Math.floor(center.y / span)));
  for (let ring = 0; ring < g.m; ring++)
    for (const cell of ringCells(g.m, cx, cy, ring)) {
      if (g.built[cell] === 1) continue;
      if (performance.now() >= until) return false;
      ensureCell(layer.cells, cell);
    }
  return true;
}

function ringCells(m: number, cx: number, cy: number, ring: number): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, cy - ring); y <= Math.min(m - 1, cy + ring); y++)
    for (let x = Math.max(0, cx - ring); x <= Math.min(m - 1, cx + ring); x++) if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === ring) out.push(y * m + x);
  return out;
}

export const NO_CLIMB = 255;
const STEEP_TOLERANCE = 1e-4;
const CLIMB_NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const climbNeeds = new WeakMap<NavLayer, Uint8Array>();

export function climbNeed(layer: NavLayer): Uint8Array {
  const hit = climbNeeds.get(layer);
  if (hit) return hit;
  ensureAll(layer.cells);
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

const CLIMB_SHARES_KEPT = 16;

function blockOverClimb(nav: TerrainNav, climb: number): Float32Array {
  const cached = nav.climbShares.get(climb);
  if (cached) return cached;
  if (nav.climbShares.size >= CLIMB_SHARES_KEPT) nav.climbShares.clear();
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
