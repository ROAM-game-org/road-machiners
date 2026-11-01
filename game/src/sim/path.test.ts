import { START_KITS } from '../data/start';
import { describe, expect, it } from 'vitest';
import { MAP_SPREAD, REGION } from '../data/region';
import { FALLEN_SUN_DECKS } from '../data/territory';
import { deckById } from './bridge';
import { boxSegmentDistance, propBoxes } from './mapgen';
import { berthsOf, chooseOn } from './tracks';
import { berthTaste, tasteKey, tasteOf } from './nav/layer';
import { continueRoute, followRoute, keepRoute, reachesFrom, route, routeLength, type Blocker } from './path';
import { isCliff, tileAt } from './terrain';
import type { Vehicle, World } from './types';
import { siteGates } from './sites';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { dist, polylineDist, segmentDist, type Vec } from './vec';
import { newWorld } from './world';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const startWorld = (seed: number): World => reusedWorld(`path ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));
const w1337 = startWorld(1337);

describe("route", () => {
  it("goes straight when nothing is in the way", () => {
    const w = emptyWorld();
    expect(route(w, { x: 30, y: 30 }, { x: 40, y: 30 }, 0.6, [])).toEqual([
      { x: 40, y: 30 },
    ]);
  });

  it("ends at the map edge when the goal lies beyond it", () => {
    const w = emptyWorld();
    const pts = route(w, { x: 30, y: 10 }, { x: 30, y: -17 }, 0.6, []);
    expect(pts[pts.length - 1]).toEqual({ x: 30, y: 0.6 });
  });

  it("bends around a rock in the way, keeping clear of it", () => {
    const w = emptyWorld();
    w.obstacles = [{ id: "r", pos: { x: 35, y: 30 }, r: 1.2, kind: "rock" }];
    const pts = route(w, { x: 30, y: 30 }, { x: 40, y: 30 }, 0.6, []);
    expect(pts.length).toBeGreaterThan(1);
    let prev = { x: 30, y: 30 };
    for (const p of pts) {
      expect(segmentDist(w.obstacles[0].pos, prev, p)).toBeGreaterThanOrEqual(
        1.2 + 0.6,
      );
      prev = p;
    }
  });

  const fence = { id: "fence-0", pos: { x: 40, y: 30 }, r: 0.5, kind: "landmark" as const, look: "fence" as const, yaw: Math.PI / 2 };

  it("drives straight along a fence's side, closer to it than its radius would allow", () => {
    const w = emptyWorld();
    w.obstacles = [fence];
    const to = { x: 41.2, y: 40 };

    expect(route(w, { x: 41.2, y: 20 }, to, 0.6, [])).toEqual([to]);
  });

  it("bends around a fence across the way, keeping clear of its rails", () => {
    const w = emptyWorld();
    w.obstacles = [fence];
    const pts = route(w, { x: 35, y: 30 }, { x: 45, y: 30 }, 0.6, []);

    expect(pts.length).toBeGreaterThan(1);
    let prev = { x: 35, y: 30 };
    for (const p of pts) {
      for (const box of propBoxes(fence)) expect(boxSegmentDistance(box, prev, p)).toBeGreaterThanOrEqual(0.6);
      prev = p;
    }
  });

  it("routes to the closest reachable point when the goal is walled in", () => {
    const w = emptyWorld();
    const center = { x: 50, y: 30 };
    w.obstacles = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * 2 * Math.PI;
      return { id: `ring-${i}`, pos: { x: center.x + 6 * Math.cos(a), y: center.y + 6 * Math.sin(a) }, r: 1, kind: "rock" as const };
    });
    const end = route(w, { x: 30, y: 30 }, center, 0.6, []).at(-1)!;
    expect(dist(end, center)).toBeGreaterThan(6 + 1 + 0.6);
    expect(dist(end, center)).toBeLessThan(6 + 1 + 0.6 + 2);
  });

  it("stops short of parked trucks that fence in the goal instead of driving through them", () => {
    const w = emptyWorld();
    const center = { x: 50, y: 30 };
    const parked: Blocker[] = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 2 * Math.PI;
      return { pos: { x: center.x + 3 * Math.cos(a), y: center.y + 3 * Math.sin(a) }, r: 0.7 };
    });
    const from = { x: 30, y: 30 };
    const pts = route(w, from, center, 0.6, parked);
    expect(dist(pts.at(-1)!, center)).toBeGreaterThan(3 + 0.7 + 0.6);
    let prev = from;
    for (const p of pts) {
      for (const o of parked) expect(segmentDist(o.pos, prev, p)).toBeGreaterThanOrEqual(o.r + 0.6);
      prev = p;
    }
  });

  function pocketWorld(): { w: World; center: Vec } {
    const w = emptyWorld();
    const center = { x: 50, y: 30 };
    w.obstacles = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * 2 * Math.PI;
      return { id: `ring-${i}`, pos: { x: center.x + 3 * Math.cos(a), y: center.y + 3 * Math.sin(a) }, r: 0.2, kind: "rock" as const };
    });
    return { w, center };
  }

  it("a truck on blocked ground next to a closed pocket drives out toward the goal's side", () => {
    const { w, center } = pocketWorld();
    const pts = route(w, { x: center.x + 2.8, y: center.y }, { x: 70, y: 30 }, 0.6, []);
    expect(dist(pts[0], center)).toBeGreaterThan(3);
    expect(dist(pts.at(-1)!, { x: 70, y: 30 })).toBeLessThan(0.01);
  });


  it('player routes on the real map stay direct where no cliff lies across the straight line', () => {
    const w = w1337;
    const size = w.terrain.size;
    let seed = 1337;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const clamp = (v: number) => Math.min(size - 20, Math.max(20, v));
    const crossesCliff = (a: Vec, b: Vec): boolean => {
      const steps = Math.ceil(dist(a, b) * 2);
      return Array.from({ length: steps + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps })).some((p) => isCliff(w.terrain, tileAt(w.terrain, p)));
    };
    let waypoints = 0;
    let clear = 0;
    let length = 0;
    let straight = 0;
    for (let k = 0; k < 150; k++) {
      const from = { x: 20 + next() * (size - 40), y: 20 + next() * (size - 40) };
      const heading = next() * Math.PI * 2;
      const span = 15 + next() * 120;
      const to = { x: clamp(from.x + Math.cos(heading) * span), y: clamp(from.y + Math.sin(heading) * span) };
      let pts: Vec[];
      try {
        pts = route(w, from, to, 0.6, []);
      } catch {
        continue;
      }
      waypoints += pts.length;
      if (crossesCliff(from, to)) continue;
      clear++;
      length += routeLength(from, pts);
      straight += dist(from, to);
    }
    expect(waypoints).toBeLessThanOrEqual(2000);
    expect(clear).toBeGreaterThanOrEqual(50);
    expect(length).toBeLessThanOrEqual(1.28 * straight);
  });
});

describe('raised deck ends', () => {
  const flap = deckById(FALLEN_SUN_DECKS[0].id);
  const on = (along: number, across: number): Vec => ({
    x: flap.from.x + flap.axis.x * along - flap.axis.y * across,
    y: flap.from.y + flap.axis.y * along + flap.axis.x * across,
  });
  const alongOf = (p: Vec) => (p.x - flap.from.x) * flap.axis.x + (p.y - flap.from.y) * flap.axis.y;
  const acrossOf = (p: Vec) => (p.y - flap.from.y) * flap.axis.x - (p.x - flap.from.x) * flap.axis.y;
  const onFlap = (p: Vec) => alongOf(p) >= 0 && alongOf(p) <= flap.length && Math.abs(acrossOf(p)) <= flap.width / 2;

  function samples(points: Vec[]): Vec[] {
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const n = Math.max(1, Math.ceil(dist(points[i - 1], points[i]) * 20));
      for (let k = 1; k <= n; k++) out.push({ x: points[i - 1].x + ((points[i].x - points[i - 1].x) * k) / n, y: points[i - 1].y + ((points[i].y - points[i - 1].y) * k) / n });
    }
    return out;
  }

  function expectOnAndOffOverLowEnd(points: Vec[]): void {
    const path = samples(points);
    for (let i = 1; i < path.length; i++) {
      if (onFlap(path[i]) === onFlap(path[i - 1])) continue;
      expect(alongOf(path[i]), `${path[i].x},${path[i].y}`).toBeLessThan(0.5);
      expect(Math.abs(acrossOf(path[i]))).toBeLessThan(flap.width / 2);
    }
  }

  it('climbs from the landing below the lip onto the flap only round by its low end', () => {
    const radius = 0.5;
    const below = on(flap.length + 4, 0);
    const top = on(flap.length - 1.5, 0);
    const points = [below, ...route(w1337, below, top, radius, [])];

    expect(points.at(-1)).toEqual(top);
    expectOnAndOffOverLowEnd(points);
    expect(routeLength(below, points.slice(1))).toBeGreaterThan(flap.length);
  });

  it('never routes off the flap over its lip, though the landing lies straight ahead', () => {
    const radius = 0.5;
    const top = on(flap.length - 1.5, 0);
    const landing = on(flap.length + 6, 0);
    const points = [top, ...route(w1337, top, landing, radius, [])];

    expect(points.at(-1)).toEqual(landing);
    expectOnAndOffOverLowEnd(points);
  });
});

describe('driver taste', () => {
  const brain = npcBrain('trader', { x: 0, y: 0 }, ['trader']);
  const site = (id: string) => {
    const found = [...REGION.towns, ...REGION.locations].find((s) => s.id === id);
    if (found === undefined) throw new Error(`No site ${id}`);
    return found;
  };
  const from = siteGates(site('nose'))[0];
  const to = siteGates(site('pump-station'))[0];
  const w = w1337;
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  const trader = (id: string): Vehicle => ({ ...me, id, faction: 'independent', brain });
  const apart = (p: Vec[], q: Vec[]) => Math.max(...p.map((x) => polylineDist(x, q)), ...q.map((x) => polylineDist(x, p)));

  it('sends drivers between the same places along different ways', () => {
    const routes = Array.from({ length: 10 }, (_, i) => [from, ...route(w, from, to, 0.8, [], trader(`v${100 + i}`))]);
    const ways = routes.filter((r, i) => routes.slice(0, i).every((q) => apart(r, q) > 10 * MAP_SPREAD));
    expect(ways.length).toBeGreaterThanOrEqual(2);
  });

  it('gives one driver the same route every time', () => {
    const driver = trader('v100');
    expect(route(w, from, to, 0.8, [], driver)).toEqual(route(w, from, to, 0.8, [], { ...driver }));
  });

  it('plans the plain route for the player', () => {
    expect(route(w, from, to, 0.8, [], me)).toEqual(route(w, from, to, 0.8, [], { ...me, id: 'another' }));
  });
});

describe('berth around a truck the driver ran from', () => {
  const open = () => {
    const w = emptyWorld({ x: 10, y: 10 });
    const driver = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 60 });
    driver.brain = npcBrain('buggy', driver.pos, ['trader']);
    return { w, driver };
  };
  const a = { x: 30, y: 60 };
  const b = { x: 130, y: 60 };

  it('bends the route around the last sensed point', () => {
    const { w, driver } = open();
    const plain = route(w, a, b, 0.8, [], driver);
    chooseOn(w, driver, 'v300', { x: 80, y: 60 }, 'flee', true);
    const around = route(w, a, b, 0.8, [], driver);
    const r = berthsOf(w, driver)[0].r;
    expect(plain).toEqual([b]);
    expect(around.length).toBeGreaterThan(1);
    for (const p of [a, ...around]) expect(dist(p, { x: 80, y: 60 })).toBeGreaterThan(r - 1.5);
    expect(around[around.length - 1]).toEqual(b);
  });

  it('still reaches a stop inside the berth', () => {
    const { w, driver } = open();
    chooseOn(w, driver, 'v300', { x: 80, y: 60 }, 'flee', true);
    const inside = { x: 82, y: 60 };
    const points = route(w, a, inside, 0.8, [], driver);
    expect(points[points.length - 1]).toEqual(inside);
  });

  it('ignores the truck the top goal targets', () => {
    const { w, driver } = open();
    driver.brain!.goals = [{ kind: 'fight', targetId: 'v300', destination: null, phase: 'travel', reason: 'fightBack' }];
    chooseOn(w, driver, 'v300', { x: 80, y: 60 }, 'flee', true);
    expect(route(w, a, b, 0.8, [], driver)).toEqual([b]);
  });

  it('keys the search by the berth and leaves a driver without one alone', () => {
    const { w, driver } = open();
    const base = tasteOf(w, driver)!;
    const plainKey = tasteKey(base);
    expect(tasteKey(berthTaste(base, []))).toBe(plainKey);
    expect(berthTaste(base, [])).toBe(base);
    const one = tasteKey(berthTaste(base, [{ x: 80, y: 60, r: 20 }]));
    const other = tasteKey(berthTaste(base, [{ x: 90, y: 60, r: 20 }]));
    expect(one).not.toBe(plainKey);
    expect(one).not.toBe(other);
  });
});

describe('kept routes', () => {
  function bent(): { w: World; from: Vec; to: Vec; points: Vec[] } {
    const w = emptyWorld();
    w.obstacles = [36, 40, 44].map((x) => ({ id: `r${x}`, pos: { x, y: 30 }, r: 1.5, kind: 'rock' as const }));
    const from = { x: 30, y: 30 };
    const to = { x: 50, y: 30 };
    return { w, from, to, points: route(w, from, to, 0.6, []) };
  }

  it('continues from a later position, dropping the corners driven past', () => {
    const { w, from, to, points } = bent();
    expect(points.length).toBeGreaterThan(2);
    const kept = keepRoute(w, to, points, [], undefined, false);
    const again = continueRoute(w, from, kept, to, 0.6, [])!;
    expect(again[0]).toEqual(points[0]);
    for (const p of again) expect(points).toContainEqual(p);
    const past = { x: points[0].x + (points[1].x - points[0].x) * 0.1, y: points[0].y + (points[1].y - points[0].y) * 0.1 };
    const rest = continueRoute(w, past, kept, to, 0.6, [])!;
    expect(rest.length).toBeGreaterThan(0);
    for (const p of rest) expect(points.slice(1)).toContainEqual(p);
    expect(rest.at(-1)).toEqual(to);
  });

  it('straightens only the road ahead and keeps the corners past the lookahead', () => {
    const w = emptyWorld();
    const points = Array.from({ length: 40 }, (_, i) => ({ x: 32 + i * 4, y: i % 2 === 0 ? 30 : 32 }));
    const from = { x: 30, y: 30 };
    const again = continueRoute(w, from, keepRoute(w, points.at(-1)!, points, [], undefined, false), points.at(-1)!, 0.6, [])!;
    const far = points.filter((p) => routeLength(from, points.slice(0, points.indexOf(p) + 1)) > REGION.navigation.lookahead + 8);
    expect(far.length).toBeGreaterThan(10);
    expect(again.slice(-far.length)).toEqual(far);
    expect(again.length).toBeLessThan(points.length);
  });

  it('follows a window of a longer trip to its own end, and plans the next window within the lookahead of that end', () => {
    const w = emptyWorld();
    const window = [{ x: 30 + REGION.navigation.lookahead * 2, y: 30 }];
    const dest = { x: 30 + REGION.navigation.lookahead * 5, y: 30 };
    const kept = keepRoute(w, dest, window, [], undefined, true);
    expect(continueRoute(w, { x: 30, y: 30 }, kept, dest, 0.6, [])!.at(-1)).toEqual(window[0]);
    expect(continueRoute(w, { x: window[0].x - REGION.navigation.lookahead / 2, y: 30 }, kept, dest, 0.6, [])).toBeNull();
  });

  it('keeps the end of a window when a new blocker forces a fresh route within it', () => {
    const w = emptyWorld();
    const driver = w.vehicles[0];
    const dest = { x: 30 + REGION.navigation.farWindow * 3, y: 30 };
    const first = followRoute(w, driver, dest, 0.6, [], null);
    expect(first.partial).toBe(true);
    driver.pos = { x: 40, y: 30 };
    const rock: Blocker = { pos: { x: 60, y: 30 }, r: 1.5 };
    const again = followRoute(w, driver, dest, 0.6, [rock], first);
    expect(again.points.at(-1)).toEqual(first.points.at(-1));
    expect(again.points.every((p, i) => segmentDist(rock.pos, i === 0 ? driver.pos : again.points[i - 1], p) > rock.r)).toBe(true);
  });

  it('ends on a destination that moved, and drops the route for a vehicle parked on a later leg', () => {
    const { w, from, to, points } = bent();
    const kept = keepRoute(w, to, points, [], undefined, false);
    const near = { x: to.x, y: to.y + 0.3 };
    expect(continueRoute(w, from, kept, near, 0.6, [])!.at(-1)).toEqual(near);
    const onLeg = { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 };
    expect(continueRoute(w, from, kept, to, 0.6, [{ pos: onLeg, r: 0.8 }])).toBeNull();
    expect(continueRoute(w, from, keepRoute(w, to, points, [{ pos: onLeg, r: 0.8 }], undefined, false), to, 0.6, [{ pos: onLeg, r: 0.8 }])).not.toBeNull();
  });
});

describe('reachesFrom', () => {
  const center = { x: 60, y: 60 };
  const ringed = () => {
    const w = emptyWorld(center);
    w.obstacles = Array.from({ length: 16 }, (_, i) => {
      const a = (2 * Math.PI * i) / 16;
      return { id: `ring${i}`, pos: { x: center.x + Math.cos(a) * 3.5, y: center.y + Math.sin(a) * 3.5 }, r: 1.2, kind: 'rock' as const };
    });
    return w;
  };

  it('is false inside a closed ring of rocks and true beside the anchor', () => {
    const w = ringed();
    const reaches = reachesFrom(w, { x: 80, y: 60 }, 0.6, Infinity);
    expect(reaches(center)).toBe(false);
    expect(reaches({ x: 79, y: 60 })).toBe(true);
  });

  it('is false off the map', () => {
    const reaches = reachesFrom(emptyWorld(), { x: 80, y: 60 }, 0.6, Infinity);
    expect(reaches({ x: -1, y: 60 })).toBe(false);
  });

  it('throws on an anchor inside a solid rock', () => {
    const w = emptyWorld();
    w.obstacles = [{ id: 'big', pos: { x: 80, y: 60 }, r: 8, kind: 'rock' }];
    expect(() => reachesFrom(w, { x: 80, y: 60 }, 0.6, Infinity)).toThrow(/No nav component/);
  });
});
