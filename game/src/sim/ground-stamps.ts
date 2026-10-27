import { CANYON_BRIDGE_GROUND, MAPGEN } from '../data/terrain';
import { dist, type Vec } from './vec';

export type StampSite = { id: string; pos: Vec; reach: number; shift: Vec; edge: (p: Vec) => number };

function shiftOf(pos: Vec, from: Vec): Vec {
  return { x: pos.x - from.x, y: pos.y - from.y };
}

function bridgeSite(): StampSite {
  const { id, pos, from, radius } = CANYON_BRIDGE_GROUND;
  return { id, pos, reach: radius, shift: shiftOf(pos, from), edge: (p) => Math.max(0, dist(p, pos) - radius) };
}

export const STAMP_SITES: readonly StampSite[] = [bridgeSite()];

for (const site of STAMP_SITES) if (!Number.isInteger(site.shift.x) || !Number.isInteger(site.shift.y)) throw new Error(`${site.id} stands off the tile grid of its ground`);

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function stampShare(site: StampSite, p: Vec): number {
  if (dist(p, site.pos) > site.reach + MAPGEN.groundHold + MAPGEN.groundFeather) return 0;
  const gap = Math.max(0, site.edge(p) - MAPGEN.groundHold);
  return gap >= MAPGEN.groundFeather ? 0 : 1 - smooth(gap / MAPGEN.groundFeather);
}

export function strongestStamp(p: Vec): { site: StampSite; share: number } | null {
  let best: { site: StampSite; share: number } | null = null;
  for (const site of STAMP_SITES) {
    const share = stampShare(site, p);
    if (share > (best?.share ?? 0)) best = { site, share };
  }
  return best;
}
