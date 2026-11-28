import { beforeAll, describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { resetPerf, perfSnapshot } from '../perf';
import { findCells, nearestFreeCell, stampOverlay } from './nav/astar';
import { dynamicBlockers, navLayer } from './nav/layer';
import { route, routeLength, straightClear, type Blocker } from './path';
import { emptyWorld } from './testkit';
import { type Vec } from './vec';
import { budget } from '../test/budget';
import { cellSpan, LONG_CELLS, mulberry, Ref, referenceLayer, startWorld } from '../test/path-reference-rules';

const REFERENCE_REACH = 780;


describe('nav layers match the old grid rules', () => {
  const w = startWorld(1);
  const rand = mulberry(8);
  const at = (lo: number, hi: number) => lo + (hi - lo) * rand();
  for (let i = 0; i < 4; i++) w.obstacles = [...w.obstacles, { id: `wreck-t${i}`, pos: { x: at(40, w.size - 40), y: at(40, w.size - 40) }, r: 1, kind: 'wreck' }];
  const pairs = Array.from({ length: 10 }, (_, i) => {
    const from = { x: at(5, w.size - 5), y: at(5, w.size - 5) };
    const reach = i % 2 === 0 ? 30 : Math.min(w.size, REFERENCE_REACH);
    const to = { x: Math.min(w.size - 5, Math.max(5, from.x + at(-reach, reach))), y: Math.min(w.size - 5, Math.max(5, from.y + at(-reach, reach))) };
    const extra: Blocker[] = [{ pos: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, r: 0.9 }];
    return { from, to, extra, radius: i % 3 === 0 ? 0.8 : 0.6 };
  });
  const refLayer = (radius: number) => referenceLayer(w.terrain, radius);

  beforeAll(() => {
    for (const radius of new Set(pairs.map((p) => p.radius))) refLayer(radius);
  }, budget(240_000));

  it('A* cells avoid every blocked cell and cost within 1% of the reference', () => {
    let searched = 0;
    for (const { from, to, extra, radius } of pairs) {
      const g = Ref.withBlockers(Ref.breakableGrid(refLayer(radius), w, radius), extra, radius);
      const start = Ref.cellOf(g, from);
      const goal = Ref.nearestFree(g, Ref.cellOf(g, to));
      const layer = navLayer(w.terrain, w.obstacles, radius);
      expect(layer.n).toBe(g.n);
      const overlay = stampOverlay(layer, dynamicBlockers(w.obstacles, w.terrain, extra), radius);
      expect(nearestFreeCell(layer, overlay, Ref.cellOf(g, to))).toBe(goal);
      if (goal === null) continue;
      const ref = Ref.astar(g, start, goal);
      const got = findCells(layer, overlay, start, goal, null);
      expect(got === null).toBe(ref === null);
      if (!ref || !got) continue;
      searched++;
      expect(got[0]).toBe(start);
      expect(got[got.length - 1]).toBe(goal);
      for (let i = 1; i < got.length; i++) expect(g.blocked[got[i]], `cell ${got[i] % g.n},${Math.floor(got[i] / g.n)} of ${g.n}`).toBe(0);
      const tolerance = cellSpan(g.n, start, goal) > LONG_CELLS ? 0.05 : 0.01;
      expect(Ref.pathCost(g, got) - Ref.pathCost(g, ref)).toBeLessThanOrEqual(tolerance * Ref.pathCost(g, ref));
      if (tolerance === 0.01) expect(Ref.pathCost(g, ref) - Ref.pathCost(g, got)).toBeLessThanOrEqual(0.01 * Ref.pathCost(g, ref));
    }
    expect(searched).toBeGreaterThanOrEqual(4);
  }, budget(180_000));

  it('straightClear equals the reference line check', () => {
    let clear = 0;
    const road = REGION.roads[0];
    const mid = Math.floor(road.length / 2);
    const alongRoad = { from: road[mid], to: road[mid + 1], extra: [] as Blocker[], radius: 0.6 };
    for (const { from, to, extra, radius } of [...pairs, alongRoad]) {
      const expected = Ref.clearLine(w.terrain, [...Ref.blockers(w, extra), ...Ref.breakables(w)], from, to, radius + Ref.CLEARANCE, Infinity);
      expect(straightClear(w, from, to, radius, extra)).toBe(expected);
      const open = Ref.clearLine(w.terrain, [...Ref.blockers(w, []), ...Ref.breakables(w)], from, to, radius + Ref.CLEARANCE, Infinity);
      expect(straightClear(w, from, to, radius, [])).toBe(open);
      if (open) clear++;
    }
    expect(clear).toBeGreaterThan(0);
  });

  it('routes equal the reference and repeat routes come from the cache', () => {
    resetPerf();
    for (const { from, to, extra, radius } of pairs) {
      const ref = Ref.route(w, refLayer(radius), from, to, radius, extra);
      const first = route(w, from, to, radius, extra);
      const again = route(w, from, to, radius, extra);
      expect(again).toEqual(first);
      first[0] = { x: -1, y: -1 };
      expect(route(w, from, to, radius, extra)).toEqual(again);
      const n = refLayer(radius).n;
      const cell = (p: Vec) => Math.min(n - 1, Math.floor(p.y / Ref.CELL)) * n + Math.min(n - 1, Math.floor(p.x / Ref.CELL));
      if (cellSpan(n, cell(from), cell(to)) <= LONG_CELLS) {
        expect(again).toEqual(ref);
        continue;
      }
      expect(again[again.length - 1]).toEqual(ref[ref.length - 1]);
      expect(routeLength(from, again)).toBeLessThanOrEqual(1.1 * routeLength(from, ref));
    }
    expect(perfSnapshot()['route-cache-hit'].calls).toBeGreaterThan(0);
  }, budget(60_000));

  it('a new kill wreck changes the route without rebuilding the static layer', () => {
    const a = { x: 30, y: 30 };
    const b = { x: 50, y: 30 };
    const flat = emptyWorld(a);
    const layer = navLayer(flat.terrain, flat.obstacles, 0.6);
    expect(route(flat, a, b, 0.6, [])).toEqual([b]);
    flat.obstacles = [...flat.obstacles, { id: 'wreck-x', pos: { x: 40, y: 30 }, r: 1.2, kind: 'wreck' }];
    const around = route(flat, a, b, 0.6, []);
    expect(around.length).toBeGreaterThan(1);
    expect(navLayer(flat.terrain, flat.obstacles, 0.6)).toBe(layer);
  });
});
