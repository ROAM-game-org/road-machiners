import { describe, expect, it } from 'vitest';
import { crossesRail, deckAt, decksOf } from './bridge';
import { highwayMap } from './highway';
import { route, type Blocker } from './path';
import { clearanceFor } from './clearance';
import { addVehicle, emptyWorld } from './testkit';
import type { World } from './types';
import type { Vec } from './vec';

function highwayWorld(seed: number, window: number): World {
  const w = emptyWorld();
  w.terrain = highwayMap(seed, window).terrain;
  w.obstacles = [];
  return w;
}

function legs(from: Vec, points: Vec[]): [Vec, Vec][] {
  return points.map((p, i) => [i === 0 ? from : points[i - 1], p]);
}

describe('a truck inside the walls of a ramp routes out through the open end', () => {
  it('a semi with a truck parked beside the open end never routes across a rail', () => {
    const w = highwayWorld(19, 5);
    const decks = decksOf(w.terrain.atlas);
    const from = { x: 211.1, y: 239.91 };
    const parked: Blocker[] = [{ pos: { x: 214.7, y: 242.8 }, r: 0.6 }];
    const points = route(w, from, { x: 210.56, y: 242.35 }, 1.2, parked);

    expect(deckAt(decks, from.x, from.y)).not.toBeNull();
    expect(legs(from, points).filter(([a, b]) => crossesRail(decks, a, b, 0))).toEqual([]);
  });

  it('a bus sealed in by a wreck at the open end routes out past the wreck, not to its own spot', () => {
    const w = highwayWorld(12, 12);
    const decks = decksOf(w.terrain.atlas);
    const from = { x: 211.11, y: 185.47 };
    const wreck: Blocker[] = [{ pos: { x: 210.66, y: 190.29 }, r: 0.5 }];
    const points = route(w, from, { x: 214.18, y: 166.16 }, 0.9, wreck);

    expect(deckAt(decks, from.x, from.y)).not.toBeNull();
    expect(legs(from, points).filter(([a, b]) => crossesRail(decks, a, b, 0))).toEqual([]);
    expect(points.some((p) => deckAt(decks, p.x, p.y) === null && p.y > from.y)).toBe(true);
  });

  it('counts a semi pressed between the rails and the lip of a ramp as touching', () => {
    const w = highwayWorld(19, 5);
    const semi = addVehicle(w, 'scrapjaw', 'semi', ['stockEngine'], { x: 211, y: 239.9 }, -1.49);

    expect(clearanceFor(w, semi, []).touches(semi.pos, semi.heading, semi.bend)).toBe(true);
    expect(clearanceFor(w, semi, []).touches({ x: 200, y: 250 }, semi.heading, semi.bend)).toBe(false);
  });
});
