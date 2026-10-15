import { FURY_ROAD } from '../data/modes';
import { RULES } from '../data/rules';
import { groupPrey } from './combat';
import { acrossOf, alongOf, roadPoint, toRoad } from './highway';
import { vehicleStats } from './stats';
import type { MoveOrder, Vehicle, World } from './types';

export function runsDown(world: World, v: Vehicle): boolean {
  const run = world.furyRoad;
  return run !== null && run.groups.some((g) => g.vehicles.includes(v.id));
}

export function rollingOrder(world: World, v: Vehicle): MoveOrder | null {
  if (!runsDown(world, v)) return null;
  const prey = groupPrey(world, v);
  if (prey.speed <= RULES.parkedSpeed) return null;
  const gap = alongNow(world, v) - alongNow(world, prey);
  if (gap > FURY_ROAD.rolling.near) return rollAhead(world, v, prey, gap);
  if (-gap > reachOf(world, v)) return catchUp(world, v, prey);
  return null;
}

function rollAhead(world: World, v: Vehicle, prey: Vehicle, gap: number): MoveOrder {
  const { near, ramp, lead } = FURY_ROAD.rolling;
  const pace = prey.speed * Math.max(0, 1 - (gap - near) / ramp);
  if (pace <= RULES.parkedSpeed) return { kind: 'brake' };
  return { kind: 'through', dest: onRoad(world, alongNow(world, v) + lead, acrossNow(world, prey)), pace };
}

function catchUp(world: World, v: Vehicle, prey: Vehicle): MoveOrder {
  const dest = onRoad(world, alongNow(world, prey) + FURY_ROAD.rolling.lead, acrossNow(world, prey));
  return { kind: 'through', dest, pace: vehicleStats(world, v).maxSpeed };
}

function reachOf(world: World, v: Vehicle): number {
  return Math.max(RULES.arriveRadius, ...vehicleStats(world, v).weapons.map((mw) => mw.def.range));
}

function alongNow(world: World, v: Vehicle): number {
  return alongOf(world.seed, toRoad(world.furyRoad!.window, v.pos));
}

function acrossNow(world: World, v: Vehicle): number {
  return acrossOf(world.seed, toRoad(world.furyRoad!.window, v.pos));
}

function onRoad(world: World, along: number, across: number) {
  return roadPoint(world.seed, world.furyRoad!.window, along, across);
}
