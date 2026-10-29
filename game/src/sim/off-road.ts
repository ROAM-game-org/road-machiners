
import { huntsOffRoad } from './hunt-style';
import { topGoal } from './npc-activities';
import { isStranded } from './stats';
import type { Vehicle, World } from './types';
import { isRaider } from './relations';

export function keepsOffRoads(world: World, v: Vehicle): boolean {
  if (!v.brain) return false;
  if (ridesToTheLight(v)) return true;
  return isRaider(v) && (hides(world, v) || huntsOffRoad(v.brain));
}

function ridesToTheLight(v: Vehicle): boolean {
  const reason = topGoal(v)?.reason;
  return reason === 'rideVigil' || reason === 'rideHome';
}

function hides(world: World, v: Vehicle): boolean {
  const goal = topGoal(v)?.kind;
  return goal === 'retreat' || goal === 'flee' || isStranded(world, v);
}
