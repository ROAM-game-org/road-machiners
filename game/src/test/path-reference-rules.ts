import { START_KITS } from '../data/start';
import { REGION } from '../data/region';
import { TERRAIN, TERRAIN_TYPES } from '../data/terrain';
import { PHYSICS } from '../data/physics';
import { boxDistance, boxSegmentDistance, isBreakable, isDriveObstacle, propBoxes, propReach } from '../sim/mapgen';
import { BREAKABLE } from '../data/rules';
import { type Blocker } from '../sim/path';
import { nextRandom } from '../sim/rng';
import { isCliff, tileAt, tileSlope, type Terrain } from '../sim/terrain';
import type { Obstacle, World } from '../sim/types';
import { siteGap } from '../sim/sites';
import { dist, segmentDist, type Vec } from '../sim/vec';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { defaultSetup } from '../sim/settings';

export const startWorld = (seed: number): World => reusedWorld(`path ${seed}`, () => newWorld(seed, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));


export namespace Ref {
  const SITES_PRICED_LIKE_ROAD = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== 'territory')];
  export const CELL = 0.5;
  export const CLEARANCE = 0.4;
  export type Grid = { n: number; blocked: Uint8Array; slow: Float32Array };

  const cliffTiles = new WeakMap<Terrain, Int8Array>();

  function cliffTile(t: Terrain, tile: number): boolean {
    let known = cliffTiles.get(t);
    if (!known) {
      known = new Int8Array(t.size * t.size);
      cliffTiles.set(t, known);
    }
    if (known[tile] === 0) known[tile] = isCliff(t, tile) ? 2 : 1;
    return known[tile] === 2;
  }

  function nearCliff(t: Terrain, p: Vec, reach: number): boolean {
    const probes = [p, { x: p.x + reach, y: p.y }, { x: p.x - reach, y: p.y }, { x: p.x, y: p.y + reach }, { x: p.x, y: p.y - reach }];
    return probes.some((q) => cliffTile(t, tileAt(t, q)));
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
    const perTile = Math.round(1 / CELL);
    for (let ty = 0; ty * perTile < n; ty++)
      for (let tx = 0; tx * perTile < n; tx++) {
        const cost = tileCost(t, { x: (tx * perTile + 0.5) * CELL, y: (ty * perTile + 0.5) * CELL });
        for (let y = ty * perTile; y < Math.min(n, (ty + 1) * perTile); y++)
          for (let x = tx * perTile; x < Math.min(n, (tx + 1) * perTile); x++) slow[y * n + x] = cost;
      }
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

  export function grid(layer: { n: number; cliff: Uint8Array; slow: Float32Array }, blockers: Blocker[], radius: number, costly: Blocker[] = []): Grid {
    const n = layer.n;
    const blocked = layer.cliff.slice();
    const slow = layer.slow.slice();
    stamp(n, blockers, radius, (c) => (blocked[c] = 1));
    stamp(n, costly, radius, (c) => (slow[c] = Math.fround(layer.slow[c] * BREAKABLE.routeCost)));
    return { n, blocked, slow };
  }

  const staticGrids = new WeakMap<object, { list: Blocker[]; grid: Grid }>();

  function staticGrid(layer: { n: number; cliff: Uint8Array; slow: Float32Array }, w: World, radius: number): Grid {
    blockers(w, []);
    const list = staticBlockers.get(w.obstacles)!.list;
    const known = staticGrids.get(layer);
    if (known && known.list === list) return known.grid;
    const built = grid(layer, list, radius);
    staticGrids.set(layer, { list, grid: built });
    return built;
  }

  const breakableGrids = new WeakMap<object, { list: Blocker[]; grid: Grid }>();

  export function breakableGrid(layer: { n: number; cliff: Uint8Array; slow: Float32Array }, w: World, radius: number): Grid {
    blockers(w, []);
    const list = staticBlockers.get(w.obstacles)!.list;
    const known = breakableGrids.get(layer);
    if (known && known.list === list) return known.grid;
    const built = grid(layer, list, radius, breakables(w));
    breakableGrids.set(layer, { list, grid: built });
    return built;
  }

  export function withBlockers(base: Grid, extra: Blocker[], radius: number): Grid {
    const blocked = base.blocked.slice();
    stamp(base.n, extra, radius, (c) => (blocked[c] = 1));
    return { n: base.n, blocked, slow: base.slow };
  }

  function stamp(n: number, blockers: Blocker[], radius: number, mark: (c: number) => void): void {
    const grow = radius + CLEARANCE;
    const circles = blockers.flatMap((o) => (o.prop ? o.prop.boxes.map((b) => ({ pos: b.center, r: Math.hypot(b.half.x, b.half.y), inside: (p: Vec) => boxDistance(b, p) < grow })) : [{ pos: o.pos, r: o.r, inside: (p: Vec) => dist(p, o.pos) < o.r + grow }]));
    for (const o of circles) {
      const reach = o.r + grow;
      const lo = { x: Math.max(0, Math.floor((o.pos.x - reach) / CELL)), y: Math.max(0, Math.floor((o.pos.y - reach) / CELL)) };
      const hi = { x: Math.min(n - 1, Math.floor((o.pos.x + reach) / CELL)), y: Math.min(n - 1, Math.floor((o.pos.y + reach) / CELL)) };
      for (let x = lo.x; x <= hi.x; x++)
        for (let y = lo.y; y <= hi.y; y++) if (o.inside({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL })) mark(y * n + x);
    }
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

  const reachableSets = new WeakMap<Grid, Uint8Array[]>();

  export function reachable(g: Grid, start: number): Uint8Array {
    const seed = g.blocked[start] ? neighbors(g, start).find((c) => !g.blocked[c]) : start;
    const sets = reachableSets.get(g) ?? [];
    reachableSets.set(g, sets);
    const known = seed === undefined ? undefined : sets.find((set) => set[seed] === 1);
    if (known) return known;
    const out = new Uint8Array(g.n * g.n);
    if (seed === undefined) return out;
    sets.push(out);
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
    const statics = staticGrid(layer, w, radius);
    const g = withBlockers(statics, extra, radius);
    const start = cellOf(g, from);
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
    const list = w.obstacles.filter((o) => isDriveObstacle(o) && !isBreakable(o)).map(blocker);
    staticBlockers.set(w.obstacles, { count: w.obstacles.length, list });
    return [...list, ...extra];
  }

  export function breakables(w: World): Blocker[] {
    return w.obstacles.filter((o) => isDriveObstacle(o) && isBreakable(o)).map(blocker);
  }

  function blocker(o: Obstacle): Blocker {
    if (o.kind === 'site') return o;
    return { pos: o.pos, r: propReach(o), prop: { key: o.id, boxes: propBoxes(o).filter((b) => b.z0 < PHYSICS.truckClearance) } };
  }
}

export const LONG_CELLS = 32;

export function cellSpan(n: number, a: number, b: number): number {
  const dx = Math.abs((a % n) - (b % n));
  const dy = Math.abs(Math.floor(a / n) - Math.floor(b / n));
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

export function mulberry(seed: number): () => number {
  const r = { rngState: seed };
  return () => nextRandom(r);
}

const referenceLayers = new WeakMap<Terrain, Map<number, ReturnType<typeof Ref.terrainLayer>>>();

export function referenceLayer(terrain: Terrain, radius: number): ReturnType<typeof Ref.terrainLayer> {
  const byRadius = referenceLayers.get(terrain) ?? new Map<number, ReturnType<typeof Ref.terrainLayer>>();
  referenceLayers.set(terrain, byRadius);
  const known = byRadius.get(radius);
  if (known) return known;
  const built = Ref.terrainLayer(terrain, radius);
  byRadius.set(radius, built);
  return built;
}
