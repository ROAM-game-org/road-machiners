import { FURY_ROAD } from '../data/modes';
import { RULES } from '../data/rules';
import type { Vehicle, World } from './types';

export function overdriveBoostOf(world: World, v: Vehicle): number {
  return catchingUp(world, v) ? FURY_ROAD.catchUp.boost : RULES.overdriveBoost;
}

export function catchingUp(world: World, v: Vehicle): boolean {
  const run = world.furyRoad;
  return run !== null && run.groups.some((g) => g.vehicles.includes(v.id) && !g.engaged.includes(v.id));
}

export function runsDown(world: World, v: Vehicle): boolean {
  const run = world.furyRoad;
  return run !== null && run.groups.some((g) => g.vehicles.includes(v.id));
}
