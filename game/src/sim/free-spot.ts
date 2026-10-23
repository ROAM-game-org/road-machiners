import { CHEATS } from '../data/rules';
import { isFree } from './spawn';
import type { World } from './types';
import type { Vec } from './vec';

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
