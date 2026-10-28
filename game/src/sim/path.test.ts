import { START_KITS } from '../data/start';
import { describe, expect, it } from 'vitest';
import { MAP_SPREAD, REGION } from '../data/region';
import { TERRAIN_TYPES } from '../data/terrain';
import { FALLEN_SUN_DECKS } from '../data/territory';
import { deckById } from './bridge';
import { boxSegmentDistance, propBoxes } from './mapgen';
import { offRoadTaste, tasteKey, tasteOf, terrainNav, tileIndex } from './nav/layer';
import { continueRoute, followRoute, keepRoute, reachesFrom, route, routeLength, straightClear, type Blocker } from './path';
import { tileAt } from './terrain';
import type { NpcActivity, Vehicle, World } from './types';
import type { TraitId } from '../data/npcs';
import { siteGates } from './sites';
import { addGoods } from './inventory';
import { climbGrade } from './stats';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
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


  it('player routes on the real map stay direct', () => {
    const w = w1337;
    const size = w.terrain.size;
    let seed = 1337;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const clamp = (v: number) => Math.min(size - 20, Math.max(20, v));
    let waypoints = 0;
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
      length += routeLength(from, pts);
      straight += dist(from, to);
    }
    expect(waypoints).toBeLessThanOrEqual(2000);
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

describe('routes prefer roads', () => {
  function roadWorld(road: Vec[]): World {
    const w = emptyWorld();
    const t = editableTerrain(w);
    for (let y = 0; y < t.size; y++)
      for (let x = 0; x < t.size; x++) t.types[y * t.size + x] = polylineDist({ x: x + 0.5, y: y + 0.5 }, road) < REGION.roadWidth / 2 ? 'road' : 'hardpan';
    return w;
  }

  function roadShare(w: World, from: Vec, points: Vec[]): number {
    let on = 0;
    let all = 0;
    let prev = from;
    for (const p of points) {
      const n = Math.ceil(dist(prev, p) * 4);
      for (let k = 0; k < n; k++) {
        all++;
        if (w.terrain.types[tileAt(w.terrain, { x: prev.x + ((p.x - prev.x) * k) / n, y: prev.y + ((p.y - prev.y) * k) / n })] === 'road') on++;
      }
      prev = p;
    }
    return on / all;
  }

  it('follows a bent road that is 41% longer than the straight line', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 160, y: 160 };
    const w = roadWorld([a, { x: 160, y: 100 }, b]);
    const pts = route(w, a, b, 0.6, []);
    expect(roadShare(w, a, pts)).toBeGreaterThan(0.9);
  });

  it('joins the road from open ground next to it instead of cutting the bend', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 160, y: 160 };
    const w = roadWorld([a, { x: 160, y: 100 }, b]);
    const start = { x: 100, y: 106 };
    const pts = route(w, start, b, 0.6, []);
    expect(roadShare(w, start, pts)).toBeGreaterThan(0.85);
  });

  it('a truck pushed deep into a rock clearance routes out of it first', () => {
    const w = emptyWorld();
    const rock = { x: 40, y: 30 };
    w.obstacles = [{ id: 'r', pos: rock, r: 3, kind: 'rock' }];
    const from = { x: 36.8, y: 30 };
    const pts = route(w, from, { x: 44, y: 30 }, 0.6, []);
    expect(pts.length).toBeGreaterThan(1);
    expect(dist(pts[0], rock)).toBeGreaterThan(dist(from, rock));
    for (let i = 1; i < pts.length; i++) for (const box of propBoxes(w.obstacles[0])) expect(boxSegmentDistance(box, pts[i - 1], pts[i])).toBeGreaterThanOrEqual(0.6);
  });

  it('prices the ground within a road width of a site like road', () => {
    const w = emptyWorld();
    editableTerrain(w).types.fill('hardpan');
    const nav = terrainNav(w.terrain);
    const site = REGION.locations.find((l) => l.kind !== 'territory')!;
    const at = (d: number) => nav.tileCost[tileIndex(nav.size, site.pos.x + d, site.pos.y)];
    expect(at(site.radius + REGION.roadWidth - 1)).toBeCloseTo(1 / TERRAIN_TYPES.hardpan.speed, 9);
    expect(at(site.radius + REGION.roadWidth + 1)).toBeCloseTo(REGION.navigation.offRoadCost / TERRAIN_TYPES.hardpan.speed, 9);
  });

  it('goes around a steep hill that it could climb', () => {
    const w = emptyWorld();
    const t = editableTerrain(w);
    const n = t.size + 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t.heights[j * n + i] = Math.max(0, 4 - Math.hypot(i - 35, j - 30)) * 0.58;
    const pts = route(w, { x: 30, y: 30 }, { x: 40, y: 30 }, 0.6, []);
    expect(polylineDist({ x: 35, y: 30 }, [{ x: 30, y: 30 }, ...pts])).toBeGreaterThan(3);
  });

  describe('climb limit', () => {
    const FOOT = 45;
    const TOP = 3.3;
    function ravine(wall: number, mouth: number | null, w: World = emptyWorld({ x: 200, y: 200 })): World {
      const t = editableTerrain(w);
      const n = t.size + 1;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const open = mouth === null ? 0 : Math.min(1, Math.max(0, (j - 60) / 10));
          const grade = wall + ((mouth ?? wall) - wall) * open;
          t.heights[j * n + i] = Math.min(TOP, Math.max(0, (i - FOOT) * grade));
        }
      return w;
    }
    function loadedHauler(w: World): Vehicle {
      const v = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine', 'plates', 'trailerBox'], { x: 40, y: 40 });
      v.brain = npcBrain('trader', v.pos, ['trader']);
      addGoods(w, v, 'scrap', 122);
      return v;
    }
    function scout(w: World): Vehicle {
      const v = addVehicle(w, 'independent', 'buggy', ['stockEngine'], { x: 40, y: 40 });
      v.brain = npcBrain('trader', v.pos, ['trader']);
      return v;
    }
    const from = { x: 40, y: 40 };
    const to = { x: 80, y: 40 };
    const reachedY = (pts: Vec[]) => Math.max(...pts.map((p) => p.y));

    it('sends a loaded hauler round a wall it cannot climb, by the gentle mouth', () => {
      const w = ravine(0.5, 0.15);
      const heavy = loadedHauler(w);
      expect(climbGrade(w, heavy)).toBeLessThan(0.5);
      expect(reachedY(route(w, from, to, 0.6, [], heavy))).toBeGreaterThan(60);
    });

    it('lets a truck that climbs the wall cross it as before', () => {
      const w = ravine(0.5, 0.15);
      const light = scout(w);
      expect(climbGrade(w, light)).toBeGreaterThanOrEqual(0.5);
      expect(reachedY(route(w, from, to, 0.6, [], light))).toBeLessThan(45);
    });

    it('gives the player a limit too, so the preview goes round a wall the truck cannot climb', () => {
      const w = emptyWorld({ ...from });
      const me = w.vehicles[0];
      addGoods(w, me, 'scrap', 400);
      ravine(Math.min(0.59, climbGrade(w, me) + 0.06), 0.15, w);
      expect(reachedY(route(w, from, to, 0.6, [], me))).toBeGreaterThan(60);
    });

    it('ends at the same cell with or without the limit in a closed pit', () => {
      const w = ravine(0.55, null);
      const heavy = loadedHauler(w);
      const plain = route(w, from, to, 0.6, []);
      const limited = route(w, from, to, 0.6, [], heavy);
      expect(dist(limited[limited.length - 1], plain[plain.length - 1])).toBeLessThan(1);
    });

    it('keeps a long route off the wall too', () => {
      const w = ravine(0.5, 0.15);
      const heavy = loadedHauler(w);
      const pts = route(w, { x: 40, y: 40 }, { x: 160, y: 40 }, 0.6, [], heavy);
      expect(reachedY(pts)).toBeGreaterThan(60);
    });
  });

  it('crosses gentle rolling ground in one straight line', () => {
    const w = emptyWorld();
    const t = editableTerrain(w);
    t.types.fill('hardpan');
    const n = t.size + 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t.heights[j * n + i] = Math.sin(i / 3) * Math.cos(j / 4) * 0.6;
    const from = { x: 30, y: 30 };
    const pts = route(w, from, { x: 70, y: 30 }, 0.6, []);
    expect(pts.length).toBeLessThanOrEqual(2);
    expect(routeLength(from, pts)).toBeLessThan(1.03 * 40);
  });

  it('crosses open ground when the road detour is three times longer', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 160, y: 100 };
    const w = roadWorld([a, { x: 100, y: 160 }, { x: 160, y: 160 }, b]);
    const pts = route(w, a, b, 0.6, []);
    expect(routeLength(a, pts)).toBeLessThan(1.2 * dist(a, b));
  });

  describe('hunting raiders', () => {
    function driverOn(w: World, faction: 'scrapjaw' | 'independent', traits: TraitId[], kind: NpcActivity['kind']): Vehicle {
      const v = addVehicle(w, faction, 'buggy', ['mg', 'stockEngine'], { x: 0, y: 0 });
      v.id = 'v7';
      v.brain = npcBrain('buggy', { x: 0, y: 0 }, traits);
      v.brain.goals = [{ kind, targetId: null, destination: null, phase: 'travel', reason: 'idle' }];
      return v;
    }
    function drivers(w: World) {
      return { raider: driverOn(structuredClone(w), 'scrapjaw', ['raider'], 'raid'), trader: driverOn(structuredClone(w), 'independent', ['trader'], 'trade') };
    }
    const straightRoad = () => roadWorld([{ x: 40, y: 100 }, { x: 220, y: 100 }]);
    const onRoadLength = (w: World, from: Vec, pts: Vec[]) => roadShare(w, from, pts) * routeLength(from, pts);

    it('a raider on a raid routes off the road between two open points beside it, while a trader takes it', () => {
      const w = straightRoad();
      const { raider, trader } = drivers(w);
      const a = { x: 100, y: 106 };
      const b = { x: 160, y: 106 };

      const hunting = route(w, a, b, 0.6, [], raider);
      const trading = route(w, a, b, 0.6, [], trader);

      expect(roadShare(w, a, hunting)).toBeLessThan(0.05);
      expect(roadShare(w, a, trading)).toBeGreaterThan(0.7);
    });

    it('a raider on a raid leaves a straight road between two points on it', () => {
      const w = straightRoad();
      const { raider, trader } = drivers(w);
      const a = { x: 100, y: 100 };
      const b = { x: 160, y: 100 };

      const hunting = route(w, a, b, 0.6, [], raider);

      expect(roadShare(w, a, hunting)).toBeLessThan(0.25);
      expect(route(w, a, b, 0.6, [], trader)).toEqual([b]);
    });

    it('a raider crossing a road crosses it rather than following it', () => {
      const w = straightRoad();
      const { raider, trader } = drivers(w);
      const a = { x: 110, y: 85 };
      const b = { x: 170, y: 115 };

      const hunting = route(w, a, b, 0.6, [], raider);
      const trading = route(w, a, b, 0.6, [], trader);

      expect(onRoadLength(w, a, hunting)).toBeLessThan(3 * REGION.roadWidth);
      expect(onRoadLength(w, a, trading)).toBeGreaterThan(3 * REGION.roadWidth);
    });

    it("keeps the trader's taste, cache key and route, and keys the hunting style apart", () => {
      const w = straightRoad();
      const { raider, trader } = drivers(w);
      const a = { x: 100, y: 106 };
      const b = { x: 160, y: 106 };
      const traderTaste = tasteOf(w, trader)!;
      const huntingTaste = offRoadTaste(tasteOf(w, raider)!, terrainNav(w.terrain));

      const hunting = route(w, a, b, 0.6, [], raider);
      const trading = route(w, a, b, 0.6, [], trader);

      expect(traderTaste.shy).toBeNull();
      expect(tasteKey(traderTaste)).toBe(String(traderTaste.seed));
      expect(tasteKey(huntingTaste)).toBe(`${traderTaste.seed}:off`);
      expect(trading).not.toEqual(hunting);
      expect(route(w, a, b, 0.6, [], driverOn(structuredClone(w), 'scrapjaw', ['raider'], 'sell'))).toEqual(trading);
    });

    it('plans off-road legs on the real map that a truck can drive straight', () => {
      const w = w1337;
      const { raider, trader } = drivers(w);
      const gate = (id: string) => siteGates([...REGION.towns, ...REGION.locations].find((s) => s.id === id)!)[0];
      const from = gate('nose');
      const to = gate('dustwell');

      const hunting = route(w, from, to, 0.8, [], raider);

      expect(hunting.length).toBeGreaterThan(2);
      for (let i = 1; i < hunting.length; i++) if (dist(hunting[i - 1], hunting[i]) >= 1) expect(straightClear(w, hunting[i - 1], hunting[i], 0.8, [])).toBe(true);
      expect(roadShare(w, from, hunting)).toBeLessThan(roadShare(w, from, route(w, from, to, 0.8, [], trader)));
    });
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
    const reaches = reachesFrom(w, { x: 80, y: 60 }, 0.6);
    expect(reaches(center)).toBe(false);
    expect(reaches({ x: 79, y: 60 })).toBe(true);
  });

  it('is false off the map', () => {
    const reaches = reachesFrom(emptyWorld(), { x: 80, y: 60 }, 0.6);
    expect(reaches({ x: -1, y: 60 })).toBe(false);
  });

  it('throws on an anchor inside a solid rock', () => {
    const w = emptyWorld();
    w.obstacles = [{ id: 'big', pos: { x: 80, y: 60 }, r: 8, kind: 'rock' }];
    expect(() => reachesFrom(w, { x: 80, y: 60 }, 0.6)).toThrow(/No nav component/);
  });
});
