
import { MAP_DRAFT, REGION } from '../data/region';
import { DESERT, GEOLOGY, MAPGEN, TERRAIN, type TerrainTypeId } from '../data/terrain';
import { ZONE_KINDS, zoneWeight } from '../sim/zones';
import { bridgeCut, deckAt, ICARUS_DECKS } from '../sim/bridge';
import { ICARUS_KEY, icarusAtlas } from '../sim/atlas';
import { bakedHeight, broadAt, flattenFactor, reliefAt } from '../sim/elevation';
import { gradeRoads } from '../sim/road-grade';
import { ROAD_INDEX } from '../sim/road-index';
import { chance, randRange, type Rng } from '../sim/rng';
import { BUILT_BLACK_MUD, BUILT_DITCH, BUILT_CANAL, BUILT_FIELD, BUILT_GLASS, BUILT_OLD_ROAD, BUILT_PAD, BUILT_DIRTY_WATER, BUILT_SCRUB, BUILT_TOXIC, BUILT_TRACK, groundAt, TYPE_IDS, type BakedProp } from '../sim/terrain';
import { clearOfSites, onDeck } from '../sim/mapgen';
import { siteGap } from '../sim/sites';
import { dist, polylineDist, type Vec } from '../sim/vec';
import { newWorldLayer } from './newworld';
import { apronLayer } from './apron';
import { desertLayer } from './desert';
import { exitLayer } from './exits';
import { farmBeltLayer } from './farmbelt';
import { zoneReport } from './report';
import { fillGlassTrail } from './glass';
import { swampLayer } from './swamp';
import { oldWorldLayer, tilesWithin, washTile } from './oldworld';
import { fortressLayer } from './fortress';
import { stampTerritoryGround } from './ground-stamps';
import { keepStartClear } from './start-ground';
import { boatLayer } from './boats';
import { roadsideLayer } from './roadside';
import { reserveSpurs, territoryLayer } from './territory';
import { cornerNeighbors, geologyLayer, pondDepths, type Neighbors } from './geology';

export function bakeMap(seed: number): MapDraft {
  let d = groundForTerritories(seed);
  d = timed('territories', () => territoryLayer(seed, d));
  d = timed('glass trail', () => fillGlassTrail(seed, d));
  d = timed('ground', () => groundLayer(seed, d));
  d = detailed('rocks', d, () => rockLayer(seed, d));
  d = timed('apron', () => apronLayer(seed, d));
  d = timed('fortresses', () => fortressLayer(d));
  d = timed('start', () => keepStartClear(d));
  d = detailed('roadside', d, () => roadsideLayer(seed, d));
  d = detailed('boats', d, () => boatLayer(seed, d));
  d = timed('exits around props', () => exitLayer(d));
  const misses = zoneReport(seed, d);
  if (misses.length > 0) throw new Error(`The bake misses its zone checks:\n${misses.join('\n')}`);
  return d;
}

function detailed(layer: string, d: MapDraft, run: () => MapDraft): MapDraft {
  if (MAP_DRAFT === null) return timed(layer, run);
  console.log(`${layer}: left out of the draft`);
  return d;
}

export function groundForTerritories(seed: number): MapDraft {
  let d = timed('base', () => baseLayer(seed, REGION.size));
  d = detailed('geology', d, () => geologyLayer(seed, d));
  d = timed('territory ground', () => stampTerritoryGround(d));
  d = timed('finish', () => finishLayer(seed, d));
  d = timed('desert', () => desertLayer(seed, d));
  d = timed('swamp', () => swampLayer(seed, d));
  d = timed('spurs', () => reserveSpurs(d));
  d = timed('farm belt', () => farmBeltLayer(seed, d));
  d = timed('exits', () => exitLayer(d));
  d = timed('old world', () => oldWorldLayer(seed, d));
  return timed('new world', () => newWorldLayer(seed, d));
}

function timed(layer: string, run: () => MapDraft): MapDraft {
  const start = performance.now();
  const d = run();
  console.log(`${layer}: ${Math.round(performance.now() - start)} ms`);
  return d;
}

