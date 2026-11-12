import { HONK_RANGE, ROAD_HORN } from '../data/personalities';
import { inCombat, isHostile } from './combat';
import { sameCompany } from './companies';
import { isKnockedOut } from './defeat';
import { talkOf } from './dialogue';
import { slotOf } from './fidelity';
import { charCodes, hashRandom } from './rng';
import { modeRules } from './settings';
import type { RoadHornCause, Vehicle, World } from './types';
import { dist } from './vec';

export function hearsHorn(listener: Vehicle, honker: Vehicle): boolean {
  return dist(listener.pos, honker.pos) <= HONK_RANGE;
}

export function hornAtSight(world: World, npc: Vehicle, seen: readonly Vehicle[]): void {
  if ((world.turn + slotOf(npc.id)) % ROAD_HORN.paceTurns !== 0) return;
  if (!rolls(world, npc, ROAD_HORN.sightSalt, ROAD_HORN.sightChance)) return;
  const other = nearest(npc, seen.filter((x) => freshSighting(world, npc, x) && greetable(world, npc, x)));
  if (other && mayHonk(world, npc)) horned(world, npc, 'sight', other);
}

export function hornAtBrake(world: World, npc: Vehicle, meeting: readonly Vehicle[], wasBraking: boolean): void {
  if (wasBraking || npc.speed < ROAD_HORN.brakeSpeed) return;
  if (!rolls(world, npc, ROAD_HORN.brakeSalt, ROAD_HORN.brakeChance)) return;
  const other = nearest(npc, meeting);
  if (other && mayHonk(world, npc)) horned(world, npc, 'brake', other);
}

function rolls(world: World, npc: Vehicle, salt: string, chance: number): boolean {
  return hashRandom(world.seed, ...charCodes(npc.id), world.turn, ...charCodes(salt)) < chance;
}

function freshSighting(world: World, npc: Vehicle, other: Vehicle): boolean {
  const since = npc.brain!.tracks[other.id]?.seenSince;
  return since !== null && since !== undefined && world.turn - since < ROAD_HORN.paceTurns;
}

function greetable(world: World, npc: Vehicle, other: Vehicle): boolean {
  return !isKnockedOut(other) && !sameCompany(world, npc, other) && !isHostile(world, npc, other);
}

function nearest(npc: Vehicle, trucks: readonly Vehicle[]): Vehicle | null {
  let best: Vehicle | null = null;
  for (const x of trucks) if (!best || dist(npc.pos, x.pos) < dist(npc.pos, best.pos)) best = x;
  return best;
}

function mayHonk(world: World, npc: Vehicle): boolean {
  if (!modeRules(world).radio || !npc.brain || npc.id === world.player.vehicleId) return false;
  if (isKnockedOut(npc) || inCombat(world, npc) || !talkOf(npc).honksBack) return false;
  return !world.events.some((e) => e.t === 'roadHorn' && dist(e.at, npc.pos) <= HONK_RANGE);
}

function horned(world: World, npc: Vehicle, cause: RoadHornCause, other: Vehicle): void {
  if (other.id === npc.id) throw new Error(`${npc.id} cannot honk at itself`);
  world.events.push({ t: 'roadHorn', vehicle: npc.id, cause, other: other.id, at: { ...npc.pos } });
}
