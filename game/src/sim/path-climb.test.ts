import { describe, expect, it } from 'vitest';
import { route } from './path';
import type { Vehicle, World } from './types';
import { addGoods } from './inventory';
import { climbGrade } from './stats';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import { dist, type Vec } from './vec';

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
