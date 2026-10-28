
import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { TERRAIN_TYPES } from '../../data/terrain';
import { HIGHWAY } from '../../data/modes';
import { REGION } from '../../data/region';
import { SCATTER, type ScatterShare } from '../../data/view';
import { desertWeight, lookTypes, type LookType } from '../../render/groundPaint';
import { hash2, valueNoise } from '../../render/noise';
import { atlasOf, type Atlas } from '../../sim/atlas';
import { groundAt, type Terrain } from '../../sim/terrain';
import type { Obstacle } from '../../sim/types';
import type { Vec } from '../../sim/vec';
import { ZONE_KINDS, zoneWeight } from '../../sim/zones';
import { instancedModel } from './models';
import type { RenderScope } from './scope';
import { deckFloorCap, TERRAIN_CHUNK } from './terrain';

const S = PHYSICS.metersPerTile;
export const ROAD_GAP = REGION.roadWidth / 2 + 0.3;
export const SHOULDER_TILES = 2;
export const OBSTACLE_GAP = 0.5;
export const CACTUS_NEAR_ROCK = 2;
const PEBBLE_CHANCE = 0.3;
const PEBBLE_ON_DESERT = 0.45;
const PEBBLE_ON_SHOULDER = 0.6;
const SCRUB_ON_SCRUB = 0.45;
const SCRUB_ELSEWHERE = 0.04;
const SCRUB_ON_DESERT = 0.14;
const CACTUS_ON_DESERT = 0.01;
const CACTUS_BY_ROCK = 0.06;
const DEBRIS_CENTER = 0.03;
const DEBRIS_EDGE = 0.5;
const DEBRIS_SCRUB = 0.25;
const PEBBLE_RADIUS ={ min: 0.025, max: 0.045 };
const SCRUB_RADIUS = { min: 0.07, max: 0.12 };
const DESERT_STONES_RADIUS = { min: 0.07, max: 0.14 };
const DESERT_SCRUB_RADIUS = { min: 0.11, max: 0.17 };
const CACTUS_HEIGHT = { min: 0.8, max: 1.3 };
const TINT = { min: 0.85, max: 1.15 };

const MODELS = ['pebbles', 'scrub', 'desert_stones', 'desert_scrub', 'cactus'] as const;
type ScatterModel = (typeof MODELS)[number];
const CASTS_SHADOW: ReadonlySet<ScatterModel> = new Set(['desert_scrub', 'cactus']);

type Placed = { matrix: THREE.Matrix4; tint: number };
export type ScatterChunk = { center: Vec } & Record<ScatterModel, Placed[]>;

export function addScatter(t: Terrain, obstacles: Obstacle[], scope: RenderScope): void {
  const reach = (TERRAIN_CHUNK / 2) * Math.SQRT2 + 1;
  for (const chunk of scatterPlacements(t, obstacles)) {
    for (const name of MODELS) {
      const list = chunk[name];
      if (list.length === 0) continue;
      const group = instancedModel(name, list.map((p) => p.matrix), list.map((p) => p.tint));
      for (const mesh of group.children) {
        mesh.castShadow = CASTS_SHADOW.has(name);
        mesh.receiveShadow = true;
      }
      scope.add(group, chunk.center, reach);
    }
  }
}

export function scatterPlacements(t: Terrain, obstacles: Obstacle[]): ScatterChunk[] {
  const blocked = blockedTiles(t.size, obstacles);
  const rocky = rockyTiles(t.size, obstacles);
  const look = lookTypes(t);
  const chunks: ScatterChunk[] = [];
  for (let cy = 0; cy < t.size; cy += TERRAIN_CHUNK) for (let cx = 0; cx < t.size; cx += TERRAIN_CHUNK) chunks.push(chunkScatter(t, look, blocked, rocky, cx, cy));
  return chunks;
}

function chunkScatter(t: Terrain, look: readonly LookType[], blocked: Uint8Array, rocky: Uint8Array, cx: number, cy: number): ScatterChunk {
  const atlas = atlasOf(t);
  const highway = highwaySeed(t);
  const blocks = chunkBlocks(t, cx, cy);
  const chunk: ScatterChunk = { center: { x: cx + Math.min(TERRAIN_CHUNK, t.size - cx) / 2, y: cy + Math.min(TERRAIN_CHUNK, t.size - cy) / 2 }, pebbles: [], scrub: [], desert_stones: [], desert_scrub: [], cactus: [] };
  for (let y = cy; y < Math.min(cy + TERRAIN_CHUNK, t.size); y++) for (let x = cx; x < Math.min(cx + TERRAIN_CHUNK, t.size); x++) {
    const i = y * t.size + x;
    const model = blocked[i] ? null : tileModel(atlas, highway, blocks[blockOf(x - cx, y - cy)], look[i], x, y, rocky[i] === 1);
    if (model === null || onLoweredGround(t, x, y)) continue;
    chunk[model].push(placed(t, x, y, model));
  }
  return chunk;
}

