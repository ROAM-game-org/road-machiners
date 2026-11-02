import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { CRASH, MAPGEN } from '../data/terrain';
import { siteGap } from '../sim/sites';
import { territoryAt } from '../sim/territory';
import { apronCaches, apronClump, apronDraws, apronShare, apronThinning } from './apron';

const crater = REGION.locations.find((l) => l.id === 'fallen-sun');

describe('the Fallen Sun apron', () => {
  const outside = apronDraws(MAPGEN.seed).filter((p) => territoryAt(p.pos) === null);

  it('thins with distance from the crater edge and ends without a cut', () => {
    expect(apronThinning(0, 100)).toBeCloseTo(1, 9);
    expect(apronThinning(100, 200)).toBeLessThan(apronThinning(40, 140));
    expect(apronThinning(300, CRASH.apron.reach)).toBe(0);
    expect(apronThinning(300, CRASH.apron.reach * (1 - CRASH.apron.taper / 2))).toBeGreaterThan(0);
  });

  it('fades out toward the uprange side instead of cutting', () => {
    const edge = Math.acos(CRASH.apron.bareBelow);
    expect(apronShare(Math.PI)).toBe(0);
    expect(apronShare(edge)).toBeCloseTo(0, 9);
    expect(apronShare(edge - 0.1)).toBeGreaterThan(0);
    expect(apronShare(0)).toBe(1);
  });

  it('clumps by noise, with bare ground and dense ground both present', () => {
    const levels = Array.from({ length: 4000 }, (_, k) => apronClump(5, { x: 900 + (k % 80) * 7, y: 700 + Math.floor(k / 80) * 7 }));
    expect(levels.filter((c) => c === 0).length).toBeGreaterThan(200);
    expect(levels.filter((c) => c > 0.9).length).toBeGreaterThan(200);
  });

  it('covers about twice the old reach in area, with fewer pieces per tile far out', () => {
    expect((CRASH.apron.reach / 260) ** 2).toBeGreaterThan(1.9);
    if (!crater) throw new Error('no crater');
    const count = (lo: number, hi: number): number => outside.filter((p) => siteGap(crater, p.pos) >= lo && siteGap(crater, p.pos) < hi).length;
    const area = (lo: number, hi: number): number => Math.PI * ((60 + hi) ** 2 - (60 + lo) ** 2);
    expect(count(0, 40) / area(0, 40)).toBeGreaterThan((2 * count(150, 250)) / area(150, 250));
    expect(outside.some((p) => siteGap(crater, p.pos) > 200)).toBe(true);
  });

  it('sets rare cargo pods in noise clumps of the outer field, apart and never inside the outline', () => {
    if (!crater) throw new Error('no crater');
    const { count, from, clump, apart } = CRASH.apron.caches;
    const pods = apronCaches(MAPGEN.seed, () => true);
    expect(pods).toHaveLength(count);
    for (const pod of pods) {
      expect(pod.kind).toBe('shipCache');
      expect(siteGap(crater, pod.pos)).toBeGreaterThanOrEqual(from);
      expect(territoryAt(pod.pos)).toBeNull();
    }
    for (const [a, b] of pods.flatMap((p, i) => pods.slice(i + 1).map((q): [typeof p, typeof p] => [p, q]))) expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThanOrEqual(apart);
    expect(apronCaches(MAPGEN.seed, () => true)).toEqual(pods);
    expect(clump).toBeGreaterThan(0.5);
  });

  it('mixes ship parts among the rocks and shards', () => {
    const parts = new Set(CRASH.apron.parts.looks.map((l) => l.look));
    const share = outside.filter((p) => parts.has(p.kind)).length / outside.length;
    expect(share).toBeGreaterThan(CRASH.apron.parts.share * 0.8);
    expect(share).toBeLessThan(CRASH.apron.parts.share * 1.2);
    for (const look of parts) expect(outside.some((p) => p.kind === look), look).toBe(true);
    expect(outside.some((p) => p.kind === 'rimRock')).toBe(true);
    expect(outside.some((p) => p.kind === 'hullShard')).toBe(true);
  });

  it('draws the same pieces for the same seed', () => {
    expect(apronDraws(MAPGEN.seed)).toEqual(apronDraws(MAPGEN.seed));
  });
});
