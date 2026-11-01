
import { REGION } from '../../data/region';
import { count } from '../../perf';
import type { Blocker } from './buckets';
import { cellOfBlock, cellOfFine, costsWithin, endRegion, ensureCell, ensureFine, regionAt, stepCost, triIndex } from './cells';
import { CELL, COARSE, componentOf, slowAt, stampBlockers, tasted, tastedCoarse, type NavLayer, type Taste } from './layer';

export type Overlay = { stamp: Uint32Array; gen: number };

const overlay: Overlay = { stamp: new Uint32Array(0), gen: 0 };

export function stampOverlay(layer: NavLayer, blockers: Blocker[], radius: number): Overlay {
  const size = layer.n * layer.n;
  if (overlay.stamp.length !== size || overlay.gen === 0xffffffff) {
    overlay.stamp = new Uint32Array(size);
    overlay.gen = 0;
  }
  const gen = ++overlay.gen;
  const stamp = overlay.stamp;
  stampBlockers(layer.n, blockers, radius, (c) => (stamp[c] = gen));
  return overlay;
}

let cost = new Float64Array(0);
let from = new Int32Array(0);
let seen = new Uint32Array(0);
let closed = new Uint32Array(0);
let queue = new Int32Array(0);
let gen = 0;

function begin(size: number): number {
  if (seen.length !== size || gen === 0xffffffff) {
    cost = new Float64Array(size);
    from = new Int32Array(size);
    seen = new Uint32Array(size);
    closed = new Uint32Array(size);
    queue = new Int32Array(size);
    gen = 0;
  }
  return ++gen;
}

export function nearestFreeCell(layer: NavLayer, ov: Overlay, c: number, component: number | null = null, maxRing = Infinity, accepts: (cell: number) => boolean = () => true): number | null {
  const n = layer.n;
  const g = begin(n * n);
  const holds = component === null ? null : cellsHolding(layer, component);
  let tail = 0;
  queue[tail++] = c;
  seen[c] = g;
  for (let i = 0; i < tail; i++) {
    const cur = queue[i];
    if (freeIn(layer, ov, cur, component, holds) && accepts(cur)) return cur;
    tail = ringOut(n, cur, c, g, maxRing, tail);
  }
  return null;
}

function freeIn(layer: NavLayer, ov: Overlay, c: number, component: number | null, holds: Uint8Array | null): boolean {
  if (holds !== null && holds[cellOfFine(layer.grid, c)] === 0) return false;
  return isFree(layer, ov, c) && (component === null || componentOf(layer, c) === component);
}

function ringOut(n: number, cur: number, c: number, g: number, maxRing: number, tail: number): number {
  const count = neighbours(n, cur);
  for (let k = 0; k < count; k++) {
    const next = around[k];
    if (seen[next] === g || ringOf(n, c, next) > maxRing) continue;
    seen[next] = g;
    queue[tail++] = next;
  }
  return tail;
}

function cellsHolding(layer: NavLayer, component: number): Uint8Array {
  const P = layer.grid.pieces;
  const holds = new Uint8Array(layer.grid.m * layer.grid.m);
  for (let p = 1; p < P.cell.length; p++) if (P.cell[p] !== -1 && P.comp[p] === component) holds[P.cell[p]] = 1;
  return holds;
}

function isFree(layer: NavLayer, ov: Overlay, c: number): boolean {
  const cell = cellOfFine(layer.grid, c);
  if (layer.grid.built[cell] === 0) ensureCell(layer.cells, cell);
  return !layer.blocked[c] && ov.stamp[c] !== ov.gen;
}

function ringOf(n: number, a: number, b: number): number {
  return Math.max(Math.abs((a % n) - (b % n)), Math.abs(Math.floor(a / n) - Math.floor(b / n)));
}

const AROUND_X = [-1, -1, -1, 0, 0, 1, 1, 1];
const AROUND_Y = [-1, 0, 1, -1, 1, -1, 0, 1];
const AROUND_STEP = [Math.SQRT2, 1, Math.SQRT2, 1, 1, Math.SQRT2, 1, Math.SQRT2];
const around = new Int32Array(8);
const aroundStep = new Float64Array(8);

