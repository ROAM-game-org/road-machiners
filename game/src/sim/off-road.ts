import { huntsOffRoad } from './hunt-style';
import { topGoal } from './npc-activities';
import { isStranded } from './stats';
import { keepsToItself } from './sunward';
import type { Vehicle, World } from './types';
import { isRaider } from './relations';

export function keepsOffRoads(world: World, v: Vehicle): boolean {
  if (!v.brain) return false;
  if (keepsToItself(world, v)) return true;
  if (!isRaider(v)) return false;
  return hides(world, v) || huntsOffRoad(v.brain);
}

function hides(world: World, v: Vehicle): boolean {
  const goal = topGoal(v)?.kind;
  return goal === 'retreat' || goal === 'flee' || isStranded(world, v);
}
