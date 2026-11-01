import { START_KITS } from '../data/start';
import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { onRouteRoad, terrainNav } from './nav/layer';
import { continueRoute, keepRoute, route, routeLength } from './path';
import { isCliff, tileAt } from './terrain';
import type { TraitId } from '../data/npcs';
import type { Vehicle, World } from './types';
import { siteGates } from './sites';

import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import { dist, polylineDist, type Vec } from './vec';
import { newWorld } from './world';
import { TEST_MAP } from '../test/map';

import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const startWorld = (seed: number): World => reusedWorld(`path ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));

function roadWorld(...roads: Vec[][]): World {
  const w = emptyWorld();
  const t = editableTerrain(w);
  for (let y = 0; y < t.size; y++)
    for (let x = 0; x < t.size; x++) t.types[y * t.size + x] = roads.some((r) => polylineDist({ x: x + 0.5, y: y + 0.5 }, r) < REGION.roadWidth / 2) ? 'road' : 'hardpan';
  return w;
}

function roadRuns(w: World, from: Vec, points: Vec[]): number[] {
  const nav = terrainNav(w.terrain);
  const runs: number[] = [];
  let run = 0;
  let prev = from;
  for (const p of points) {
    const n = Math.max(1, Math.ceil(dist(prev, p) * 4));
    for (let k = 0; k < n; k++) {
      if (onRouteRoad(nav, prev.x + ((p.x - prev.x) * k) / n, prev.y + ((p.y - prev.y) * k) / n)) run += dist(prev, p) / n;
      else if (run > 0) {
        runs.push(run);
        run = 0;
      }
    }
    prev = p;
  }
  if (run > 0) runs.push(run);
  return runs;
}
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('raiders that keep off roads', () => {
  function raider(w: World, pos: Vec): Vehicle {
    const v = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], pos);
    v.brain = npcBrain('test', pos, ['raider']);
    v.brain.goals = [{ kind: 'sell', targetId: null, destination: null, phase: 'travel', reason: 'patrolTown' }];
    return v;
  }
  function flee(v: Vehicle): void {
    v.brain!.goals.push({ kind: 'flee', targetId: null, destination: null, phase: 'travel', reason: 'escapeAttacker' });
  }

  it('drives beside a road that a raider on patrol drives along, to the same end', () => {
    const a = { x: 30, y: 100 };
    const b = { x: 90, y: 100 };
    const w = roadWorld([{ x: 20, y: 100 }, { x: 100, y: 100 }]);
    const v = raider(w, a);
    const plain = route(w, a, b, 0.6, [], v);
    flee(v);
    const off = route(w, a, b, 0.6, [], v);
    expect(total(roadRuns(w, a, plain))).toBeGreaterThan(50);
    expect(Math.max(0, ...roadRuns(w, a, off).slice(1, -1))).toBe(0);
    expect(total(roadRuns(w, a, off))).toBeLessThan(REGION.roadWidth + 2);
    expect(off.at(-1)).toEqual(plain.at(-1));
  });

  it('crosses a road lying across its way once, straight over', () => {
    const a = { x: 30, y: 100 };
    const b = { x: 90, y: 100 };
    const w = roadWorld([{ x: 60, y: 0 }, { x: 60, y: REGION.size }]);
    const v = raider(w, a);
    flee(v);
    const runs = roadRuns(w, a, route(w, a, b, 0.6, [], v));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toBeLessThan(REGION.roadWidth + 1.5);
  });

  it('keeps away from a cliff beside the road as a plain route does', () => {
    const a = { x: 30, y: 100 };
    const b = { x: 90, y: 100 };
    const w = roadWorld([{ x: 20, y: 100 }, { x: 100, y: 100 }]);
    const t = w.terrain;
    const n = t.size + 1;
    for (let j = 104; j < n; j++) for (let i = 0; i < n; i++) t.heights[j * n + i] = -8;
    const v = raider(w, a);
    flee(v);
    const off = route(w, a, b, 0.6, [], v);
    let prev = a;
    for (const p of off) {
      for (let k = 0; k <= 20; k++) expect(isCliff(t, tileAt(t, { x: prev.x + ((p.x - prev.x) * k) / 20, y: prev.y + ((p.y - prev.y) * k) / 20 }))).toBe(false);
      prev = p;
    }
    expect(total(roadRuns(w, a, off))).toBeLessThan(REGION.roadWidth + 2);
  });

  it('turns off the road toward its camp on the real map', () => {
    const w = startWorld(1337);
    const kiln = REGION.locations.find((l) => l.id === 'kiln')!;
    const pad = siteGates(kiln)[0];
    const start = REGION.roads.flat().find((p) => dist(p, kiln.pos) > 55 && dist(p, kiln.pos) < 75 && onRouteRoad(terrainNav(w.terrain), p.x, p.y))!;
    expect(onRouteRoad(terrainNav(w.terrain), start.x, start.y)).toBe(true);
    const v = raider(w, start);
    const plain = route(w, start, pad, 0.8, [], v);
    flee(v);
    const off = route(w, start, pad, 0.8, [], v);
    const plainRoad = total(roadRuns(w, start, plain)) / routeLength(start, plain);
    const offRuns = roadRuns(w, start, off);
    expect(total(offRuns) / routeLength(start, off)).toBeLessThan(plainRoad / 2);
    expect(Math.max(0, ...offRuns.slice(1))).toBeLessThan(REGION.roadWidth * 2);
    expect(dist(off.at(-1)!, plain.at(-1)!)).toBeLessThan(0.01);
  });

  it('caches routes on and off roads apart, and drops a kept route once the driver strands', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 160, y: 100 };
    const w = roadWorld([{ x: 90, y: 100 }, { x: 170, y: 100 }]);
    const v = raider(w, a);
    const plain = route(w, a, b, 0.6, [], v);
    flee(v);
    const off = route(w, a, b, 0.6, [], v);
    v.brain!.goals.pop();
    expect(route(w, a, b, 0.6, [], v)).toEqual(plain);
    expect(off).not.toEqual(plain);
    const kept = keepRoute(w, b, plain, [], v);
    expect(kept.style).toBe('road');
    expect(continueRoute(w, a, kept, b, 0.6, [], v)).not.toBeNull();
    v.resources!.fuel = 0;
    expect(continueRoute(w, a, kept, b, 0.6, [], v)).toBeNull();
    const keptOff = keepRoute(w, b, off, [], v);
    expect(keptOff.style).toBe('hidden');
    expect(continueRoute(w, a, keptOff, b, 0.6, [], v)).not.toBeNull();
  });
});

describe('scavengers and roamers that cut across open ground', () => {
  const a = { x: 30, y: 100 };
  const b = { x: 90, y: 100 };
  const detour = (height: number) => roadWorld([a, { x: a.x, y: a.y + height }, { x: b.x, y: a.y + height }, b]);

  function driverWith(w: World, traits: TraitId[]): Vehicle {
    const v = addVehicle(w, 'independent', 'buggy', ['mg', 'stockEngine'], a);
    v.brain = npcBrain('test', a, traits);
    v.brain.goals = [{ kind: 'sell', targetId: null, destination: null, phase: 'travel', reason: 'tripToSite' }];
    return v;
  }

  const roadShare = (w: World, points: Vec[]) => total(roadRuns(w, a, points)) / routeLength(a, points);

  it.each(['scavenger', 'roamer'] as const)('crosses the field where a %s would otherwise take a long road dogleg, and a trader keeps the road', (trait) => {
    const w = detour(20);
    const cut = route(w, a, b, 0.6, [], driverWith(w, [trait]));
    const road = route(w, a, b, 0.6, [], driverWith(w, ['trader']));
    expect(routeLength(a, cut)).toBeLessThan(routeLength(a, road) * 0.8);
    expect(roadShare(w, cut)).toBeLessThan(0.3);
    expect(roadShare(w, road)).toBeGreaterThan(0.7);
  });

  it('keeps the road when the road way is only slightly longer', () => {
    const w = detour(5);
    const drivers = Array.from({ length: 10 }, (_, i) => Object.assign(driverWith(w, ['scavenger']), { id: `scavenger-${i}` }));
    const keepers = drivers.filter((driver) => roadShare(w, route(w, a, b, 0.6, [], driver)) > 0.7);
    expect(keepers.length).toBeGreaterThan(drivers.length / 2);
    const road = route(w, a, b, 0.6, [], driverWith(w, ['trader']));
    expect(roadShare(w, road)).toBeGreaterThan(0.7);
  });

  it('drops a kept route of another style, and keeps its own', () => {
    const w = detour(20);
    const trader = driverWith(w, ['trader']);
    trader.id = 'road-trader';
    const kept = keepRoute(w, b, route(w, a, b, 0.6, [], trader), [], trader);
    expect(kept.style).toBe('road');
    expect(continueRoute(w, a, kept, b, 0.6, [], trader)).not.toBeNull();
    trader.brain!.traits = ['scavenger'];
    expect(continueRoute(w, a, kept, b, 0.6, [], trader)).toBeNull();
    const midway = { x: 50, y: 100 };
    const cutKept = keepRoute(w, b, route(w, midway, b, 0.6, [], trader), [], trader);
    expect(cutKept.style).toBe('cut');
    expect(continueRoute(w, midway, cutKept, b, 0.6, [], trader)).not.toBeNull();
  });
});