export type MapDraft = {
  size: number;
  heights: Float32Array;
  types: Uint8Array;
  props: BakedProp[];
  sand: Float32Array;
  flow: Float32Array;
  slumped: Uint8Array;
  built: Uint8Array;
};

export function newDraft(size: number): MapDraft {
  if (!Number.isInteger(size) || size <= 0) throw new Error(`Map size must be a positive integer, got ${size}`);
  const corners = (size + 1) * (size + 1);
  return {
    size,
    heights: new Float32Array(corners),
    types: new Uint8Array(size * size),
    props: [],
    sand: new Float32Array(corners),
    flow: new Float32Array(corners),
    slumped: new Uint8Array(corners),
    built: new Uint8Array(size * size),
  };
}

export function typeCode(id: TerrainTypeId): number {
  const code = TYPE_IDS.indexOf(id);
  if (code < 0) throw new Error(`Unknown ground type ${id}`);
  return code;
}

export function tileSteepness(heights: ArrayLike<number>, size: number, tile: number): number {
  const i = tile % size;
  const j = Math.floor(tile / size);
  const w = size + 1;
  const a = heights[j * w + i];
  const b = heights[j * w + i + 1];
  const c = heights[(j + 1) * w + i];
  const d = heights[(j + 1) * w + i + 1];
  return Math.hypot((b - a + d - c) / 2, (c - a + d - b) / 2);
}

export function footprintRelief(heights: ArrayLike<number>, size: number, p: BakedProp, segment: boolean): number {
  const t = { size, heights };
  const seat = groundAt(t, p.pos.x, p.pos.y);
  const angles = segment ? [p.yaw, p.yaw + Math.PI] : Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);
  return Math.max(...angles.map((a) => Math.abs(groundAt(t, p.pos.x + Math.cos(a) * p.r, p.pos.y + Math.sin(a) * p.r) - seat)));
}

export function baseLayer(seed: number, size: number): MapDraft {
  const d = newDraft(size);
  for (let j = 0; j <= size; j++) for (let i = 0; i <= size; i++) d.heights[j * (size + 1) + i] = bakedHeight(seed, reliefAt(seed, i, j) + broadAt(seed, i, j), i, j);
  return d;
}

export function finishLayer(seed: number, d: MapDraft): MapDraft {
  const w = d.size + 1;
  for (let j = 0; j <= d.size; j++) for (let i = 0; i <= d.size; i++) {
    const flatten = flattenFactor(i, j) * (1 - bridgeCut(ICARUS_DECKS, i, j));
    if (flatten === 0) continue;
    const k = j * w + i;
    d.heights[k] += (bakedHeight(seed, broadAt(seed, i, j), i, j) - d.heights[k]) * flatten;
  }
  d.heights.set(gradeRoads({ size: d.size, heights: Array.from(d.heights), types: [], atlas: ICARUS_KEY }));
  return d;
}

const SITES = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== 'territory')];
const T = TERRAIN.types;
const G = GEOLOGY.ground;

type GroundInput = { seed: number; d: MapDraft; pond: Float32Array };

type GroundRule = (g: GroundInput, tile: number, k: number) => TerrainTypeId | null;

export function groundLayer(seed: number, d: MapDraft): MapDraft {
  const g: GroundInput = { seed, d, pond: drainChannels(pondDepths(d.heights, d.size, G.lakeDepth), d.size) };
  for (let y = 0; y < d.size; y++) for (let x = 0; x < d.size; x++) d.types[y * d.size + x] = typeCode(pickType(g, x, y));
  return d;
}

const MARKED_TYPES: Record<number, TerrainTypeId> = {
  [BUILT_OLD_ROAD]: 'asphalt',
  [BUILT_FIELD]: 'field',
  [BUILT_SCRUB]: 'scrub',
  [BUILT_DIRTY_WATER]: 'dirtyWater',
  [BUILT_TOXIC]: 'toxic',
  [BUILT_TRACK]: 'track',
  [BUILT_CANAL]: 'canal',
  [BUILT_PAD]: 'concrete',
  [BUILT_GLASS]: 'glass',
  [BUILT_BLACK_MUD]: 'blackMud',
  [BUILT_DITCH]: 'sand',
};