function neighbours(n: number, cell: number): number {
  const x = cell % n;
  const y = Math.floor(cell / n);
  let count = 0;
  for (let i = 0; i < 8; i++) {
    const nx = x + AROUND_X[i];
    const ny = y + AROUND_Y[i];
    if (!inGrid(n, nx, ny)) continue;
    around[count] = ny * n + nx;
    aroundStep[count++] = AROUND_STEP[i];
  }
  return count;
}

function inGrid(n: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < n && y < n;
}

let heapItems = new Int32Array(1 << 16);
let heapKeys = new Float64Array(1 << 16);
let heapSize = 0;

function heapPush(item: number, key: number): void {
  if (heapSize === heapItems.length) {
    const items = new Int32Array(heapSize * 2);
    const keys = new Float64Array(heapSize * 2);
    items.set(heapItems);
    keys.set(heapKeys);
    heapItems = items;
    heapKeys = keys;
  }
  let i = heapSize++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapKeys[p] <= key) break;
    heapItems[i] = heapItems[p];
    heapKeys[i] = heapKeys[p];
    i = p;
  }
  heapItems[i] = item;
  heapKeys[i] = key;
}

function heapPop(): number {
  const top = heapItems[0];
  const lastItem = heapItems[--heapSize];
  const lastKey = heapKeys[heapSize];
  if (heapSize > 0) {
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= heapSize) break;
      const right = left + 1;
      const child = right < heapSize && heapKeys[right] < heapKeys[left] ? right : left;
      if (heapKeys[child] >= lastKey) break;
      heapItems[i] = heapItems[child];
      heapKeys[i] = heapKeys[child];
      i = child;
    }
    heapItems[i] = lastItem;
    heapKeys[i] = lastKey;
  }
  return top;
}

function heuristic(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

const LONG_CELLS = 32;

type Box = { x0: number; y0: number; x1: number; y1: number };

function shortBox(n: number, a: number, b: number): Box {
  const ax = a % n;
  const ay = Math.floor(a / n);
  const bx = b % n;
  const by = Math.floor(b / n);
  return { x0: Math.min(ax, bx) - LONG_CELLS, y0: Math.min(ay, by) - LONG_CELLS, x1: Math.max(ax, bx) + LONG_CELLS, y1: Math.max(ay, by) + LONG_CELLS };
}

export function findCells(layer: NavLayer, ov: Overlay, start: number, goal: number, taste: Taste | null): Int32Array | null {
  const cells = findCellsToward(layer, ov, start, goal, taste);
  return cells && cells[cells.length - 1] === goal ? cells : null;
}

export function findCellsToward(layer: NavLayer, ov: Overlay, start: number, goal: number, taste: Taste | null): Int32Array | null {
  if (start === goal) return Int32Array.of(start);
  if (!connected(layer, start, goal)) return null;
  const n = layer.n;
  if (heuristic(start % n, Math.floor(start / n), goal % n, Math.floor(goal / n)) <= LONG_CELLS) return fineSearch(layer, ov, start, goal, false, taste, shortBox(n, start, goal));
  return corridorSearch(layer, ov, start, goal, taste);
}

function corridorSearch(layer: NavLayer, ov: Overlay, start: number, goal: number, taste: Taste | null): Int32Array {
  let cells: Int32Array | null = null;
  for (const { ring, avoids } of CORRIDOR_TRIES) {
    if (!markCorridor(layer, start, goal, taste, ring, avoids ? ov : null)) break;
    cells = fineSearch(layer, ov, start, goal, true, taste);
    if (cells[cells.length - 1] === goal) return cells;
    count('route-corridor-miss');
  }
  return cells ?? fineSearch(layer, ov, start, goal, false, taste);
}

const CORRIDOR_TRIES = [{ ring: 2, avoids: false }, { ring: 3, avoids: false }, { ring: 3, avoids: true }];
const COVERED_COST = 1000;

function coveredCost(layer: NavLayer, ov: Overlay | null, r: number): number {
  return ov === null ? 1 : 1 + COVERED_COST * coveredShare(layer, ov, r);
}

function coveredShare(layer: NavLayer, ov: Overlay, r: number): number {
  const g = layer.grid;
  const block = g.regions.block[r];
  const n = layer.n;
  const x0 = (block % g.bn) * COARSE;
  const y0 = Math.floor(block / g.bn) * COARSE;
  let own = 0;
  let covered = 0;
  for (let y = y0; y < Math.min(n, y0 + COARSE); y++)
    for (let x = x0; x < Math.min(n, x0 + COARSE); x++) {
      const c = y * n + x;
      if (regionAt(g, c) !== r) continue;
      own++;
      if (ov.stamp[c] === ov.gen) covered++;
    }
  return covered / own;
}

export function connected(layer: NavLayer, start: number, goal: number): boolean {
  const target = componentOf(layer, goal);
  return target !== 0 && target === startComponent(layer, start);
}

export function startComponent(layer: NavLayer, start: number): number {
  const own = componentOf(layer, start);
  if (own !== 0) return own;
  const n = layer.n;
  const x = start % n;
  const y = Math.floor(start / n);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const c = componentOf(layer, ny * n + nx);
      if (c !== 0) return c;
    }
  return 0;
}

