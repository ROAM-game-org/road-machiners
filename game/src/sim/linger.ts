import { LINGER, LINGER_REASONS, type LingerReason } from '../data/linger';
import { RULES } from '../data/rules';
import { TIME } from '../data/time';
import { createActivity } from './npc-activities';
import { hasTrait } from './npc-decisions';
import { shadedSpotNear } from './npc-repair';
import { route } from './path';
import { propsAround } from './prop-index';
import { ROAD_INDEX } from './road-index';
import { hasSalvage, isRoadWreck } from './salvage';
import { hasExplorationMap } from './settings';
import { isFree } from './spawn';
import { vehicleStats } from './stats';
import { layOf } from './survey';
import { clockOf, sunAt } from './sun';
import { isCliff, tileAt } from './terrain';
import type { GoalReason, NpcActivity, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { isOvercast, weatherAt } from './weather';

export function isLingerReason(reason: GoalReason): reason is LingerReason {
  return (LINGER_REASONS as readonly GoalReason[]).includes(reason);
}

function inWindow(hour: number, reason: LingerReason): boolean {
  const { from, to } = LINGER.windows[reason];
  return hour >= from && hour < to;
}

function clearSky(world: World, pos: Vec): boolean {
  return !isOvercast(world) && weatherAt(world, pos).sight >= 1;
}

function openNow(world: World, vehicle: Vehicle, reason: LingerReason): boolean {
  if (!inWindow(clockOf(world.turn).hour, reason)) return false;
  if (reason === 'watchSunset') return clearSky(world, vehicle.pos);
  return reason === 'restShade' ? sunAt(world.turn) !== null : true;
}

export function lingerReasonNow(world: World, vehicle: Vehicle): LingerReason | null {
  if (!hasExplorationMap(world) || LINGER.barredTraits.some((trait) => hasTrait(vehicle, trait))) return null;
  return LINGER_REASONS.find((reason) => openNow(world, vehicle, reason)) ?? null;
}

function windowEnd(world: World, reason: LingerReason): number {
  const hoursLeft = LINGER.windows[reason].to - clockOf(world.turn).hour;
  const toEnd = Math.ceil((hoursLeft * TIME.turnsPerDay) / 24);
  return world.turn + Math.max(1, Math.min(toEnd, LINGER.maxTurns[reason]));
}

function reachable(world: World, vehicle: Vehicle, spot: Vec): boolean {
  const radius = vehicleStats(world, vehicle).radius;
  if (!isFree(world, spot, radius, vehicle.id)) return false;
  const end = route(world, vehicle.pos, spot, radius, [], vehicle).at(-1) ?? vehicle.pos;
  return dist(end, spot) <= RULES.arriveRadius;
}

function sunsetCandidates(world: World, vehicle: Vehicle): Vec[] {
  const radius = LINGER.searchRadius.watchSunset;
  const step = LINGER.sunsetStep;
  const out: Vec[] = [];
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const p = { x: vehicle.pos.x + dx, y: vehicle.pos.y + dy };
      if (Math.hypot(dx, dy) <= radius && p.x > 1 && p.y > 1 && p.x < world.size - 1 && p.y < world.size - 1) out.push(p);
    }
  }
  return out.sort((a, b) => dist(vehicle.pos, a) - dist(vehicle.pos, b));
}

function viewpoint(world: World, p: Vec): boolean {
  if (isCliff(world.terrain, tileAt(world.terrain, p))) return false;
  if (ROAD_INDEX.nearestWithin(p.x, p.y, LINGER.sunsetRoadReach) === Infinity) return false;
  return layOf(world.terrain, p) === 'rise';
}

function sunsetSpot(world: World, vehicle: Vehicle): { spot: Vec; target: string | null } | null {
  const spot = sunsetCandidates(world, vehicle).filter((p) => viewpoint(world, p)).find((p) => reachable(world, vehicle, p));
  return spot ? { spot, target: null } : null;
}

function shadeSpot(world: World, vehicle: Vehicle): { spot: Vec; target: string | null } | null {
  const spot = shadedSpotNear(world, vehicle, LINGER.searchRadius.restShade);
  return spot ? { spot, target: null } : null;
}

export function lootedRoadWreck(world: World, id: string): boolean {
  if (!isRoadWreck({ id })) return false;
  const stock = world.salvage.find((s) => s.id === id);
  return stock !== undefined && !hasSalvage(stock);
}

function graveSpot(world: World, vehicle: Vehicle): { spot: Vec; target: string | null } | null {
  const wrecks = propsAround(world, 'shade', vehicle.pos, LINGER.searchRadius.tendGrave)
    .filter((o) => lootedRoadWreck(world, o.id))
    .sort((a, b) => dist(vehicle.pos, a.pos) - dist(vehicle.pos, b.pos));
  for (const wreck of wrecks) {
    const away = dist(vehicle.pos, wreck.pos) || 1;
    const gap = wreck.r + LINGER.graveGap;
    const spot = { x: wreck.pos.x + ((vehicle.pos.x - wreck.pos.x) / away) * gap, y: wreck.pos.y + ((vehicle.pos.y - wreck.pos.y) / away) * gap };
    if (reachable(world, vehicle, spot)) return { spot, target: wreck.id };
  }
  return null;
}

const SPOTS: Record<LingerReason, (world: World, vehicle: Vehicle) => { spot: Vec; target: string | null } | null> = {
  watchSunset: sunsetSpot,
  restShade: shadeSpot,
  tendGrave: graveSpot,
};

export function lingerGoal(world: World, vehicle: Vehicle): NpcActivity | null {
  const reason = lingerReasonNow(world, vehicle);
  if (!reason) return null;
  const found = SPOTS[reason](world, vehicle);
  if (!found) return null;
  return { ...createActivity('wait', found.target, found.spot, reason), until: windowEnd(world, reason) };
}

export function lingerInvalid(world: World, goal: NpcActivity): GoalReason | null {
  if (goal.reason !== 'tendGrave') return null;
  return goal.targetId !== null && lootedRoadWreck(world, goal.targetId) ? null : 'salvageGone';
}