function pickType(g: GroundInput, x: number, y: number): TerrainTypeId {
  const c = { x: x + 0.5, y: y + 0.5 };
  const built = builtType(c);
  if (built) return built;
  const tile = y * g.d.size + x;
  const marked = MARKED_TYPES[g.d.built[tile]];
  if (marked) return marked;
  const k = y * (g.d.size + 1) + x;
  for (const rule of GEOLOGY_RULES) {
    const type = rule(g, tile, k);
    if (type) return type;
  }
  return 'hardpan';
}

function drainChannels(pond: Float32Array, size: number): Float32Array {
  const n = size + 1;
  const channels = [TERRAIN.features.canyon, TERRAIN.features.dryRiver, TERRAIN.features.trench];
  for (let k = 0; k < pond.length; k++) {
    if (pond[k] === 0) continue;
    const p = { x: k % n, y: Math.floor(k / n) };
    if (channels.some((c) => polylineDist(p, c.path) <= c.width + c.bank / 2)) pond[k] = 0;
  }
  return pond;
}

function builtType(c: Vec): TerrainTypeId | null {
  if (deckAt(ICARUS_DECKS, c.x, c.y) !== null) return 'road';
  if (ROAD_INDEX.nearestWithin(c.x, c.y, REGION.roadWidth / 2) < REGION.roadWidth / 2) return 'road';
  return SITES.some((s) => siteGap(s, c) < T.siteMargin) ? 'hardpan' : null;
}

function screeType(g: GroundInput, tile: number, k: number): TerrainTypeId | null {
  if (tileSteepness(g.d.heights, g.d.size, tile) >= T.screeSlope) return 'scree';
  return cornerMax(g.d.slumped, g.d.size, k) > 0 ? 'scree' : null;
}

function pondType(g: GroundInput, _tile: number, k: number): TerrainTypeId | null {
  const n = g.d.size + 1;
  if (zoneWeight('desert', k % n, Math.floor(k / n)) > DESERT.pondless) return null;
  const depth = cornerMax(g.pond, g.d.size, k);
  if (depth >= G.mudDepth) return 'mud';
  return depth >= G.saltDepth ? 'saltCrust' : null;
}

function washType(g: GroundInput, tile: number): TerrainTypeId | null {
  if (!washTile(g.d, tile)) return null;
  return tileSteepness(g.d.heights, g.d.size, tile) >= G.gravelSlope ? 'gravel' : 'sand';
}

function sandType(g: GroundInput, _tile: number, k: number): TerrainTypeId | null {
  return cornerMean(g.d.sand, g.d.size, k) >= G.looseSand ? 'sand' : null;
}

function wingSandType(g: GroundInput, _tile: number, k: number): TerrainTypeId | null {
  const n = g.d.size + 1;
  const p = { x: (k % n) + 0.5, y: Math.floor(k / n) + 0.5 };
  const F = TERRAIN.features;
  if (F.mounds.some((m) => dist(p, m.center) <= m.radius + m.bank * 0.7)) return 'sand';
  if (dist(p, F.wing.pos) <= F.wing.r) return 'sand';
  return polylineDist(p, F.trench.path) <= F.trench.width ? 'sand' : null;
}

const GEOLOGY_RULES: GroundRule[] = [screeType, wingSandType, pondType, washType, sandType];

function cornerMax(a: ArrayLike<number>, size: number, k: number): number {
  const w = size + 1;
  return Math.max(a[k], a[k + 1], a[k + w], a[k + w + 1]);
}

function cornerMean(a: ArrayLike<number>, size: number, k: number): number {
  const w = size + 1;
  return (a[k] + a[k + 1] + a[k + w] + a[k + w + 1]) / 4;
}


const O = REGION.obstacles;
const B = GEOLOGY.boulders;
const BOULDER_FREE = new Set([BUILT_TRACK, BUILT_GLASS, BUILT_CANAL, BUILT_DITCH]);
const BOULDER_SLOPE_LIMIT = TERRAIN.drive.maxSlope - Math.SQRT2 / MAPGEN.heightScale;

