import { describe, expect, it } from 'vitest';
import { crossesRail, deckAt, decksOf, type Deck } from './bridge';
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

function rampOf(w: World, id: string): Deck {
  const deck = decksOf(w.terrain.atlas).decks.find((d) => d.id === id);
  if (!deck) throw new Error(`No ramp ${id} in this window`);
  return deck;
}

function onRamp(ramp: Deck, along: number, across: number): Vec {
  return { x: ramp.from.x + ramp.axis.x * along - ramp.axis.y * across, y: ramp.from.y + ramp.axis.y * along + ramp.axis.x * across };
}

function alongRamp(ramp: Deck, p: Vec): number {
  return (p.x - ramp.from.x) * ramp.axis.x + (p.y - ramp.from.y) * ramp.axis.y;
}

function legs(from: Vec, points: Vec[]): [Vec, Vec][] {
  return points.map((p, i) => [i === 0 ? from : points[i - 1], p]);
}

describe('a truck inside the walls of a ramp routes out through the open end', () => {
  it('a semi with a truck parked beside the open end never routes across a rail', () => {
    const w = highwayWorld(1, 2);
    const ramp = rampOf(w, 'ramp-4-1-0');
    const decks = decksOf(w.terrain.atlas);
    const from = onRamp(ramp, 2.99, -0.97);
    const parked: Blocker[] = [{ pos: onRamp(ramp, 0.47, 2.9), r: 0.6 }];
    const points = route(w, from, onRamp(ramp, 0.51, -1.27), 1.2, parked);

    expect(deckAt(decks, from.x, from.y)).not.toBeNull();
    expect(legs(from, points).filter(([a, b]) => crossesRail(decks, a, b, 0))).toEqual([]);
  });

  it('a bus sealed in by a wreck at the open end routes out past the wreck, not to its own spot', () => {
    const w = highwayWorld(3, 6);
    const ramp = rampOf(w, 'ramp-7-2-0');
    const decks = decksOf(w.terrain.atlas);
    const from = onRamp(ramp, 3.73, 0.43);
    const wreck: Blocker[] = [{ pos: onRamp(ramp, -1.11, 0.27), r: 0.5 }];
    const points = route(w, from, onRamp(ramp, 23.19, 2.33), 0.9, wreck);

    expect(deckAt(decks, from.x, from.y)).not.toBeNull();
    expect(legs(from, points).filter(([a, b]) => crossesRail(decks, a, b, 0))).toEqual([]);
    expect(points.some((p) => deckAt(decks, p.x, p.y) === null && alongRamp(ramp, p) < alongRamp(ramp, from))).toBe(true);
  });

  it('counts a semi pressed between the rails and the lip of a ramp as touching', () => {
    const w = highwayWorld(1, 2);
    const ramp = rampOf(w, 'ramp-4-1-0');
    const at = onRamp(ramp, 2.99, -1.07);
    const semi = addVehicle(w, 'scrapjaw', 'semi', ['stockEngine'], at, Math.atan2(ramp.axis.y, ramp.axis.x) - 0.018);

    expect(clearanceFor(w, semi, []).touches(semi.pos, semi.heading, semi.bend)).toBe(true);
    expect(clearanceFor(w, semi, []).touches(onRamp(ramp, -8.15, -11.02), semi.heading, semi.bend)).toBe(false);
  });
});
