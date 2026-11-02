import { CHEATS, RULES } from '../data/rules';
import { isFree } from './spawn';
import { vehicleStats } from './stats';
import type { Vehicle, World } from './types';
import type { Vec } from './vec';

const WAYS_OUT = [180, 135, -135, 90, -90].map((deg) => (deg * Math.PI) / 180);

export function spotNear(center: Vec, accepts: (pos: Vec) => boolean): Vec | null {
  if (accepts(center)) return { ...center };
  for (let ring = 1; ring <= CHEATS.searchRings; ring++) {
    const r = ring * CHEATS.searchStep;
    const points = Math.ceil((2 * Math.PI * r) / CHEATS.searchStep);
    const spot = circlePoints(center, r, points).find(accepts);
    if (spot) return spot;
  }
  return null;
}

export function freeSpotNear(w: World, center: Vec, radius: number, ignoreId: string | null): Vec | null {
  return spotNear(center, (pos) => isFree(w, pos, radius, ignoreId));
}

export function firstFree(w: World, points: Vec[], radius: number, ignoreId: string | null): Vec | null {
  return points.find((p) => isFree(w, p, radius, ignoreId)) ?? null;
}

function circlePoints(center: Vec, r: number, count: number): Vec[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count;
    return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
  });
}

export function backOutSpot(world: World, v: Vehicle): Vec {
  const back = RULES.reverse.distance + RULES.minAimDistance;
  const spots = WAYS_OUT.map((turn) => ({ x: v.pos.x + Math.cos(v.heading + turn) * back, y: v.pos.y + Math.sin(v.heading + turn) * back }));
  const radius = vehicleStats(world, v).radius;
  return spots.find((spot) => isFree(world, spot, radius, v.id)) ?? spots[0];
}
