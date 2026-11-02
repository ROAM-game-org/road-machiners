import { REGION } from '../data/region';
import { SUNWARD } from '../data/sunward';
import { TERRAIN } from '../data/terrain';
import { huntsOffRoad } from './hunt-style';
import type { Berth } from './nav/layer';
import { topGoal } from './npc-activities';
import { isStranded } from './stats';
import { keepsToItself } from './sunward';
import type { Vehicle, World } from './types';
import { isRaider } from './relations';

export type RouteStyle = 'road' | 'cut' | 'hidden';

export const ROUTE_STYLES: readonly RouteStyle[] = ['road', 'cut', 'hidden'];

const CUT_TRAITS = ['scavenger', 'roamer'] as const;

export function routeStyle(world: World, v: Vehicle): RouteStyle {
  if (!v.brain) return 'road';
  if (isHidden(world, v, v.brain)) return 'hidden';
  return CUT_TRAITS.some((trait) => v.brain!.traits.includes(trait)) ? 'cut' : 'road';
}

function isHidden(world: World, v: Vehicle, brain: NonNullable<Vehicle['brain']>): boolean {
  return keepsToItself(world, v) || ridesToTheLight(v) || (isRaider(v) && (hides(world, v) || huntsOffRoad(brain)));
}

const INHABITED = [...REGION.towns, ...REGION.locations.filter((site) => site.kind === 'camp')];

const RIDE_BERTHS: Berth[] = INHABITED.map((site) => ({ x: site.pos.x, y: site.pos.y, r: site.radius + TERRAIN.vision.radius * TERRAIN.vision.grayFactor + SUNWARD.rideBerthMargin }));

export function rideBerths(v: Vehicle): Berth[] {
  return ridesToTheLight(v) ? RIDE_BERTHS : [];
}

function ridesToTheLight(v: Vehicle): boolean {
  const reason = topGoal(v)?.reason;
  return reason === 'rideVigil' || reason === 'rideHome';
}

function hides(world: World, v: Vehicle): boolean {
  const goal = topGoal(v)?.kind;
  return goal === 'retreat' || goal === 'flee' || isStranded(world, v);
}