export function canStepOut(layer: NavLayer, ov: Overlay, start: number): boolean {
  if (isFree(layer, ov, start)) return true;
  const count = neighbours(layer.n, start);
  for (let k = 0; k < count; k++) if (isFree(layer, ov, around[k])) return true;
  return false;
}

let coarseCost = new Float64Array(0);
let coarseFrom = new Int32Array(0);
let coarseSeen = new Uint32Array(0);
let coarseClosed = new Uint32Array(0);
let coarseGen = 0;
let inCorridor = new Uint32Array(0);
let corridorGen = 0;
let inCells = new Uint32Array(0);
let cellsGen = 0;

function markCorridor(layer: NavLayer, start: number, goal: number, taste: Taste | null, ring: number, avoid: Overlay | null): boolean {
  const grid = layer.grid;
  const R = grid.regions;
  const bn = grid.bn;
  const from = startRegion(layer, start, goal);
  ensureFine(layer.cells, goal);
  const to = regionAt(grid, goal);
  if (!markCells(layer, from, to, avoid, taste)) return false;
  coarseRoom(R.block.length, bn);
  const g = ++coarseGen;
  const search = { layer, taste, avoid, g, to, w: REGION.navigation.heuristicWeight };
  heapSize = 0;
  coarseCost[from] = 0;
  coarseFrom[from] = -1;
  coarseSeen[from] = g;
  heapPush(from, heuristic(R.x[from], R.y[from], R.x[to], R.y[to]) * search.w);
  while (heapSize > 0) {
    const cur = heapPop();
    if (cur === to) return markBlocks(layer, to, ring);
    if (coarseClosed[cur] === g) continue;
    coarseClosed[cur] = g;
    for (const next of R.links[cur]) if (coarseClosed[next] !== g && inCells[cellOfBlock(grid, R.block[next])] === cellsGen) relaxRegion(search, cur, next);
  }
  return false;
}

type RegionSearch = { layer: NavLayer; taste: Taste | null; avoid: Overlay | null; g: number; to: number; w: number };

function relaxRegion(s: RegionSearch, cur: number, next: number): void {
  const R = s.layer.grid.regions;
  const step = stepCost(R, cur, next) * coveredCost(s.layer, s.avoid, next);
  const c = coarseCost[cur] + tastedCoarse(s.taste, step, ((R.x[cur] + R.x[next]) / 2) * CELL, ((R.y[cur] + R.y[next]) / 2) * CELL, R.block[cur], R.block[next]);
  if (coarseSeen[next] === s.g && c >= coarseCost[next]) return;
  coarseSeen[next] = s.g;
  coarseCost[next] = c;
  coarseFrom[next] = cur;
  heapPush(next, c + heuristic(R.x[next], R.y[next], R.x[s.to], R.y[s.to]) * s.w);
}