export function rockLayer(seed: number, d: MapDraft): MapDraft {
  const rng: Rng = { rngState: seed };
  const n = d.size + 1;
  const nb = cornerNeighbors(n);
  d.props = d.props.filter((p) => p.kind !== 'rock' && p.kind !== 'crag');
  for (let j = 1; j < d.size; j++) for (let i = 1; i < d.size; i++) {
    const spot = d.sand[j * n + i] >= G.looseSand ? null : boulderSpot(d.heights, nb, n, j * n + i);
    if (spot && chance(rng, spot.odds)) placeBoulder(d, rng, i, j, spot.kind);
  }
  return d;
}

type BoulderSpot = { odds: number; kind: 'rock' | 'crag' };

function boulderSpot(h: ArrayLike<number>, nb: Neighbors, n: number, k: number): BoulderSpot | null {
  if (isCliffBase(h, nb, k)) return { odds: B.cliffBase * zoneBoulderOdds(n, k), kind: 'rock' };
  if (!isRidgeTop(h, n, k)) return null;
  return { odds: B.ridgeTop * zoneBoulderOdds(n, k), kind: h[k] >= B.crag.above ? 'crag' : 'rock' };
}

export function zoneBoulderOdds(n: number, k: number): number {
  const x = k % n;
  const y = Math.floor(k / n);
  let owned = 0;
  let odds = 0;
  for (const kind of ZONE_KINDS) {
    const w = zoneWeight(kind, x, y);
    owned += w;
    odds += w * B.zoneOdds[kind];
  }
  return odds + Math.max(0, 1 - owned) * B.zoneOdds.plain;
}

function isCliffBase(h: ArrayLike<number>, nb: Neighbors, k: number): boolean {
  for (let q = 0; q < 8; q++) {
    if ((h[k + nb.offsets[q]] - h[k]) * nb.invDist[q] > TERRAIN.drive.maxSlope) return true;
  }
  return false;
}

function isRidgeTop(h: ArrayLike<number>, n: number, k: number): boolean {
  return bulges(h, k, 1, 1) || bulges(h, k, n, 1) || bulges(h, k, n + 1, 2) || bulges(h, k, n - 1, 2);
}

function bulges(h: ArrayLike<number>, k: number, o: number, spanSq: number): boolean {
  const a = h[k - o];
  const b = h[k + o];
  if (h[k] < a || h[k] < b) return false;
  return (h[k] - (a + b) / 2) / spanSq >= B.ridgeCurvature;
}

function placeBoulder(d: MapDraft, rng: Rng, i: number, j: number, kind: 'rock' | 'crag'): void {
  const pos = { x: i + randRange(rng, -0.5, 0.5), y: j + randRange(rng, -0.5, 0.5) };
  const [low, high] = kind === 'crag' ? B.crag.radius : B.radius;
  const r = randRange(rng, low, high);
  const yaw = kind === 'crag' ? randRange(rng, 0, Math.PI * 2) : 0;
  if (fitsOffRoad(d.size, d.heights, d.built, d.props, pos, r)) d.props.push({ kind, pos, r, yaw, group: 0, step: 0 });
}

function fitsOffRoad(size: number, heights: ArrayLike<number>, built: Uint8Array, placed: BakedProp[], pos: Vec, r: number): boolean {
  if (Math.min(pos.x, pos.y, size - pos.x, size - pos.y) < O.edgeMargin) return false;
  const roadGap = REGION.roadWidth / 2 + O.roadClearance + r;
  if (ROAD_INDEX.nearestWithin(pos.x, pos.y, roadGap) < roadGap) return false;
  return fitsGround(size, heights, built, pos, r) && !onDeck(icarusAtlas(), pos, r) && clearOfSites(icarusAtlas(), pos, r) && placed.every((o) => dist(pos, o.pos) >= o.r + r + O.gap);
}

function fitsGround(size: number, heights: ArrayLike<number>, built: Uint8Array, pos: Vec, r: number): boolean {
  const tile = Math.floor(pos.y) * size + Math.floor(pos.x);
  if ([tile, ...tilesWithin(size, pos, r)].some((k) => BOULDER_FREE.has(built[k]))) return false;
  return tileSteepness(heights, size, tile) <= BOULDER_SLOPE_LIMIT;
}
