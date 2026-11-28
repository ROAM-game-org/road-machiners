import { describe, expect, it } from 'vitest';
import { START_KITS } from '../../data/start';
import { BREAKABLE } from '../../data/rules';
import { boxSegmentDistance, propBoxes } from '../mapgen';
import { route } from '../path';
import type { Obstacle } from '../types';
import { dist, type Vec } from '../vec';
import { blockedAt, CELL, CLEARANCE, slowAt, navLayer, type NavLayer } from './layer';
import { pieceTable, regionAt } from './cells';
import { perfSnapshot, resetPerf } from '../../perf';
import { emptyWorld } from '../testkit';
import { newWorld } from '../world';
import { TEST_MAP } from '../../test/map';
import { budget } from '../../test/budget';
import { defaultSetup } from '../settings';

function mismatchesNear(a: NavLayer, b: NavLayer, from: Vec, to: Vec): number {
  let wrong = 0;
  for (let y = Math.floor(from.y / CELL); y <= Math.floor(to.y / CELL); y++)
    for (let x = Math.floor(from.x / CELL); x <= Math.floor(to.x / CELL); x++) {
      const c = y * a.n + x;
      if (blockedAt(a, c) !== blockedAt(b, c) || slowAt(a, c) !== slowAt(b, c)) wrong++;
      else if (a.grid.regions.slow[regionAt(a.grid, c)] !== b.grid.regions.slow[regionAt(b.grid, c)]) wrong++;
    }
  return wrong;
}

