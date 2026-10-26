import { MOMENT_IDS, MOMENT_TALK, MOMENTS, type MomentId } from '../data/moments';
import { RULES } from '../data/rules';
import { playerVehicle } from './damage';
import { isKnockedOut } from './defeat';
import { finishGoal, topGoal } from './npc-activities';
import { hasTrait } from './npc-decisions';
import { charCodes, hashRandom } from './rng';
import type { MomentState, Vehicle, World } from './types';
import { dist } from './vec';

export function freshMoments(): Record<MomentId, MomentState> {
  return Object.fromEntries(MOMENT_IDS.map((id) => [id, { driver: null, heard: false }])) as Record<MomentId, MomentState>;
}

function momentsOf(world: World): Record<MomentId, MomentState> {
  if (!world.moments) throw new Error('This world keeps no moments');
  return world.moments;
}

export function eligibleFor(vehicle: Vehicle, id: MomentId): boolean {
  const brain = vehicle.brain;
  if (!brain || isKnockedOut(vehicle)) return false;
  const moment = MOMENTS[id];
  if (!moment.personalities.includes(brain.personality)) return false;
  return moment.anyTrait.some((t) => hasTrait(vehicle, t)) && !moment.barredTraits.some((t) => hasTrait(vehicle, t));
}

export function momentOf(world: World, vehicle: Vehicle): MomentId | null {
  if (!world.moments) return null;
  return MOMENT_IDS.find((id) => !world.moments![id].heard && world.moments![id].driver === vehicle.id) ?? null;
}

function holds(world: World, vehicle: Vehicle): boolean {
  return MOMENT_IDS.some((id) => world.moments![id].driver === vehicle.id);
}

function pick(world: World, id: MomentId, candidates: Vehicle[]): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => (a.id < b.id ? -1 : 1));
  return sorted[Math.floor(hashRandom(world.seed, ...charCodes(id), world.turn) * sorted.length)].id;
}

function assign(world: World, id: MomentId, pool: Vehicle[]): void {
  momentsOf(world)[id].driver = pick(world, id, pool.filter((v) => eligibleFor(v, id) && !holds(world, v)));
}

export function assignMoments(world: World): void {
  if (!world.moments) return;
  for (const id of MOMENT_IDS) if (!world.moments[id].heard && world.moments[id].driver === null) assign(world, id, world.vehicles);
}

export function passMoments(world: World): void {
  if (!world.moments) return;
  const moments = world.moments;
  const lost = MOMENT_IDS.filter((id) => !moments[id].heard && moments[id].driver !== null && world.removed.some((v) => v.id === moments[id].driver));
  for (const id of lost) {
    moments[id].driver = null;
    assign(world, id, world.vehicles);
  }
  const spawned = world.events.flatMap((e) => (e.t === 'spawn' ? [e.vehicle] : []));
  if (spawned.length === 0) return;
  const fresh = world.vehicles.filter((v) => spawned.includes(v.id));
  for (const id of MOMENT_IDS) if (!moments[id].heard && moments[id].driver === null) assign(world, id, fresh);
}

export function releaseGoneHolders(world: World): void {
  if (!world.moments) return;
  const present = new Set(world.vehicles.map((v) => v.id));
  for (const id of MOMENT_IDS) {
    const moment = world.moments[id];
    if (!moment.heard && moment.driver !== null && !present.has(moment.driver)) moment.driver = null;
  }
}

function onTheLine(world: World, vehicle: Vehicle, id: MomentId): boolean {
  const call = world.player.call;
  return call !== null && call.with === vehicle.id && call.topic === id;
}

function lingersFor(vehicle: Vehicle, id: MomentId): boolean {
  const top = topGoal(vehicle);
  return top !== null && top.kind === 'wait' && top.reason === MOMENTS[id].reason && top.phase === 'act';
}

function playerStopsBy(world: World, vehicle: Vehicle): boolean {
  const me = playerVehicle(world);
  return me.speed <= RULES.parkedSpeed && dist(me.pos, vehicle.pos) <= MOMENT_TALK.range;
}

export function momentDue(world: World, vehicle: Vehicle, id: MomentId): boolean {
  if (momentOf(world, vehicle) !== id) return false;
  return onTheLine(world, vehicle, id) || (lingersFor(vehicle, id) && playerStopsBy(world, vehicle));
}

export function hearMoment(world: World, vehicle: Vehicle, id: MomentId): void {
  const moment = momentsOf(world)[id];
  if (moment.driver !== vehicle.id) throw new Error(`${vehicle.id} does not hold the moment ${id}`);
  moment.heard = true;
  if (topGoal(vehicle)?.reason === MOMENTS[id].reason) finishGoal(world, vehicle, 'answeredCall');
}

export function lingersForMoment(world: World, vehicle: Vehicle, reason: string | null): boolean {
  const id = momentOf(world, vehicle);
  return id !== null && MOMENTS[id].reason === reason;
}
