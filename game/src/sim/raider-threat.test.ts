import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import { raiderPosts, threatAt, threatAlong, threatOfCount } from './raider-threat';
import { emptyWorld } from './testkit';

describe('raider threat steps', () => {
  it('maps post counts to steps', () => {
    expect([0, 1, 2, 3, 9].map(threatOfCount)).toEqual([1, 2, 2, 3, 3]);
  });

  it('rejects counts that are not whole and non-negative', () => {
    expect(() => threatOfCount(-1)).toThrow();
    expect(() => threatOfCount(1.5)).toThrow();
  });
});

describe('raider posts', () => {
  it('lists every camp post and is built once per terrain', () => {
    const w = emptyWorld();
    const camps = REGION.locations.filter((site) => site.kind === 'camp');
    const expected = camps.flatMap((camp) => [...raiderGrounds(w, camp), ...raiderPatrolPosts(w, camp)]);
    expect(raiderPosts(w)).toEqual(expected);
    expect(raiderPosts(w)).toBe(raiderPosts(w));
  });

  it('reads a point far from every post as safe', () => {
    const w = emptyWorld();
    const far = { x: -1000, y: -1000 };
    expect(threatAt(w, far)).toBe(1);
    expect(threatAlong(w, far, { x: -1000, y: -900 })).toBe(1);
  });

  it('reads a post itself as at least risky', () => {
    const w = emptyWorld();
    expect(threatAt(w, raiderPosts(w)[0])).toBeGreaterThanOrEqual(2);
  });
});