function chunkBlocks(t: Terrain, cx: number, cy: number): (Block | null)[] {
  if (isZoned(t)) return blockShares(cx, cy);
  return new Array<null>(BLOCKS_PER_SIDE * BLOCKS_PER_SIDE).fill(null);
}

function highwaySeed(t: Terrain): number | null {
  return t.atlas.kind === 'highway' ? t.atlas.seed : null;
}

function isZoned(t: Terrain): boolean {
  if (t.atlas.kind === 'icarus') return true;
  if (t.atlas.kind === 'highway') return false;
  throw new Error(`Scatter has no density rules for map ${JSON.stringify(t.atlas)}`);
}

const BLOCKS_PER_SIDE = TERRAIN_CHUNK / SCATTER.block;

function blockOf(dx: number, dy: number): number {
  return Math.floor(dy / SCATTER.block) * BLOCKS_PER_SIDE + Math.floor(dx / SCATTER.block);
}

type Block = { share: ScatterShare; byLook: Map<LookType, LookOdds> };

function blockShares(cx: number, cy: number): Block[] {
  const blocks: Block[] = [];
  for (let j = 0; j < BLOCKS_PER_SIDE; j++) for (let i = 0; i < BLOCKS_PER_SIDE; i++) {
    blocks.push({ share: regionShare(cx + (i + 0.5) * SCATTER.block, cy + (j + 0.5) * SCATTER.block), byLook: new Map() });
  }
  return blocks;
}

function oddsIn(block: Block | null, look: LookType): LookOdds {
  if (block === null) return CHANCES[look];
  let odds = block.byLook.get(look);
  if (odds === undefined) {
    const base = CHANCES[look];
    odds = { open: regional(base.open, block.share), byRock: regional(base.byRock, block.share), shoulder: regional(base.shoulder, block.share) };
    block.byLook.set(look, odds);
  }
  return odds;
}

function tileModel(atlas: Atlas, highway: number | null, block: Block | null, look: LookType, x: number, y: number, byRock: boolean): ScatterModel | null {
  const p = tilePoint(x, y);
  const across = highway === null ? Infinity : atlas.roadIndex.nearestWithin(p.x, p.y, HIGHWAY.road.asphalt);
  if (across <= HIGHWAY.road.asphalt) return asphaltModel(across, highway ?? 0, x, y);
  const kind = tileScatter(atlas, oddsIn(block, look), x, y, byRock);
  return kind === null ? null : modelOf(kind, desertWeight(look) > 0);
}

function asphaltModel(across: number, seed: number, x: number, y: number): ScatterModel | null {
  const chance = DEBRIS_CENTER + (DEBRIS_EDGE - DEBRIS_CENTER) * (across / HIGHWAY.road.asphalt) ** 2;
  const h = hash2(x * 37 + 11 + seed, y * 41 + 13);
  if (h >= chance) return null;
  return modelOf(h < chance * (1 - DEBRIS_SCRUB) ? 'pebbles' : 'scrub', true);
}

const TILE_CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];

function drawnLower(t: Terrain, x: number, y: number, ground: number): boolean {
  const cap = deckFloorCap(t, x, y);
  return cap !== null && ground > cap;
}

export function onLoweredGround(t: Terrain, x: number, y: number): boolean {
  const p = tilePoint(x, y);
  if (drawnLower(t, p.x, p.y, groundAt(t, p.x, p.y))) return true;
  return TILE_CORNERS.some(([i, j]) => drawnLower(t, x + i, y + j, t.heights[(y + j) * (t.size + 1) + x + i]));
}

type ScatterKind = 'pebbles' | 'scrub' | 'cactus';

function modelOf(kind: ScatterKind, desert: boolean): ScatterModel {
  if (!desert || kind === 'cactus') return kind;
  return kind === 'pebbles' ? 'desert_stones' : 'desert_scrub';
}

function tileScatter(atlas: Atlas, odds: LookOdds, x: number, y: number, byRock: boolean): ScatterKind | null {
  const h = hash2(x * 7 + 3, y * 13 + 5);
  const open = byRock ? odds.byRock : odds.open;
  const shoulder = odds.shoulder;
  if (pick(h, open) === null && pick(h, shoulder) === null) return null;
  const p = tilePoint(x, y);
  const road = atlas.roadIndex.nearestWithin(p.x, p.y, ROAD_GAP + SHOULDER_TILES);
  return road < ROAD_GAP ? null : pick(h, road < ROAD_GAP + SHOULDER_TILES ? shoulder : open);
}

export function regionShare(cx: number, cy: number): ScatterShare {
  const R = SCATTER.regions;
  let owned = 0;
  let pebbles = 0;
  let scrub = 0;
  let cactus = 0;
  for (const kind of ZONE_KINDS) {
    const w = zoneWeight(kind, cx, cy);
    owned += w;
    pebbles += w * R[kind].pebbles;
    scrub += w * R[kind].scrub;
    cactus += w * R[kind].cactus;
  }
  const plain = Math.max(0, 1 - owned);
  const { frequency, depth, pebbleSeed, scrubSeed } = SCATTER.patch;
  const pebblePatch = 1 + depth * (2 * valueNoise(cx * frequency + pebbleSeed, cy * frequency + pebbleSeed) - 1);
  const scrubPatch = 1 + depth * (2 * valueNoise(cx * frequency + scrubSeed, cy * frequency + scrubSeed) - 1);
  return {
    pebbles: (pebbles + plain * R.plain.pebbles) * pebblePatch,
    scrub: (scrub + plain * R.plain.scrub) * scrubPatch,
    cactus: cactus + plain * R.plain.cactus,
  };
}

