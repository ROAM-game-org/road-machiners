import { START_KITS } from '../data/start';
import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { route, routeLength } from './path';
import type { World } from './types';
import { sitePads } from './sites';
import { raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import { ROAD_INDEX } from './road-index';
import { addVehicle, npcBrain } from './testkit';
import { dist, type Vec } from './vec';
import { newWorld } from './world';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const startWorld = (seed: number): World => reusedWorld(`path ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));

describe('raider hunting routes on the map', () => {
  const camps = REGION.locations.filter((l) => l.kind === 'camp');

  function legsOf(w: World): [Vec, Vec][] {
    const legs: [Vec, Vec][] = [];
    for (const camp of camps) {
      const raid = raiderGrounds(w, camp);
      const patrol = raiderPatrolPosts(w, camp);
      const pad = sitePads(camp)[0];
      for (const post of raid) legs.push([pad, post]);
      for (const chain of [raid, patrol]) for (let i = 0; i + 1 < chain.length; i++) legs.push([chain[i], chain[i + 1]]);
    }
    return legs;
  }

  function measure(band: number) {
    const saved = REGION.navigation.roadShyBand;
    REGION.navigation.roadShyBand = band;
    try {
      const w = startWorld(1);
      w.terrain = { ...TEST_MAP.terrain };
      const driver = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 100, y: 100 });
      driver.brain = npcBrain('buggy', driver.pos, ['raider']);
      driver.brain.goals = [{ kind: 'raid', targetId: null, destination: null, phase: 'travel', reason: 'raid' }];
      let length = 0, road = 0, near6 = 0, near10 = 0, samples = 0;
      const legs = legsOf(w);
      for (const [from, to] of legs) {
        const points = route(w, from, to, 0.8, [], driver);
        length += routeLength(from, points);
        let prev = from;
        for (const p of points) {
          const n = Math.max(1, Math.ceil(dist(prev, p) * 2));
          for (let k = 0; k < n; k++) {
            const x = prev.x + ((p.x - prev.x) * k) / n;
            const y = prev.y + ((p.y - prev.y) * k) / n;
            const edge = ROAD_INDEX.nearestWithin(x, y, 12 + REGION.roadWidth) - REGION.roadWidth / 2;
            samples++;
            if (edge <= 0) road++;
            if (edge <= 6) near6++;
            if (edge <= 10) near10++;
          }
          prev = p;
        }
      }
      return { legs: legs.length, meanLength: length / legs.length, road: road / samples, near6: near6 / samples, near10: near10 / samples };
    } finally {
      REGION.navigation.roadShyBand = saved;
    }
  }

  it('stay off roads and keep a band from them, at a bounded detour', () => {
    const shy = measure(REGION.navigation.roadShyBand);
    const plain = measure(0);
    console.log('hunting routes', JSON.stringify({ shy, plain }));
    expect(shy.road).toBeLessThan(plain.road);
    expect(shy.near6).toBeLessThanOrEqual(plain.near6 * 0.6);
    expect(shy.near10).toBeLessThanOrEqual(plain.near10 * 0.62);
    expect(shy.meanLength).toBeLessThanOrEqual(plain.meanLength * 1.3);
  }, budget(90_000));

  it('still cross a road to reach the far side', () => {
    const road = REGION.roads[0];
    const mid = Math.floor(road.length / 2);
    const a = road[mid];
    const b = road[mid + 1];
    const along = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(along.x, along.y);
    const normal = { x: -along.y / len, y: along.x / len };
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const side = (s: number): Vec => ({ x: centre.x + normal.x * 14 * s, y: centre.y + normal.y * 14 * s });
    const w = startWorld(1);
    const driver = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], side(-1));
    driver.brain = npcBrain('buggy', driver.pos, ['raider']);
    driver.brain.goals = [{ kind: 'raid', targetId: null, destination: null, phase: 'travel', reason: 'raid' }];
    const points = route(w, side(-1), side(1), 0.8, [], driver);
    expect(dist(points.at(-1)!, side(1))).toBeLessThanOrEqual(4);
    const across = (p: Vec): number => Math.sign((p.x - centre.x) * normal.x + (p.y - centre.y) * normal.y);
    expect(across(side(-1))).not.toBe(across(points.at(-1)!));
  });
});