function coarseRoom(regions: number, bn: number): void {
  if (coarseSeen.length < regions || coarseGen === 0xffffffff) {
    const room = Math.max(regions, coarseSeen.length * 2);
    coarseCost = new Float64Array(room);
    coarseFrom = new Int32Array(room);
    coarseSeen = new Uint32Array(room);
    coarseClosed = new Uint32Array(room);
    coarseGen = 0;
  }
  if (inCorridor.length === bn * bn && corridorGen !== 0xffffffff) return;
  inCorridor = new Uint32Array(bn * bn);
  corridorGen = 0;
}

function markBlocks(layer: NavLayer, to: number, ring: number): boolean {
  const { bn, regions: R } = layer.grid;
  const cg = ++corridorGen;
  for (let r = to; r !== -1; r = coarseFrom[r]) {
    const x = R.block[r] % bn;
    const y = Math.floor(R.block[r] / bn);
    for (let ny = Math.max(0, y - ring); ny <= Math.min(bn - 1, y + ring); ny++) for (let nx = Math.max(0, x - ring); nx <= Math.min(bn - 1, x + ring); nx++) inCorridor[ny * bn + nx] = cg;
  }
  return true;
}

let pieceCost = new Float64Array(0);
let pieceFrom = new Int32Array(0);
let pieceSeen = new Uint32Array(0);
let pieceClosed = new Uint32Array(0);
let pieceGen = 0;

function markCells(layer: NavLayer, from: number, to: number, avoid: Overlay | null, taste: Taste | null): boolean {
  const chain = crossingCells(layer, from, to, avoid, taste);
  if (chain === null) return false;
  const m = layer.grid.m;
  if (inCells.length !== m * m || cellsGen === 0xffffffff) {
    inCells = new Uint32Array(m * m);
    cellsGen = 0;
  }
  const cg = ++cellsGen;
  const ring = avoid === null ? REGION.navigation.cellRing : REGION.navigation.avoidCellRing;
  count('route-crossing-cells', chain.length);
  for (const cell of chain) markCellsAround(layer, cell, ring, cg);
  return true;
}

function markCellsAround(layer: NavLayer, cell: number, ring: number, cg: number): void {
  const m = layer.grid.m;
  const cx = cell % m;
  const cy = Math.floor(cell / m);
  for (let y = Math.max(0, cy - ring); y <= Math.min(m - 1, cy + ring); y++)
    for (let x = Math.max(0, cx - ring); x <= Math.min(m - 1, cx + ring); x++) {
      if (inCells[y * m + x] === cg) continue;
      inCells[y * m + x] = cg;
      ensureCell(layer.cells, y * m + x);
    }
}

const cheapest = new WeakMap<Float32Array, number>();

function cheapestSlow(layer: NavLayer): number {
  let low = cheapest.get(layer.slow);
  if (low === undefined) {
    low = layer.slow.reduce((a, b) => Math.min(a, b), Infinity);
    cheapest.set(layer.slow, low);
  }
  return low;
}

function crossingCells(layer: NavLayer, from: number, to: number, avoid: Overlay | null, taste: Taste | null): number[] | null {
  const grid = layer.grid;
  const R = grid.regions;
  const P = grid.pieces;
  const T = grid.portals;
  const [a, b] = [R.piece[from], R.piece[to]];
  if (a === b) return [P.cell[a]];
  const goal = T.a.length;
  crossingRoom(goal + 1);
  const goalCost = costsWithin(grid, to);
  const s: CrossingSearch = { layer, avoid, taste, g: ++pieceGen, goal, to, b, rate: cheapestSlow(layer), toGoal: new Map(P.ends[b].map((t) => [t, goalCost(endRegion(grid, t, b))])) };
  heapSize = 0;
  const fromStart = costsWithin(grid, from);
  for (const t of P.ends[a]) relaxCrossing(s, t, fromStart(endRegion(grid, t, a)), -1);
  while (heapSize > 0) {
    const cur = heapPop();
    if (cur === goal) return chainCells(grid, pieceFrom[goal], a, b);
    if (pieceClosed[cur] === s.g) continue;
    pieceClosed[cur] = s.g;
    expandCrossing(s, cur);
  }
  return null;
}

