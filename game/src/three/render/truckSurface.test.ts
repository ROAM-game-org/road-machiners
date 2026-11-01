import { describe, expect, it } from 'vitest';
import { ATLAS_MAX, edgeDistances, NEUTRAL_SLOT, packMasks, slotUv, WEAR_EDGE, type AtlasLayout } from './truckSurface';

const sides = (entries: [string, number][]) => new Map(entries);

function overlaps(a: { x: number; y: number; side: number }, b: { x: number; y: number; side: number }): boolean {
  return a.x < b.x + b.side && b.x < a.x + a.side && a.y < b.y + b.side && b.y < a.y + a.side;
}

function slotsOf(layout: AtlasLayout) {
  return [...layout.slots.values()];
}

describe('packMasks', () => {
  const layout = packMasks(sides([['base', 512], ['gun', 128], ['wheel', 64], ['plate', 128], ['bolt', 32], ['cab', 256]]));

  it('gives every mask and the neutral slot a slot', () => {
    expect([...layout.slots.keys()].sort()).toEqual(['base', 'bolt', 'cab', 'gun', NEUTRAL_SLOT, 'plate', 'wheel'].sort());
  });

  it('keeps slots apart and inside the atlas (IV4)', () => {
    const all = slotsOf(layout);
    for (const s of all) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.side).toBeLessThanOrEqual(layout.side);
      expect(s.y + s.side).toBeLessThanOrEqual(layout.side);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
  });

  it('starts every slot on a multiple of its own side, so a mip level never mixes two slots (IV4)', () => {
    for (const s of slotsOf(layout)) {
      expect(s.x % s.side).toBe(0);
      expect(s.y % s.side).toBe(0);
    }
  });

  it('uses the smallest square atlas that fits', () => {
    expect(layout.side).toBe(1024);
    expect(packMasks(sides([['a', 512], ['b', 512], ['c', 512]])).side).toBe(1024);
    expect(packMasks(sides([['a', 512], ['b', 512], ['c', 512], ['d', 512]])).side).toBe(2048);
  });

  it('fails loud when the masks do not fit the biggest atlas', () => {
    const many = sides(Array.from({ length: 5 }, (_, i): [string, number] => [`m${i}`, ATLAS_MAX / 2]));
    expect(() => packMasks(many)).toThrow(/atlas/);
  });

  it('fails loud on a mask side that is not a power of two', () => {
    expect(() => packMasks(sides([['odd', 300]]))).toThrow(/power of two/);
  });
});

describe('slotUv', () => {
  const layout = packMasks(sides([['base', 512], ['gun', 128]]));
  const gun = layout.slots.get('gun')!;

  it('maps the corners of a model UV to the corners of its slot', () => {
    expect(slotUv(layout, gun, 0, 0)).toEqual([gun.x / layout.side, gun.y / layout.side]);
    expect(slotUv(layout, gun, 1, 1)).toEqual([(gun.x + gun.side) / layout.side, (gun.y + gun.side) / layout.side]);
  });
});

type P = [number, number, number];

function soup(tris: [P, P, P][]): Float32Array {
  return new Float32Array(tris.flat(2));
}

function distanceAt(out: Float32Array, tri: number, bary: P): number {
  let best = Infinity;
  for (let edge = 0; edge < 3; edge++) {
    let d = 0;
    for (let corner = 0; corner < 3; corner++) d += bary[corner] * out[(tri * 3 + corner) * 3 + edge];
    best = Math.min(best, d);
  }
  return best;
}

const top: [P, P, P][] = [
  [[0, 1, 0], [0, 1, 1], [1, 1, 1]],
  [[0, 1, 0], [1, 1, 1], [1, 1, 0]],
];
const front: [P, P, P][] = [
  [[0, 0, 1], [1, 0, 1], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1], [0, 1, 1]],
];

describe('edgeDistances', () => {
  it('measures the distance to a convex fold between two faces', () => {
    const out = edgeDistances(soup([...top, ...front]));
    expect(distanceAt(out, 0, [0, 0.5, 0.5])).toBeCloseTo(0, 6);
    expect(distanceAt(out, 0, [1, 0, 0])).toBeCloseTo(1, 6);
    expect(distanceAt(out, 0, [0.5, 0.25, 0.25])).toBeCloseTo(0.5, 6);
  });

  it('ignores the diagonal inside one flat face', () => {
    const out = edgeDistances(soup(top));
    expect(distanceAt(out, 0, [0.5, 0, 0.5])).toBeGreaterThanOrEqual(WEAR_EDGE.far);
  });

  it('ignores an open border', () => {
    const out = edgeDistances(soup(top));
    expect(distanceAt(out, 0, [0, 0.5, 0.5])).toBeGreaterThanOrEqual(WEAR_EDGE.far);
  });

  it('ignores a concave fold', () => {
    const floor: [P, P, P][] = [
      [[0, 0, 0], [0, 0, 1], [1, 0, 1]],
      [[0, 0, 0], [1, 0, 1], [1, 0, 0]],
    ];
    const wall: [P, P, P][] = [
      [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
      [[0, 0, 0], [1, 1, 0], [0, 1, 0]],
    ];
    const out = edgeDistances(soup([...floor, ...wall]));
    expect(distanceAt(out, 1, [0.5, 0, 0.5])).toBeGreaterThanOrEqual(WEAR_EDGE.far);
  });

  it('ignores a fold flatter than the wear angle', () => {
    const tilt = Math.tan(WEAR_EDGE.minAngle / 2);
    const slope: [P, P, P][] = [
      [[0, 1, 1], [1, 1 - tilt, 2], [1, 1, 1]],
      [[0, 1, 1], [0, 1 - tilt, 2], [1, 1 - tilt, 2]],
    ];
    const out = edgeDistances(soup([...top, ...slope]));
    expect(distanceAt(out, 0, [0, 0.5, 0.5])).toBeGreaterThanOrEqual(WEAR_EDGE.far);
  });
});
