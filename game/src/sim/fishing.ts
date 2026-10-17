import { FISHING } from '../data/fishing';
import { RULES } from '../data/rules';
import { TIME } from '../data/time';
import { idKey } from './detect';
import { playerVehicle } from './damage';
import { startJob } from './jobs';
import { practice } from './progress';
import { hashRandom } from './rng';
import { getResources } from './resources';
import { modeRules } from './settings';
import { suppliesCap } from './stats';
import type { Terrain } from './terrain';
import type { Job, Vehicle, World } from './types';
import type { Vec } from './vec';
import { playerCommand } from './world';

export type Pool = { id: string; tiles: number[]; capacity: number };
export type PoolIndex = { pools: Pool[]; byTile: Int32Array; byId: Map<string, Pool> };
export type FishAction = { pool: string; ready: boolean; full: boolean };

type FishJob = Extract<Job, { kind: 'fish' }>;

const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FISH_SALT = 0x66697368;

const indexes = new WeakMap<Terrain['types'], PoolIndex>();

export function poolIndexOf(terrain: Terrain): PoolIndex {
  const cached = indexes.get(terrain.types);
  if (cached) return cached;
  const built = buildIndex(terrain);
  indexes.set(terrain.types, built);
  return built;
}

function buildIndex(terrain: Terrain): PoolIndex {
  const { size, types } = terrain;
  const byTile = new Int32Array(size * size).fill(-1);
  const pools: Pool[] = [];
  const byId = new Map<string, Pool>();
  for (let start = 0; start < types.length; start++) {
    if (types[start] !== 'dirtyWater' || byTile[start] >= 0) continue;
    const tiles = flood(terrain, byTile, start, pools.length);
    const pool = { id: `pool-${start}`, tiles, capacity: Math.ceil(tiles.length * FISHING.fishPerTile) };
    pools.push(pool);
    byId.set(pool.id, pool);
  }
  return { pools, byTile, byId };
}

function flood(terrain: Terrain, byTile: Int32Array, start: number, label: number): number[] {
  const { size, types } = terrain;
  const tiles = [start];
  byTile[start] = label;
  for (let i = 0; i < tiles.length; i++) {
    const x = tiles[i] % size;
    const y = Math.floor(tiles[i] / size);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = ny * size + nx;
      if (types[next] !== 'dirtyWater' || byTile[next] >= 0) continue;
      byTile[next] = label;
      tiles.push(next);
    }
  }
  return tiles.sort((a, b) => a - b);
}

function rectDistance(pos: Vec, tile: number, size: number): number {
  const x = tile % size;
  const y = Math.floor(tile / size);
  return Math.hypot(Math.max(x - pos.x, 0, pos.x - (x + 1)), Math.max(y - pos.y, 0, pos.y - (y + 1)));
}

export function poolNear(world: World, pos: Vec): Pool | null {
  const index = poolIndexOf(world.terrain);
  const { size } = world.terrain;
  const cx = Math.floor(pos.x);
  const cy = Math.floor(pos.y);
  let best: Pool | null = null;
  let bestDist = Infinity;
  for (let y = Math.max(0, cy - FISHING.reach); y <= Math.min(size - 1, cy + FISHING.reach); y++)
    for (let x = Math.max(0, cx - FISHING.reach); x <= Math.min(size - 1, cx + FISHING.reach); x++) {
      const label = index.byTile[y * size + x];
      if (label < 0) continue;
      const d = rectDistance(pos, y * size + x, size);
      if (d <= FISHING.reach && d < bestDist) {
        best = index.pools[label];
        bestDist = d;
      }
    }
  return best;
}

function requirePool(world: World, id: string): Pool {
  const pool = poolIndexOf(world.terrain).byId.get(id);
  if (!pool) throw new Error(`Unknown pool ${id}`);
  return pool;
}

export function fishLeft(world: World, pool: Pool): number {
  return pool.capacity - (world.fishTaken[pool.id] ?? 0);
}

export function takeFish(world: World, pool: Pool): void {
  if (fishLeft(world, pool) <= 0) throw new Error(`Pool ${pool.id} holds no fish`);
  world.fishTaken[pool.id] = (world.fishTaken[pool.id] ?? 0) + 1;
}

function isFull(world: World, v: Vehicle): boolean {
  return getResources(world, v).supplies >= suppliesCap(v);
}

export function fishActions(world: World): FishAction[] {
  const me = playerVehicle(world);
  const pool = poolNear(world, me.pos);
  return pool ? [{ pool: pool.id, ready: me.speed <= RULES.parkedSpeed, full: isFull(world, me) }] : [];
}

export function beginFishing(world: World, v: Vehicle, poolId: string): void {
  const pool = requirePool(world, poolId);
  if (poolNear(world, v.pos)?.id !== pool.id) throw new Error(`${v.id} is out of reach of ${pool.id}`);
  if (isFull(world, v)) throw new Error(`${v.id} has no room for fish`);
  startJob(world, v, { kind: 'fish', pool: pool.id, caught: 0, turnsLeft: FISHING.sessionTurns, total: FISHING.sessionTurns });
}

export function startFishing(world: World, poolId: string): World {
  return playerCommand(world, (w) => beginFishing(w, playerVehicle(w), poolId));
}

export function isFishStalled(world: World, v: Vehicle, job: FishJob): boolean {
  return poolNear(world, v.pos)?.id !== job.pool;
}

function bites(world: World, v: Vehicle, pool: Pool): boolean {
  return hashRandom(world.seed, FISH_SALT, world.turn, idKey(v.id), pool.tiles[0]) < FISHING.biteChance;
}

export function fishTurn(world: World, v: Vehicle, job: FishJob): boolean {
  const pool = requirePool(world, job.pool);
  job.turnsLeft = Math.max(0, job.turnsLeft - 1);
  if (fishLeft(world, pool) > 0 && bites(world, v, pool)) catchFish(world, v, pool, job);
  if (job.turnsLeft > 0 && !isFull(world, v)) return false;
  world.events.push({ t: 'fished', vehicle: v.id, pool: pool.id, fish: job.caught });
  return true;
}

function catchFish(world: World, v: Vehicle, pool: Pool, job: FishJob): void {
  takeFish(world, pool);
  job.caught++;
  const resources = getResources(world, v);
  resources.supplies = Math.min(suppliesCap(v), resources.supplies + FISHING.fishSupplies);
  if (v.id === world.player.vehicleId) practice(world, 'fish', 1, null, pool.id);
}

export function restockFish(world: World): void {
  if (!modeRules(world).looting || world.turn % TIME.turnsPerDay !== 0) return;
  for (const id of Object.keys(world.fishTaken)) {
    const pool = requirePool(world, id);
    const left = world.fishTaken[id] - Math.ceil(pool.capacity * FISHING.restockShare);
    if (left > 0) world.fishTaken[id] = left;
    else delete world.fishTaken[id];
  }
}

export function pruneFishTaken(world: World): void {
  const { byId } = poolIndexOf(world.terrain);
  for (const id of Object.keys(world.fishTaken)) if (!byId.has(id)) delete world.fishTaken[id];
}

export function fishLineAnchor(world: World, v: Vehicle): Vec | null {
  if (v.job?.kind !== 'fish') return null;
  const pool = requirePool(world, v.job.pool);
  const { size } = world.terrain;
  let best = pool.tiles[0];
  for (const tile of pool.tiles) if (rectDistance(v.pos, tile, size) < rectDistance(v.pos, best, size)) best = tile;
  return { x: (best % size) + 0.5, y: Math.floor(best / size) + 0.5 };
}
