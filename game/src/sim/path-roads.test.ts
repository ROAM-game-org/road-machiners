import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { TERRAIN_TYPES } from '../data/terrain';
import { boxSegmentDistance, propBoxes } from './mapgen';
import { offRoadTaste, tasteKey, tasteOf, terrainNav, tileIndex } from './nav/layer';
import { route, routeLength, straightClear } from './path';
import { tileAt } from './terrain';
import type { NpcActivity, Vehicle, World } from './types';
import type { TraitId } from '../data/npcs';
import { siteGates } from './sites';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import { dist, polylineDist, type Vec } from './vec';
import { newWorld } from './world';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const startWorld = (seed: number): World => reusedWorld(`path ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));
const w1337 = startWorld(1337);

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
