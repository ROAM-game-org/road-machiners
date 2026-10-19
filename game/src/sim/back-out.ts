import { RULES } from '../data/rules';
import { isFree } from './spawn';
import { vehicleStats } from './stats';
import type { Vehicle, World } from './types';
import type { Vec } from './vec';

const WAYS_OUT = [180, 135, -135, 90, -90].map((deg) => (deg * Math.PI) / 180);

export function backOutSpot(world: World, v: Vehicle): Vec {
  const back = RULES.reverse.distance + RULES.minAimDistance;
  const spots = WAYS_OUT.map((turn) => ({ x: v.pos.x + Math.cos(v.heading + turn) * back, y: v.pos.y + Math.sin(v.heading + turn) * back }));
  const radius = vehicleStats(world, v).radius;
  return spots.find((spot) => isFree(world, spot, radius, v.id)) ?? spots[0];
}
