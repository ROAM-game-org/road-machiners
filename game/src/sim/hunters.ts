import { CHAOS_HIGHWAY } from '../data/modes';
import { RULES } from '../data/rules';
import { groupPrey } from './combat';
import { FORTRESS } from '../data/fortress';
import { type GateSide, acrossOf, alongOf, milestoneAt, outpostGateSpots, outpostYardHalf, roadPoint, toRoad } from './highway';
import { vehicleStats } from './stats';
import type { MoveOrder, Vehicle, World } from './types';
import type { Vec } from './vec';

export function runsDown(world: World, v: Vehicle): boolean {
  const run = world.chaosHighway;
  return run !== null && run.groups.some((g) => g.vehicles.includes(v.id));
}

export function rollingOrder(world: World, v: Vehicle): MoveOrder | null {
  if (!runsDown(world, v)) return null;
  const prey = groupPrey(world, v);
  if (prey.speed <= RULES.parkedSpeed) return null;
  const gap = alongNow(world, v) - alongNow(world, prey);
  if (gap > Math.max(CHAOS_HIGHWAY.rolling.near, reachOf(world, v)) && !hitBy(v, prey)) return rollAhead(world, v, prey, gap);
  if (-gap > reachOf(world, v)) return catchUp(world, v, prey);
  return null;
}

function rollAhead(world: World, v: Vehicle, prey: Vehicle, gap: number): MoveOrder {
  const { near, ramp, close, lead } = CHAOS_HIGHWAY.rolling;
  const pace = prey.speed * Math.min(Math.max(0, 1 - (gap - near) / ramp), 1 - close);
  if (pace <= RULES.parkedSpeed) return { kind: 'brake' };
  return { kind: 'through', dest: onRoad(world, alongNow(world, v) + lead, acrossNow(world, prey)), pace };
}

function hitBy(v: Vehicle, prey: Vehicle): boolean {
  return v.brain?.attackers[prey.id] === true;
}

function catchUp(world: World, v: Vehicle, prey: Vehicle): MoveOrder {
  const dest = onRoad(world, alongNow(world, prey) + CHAOS_HIGHWAY.rolling.lead, acrossNow(world, prey));
  return { kind: 'through', dest, pace: vehicleStats(world, v).maxSpeed };
}

function reachOf(world: World, v: Vehicle): number {
  return Math.max(RULES.arriveRadius, ...vehicleStats(world, v).weapons.map((mw) => mw.def.range));
}

function alongNow(world: World, v: Vehicle): number {
  return alongOf(world.seed, toRoad(world.seed, world.chaosHighway!.window, v.pos));
}

function acrossNow(world: World, v: Vehicle): number {
  return acrossOf(world.seed, toRoad(world.seed, world.chaosHighway!.window, v.pos));
}

function onRoad(world: World, along: number, across: number) {
  return roadPoint(world.seed, world.chaosHighway!.window, along, across);
}

export function fortReach(radius: number): number {
  return outpostYardHalf() + FORTRESS.wallDepth / 2 + radius + CHAOS_HIGHWAY.spawnClear;
}

export function stretchSpan(world: World, radius: number): { from: number; to: number } {
  const window = world.chaosHighway!.window;
  const reach = fortReach(radius);
  const span = { from: milestoneAt(world.seed, window) + reach, to: milestoneAt(world.seed, window + 1) - reach };
  if (span.from > span.to) throw new Error(`Stretch ${window} is too short for a truck of radius ${radius}`);
  return span;
}

export function holdAlong(world: World, radius: number, along: number): number {
  const { from, to } = stretchSpan(world, radius);
  return Math.min(Math.max(along, from), to);
}

export function heldGoal(world: World, v: Vehicle, goal: Vec | null): Vec | null {
  if (!goal || !runsDown(world, v)) return goal;
  const run = world.chaosHighway!;
  const radius = vehicleStats(world, v).radius;
  const at = toRoad(world.seed, run.window, goal);
  const along = alongOf(world.seed, at);
  const held = holdAlong(world, radius, along);
  if (held === along) return goal;
  const across = outsideGate(world, held < along ? 'south' : 'north', radius, acrossOf(world.seed, at));
  return roadPoint(world.seed, run.window, held, across);
}

function outsideGate(world: World, side: GateSide, radius: number, across: number): number {
  const run = world.chaosHighway!;
  const gate = outpostGateSpots(world.seed, run.window, side === 'south' ? run.window + 1 : run.window)[side];
  const centre = acrossOf(world.seed, toRoad(world.seed, run.window, gate.center));
  const lane = gate.width / 2 + radius + CHAOS_HIGHWAY.spawnClear;
  const offset = across - centre;
  if (Math.abs(offset) >= lane) return across;
  return centre + (offset > 0 ? lane : -lane);
}

export function holdOnStretch(world: World, v: Vehicle, order: MoveOrder): MoveOrder {
  if (order.kind === 'brake' || !runsDown(world, v)) return order;
  const held = heldGoal(world, v, order.dest);
  return held === order.dest ? order : { kind: 'stopAt', dest: held! };
}