type CrossingSearch = { layer: NavLayer; avoid: Overlay | null; taste: Taste | null; g: number; goal: number; to: number; b: number; rate: number; toGoal: Map<number, number> };

function crossingRoom(size: number): void {
  if (pieceSeen.length >= size && pieceGen !== 0xffffffff) return;
  const room = Math.max(size, pieceSeen.length * 2);
  pieceCost = new Float64Array(room);
  pieceFrom = new Int32Array(room);
  pieceSeen = new Uint32Array(room);
  pieceClosed = new Uint32Array(room);
  pieceGen = 0;
}

function expandCrossing(s: CrossingSearch, cur: number): void {
  const { pieces: P, portals: T } = s.layer.grid;
  const goalLeg = s.toGoal.get(cur);
  if (goalLeg !== undefined) relaxCrossing(s, s.goal, goalLeg, cur);
  for (const side of [T.a[cur], T.b[cur]]) {
    const ends = P.ends[side];
    const i = ends.indexOf(cur);
    for (let j = 0; j < ends.length; j++) if (j !== i) relaxCrossing(s, ends[j], P.tri[side][triIndex(ends.length, i, j)], cur);
  }
}

function relaxCrossing(s: CrossingSearch, t: number, step: number, prev: number): void {
  const c = (prev === -1 ? 0 : pieceCost[prev]) + weighCrossing(s, t, step);
  if (pieceClosed[t] === s.g || (pieceSeen[t] === s.g && c >= pieceCost[t])) return;
  pieceSeen[t] = s.g;
  pieceCost[t] = c;
  pieceFrom[t] = prev;
  heapPush(t, c + crossingAhead(s, t));
}

function crossingAhead(s: CrossingSearch, t: number): number {
  if (t === s.goal) return 0;
  const { portals: T, regions: R } = s.layer.grid;
  return Math.hypot(T.x[t] - R.x[s.to], T.y[t] - R.y[s.to]) * s.rate;
}

function weighCrossing(s: CrossingSearch, t: number, step: number): number {
  if (t === s.goal) return step;
  const T = s.layer.grid.portals;
  const covered = s.avoid !== null && s.avoid.stamp[Math.round(T.y[t]) * s.layer.n + Math.round(T.x[t])] === s.avoid.gen;
  return tasted(s.taste, covered ? step * (1 + COVERED_COST) : step, (T.x[t] + 0.5) * CELL, (T.y[t] + 0.5) * CELL);
}

function chainCells(grid: NavLayer['grid'], last: number, a: number, b: number): number[] {
  const T = grid.portals;
  const P = grid.pieces;
  const cells = [P.cell[a], P.cell[b]];
  for (let t = last; t !== -1; t = pieceFrom[t]) cells.push(P.cell[T.a[t]], P.cell[T.b[t]]);
  return cells;
}

export function coarseCells(layer: NavLayer, start: number, goal: number, taste: Taste | null): number[] | null {
  const chain = coarseChain(layer, start, goal, taste);
  return chain && chain.slice(1).map((r) => cellOfRegion(layer, r));
}

function coarseChain(layer: NavLayer, start: number, goal: number, taste: Taste | null): number[] | null {
  if (!connected(layer, start, goal) || !markCorridor(layer, start, goal, taste, 1, null)) return null;
  const chain: number[] = [];
  for (let r = regionAt(layer.grid, goal); r !== -1; r = coarseFrom[r]) chain.push(r);
  return chain.reverse();
}

export function coarseWaypoint(layer: NavLayer, start: number, goal: number, taste: Taste | null, reachCells: number): number | null {
  const chain = coarseChain(layer, start, goal, taste);
  if (chain === null) return null;
  const { x: rx, y: ry } = layer.grid.regions;
  let along = 0;
  for (let i = 1; i < chain.length; i++) {
    along += Math.hypot(rx[chain[i]] - rx[chain[i - 1]], ry[chain[i]] - ry[chain[i - 1]]);
    if (along >= reachCells) return cellOfRegion(layer, chain[i]);
  }
  return null;
}

