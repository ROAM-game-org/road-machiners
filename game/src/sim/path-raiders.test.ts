import { START_KITS } from '../data/start';
import { beforeAll, describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { TERRAIN, TERRAIN_TYPES } from '../data/terrain';
import { resetPerf, perfSnapshot } from '../perf';
import { PHYSICS } from '../data/physics';
import { boxDistance, boxSegmentDistance, isDriveObstacle, propBoxes, propReach } from './mapgen';
import { findCells, nearestFreeCell, stampOverlay } from './nav/astar';
import { COARSE, componentOf, dynamicBlockers, navLayer, onRouteRoad, slowAt, terrainNav } from './nav/layer';
import { continueRoute, keepRoute, route, routeLength, straightClear, type Blocker } from './path';
import { nextRandom } from './rng';
import { isCliff, tileAt, tileSlope, type Terrain } from './terrain';
import type { Obstacle, Vehicle, World } from './types';
import { siteGap, siteGates, sitePads } from './sites';
import { raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import { ROAD_INDEX } from './road-index';
import { addVehicle, editableTerrain, emptyWorld, npcBrain } from './testkit';
import { dist, polylineDist, segmentDist, type Vec } from './vec';
import { newWorld } from './world';
import { TEST_MAP } from '../test/map';
import { budget } from '../test/budget';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from './settings';

const startWorld = (seed: number): World => reusedWorld(`path ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));

describe('raiders that keep off roads', () => {
  function roadWorld(...roads: Vec[][]): World {
    const w = emptyWorld();
    const t = editableTerrain(w);
    for (let y = 0; y < t.size; y++)
      for (let x = 0; x < t.size; x++) t.types[y * t.size + x] = roads.some((r) => polylineDist({ x: x + 0.5, y: y + 0.5 }, r) < REGION.roadWidth / 2) ? 'road' : 'hardpan';
    return w;
  }

  function raider(w: World, pos: Vec): Vehicle {
    const v = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], pos);
    v.brain = npcBrain('test', pos, ['raider']);
    v.brain.goals = [{ kind: 'sell', targetId: null, destination: null, phase: 'travel', reason: 'patrolTown' }];
    return v;
  }
  function flee(v: Vehicle): void {
    v.brain!.goals.push({ kind: 'flee', targetId: null, destination: null, phase: 'travel', reason: 'escapeAttacker' });
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
    const w = roadWorld([{ x: 60, y: 20 }, { x: 60, y: 190 }]);
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
    const kept = keepRoute(w, b, plain, [], v, false);
    expect(kept.offRoad).toBe(false);
    expect(continueRoute(w, a, kept, b, 0.6, [], v)).not.toBeNull();
    v.resources!.fuel = 0;
    expect(continueRoute(w, a, kept, b, 0.6, [], v)).toBeNull();
    const keptOff = keepRoute(w, b, off, [], v, false);
    expect(keptOff.offRoad).toBe(true);
    expect(continueRoute(w, a, keptOff, b, 0.6, [], v)).not.toBeNull();
  });
});

namespace Ref {
  const SITES_PRICED_LIKE_ROAD = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== 'territory')];
  export const CELL = 0.5;
  export const CLEARANCE = 0.4;
  export type Grid = { n: number; blocked: Uint8Array; slow: Float32Array };

  function nearCliff(t: Terrain, p: Vec, reach: number): boolean {
    const probes = [p, { x: p.x + reach, y: p.y }, { x: p.x - reach, y: p.y }, { x: p.x, y: p.y + reach }, { x: p.x, y: p.y - reach }];
    return probes.some((q) => isCliff(t, tileAt(t, q)));
  }

  function tileCost(t: Terrain, p: Vec, flat = false): number {
    const tile = tileAt(t, p);
    const type = t.types[tile];
    const c = { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
    const bySite = SITES_PRICED_LIKE_ROAD.some((s) => siteGap(s, c) < REGION.roadWidth);
    const s = tileSlope(t, tile);
    const slope = flat ? 1 : 1 + REGION.navigation.slopeCost * (Math.hypot(s.x, s.y) / TERRAIN.drive.maxSlope) ** 2;
    return ((type === 'road' || bySite ? 1 : REGION.navigation.offRoadCost) / TERRAIN_TYPES[type].speed) * slope;
  }

  const slowByTerrain = new WeakMap<Terrain, Float32Array>();

  function slowCosts(t: Terrain, n: number): Float32Array {
    const known = slowByTerrain.get(t);
    if (known) return known;
    const slow = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) slow[y * n + x] = tileCost(t, { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
    slowByTerrain.set(t, slow);
    return slow;
  }

  export function terrainLayer(t: Terrain, radius: number): { n: number; cliff: Uint8Array; slow: Float32Array } {
    const n = Math.ceil(t.size / CELL);
    const cliff = new Uint8Array(n * n);
    const slow = slowCosts(t, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (nearCliff(t, { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL }, radius + CLEARANCE)) cliff[y * n + x] = 1;
    return { n, cliff, slow };
  }

  export function grid(layer: { n: number; cliff: Uint8Array; slow: Float32Array }, blockers: Blocker[], radius: number): Grid {
    const n = layer.n;
    const blocked = layer.cliff.slice();
    const grow = radius + CLEARANCE;
    const circles = blockers.flatMap((o) => (o.prop ? o.prop.boxes.map((b) => ({ pos: b.center, r: Math.hypot(b.half.x, b.half.y), inside: (p: Vec) => boxDistance(b, p) < grow })) : [{ pos: o.pos, r: o.r, inside: (p: Vec) => dist(p, o.pos) < o.r + grow }]));
    for (const o of circles) {
      const reach = o.r + grow;
      const lo = { x: Math.max(0, Math.floor((o.pos.x - reach) / CELL)), y: Math.max(0, Math.floor((o.pos.y - reach) / CELL)) };
      const hi = { x: Math.min(n - 1, Math.floor((o.pos.x + reach) / CELL)), y: Math.min(n - 1, Math.floor((o.pos.y + reach) / CELL)) };
      for (let x = lo.x; x <= hi.x; x++)
        for (let y = lo.y; y <= hi.y; y++) if (o.inside({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL })) blocked[y * n + x] = 1;
    }
    return { n, blocked, slow: layer.slow };
  }

  function touches(o: Blocker, a: Vec, b: Vec, reach: number): boolean {
    if (segmentDist(o.pos, a, b) >= o.r + reach) return false;
    return !o.prop || o.prop.boxes.some((box) => boxSegmentDistance(box, a, b) < reach);
  }

  export function cellOf(g: Grid, p: Vec): number {
    return Math.min(g.n - 1, Math.max(0, Math.floor(p.y / CELL))) * g.n + Math.min(g.n - 1, Math.max(0, Math.floor(p.x / CELL)));
  }

  export function centerOf(g: Grid, c: number): Vec {
    return { x: ((c % g.n) + 0.5) * CELL, y: (Math.floor(c / g.n) + 0.5) * CELL };
  }

  function neighbors(g: Grid, c: number): number[] {
    const x = c % g.n;
    const y = Math.floor(c / g.n);
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx !== 0 || dy !== 0) && nx >= 0 && ny >= 0 && nx < g.n && ny < g.n) out.push(ny * g.n + nx);
      }
    return out;
  }

  export function nearestFree(g: Grid, c: number, allowed: Uint8Array | null = null, maxRing = Infinity): number | null {
    const seen = new Uint8Array(g.n * g.n);
    const queue = [c];
    seen[c] = 1;
    const ring = (a: number) => Math.max(Math.abs((a % g.n) - (c % g.n)), Math.abs(Math.floor(a / g.n) - Math.floor(c / g.n)));
    for (let i = 0; i < queue.length; i++) {
      if (!g.blocked[queue[i]] && (!allowed || allowed[queue[i]])) return queue[i];
      for (const nb of neighbors(g, queue[i]))
        if (!seen[nb] && ring(nb) <= maxRing) {
          seen[nb] = 1;
          queue.push(nb);
        }
    }
    return null;
  }

  export function reachable(g: Grid, start: number): Uint8Array {
    const out = new Uint8Array(g.n * g.n);
    const seed = g.blocked[start] ? neighbors(g, start).find((c) => !g.blocked[c]) : start;
    if (seed === undefined) return out;
    const queue = [seed];
    out[seed] = 1;
    for (let i = 0; i < queue.length; i++)
      for (const nb of neighbors(g, queue[i]))
        if (!out[nb] && !g.blocked[nb]) {
          out[nb] = 1;
          queue.push(nb);
        }
    return out;
  }

  function heuristic(g: Grid, a: number, b: number): number {
    const dx = Math.abs((a % g.n) - (b % g.n));
    const dy = Math.abs(Math.floor(a / g.n) - Math.floor(b / g.n));
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }

  export function astar(g: Grid, start: number, goal: number): number[] | null {
    const cost = new Float64Array(g.n * g.n).fill(Infinity);
    const from = new Int32Array(g.n * g.n).fill(-1);
    const closed = new Uint8Array(g.n * g.n);
    const heap: [number, number][] = [];
    const push = (item: number, key: number) => {
      heap.push([item, key]);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (heap[p][1] <= heap[i][1]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1;
          if (l >= heap.length) break;
          const c = l + 1 < heap.length && heap[l + 1][1] < heap[l][1] ? l + 1 : l;
          if (heap[c][1] >= heap[i][1]) break;
          [heap[c], heap[i]] = [heap[i], heap[c]];
          i = c;
        }
      }
      return top[0];
    };
    cost[start] = 0;
    push(start, heuristic(g, start, goal) * REGION.navigation.heuristicWeight);
    while (heap.length > 0) {
      const cur = pop();
      if (cur === goal) {
        const path = [goal];
        while (from[path[0]] !== -1) path.unshift(from[path[0]]);
        return path;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      for (const next of neighbors(g, cur)) {
        if (g.blocked[next] || closed[next]) continue;
        const diag = next % g.n !== cur % g.n && Math.floor(next / g.n) !== Math.floor(cur / g.n);
        const c = cost[cur] + (diag ? Math.SQRT2 : 1) * g.slow[next];
        if (c >= cost[next]) continue;
        cost[next] = c;
        from[next] = cur;
        push(next, c + heuristic(g, next, goal) * REGION.navigation.heuristicWeight);
      }
    }
    return null;
  }

  export function pathCost(g: Grid, cells: ArrayLike<number>): number {
    let total = 0;
    for (let i = 1; i < cells.length; i++) {
      const diag = cells[i] % g.n !== cells[i - 1] % g.n && Math.floor(cells[i] / g.n) !== Math.floor(cells[i - 1] / g.n);
      total += (diag ? Math.SQRT2 : 1) * g.slow[cells[i]];
    }
    return total;
  }

  export function lineCost(t: Terrain, obstacles: Blocker[], a: Vec, b: Vec, reach: number | null, maxCost: number, capFull = false): number {
    if (reach !== null && obstacles.some((o) => touches(o, a, b, reach))) return Infinity;
    const n = Math.ceil(dist(a, b) * 4);
    let sum = 0;
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / Math.max(1, n), y: a.y + ((b.y - a.y) * k) / Math.max(1, n) };
      if ((reach !== null && nearCliff(t, p, reach)) || tileCost(t, p, !capFull) > maxCost) return Infinity;
      sum += tileCost(t, p);
    }
    return (dist(a, b) * sum) / (n + 1);
  }

  export function clearLine(t: Terrain, obstacles: Blocker[], a: Vec, b: Vec, reach: number, maxCost: number, capFull = false): boolean {
    return lineCost(t, obstacles, a, b, reach, maxCost, capFull) < Infinity;
  }

  function costliestTile(t: Terrain, pts: Vec[]): number {
    return Math.max(...pts.map((p) => tileCost(t, p, true)));
  }

  function fits(t: Terrain, obstacles: Blocker[], cur: Vec, replaced: Vec[], reach: number): boolean {
    let pathCost = 0;
    let prev = cur;
    for (const p of replaced) {
      pathCost += lineCost(t, [], prev, p, null, Infinity);
      prev = p;
    }
    return lineCost(t, obstacles, cur, replaced[replaced.length - 1], reach, costliestTile(t, [cur, ...replaced])) <= pathCost * (1 + REGION.navigation.straighten + 1e-9);
  }

  function shortcut(t: Terrain, obstacles: Blocker[], from: Vec, points: Vec[], reach: number): Vec[] {
    const out: Vec[] = [];
    let cur = from;
    let i = 0;
    while (i < points.length) {
      let best = i;
      let step = 1;
      let failed = points.length;
      while (best < points.length - 1) {
        const candidate = Math.min(i + step, points.length - 1);
        if (!fits(t, obstacles, cur, points.slice(i, candidate + 1), reach)) {
          failed = candidate;
          break;
        }
        best = candidate;
        step *= 2;
      }
      while (failed - best > 1) {
        const candidate = Math.floor((best + failed) / 2);
        if (fits(t, obstacles, cur, points.slice(i, candidate + 1), reach)) best = candidate;
        else failed = candidate;
      }
      out.push(points[best]);
      cur = points[best];
      i = best + 1;
    }
    return out;
  }

  export function route(w: World, layer: ReturnType<typeof terrainLayer>, from: Vec, to: Vec, radius: number, extra: Blocker[]): Vec[] {
    const all = blockers(w, extra);
    if (clearLine(w.terrain, all, from, to, radius + CLEARANCE, 1, true)) return [to];
    const g = grid(layer, all, radius);
    const start = cellOf(g, from);
    const statics = grid(layer, blockers(w, []), radius);
    let exit: number | null = start;
    let reach = reachable(statics, start);
    if (![start, ...neighbors(g, start)].some((c) => !g.blocked[c])) {
      const ring = Math.ceil((radius + CLEARANCE) / CELL) + 1;
      const targetSide = nearestFree(g, cellOf(g, to));
      const side = targetSide === null ? null : reachable(statics, targetSide);
      exit = (side && nearestFree(g, start, side, ring)) ?? nearestFree(g, start)!;
      reach = reachable(statics, exit);
    }
    const goal = nearestFree(g, cellOf(g, to), reach)!;
    const found = astar(g, exit, goal) ?? astar(g, exit, nearestReachable(g, exit, goal))!;
    const cells = exit === start ? found : [start, ...found];
    const last = found[found.length - 1];
    const end = last === cellOf(g, to) ? to : centerOf(g, last);
    return shortcut(w.terrain, all, from, [...cells.slice(1, -1).map((c) => centerOf(g, c)), end], radius + CLEARANCE);
  }

  function nearestReachable(g: Grid, start: number, goal: number): number {
    const reach = reachable(g, start);
    let best = start;
    for (let c = 0; c < reach.length; c++) if (reach[c] && heuristic(g, c, goal) < heuristic(g, best, goal)) best = c;
    return best;
  }

  const staticBlockers = new WeakMap<Obstacle[], { count: number; list: Blocker[] }>();

  export function blockers(w: World, extra: Blocker[]): Blocker[] {
    const known = staticBlockers.get(w.obstacles);
    if (known && known.count === w.obstacles.length) return [...known.list, ...extra];
    const list = w.obstacles.filter(isDriveObstacle).map(blocker);
    staticBlockers.set(w.obstacles, { count: w.obstacles.length, list });
    return [...list, ...extra];
  }

  function blocker(o: Obstacle): Blocker {
    if (o.kind === 'site') return o;
    return { pos: o.pos, r: propReach(o), prop: { key: o.id, boxes: propBoxes(o).filter((b) => b.z0 < PHYSICS.truckClearance) } };
  }
}

const LONG_CELLS = 32;

function cellSpan(n: number, a: number, b: number): number {
  const dx = Math.abs((a % n) - (b % n));
  const dy = Math.abs(Math.floor(a / n) - Math.floor(b / n));
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function mulberry(seed: number): () => number {
  const r = { rngState: seed };
  return () => nextRandom(r);
}

const referenceLayers = new WeakMap<Terrain, Map<number, ReturnType<typeof Ref.terrainLayer>>>();

function referenceLayer(terrain: Terrain, radius: number): ReturnType<typeof Ref.terrainLayer> {
  const byRadius = referenceLayers.get(terrain) ?? new Map<number, ReturnType<typeof Ref.terrainLayer>>();
  referenceLayers.set(terrain, byRadius);
  const known = byRadius.get(radius);
  if (known) return known;
  const built = Ref.terrainLayer(terrain, radius);
  byRadius.set(radius, built);
  return built;
}

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
      const g = Ref.grid(refLayer(radius), Ref.blockers(w, extra), radius);
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
      for (let i = 1; i < got.length; i++) expect(g.blocked[got[i]]).toBe(0);
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
      const expected = Ref.clearLine(w.terrain, Ref.blockers(w, extra), from, to, radius + Ref.CLEARANCE, Infinity);
      expect(straightClear(w, from, to, radius, extra)).toBe(expected);
      const open = Ref.clearLine(w.terrain, Ref.blockers(w, []), from, to, radius + Ref.CLEARANCE, Infinity);
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

describe('long routes search a coarse corridor', () => {
  const w = startWorld(1);

  it('coarse regions are the connected pieces of each block, linked where their cells touch', () => {
    const layer = navLayer(w.terrain, w.obstacles, 0.6);
    const n = layer.n;
    const { n: bn, region, block, slow, edgeStart, edges } = layer.coarse;
    expect(bn).toBe(Math.ceil(n / COARSE));
    const blockOfCell = (x: number, y: number) => Math.floor(y / COARSE) * bn + Math.floor(x / COARSE);
    const linked = (a: number, b: number) => edges.subarray(edgeStart[a], edgeStart[a + 1]).includes(b);
    const slowSum = new Float64Array(block.length);
    const size = new Uint32Array(block.length);
    let wrong = 0;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const c = y * n + x;
        const r = region.at(c);
        if ((r === 0) !== (layer.blocked[c] === 1)) wrong++;
        if (r === 0) continue;
        if (block[r] !== blockOfCell(x, y)) wrong++;
        slowSum[r] += slowAt(layer, c);
        size[r]++;
        for (const [dx, dy] of [[1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= n || ny >= n) continue;
          const o = region.at(ny * n + nx);
          if (o === 0) continue;
          if (blockOfCell(nx, ny) === blockOfCell(x, y)) {
            if (o !== r) wrong++;
          } else if (o !== r && !(linked(r, o) && linked(o, r))) wrong++;
        }
      }
    expect(wrong).toBe(0);
    for (let r = 1; r < block.length; r++) expect(slow[r]).toBeCloseTo(slowSum[r] / size[r], 5);
    expect(block.length - 1).toBeGreaterThan(new Set(block.subarray(1)).size);
  });

  it('free cells share a component exactly when a step path joins them', () => {
    const w = emptyWorld();
    const center = { x: 100, y: 100 };
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      w.obstacles = [...w.obstacles, { id: `ring-${i}`, pos: { x: center.x + 10 * Math.cos(a), y: center.y + 10 * Math.sin(a) }, r: 1, kind: 'rock' }];
    }
    const layer = navLayer(w.terrain, w.obstacles, 0.6);
    const n = layer.n;
    const cell = (p: Vec) => Math.floor(p.y / 0.5) * n + Math.floor(p.x / 0.5);
    const inside = cell(center);
    const outside = cell({ x: 30, y: 30 });
    const far = cell({ x: 500, y: 400 });
    expect(layer.blocked[inside]).toBe(0);
    expect(componentOf(layer, inside)).not.toBe(componentOf(layer, outside));
    expect(componentOf(layer, outside)).toBe(componentOf(layer, far));
    let blockedWithComponent = 0;
    for (let c = 0; c < n * n; c++) if (layer.blocked[c] && componentOf(layer, c) !== 0) blockedWithComponent++;
    expect(blockedWithComponent).toBe(0);
  });

  it('unreachable goals return null in under 5 ms, like the full search', () => {
    const flatAround = (p: Vec) => {
      for (let y = p.y - 14; y <= p.y + 14; y++) for (let x = p.x - 14; x <= p.x + 14; x++) if (isCliff(w.terrain, tileAt(w.terrain, { x, y }))) return false;
      return true;
    };
    const center = Array.from({ length: 25 * 25 }, (_, i) => ({ x: 60 + (i % 25) * 20, y: 60 + Math.floor(i / 25) * 20 })).find(flatAround)!;
    expect(center).toBeDefined();
    const obstacles = w.obstacles.filter((o) => dist(o.pos, center) > 14);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      obstacles.push({ id: `ring-${i}`, pos: { x: center.x + 10 * Math.cos(a), y: center.y + 10 * Math.sin(a) }, r: 1, kind: 'rock' });
    }
    const local = { ...w, obstacles };
    const radius = 0.6;
    const layer = navLayer(local.terrain, local.obstacles, radius);
    const overlay = stampOverlay(layer, dynamicBlockers(local.obstacles, local.terrain, []), radius);
    const g = Ref.grid(referenceLayer(local.terrain, radius), Ref.blockers(local, []), radius);
    const goal = Ref.cellOf(g, center);
    const from = { x: 40, y: 40 };
    const start = nearestFreeCell(layer, overlay, Ref.cellOf(g, from))!;
    expect(g.blocked[goal]).toBe(0);
    expect(Ref.astar(g, start, goal)).toBeNull();
    const t = performance.now();
    const got = findCells(layer, overlay, start, goal, null);
    const ms = performance.now() - t;
    expect(got).toBeNull();
    expect(ms).toBeLessThan(5);
  }, budget(60_000));

  it('a corridor cut by a kill wreck wall plans again around the wall, never over the whole map', () => {
    const w = emptyWorld();
    for (let y = 16; y < w.size; y += 1.5) w.obstacles = [...w.obstacles, { id: `wreck-w${y}`, pos: { x: 80, y }, r: 1, kind: 'wreck' }];
    const radius = 0.6;
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const overlay = stampOverlay(layer, dynamicBlockers(w.obstacles, w.terrain, []), radius);
    const n = layer.n;
    const start = 200 * n + 60;
    const goal = 200 * n + 260;
    resetPerf();
    const got = findCells(layer, overlay, start, goal, null);
    expect(perfSnapshot()['route-corridor-miss']?.calls).toBe(2);
    expect(got).not.toBeNull();
    expect(got![got!.length - 1]).toBe(goal);
    for (const c of got!) expect(layer.blocked[c] === 0 && overlay.stamp[c] !== overlay.gen).toBe(true);
    expect(Math.min(...Array.from(got!, (c) => Math.floor(c / n)))).toBeLessThan(32);
  });

  it('long routes with no dynamic blockers never miss the corridor', () => {
    const rand = mulberry(8);
    const radius = 0.8;
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const overlay = stampOverlay(layer, [], radius);
    const n = layer.n;
    resetPerf();
    let found = 0;
    for (let i = 0; i < 20; i++) {
      const a = nearestFreeCell(layer, overlay, Math.floor(rand() * n * n))!;
      const b = nearestFreeCell(layer, overlay, Math.floor(rand() * n * n))!;
      if (componentOf(layer, a) !== componentOf(layer, b) || cellSpan(n, a, b) <= LONG_CELLS) continue;
      expect(findCells(layer, overlay, a, b, null)).not.toBeNull();
      found++;
    }
    expect(found).toBeGreaterThanOrEqual(5);
    expect(perfSnapshot()['route-corridor-miss']).toBeUndefined();
  }, budget(60_000));
});

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
    expect(shy.road).toBeLessThanOrEqual(0.04);
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
