import { describe, expect, it } from 'vitest';
import { emptyWorld } from '../../sim/testkit';
import type { World } from '../../sim/types';
import { BeforeTurn, driftAt, turnShare } from './turn-blend';

const clockOf = (before: World | null, progress: number) => ({ before, progress, moved: false, hookedLines: new Set<string>() });
const from = { pos: { x: 0, y: 0 }, vel: { x: 1, y: 2 } };
const to = { pos: { x: 3, y: -1 }, vel: { x: 3, y: -1 } };

describe('turnShare', () => {
  it('is 1 when no turn plays and the progress while one does', () => {
    expect(turnShare(null)).toBe(1);
    expect(turnShare(clockOf(null, 0.2))).toBe(1);
    expect(turnShare(clockOf(emptyWorld(), 0.4))).toBe(0.4);
  });

  it('refuses a bad progress', () => {
    expect(() => turnShare(clockOf(emptyWorld(), NaN))).toThrow();
    expect(() => turnShare(clockOf(emptyWorld(), 1.2))).toThrow();
  });
});

describe('driftAt', () => {
  it('starts on the before spot and ends on the after spot', () => {
    expect(driftAt(from, to, 0)).toEqual(from.pos);
    const end = driftAt(from, to, 1);
    expect(end.x).toBeCloseTo(to.pos.x, 12);
    expect(end.y).toBeCloseTo(to.pos.y, 12);
  });

  it('leaves along the before velocity and arrives along the after velocity', () => {
    const e = 1e-5;
    const a = driftAt(from, to, e);
    expect(a.x / e).toBeCloseTo(from.vel.x, 3);
    expect(a.y / e).toBeCloseTo(from.vel.y, 3);
    const b = driftAt(from, to, 1 - e);
    expect((to.pos.x - b.x) / e).toBeCloseTo(to.vel.x, 3);
    expect((to.pos.y - b.y) / e).toBeCloseTo(to.vel.y, 3);
  });

  it('is a straight line at constant velocity', () => {
    const a = { pos: { x: 1, y: 1 }, vel: { x: 2, y: 0.5 } };
    const b = { pos: { x: 3, y: 1.5 }, vel: { x: 2, y: 0.5 } };
    const mid = driftAt(a, b, 0.25);
    expect(mid.x).toBeCloseTo(1.5, 12);
    expect(mid.y).toBeCloseTo(1.125, 12);
  });

  it('refuses a share outside 0 to 1', () => {
    expect(() => driftAt(from, to, -0.1)).toThrow();
    expect(() => driftAt(from, to, 1.1)).toThrow();
    expect(() => driftAt(from, to, NaN)).toThrow();
  });
});

describe('BeforeTurn', () => {
  it('finds items of the before world and indexes once per before world', () => {
    let reads = 0;
    const index = new BeforeTurn<{ id: string }>(() => {
      reads++;
      return [{ id: 'a' }];
    });
    const before = emptyWorld();
    expect(index.of(null, 'a')).toBeUndefined();
    expect(index.of(clockOf(null, 0), 'a')).toBeUndefined();
    expect(index.of(clockOf(before, 0), 'a')).toEqual({ id: 'a' });
    expect(index.of(clockOf(before, 0.5), 'b')).toBeUndefined();
    expect(reads).toBe(1);
    index.of(clockOf(emptyWorld(), 0), 'a');
    expect(reads).toBe(2);
  });
});
