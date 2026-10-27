import { huntsOffRoad } from './hunt-style';
import { topGoal } from './npc-activities';
import { isStranded } from './stats';
import type { Vehicle, World } from './types';
import { isRaider } from './relations';

export type RouteStyle = 'road' | 'cut' | 'hidden';

export const ROUTE_STYLES: readonly RouteStyle[] = ['road', 'cut', 'hidden'];

const CUT_TRAITS = ['scavenger', 'roamer'] as const;

export function routeStyle(world: World, v: Vehicle): RouteStyle {
  if (!v.brain) return 'road';
  if (isRaider(v) && (hides(world, v) || huntsOffRoad(v.brain))) return 'hidden';
  return CUT_TRAITS.some((trait) => v.brain!.traits.includes(trait)) ? 'cut' : 'road';
}

function hides(world: World, v: Vehicle): boolean {
  const goal = topGoal(v)?.kind;
  return goal === 'retreat' || goal === 'flee' || isStranded(world, v);
}