function cellOfRegion(layer: NavLayer, r: number): number {
  const g = layer.grid;
  const { block, x: rx, y: ry } = g.regions;
  const n = layer.n;
  const x0 = (block[r] % g.bn) * COARSE;
  const y0 = Math.floor(block[r] / g.bn) * COARSE;
  let best = -1;
  let bestGap = Infinity;
  for (let y = y0; y < Math.min(n, y0 + COARSE); y++)
    for (let x = x0; x < Math.min(n, x0 + COARSE); x++) {
      const gap = Math.hypot(x - rx[r], y - ry[r]);
      if (regionAt(g, y * n + x) === r && gap < bestGap) {
        best = y * n + x;
        bestGap = gap;
      }
    }
  return best;
}

function startRegion(layer: NavLayer, start: number, goal: number): number {
  ensureFine(layer.cells, start);
  const own = regionAt(layer.grid, start);
  if (own !== 0) return own;
  const n = layer.n;
  const x = start % n;
  const y = Math.floor(start / n);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const c = ny * n + nx;
      if (componentOf(layer, c) === componentOf(layer, goal)) return regionAt(layer.grid, c);
    }
  throw new Error(`start cell ${start} has no free neighbour joined to goal ${goal}`);
}

function fineSearch(layer: NavLayer, ov: Overlay, start: number, goal: number, corridor: boolean, taste: Taste | null, box: Box | null = null): Int32Array {
  const n = layer.n;
  const g = begin(n * n);
  const w = REGION.navigation.heuristicWeight;
  const gx = goal % n;
  const gy = Math.floor(goal / n);
  heapSize = 0;
  cost[start] = 0;
  from[start] = -1;
  seen[start] = g;
  heapPush(start, heuristic(start % n, Math.floor(start / n), gx, gy) * w);
  let expanded = 0;
  let nearest = start;
  let nearestLeft = Infinity;
  while (heapSize > 0) {
    const cur = heapPop();
    if (cur === goal) return finished(goal, expanded);
    if (closed[cur] === g) continue;
    closed[cur] = g;
    expanded++;
    const left = heuristic(cur % n, Math.floor(cur / n), gx, gy);
    if (left < nearestLeft) {
      nearest = cur;
      nearestLeft = left;
    }
    const count = neighbours(n, cur);
    for (let k = 0; k < count; k++) {
      const next = around[k];
      if (!canEnter(layer, ov, next, g, corridor, box)) continue;
      const nx = next % n;
      const ny = Math.floor(next / n);
      const c = cost[cur] + tasted(taste, aroundStep[k] * slowAt(layer, next), (nx + 0.5) * CELL, (ny + 0.5) * CELL);
      if (seen[next] === g && c >= cost[next]) continue;
      seen[next] = g;
      cost[next] = c;
      from[next] = cur;
      heapPush(next, c + heuristic(nx, ny, gx, gy) * w);
    }
  }
  return finished(nearest, expanded);
}

function finished(end: number, expanded: number): Int32Array {
  count('route-search-cells', expanded);
  return unwind(end);
}

function canEnter(layer: NavLayer, ov: Overlay, c: number, g: number, corridor: boolean, box: Box | null): boolean {
  if (!isFree(layer, ov, c) || closed[c] === g) return false;
  const n = layer.n;
  if (box && !inBox(box, c % n, Math.floor(c / n))) return false;
  const bn = layer.grid.bn;
  return !corridor || inCorridor[Math.floor(Math.floor(c / n) / COARSE) * bn + Math.floor((c % n) / COARSE)] === corridorGen;
}

function inBox(box: Box, x: number, y: number): boolean {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}

function unwind(goal: number): Int32Array {
  let len = 1;
  for (let c = goal; from[c] !== -1; c = from[c]) len++;
  const out = new Int32Array(len);
  for (let c = goal, i = len - 1; i >= 0; c = from[c], i--) out[i] = c;
  return out;
}