function regional(c: Chances, share: ScatterShare): Chances {
  return { pebbles: exposed(c.pebbles, share.pebbles), scrub: exposed(c.scrub, share.scrub), cactus: exposed(c.cactus, share.cactus) };
}

function exposed(odds: number, share: number): number {
  return odds === 0 || share === 1 ? odds : 1 - (1 - odds) ** share;
}

type Chances = { pebbles: number; scrub: number; cactus: number };
type LookOdds = { open: Chances; byRock: Chances; shoulder: Chances };

function chances(type: LookType, shoulder: boolean, byRock: boolean): Chances {
  if (type === 'glass') return { pebbles: 0, scrub: 0, cactus: 0 };
  const w = desertWeight(type);
  if (w === 0) return { pebbles: PEBBLE_CHANCE, scrub: SCRUB_ELSEWHERE, cactus: 0 };
  if (shoulder) return { pebbles: PEBBLE_ON_SHOULDER, scrub: 0, cactus: 0 };
  const scrub = type === 'scrub' ? SCRUB_ON_SCRUB : SCRUB_ELSEWHERE + (SCRUB_ON_DESERT - SCRUB_ELSEWHERE) * w;
  const pebbles = PEBBLE_CHANCE + (PEBBLE_ON_DESERT - PEBBLE_CHANCE) * w;
  return { pebbles, scrub, cactus: (byRock ? CACTUS_BY_ROCK : CACTUS_ON_DESERT) * w };
}

const CHANCES = Object.fromEntries(
  (Object.keys(TERRAIN_TYPES) as (keyof typeof TERRAIN_TYPES)[]).filter((type) => type !== 'road').map((type) => [
    type,
    { open: chances(type, false, false), byRock: chances(type, false, true), shoulder: chances(type, true, false) },
  ]),
) as Record<LookType, { open: Chances; byRock: Chances; shoulder: Chances }>;

function pick(h: number, c: Chances): ScatterKind | null {
  if (h < c.pebbles) return 'pebbles';
  if (h < c.pebbles + c.cactus) return 'cactus';
  return h > 1 - c.scrub ? 'scrub' : null;
}

function tilePoint(x: number, y: number): Vec {
  return { x: x + hash2(x, y * 3), y: y + hash2(x * 5, y) };
}

const place = new THREE.Object3D();

function placed(t: Terrain, x: number, y: number, kind: ScatterModel): Placed {
  const p = tilePoint(x, y);
  place.position.set(p.x * S, groundAt(t, p.x, p.y) * S, p.y * S);
  place.rotation.y = hash2(x * 19, y * 23 + 1) * Math.PI * 2;
  place.scale.setScalar(size(kind, hash2(x * 11 + 1, y * 17 + 9)));
  place.updateMatrix();
  return { matrix: place.matrix.clone(), tint: lerp(TINT, hash2(x * 29 + 4, y * 31)) };
}

const RADIUS: Record<Exclude<ScatterModel, 'cactus'>, { min: number; max: number }> = {
  pebbles: PEBBLE_RADIUS,
  scrub: SCRUB_RADIUS,
  desert_stones: DESERT_STONES_RADIUS,
  desert_scrub: DESERT_SCRUB_RADIUS,
};

function size(kind: ScatterModel, s: number): number {
  if (kind === 'cactus') return lerp(CACTUS_HEIGHT, s);
  return lerp(RADIUS[kind], s) * S;
}

function lerp(r: { min: number; max: number }, s: number): number {
  return r.min + (r.max - r.min) * s;
}

function blockedTiles(size: number, obstacles: Obstacle[]): Uint8Array {
  const out = new Uint8Array(size * size);
  for (const o of obstacles) markDisc(out, size, o.pos, o.r + OBSTACLE_GAP);
  return out;
}

function rockyTiles(size: number, obstacles: Obstacle[]): Uint8Array {
  const out = new Uint8Array(size * size);
  for (const o of obstacles) if (o.kind === 'rock' || (o.kind === 'landmark' && o.look === 'crag')) markDisc(out, size, o.pos, o.r + CACTUS_NEAR_ROCK);
  return out;
}

function markDisc(out: Uint8Array, size: number, at: Vec, r: number): void {
  for (let y = Math.max(0, Math.floor(at.y - r)); y <= Math.min(size - 1, Math.ceil(at.y + r)); y++) {
    for (let x = Math.max(0, Math.floor(at.x - r)); x <= Math.min(size - 1, Math.ceil(at.x + r)); x++) {
      if (Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y) <= r) out[y * size + x] = 1;
    }
  }
}
