import { FURY_ROAD } from '../data/modes';
import { RULES } from '../data/rules';
import { groupPrey } from './combat';
import { acrossOf, alongOf, roadPoint, toRoad } from './highway';
import type { MoveOrder, Vehicle, World } from './types';

export function runsDown(world: World, v: Vehicle): boolean {
  const run = world.furyRoad;
  return run !== null && run.groups.some((g) => g.vehicles.includes(v.id));
}

export function rollingOrder(world: World, v: Vehicle): MoveOrder | null {
  if (!runsDown(world, v)) return null;
  const prey = groupPrey(world, v);
  if (prey.speed <= RULES.parkedSpeed) return null;
  const window = world.furyRoad!.window;
  const along = (x: Vehicle) => alongOf(world.seed, toRoad(window, x.pos));
  const gap = along(v) - along(prey);
  const { near, ramp, lead } = FURY_ROAD.rolling;
  if (gap <= near) return null;
  const pace = prey.speed * Math.max(0, 1 - (gap - near) / ramp);
  if (pace <= RULES.parkedSpeed) return { kind: 'brake' };
  const across = acrossOf(world.seed, toRoad(window, v.pos));
  return { kind: 'through', dest: roadPoint(world.seed, window, along(v) + lead, across), pace };
}
