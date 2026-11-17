
import { NPC_BEHAVIOR, NPC_UPKEEP } from '../data/npcs';
import { carriedSpare, isJunk, maxHp, spareTarget } from './wear';
import { mountedParts } from './grid';
import { inCombat } from './combat';
import { bodyCondition } from './npc-decisions';
import { beginFitSpare, startJob } from './jobs';
import { withinReach } from './npc-activities';
import { straightClear } from './path';
import { repairPlan } from './repair';
import { getResources } from './resources';
import { vehicleStats } from './stats';
import { inShade, shadeCasters, shadeMatters, sunAt } from './sun';
import type { NpcActivity, PartInstance, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export function isStrandedForGood(vehicle: Vehicle): boolean {
  const engine = mountedParts(vehicle, 'engine')[0];
  return !engine || isJunk(engine);
}

export function isPartWorn(part: PartInstance): boolean {
  return part.hp / maxHp(part) <= NPC_BEHAVIOR.fleeCondition;
}

export function isDamaged(vehicle: Vehicle): boolean {
  const drivingPartWorn = [...mountedParts(vehicle, 'core'), ...mountedParts(vehicle, 'engine')]
    .some((part) => !isJunk(part) && isPartWorn(part));
  return isStrandedForGood(vehicle) || drivingPartWorn || bodyCondition(vehicle) <= NPC_BEHAVIOR.fleeCondition;
}

type RepairPick = { part: PartInstance; bySpare: boolean };

function condition(part: PartInstance): number {
  return part.hp / maxHp(part);
}

function wheelForSpare(vehicle: Vehicle): PartInstance | null {
  return carriedSpare(vehicle) ? spareTarget(vehicle) : null;
}

function chooseRepairPart(world: World, vehicle: Vehicle): RepairPick | null {
  const patched = mountedParts(vehicle)
    .filter((part) => !isJunk(part) && repairPlan(world, vehicle, part.id).parts > 0)
    .sort((a, b) => condition(a) - condition(b))[0];
  const wheel = wheelForSpare(vehicle);
  if (wheel && (!patched || condition(wheel) <= condition(patched))) return { part: wheel, bySpare: true };
  return patched ? { part: patched, bySpare: false } : null;
}

function canSearchForShade(world: World, vehicle: Vehicle): boolean {
  const sun = sunAt(world.turn);
  if (!sun || !shadeMatters(world, vehicle.pos)) return false;
  if (getResources(world, vehicle).fuel === 0) return false;
  return !inShade(world, vehicle.pos, sun);
}

function isShadeCandidate(world: World, vehicle: Vehicle, point: Vec, radius: number): boolean {
  if (point.x < 1 || point.y < 1) return false;
  if (point.x >= world.size - 1 || point.y >= world.size - 1) return false;
  return dist(vehicle.pos, point) <= radius;
}

function shadeCandidates(world: World, vehicle: Vehicle, radius: number): Vec[] {
  const candidates: Vec[] = [];
  for (let y = Math.floor(vehicle.pos.y - radius); y <= vehicle.pos.y + radius; y++) {
    for (let x = Math.floor(vehicle.pos.x - radius); x <= vehicle.pos.x + radius; x++) {
      const point = { x: x + 0.5, y: y + 0.5 };
      if (isShadeCandidate(world, vehicle, point, radius)) candidates.push(point);
    }
  }
  return candidates.sort((a, b) => dist(vehicle.pos, a) - dist(vehicle.pos, b));
}

export function shadedSpotNear(world: World, vehicle: Vehicle, radius: number): Vec | null {
  const sun = sunAt(world.turn);
  if (!sun) throw new Error('Shade search requires sunlight');
  const size = vehicleStats(world, vehicle).radius;
  const blockers = world.vehicles
    .filter((other) => other.id !== vehicle.id)
    .map((other) => ({ pos: other.pos, r: vehicleStats(world, other).radius }));
  const casters = shadeCasters(world, vehicle.pos, radius);
  return shadeCandidates(world, vehicle, radius).find((point) => inShade(world, point, sun, casters) && straightClear(world, vehicle.pos, point, size, blockers)) ?? null;
}

function chooseRepairSpot(world: World, vehicle: Vehicle): Vec | null {
  if (!canSearchForShade(world, vehicle)) return null;
  return shadedSpotNear(world, vehicle, NPC_UPKEEP.shadeSearchRadius);
}

export function chooseNpcRepair(world: World, vehicle: Vehicle, threshold: number): NpcActivity | null {
  const pick = chooseRepairPart(world, vehicle);
  if (!pick) return null;
  if (condition(pick.part) > threshold) return null;
  const destination = chooseRepairSpot(world, vehicle);
  return {
    kind: 'repair',
    targetId: null,
    destination,
    phase: destination ? 'travel' : 'act',
    reason: 'patchParts',
  };
}

export function continueNpcRepair(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  if (getResources(world, vehicle).fuel === 0) activity.destination = null;
}

export function repairsHere(vehicle: Vehicle, activity: NpcActivity): boolean {
  return activity.destination === null || withinReach(vehicle, activity);
}

export function resolveNpcRepair(world: World, vehicle: Vehicle, activity: NpcActivity): boolean {
  if (!repairsHere(vehicle, activity)) return false;
  activity.phase = 'act';
  if (vehicle.job) return false;
  return startNpcRepair(world, vehicle);
}

function startNpcRepair(world: World, vehicle: Vehicle): boolean {
  if (inCombat(world, vehicle)) return false;
  const pick = chooseRepairPart(world, vehicle);
  if (!pick) return true;
  if (pick.bySpare) {
    beginFitSpare(world, vehicle, pick.part.id);
    return false;
  }
  const plan = repairPlan(world, vehicle, pick.part.id, 1);
  startJob(world, vehicle, {
    kind: 'repair',
    partId: pick.part.id,
    parts: plan.parts,
    turnsLeft: plan.turns,
    total: plan.turns,
  });
  return false;
}