describe('breakable props', () => {
  const radius = 0.6;
  const grow = radius + CLEARANCE;
  const cellAt = (n: number, p: Vec) => Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL);

  const fenceAt = (id: string, pos: Vec): Obstacle => ({ id, pos, r: 0.5, kind: 'landmark', look: 'fence', yaw: Math.PI / 2 });

  function fenceLine(x: number, y: number, half: number): Obstacle[] {
    const count = Math.ceil((2 * half) / 0.95) + 1;
    return Array.from({ length: count }, (_, k) => fenceAt(`fence-${k}`, { x, y: y - half + (2 * half * k) / (count - 1) }));
  }

  function crosses(fences: Obstacle[], from: Vec, points: Vec[]): boolean {
    let prev = from;
    for (const p of points) {
      if (fences.some((f) => propBoxes(f).some((b) => boxSegmentDistance(b, prev, p) === 0))) return true;
      prev = p;
    }
    return false;
  }

  it('stamps a fence as costly cells, not blocked ones', () => {
    const w = emptyWorld();
    const fence = fenceAt('fence-0', { x: 40.2, y: 40.3 });
    w.obstacles = [fence];
    const cell = cellAt(navLayer(w.terrain, [], radius).n, fence.pos);
    const open = slowAt(navLayer(w.terrain, [], radius), cell);
    const layer = navLayer(w.terrain, w.obstacles, radius);

    expect(blockedAt(layer, cell)).toBe(false);
    expect(slowAt(layer, cell)).toBeCloseTo(open * BREAKABLE.routeCost);
  });

  it('patches a layer when fences break or appear to the same bytes as a fresh build', () => {
    const shack: Obstacle = { id: 'shack-0', pos: { x: 52.2, y: 41.3 }, r: 0.9, kind: 'landmark', look: 'shack', yaw: 0 };
    const fences = [...fenceLine(40.2, 40.3, 4), ...fenceLine(41.1, 41.7, 3).map((f, k) => ({ ...f, id: `cross-${k}`, yaw: 0 }))];
    const extra = fenceAt('fence-extra', { x: 40.9, y: 38.6 });
    const sets = [[shack, ...fences], [shack, ...fences.filter((_, k) => k !== 3)], [shack, ...fences.filter((_, k) => k !== 3 && k !== 9), extra]];
    const patched = emptyWorld().terrain;
    for (const obstacles of sets) {
      const layer = navLayer(patched, obstacles, radius);
      const fresh = navLayer({ ...emptyWorld().terrain }, obstacles, radius);
      expect(mismatchesNear(layer, fresh, { x: 20, y: 20 }, { x: 80, y: 80 })).toBe(0);
    }
  });

  it('loads the baked route summary equal to a fresh build of every cell', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const plain = { ...w.terrain, routes: undefined };
    for (const r of [0.6, 0.95]) expect(pieceTable(navLayer(w.terrain, w.obstacles, r).grid)).toEqual(pieceTable(navLayer(plain, w.obstacles, r).grid));
  }, budget(120_000));

  it('rebuilds only the cells whose props changed, to the same summary as a fresh build', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const center = { x: 600, y: 600 };
    const ring = Array.from({ length: 48 }, (_, i): Obstacle => ({ id: `ring-${i}`, pos: { x: center.x + 9 * Math.cos((i / 48) * 2 * Math.PI), y: center.y + 9 * Math.sin((i / 48) * 2 * Math.PI) }, r: 1, kind: 'rock' }));
    const obstacles = [...w.obstacles.filter((o) => dist(o.pos, center) > 12), ...ring];
    resetPerf();
    const layer = navLayer(w.terrain, obstacles, 0.6);
    expect(perfSnapshot()['route-cell-repieced'].calls).toBeLessThan(10);
    expect(pieceTable(layer.grid)).toEqual(pieceTable(navLayer({ ...w.terrain, routes: undefined }, obstacles, 0.6).grid));
  }, budget(120_000));

  it('keeps a shack blocked', () => {
    const w = emptyWorld();
    const shack: Obstacle = { id: 'shack-0', pos: { x: 40.2, y: 40.3 }, r: 0.9, kind: 'landmark', look: 'shack', yaw: 0 };
    w.obstacles = [shack];
    const layer = navLayer(w.terrain, w.obstacles, radius);

    expect(blockedAt(layer, cellAt(layer.n, shack.pos))).toBe(true);
  });

  const crossExtra = (2 * grow + 0.1) * (BREAKABLE.routeCost - 1);
  const halfFor = (gap: number, extra: number) => Math.sqrt(((2 * gap + extra) / 2) ** 2 - gap ** 2) - grow;

  it('goes around a short fence line, whose detour costs less than crossing', () => {
    const w = emptyWorld();
    const gap = 6;
    w.obstacles = fenceLine(60, 60, halfFor(gap, crossExtra / 2));
    const from = { x: 60 - gap, y: 60 };

    expect(crosses(w.obstacles, from, route(w, from, { x: 60 + gap, y: 60 }, radius, []))).toBe(false);
  });

  it('crosses a long fence line, whose detour costs more than crossing', () => {
    const w = emptyWorld();
    const gap = 6;
    w.obstacles = fenceLine(60, 120, halfFor(gap, crossExtra * 2));
    const from = { x: 60 - gap, y: 120 };

    expect(crosses(w.obstacles, from, route(w, from, { x: 60 + gap, y: 120 }, radius, []))).toBe(true);
  });

  it('changes the layer when a fence breaks in place and restores it when the fence grows back', () => {
    const w = emptyWorld();
    const fence = fenceAt('fence-0', { x: 40.2, y: 40.3 });
    const other = fenceAt('fence-1', { x: 80.2, y: 80.3 });
    const slowOf = (obstacles: Obstacle[]) => {
      const layer = navLayer(w.terrain, obstacles, radius);
      return { id: layer.id, slow: slowAt(layer, cellAt(layer.n, fence.pos)) };
    };
    const whole = slowOf([fence]);
    const broken = slowOf([other]);
    const back = slowOf([fence]);

    expect(broken.id).not.toBe(whole.id);
    expect(broken.slow).toBeCloseTo(whole.slow / BREAKABLE.routeCost);
    expect(back.slow).toBe(whole.slow);
  });
});
