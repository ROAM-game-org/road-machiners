import { REGION } from '../data/region';
import { CANYON_BRIDGE_GROUND, MAPGEN } from '../data/terrain';
import { dist, pointInPolygon, polygonEdgeDist, type Vec } from './vec';

export type StampSite = { id: string; pos: Vec; reach: number; shift: Vec; edge: (p: Vec) => number };

function shiftOf(pos: Vec, from: Vec): Vec {
  return { x: pos.x - from.x, y: pos.y - from.y };
}

function coreSites(): StampSite[] {
  return REGION.locations.flatMap((t) => {
    if (t.kind !== 'territory' || !t.reliefFrom || !t.outline) return [];
    const outline = t.outline.map((p) => ({ x: t.pos.x + p.x, y: t.pos.y + p.y }));
    const reach = Math.max(...t.outline.map((p) => Math.hypot(p.x, p.y)));
    return [{ id: t.id, pos: t.pos, reach, shift: shiftOf(t.pos, t.reliefFrom), edge: (p: Vec) => (pointInPolygon(p, outline) ? 0 : polygonEdgeDist(p, outline)) }];
  });
}

function bridgeSite(): StampSite {
  const { id, pos, from, radius } = CANYON_BRIDGE_GROUND;
  return { id, pos, reach: radius, shift: shiftOf(pos, from), edge: (p) => Math.max(0, dist(p, pos) - radius) };
}

export const STAMP_SITES: readonly StampSite[] = [bridgeSite()];
export const RELIEF_SITES: readonly StampSite[] = [...coreSites(), ...STAMP_SITES];

for (const site of RELIEF_SITES) if (!Number.isInteger(site.shift.x) || !Number.isInteger(site.shift.y)) throw new Error(`${site.id} stands off the tile grid of its ground`);

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
  for (const site of RELIEF_SITES) {
    const share = stampShare(site, p);
    if (share > (best?.share ?? 0)) best = { site, share };
  }
  return best;
}
