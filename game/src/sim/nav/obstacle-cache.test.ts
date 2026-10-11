import { describe, expect, it } from 'vitest';
import type { Obstacle } from '../types';
import { ObstacleCache } from './obstacle-cache';

function rock(id: string, x: number, y = 0): Obstacle {
  return { id, kind: 'rock', pos: { x, y }, r: 1 } as Obstacle;
}

let total = 0;

function counting(cache: ObstacleCache<number>, obstacles: Obstacle[], scope: unknown = 0) {
  let built = 0;
  const value = cache.get(obstacles, scope, () => {
    built++;
    return ++total;
  });
  return { built, value };
}

describe('ObstacleCache', () => {
  it('returns the built value for the same array without building again', () => {
    const cache = new ObstacleCache<number>(4);
    const obstacles = [rock('a', 1), rock('b', 2)];
    const first = counting(cache, obstacles);
    const second = counting(cache, obstacles);
    expect(first.built).toBe(1);
    expect(second.built).toBe(0);
    expect(second.value).toBe(first.value);
  });

  it('reuses the entry for a structured clone with the same obstacles', () => {
    const cache = new ObstacleCache<number>(4);
    const obstacles = [rock('a', 1), rock('b', 2)];
    const first = counting(cache, obstacles);
    const clone = counting(cache, structuredClone(obstacles));
    expect(clone.built).toBe(0);
    expect(clone.value).toBe(first.value);
  });

  it('builds a new entry after a push onto a proven array', () => {
    const cache = new ObstacleCache<number>(4);
    const obstacles = [rock('a', 1)];
    const first = counting(cache, obstacles);
    obstacles.push(rock('b', 2));
    const pushed = counting(cache, obstacles);
    expect(pushed.built).toBe(1);
    expect(pushed.value).not.toBe(first.value);
    expect(counting(cache, obstacles).built).toBe(0);
  });

  it('builds a new entry for a new array where one obstacle moved or turned', () => {
    const cache = new ObstacleCache<number>(4);
    counting(cache, [rock('a', 1), rock('b', 2)]);
    expect(counting(cache, [rock('a', 1), rock('b', 3)]).built).toBe(1);
    const landmark = (yaw: number) => [{ id: 'l', kind: 'landmark', look: 'tower', yaw, pos: { x: 0, y: 0 }, r: 1 } as unknown as Obstacle];
    counting(cache, landmark(0));
    expect(counting(cache, landmark(1)).built).toBe(1);
  });

  it('keeps a separate entry per scope', () => {
    const cache = new ObstacleCache<number>(4);
    const obstacles = [rock('a', 1)];
    const one = counting(cache, obstacles, 'one');
    const two = counting(cache, obstacles, 'two');
    expect(two.built).toBe(1);
    expect(counting(cache, obstacles, 'one').value).toBe(one.value);
    expect(counting(cache, obstacles, 'two').value).toBe(two.value);
  });

  it('keeps at most the kept entries and rebuilds an evicted one, even for a proven array', () => {
    const cache = new ObstacleCache<number>(2);
    const first = [rock('a', 1)];
    counting(cache, first);
    counting(cache, [rock('b', 1)]);
    counting(cache, [rock('c', 1)]);
    expect(counting(cache, first).built).toBe(1);
  });
});
