import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { siteGap, type Site } from './sites';

const MIN_GAP = 20;
const EDGE_SAMPLES = 12;

const sites: Site[] = [...REGION.towns, ...REGION.locations];

function edgePoints(site: Site) {
  const outline = 'outline' in site ? site.outline : null;
  if (outline)
    return outline.flatMap((a, i) => {
      const b = outline[(i + 1) % outline.length];
      return Array.from({ length: EDGE_SAMPLES }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / EDGE_SAMPLES, y: a.y + ((b.y - a.y) * k) / EDGE_SAMPLES }));
    });
  return Array.from({ length: 180 }, (_, k) => ({ x: site.pos.x + Math.cos((k / 180) * 2 * Math.PI) * site.radius, y: site.pos.y + Math.sin((k / 180) * 2 * Math.PI) * site.radius }));
}

function gapBetween(a: Site, b: Site): number {
  return Math.min(...edgePoints(a).map((p) => siteGap(b, p)), ...edgePoints(b).map((p) => siteGap(a, p)));
}

describe('gaps between places', () => {
  it('leaves open ground between every two places', () => {
    for (const a of sites)
      for (const b of sites) if (a.id < b.id) expect(gapBetween(a, b), `${a.id} to ${b.id}`).toBeGreaterThanOrEqual(MIN_GAP);
  });
});
