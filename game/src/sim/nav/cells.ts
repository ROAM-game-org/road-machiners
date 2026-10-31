import { count } from '../../perf';

export type Window = { x0: number; y0: number; x1: number; y1: number };

export type Regions = { block: number[]; x: number[]; y: number[]; size: number[]; slow: number[]; piece: number[]; key: number[]; links: number[][] };

export type Pieces = { cell: number[]; key: number[]; cells: number[][]; ends: number[][]; tri: number[][]; comp: Int32Array };

export type Portals = { a: number[]; b: number[]; ra: number[]; rb: number[]; x: number[]; y: number[]; key: number[] };

export type CellGrid = {
  n: number;
  side: number;
  coarse: number;
  m: number;
  bn: number;
  built: Uint8Array;
  local: Uint8Array;
  first: Int32Array;
  regions: Regions;
  cellRegions: number[][];
  pieces: Pieces;
  portals: Portals;
};

export type CellSource = { grid: CellGrid; blocked: Uint8Array; slowOf: (c: number) => number; fill: (cell: number) => void };

const KEY_STRIDE = 4096;
const PAIR_STRIDE = 2 ** 24;
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function newGrid(n: number, side: number, coarse: number): CellGrid {
  const m = Math.ceil(n / side);
  const bn = Math.ceil(n / coarse);
  return {
    n,
    side,
    coarse,
    m,
    bn,
    built: new Uint8Array(m * m),
    local: new Uint8Array(n * n),
    first: new Int32Array(bn * bn),
    regions: { block: [-1], x: [0], y: [0], size: [0], slow: [0], piece: [0], key: [-1], links: [[]] },
    cellRegions: Array.from({ length: m * m }, () => []),
    pieces: emptyPieces(m),
    portals: emptyPortals(),
  };
}

function emptyPieces(m: number): Pieces {
  return { cell: [-1], key: [-1], cells: Array.from({ length: m * m }, () => []), ends: [[]], tri: [[]], comp: new Int32Array(1) };
}

function emptyPortals(): Portals {
  return { a: [-1], b: [-1], ra: [0], rb: [0], x: [0], y: [0], key: [-1] };
}

export function cellWindow(g: CellGrid, cell: number): Window {
  const cx = cell % g.m;
  const cy = (cell - cx) / g.m;
  return { x0: cx * g.side, y0: cy * g.side, x1: Math.min(g.n, (cx + 1) * g.side) - 1, y1: Math.min(g.n, (cy + 1) * g.side) - 1 };
}

export function cellOfFine(g: CellGrid, c: number): number {
  const x = c % g.n;
  return Math.floor((c - x) / g.n / g.side) * g.m + Math.floor(x / g.side);
}

export function cellOfBlock(g: CellGrid, block: number): number {
  const per = g.side / g.coarse;
  const bx = block % g.bn;
  return Math.floor((block - bx) / g.bn / per) * g.m + Math.floor(bx / per);
}

export function regionAt(g: CellGrid, c: number): number {
  const l = g.local[c];
  if (l === 0) return 0;
  const x = c % g.n;
  return g.first[Math.floor((c - x) / g.n / g.coarse) * g.bn + Math.floor(x / g.coarse)] + l - 1;
}

export function ensureFine(src: CellSource, c: number): void {
  const cell = cellOfFine(src.grid, c);
  if (src.grid.built[cell] === 0) ensureCell(src, cell);
}

export function ensureCell(src: CellSource, cell: number): void {
  if (src.grid.built[cell] === 1) return;
  count('route-cell');
  const order = buildRegions(src, cell);
  const ids = src.grid.pieces.cells[cell];
  if (ids.length !== order.count) throw new Error(`Route summary has ${ids.length} pieces in cell ${cell}, the map has ${order.count}. Run npm run routes:bake.`);
  order.pieceOf.forEach((local, i) => (src.grid.regions.piece[src.grid.cellRegions[cell][i]] = ids[local]));
}

export function ensureAll(src: CellSource): void {
  for (let cell = 0; cell < src.grid.m * src.grid.m; cell++) ensureCell(src, cell);
}

function buildRegions(src: CellSource, cell: number): { count: number; pieceOf: number[] } {
  const g = src.grid;
  src.fill(cell);
  const w = cellWindow(g, cell);
  const queue = new Int32Array(g.coarse * g.coarse);
  for (let by = w.y0 / g.coarse; by * g.coarse <= w.y1; by++) for (let bx = w.x0 / g.coarse; bx * g.coarse <= w.x1; bx++) blockRegions(src, cell, by * g.bn + bx, queue);
  g.built[cell] = 1;
  linkCell(g, w);
  return localPieces(g, cell);
}

type BlockArea = { block: number; x0: number; y0: number; w: number; h: number };

function blockRegions(src: CellSource, cell: number, block: number, queue: Int32Array): void {
  const g = src.grid;
  const x0 = (block % g.bn) * g.coarse;
  const y0 = Math.floor(block / g.bn) * g.coarse;
  const area = { block, x0, y0, w: Math.min(g.n, x0 + g.coarse) - x0, h: Math.min(g.n, y0 + g.coarse) - y0 };
  g.first[block] = g.regions.block.length;
  let next = 1;
  for (let sy = 0; sy < area.h; sy++)
    for (let sx = 0; sx < area.w; sx++) {
      const seed = (y0 + sy) * g.n + x0 + sx;
      if (isOpen(src, seed)) addRegion(src, cell, area, floodBlock(src, area, sy * g.coarse + sx, next++, queue));
    }
}

function isOpen(src: CellSource, c: number): boolean {
  return src.blocked[c] === 0 && src.grid.local[c] === 0;
}

type Flood = { x: number; y: number; slow: number; size: number };

function floodBlock(src: CellSource, area: BlockArea, start: number, l: number, queue: Int32Array): Flood {
  const g = src.grid;
  const C = g.coarse;
  const sum = { x: 0, y: 0, slow: 0, size: 0 };
  g.local[(area.y0 + Math.floor(start / C)) * g.n + area.x0 + (start % C)] = l;
  queue[0] = start;
  let tail = 1;
  for (let i = 0; i < tail; i++) {
    const lx = queue[i] % C;
    const ly = (queue[i] - lx) / C;
    sum.x += area.x0 + lx;
    sum.y += area.y0 + ly;
    sum.slow += src.slowOf((area.y0 + ly) * g.n + area.x0 + lx);
    tail = spread(src, area, lx, ly, l, queue, tail);
  }
  sum.size = tail;
  return sum;
}

function spread(src: CellSource, area: BlockArea, lx: number, ly: number, l: number, queue: Int32Array, tail: number): number {
  const g = src.grid;
  for (let ny = Math.max(0, ly - 1); ny <= Math.min(area.h - 1, ly + 1); ny++)
    for (let nx = Math.max(0, lx - 1); nx <= Math.min(area.w - 1, lx + 1); nx++) {
      const c = (area.y0 + ny) * g.n + area.x0 + nx;
      if (!isOpen(src, c)) continue;
      g.local[c] = l;
      queue[tail++] = ny * g.coarse + nx;
    }
  return tail;
}

function addRegion(src: CellSource, cell: number, area: BlockArea, f: Flood): void {
  const R = src.grid.regions;
  const own = src.grid.cellRegions[cell];
  R.block.push(area.block);
  R.x.push(f.x / f.size);
  R.y.push(f.y / f.size);
  R.size.push(f.size);
  R.slow.push(f.slow / f.size);
  R.piece.push(0);
  R.key.push(cell * KEY_STRIDE + own.length);
  R.links.push([]);
  own.push(R.block.length - 1);
}

type LastLink = { a: number; b: number };

function linkCell(g: CellGrid, w: Window): void {
  const last = { a: 0, b: 0 };
  for (let k = Math.max(g.coarse, w.x0); k <= Math.min(g.n - 1, w.x1 + 1); k += g.coarse) linkColumn(g, w, last, k);
  for (let k = Math.max(g.coarse, w.y0); k <= Math.min(g.n - 1, w.y1 + 1); k += g.coarse) linkRow(g, w, last, k);
}

function linkColumn(g: CellGrid, w: Window, last: LastLink, k: number): void {
  for (let y = Math.max(0, w.y0 - 1); y <= Math.min(g.n - 1, w.y1 + 1); y++)
    for (let yy = Math.max(0, y - 1); yy <= Math.min(g.n - 1, y + 1); yy++) linkPair(g, w, last, [k - 1, y], [k, yy]);
}

function linkRow(g: CellGrid, w: Window, last: LastLink, k: number): void {
  for (let x = Math.max(0, w.x0 - 1); x <= Math.min(g.n - 1, w.x1 + 1); x++)
    for (let xx = Math.max(0, x - 1); xx <= Math.min(g.n - 1, x + 1); xx++) linkPair(g, w, last, [x, k - 1], [xx, k]);
}

function linkPair(g: CellGrid, w: Window, last: LastLink, [ax, ay]: [number, number], [bx, by]: [number, number]): void {
  if (!inWindow(w, ax, ay) && !inWindow(w, bx, by)) return;
  const a = regionAt(g, ay * g.n + ax);
  const b = a === 0 ? 0 : regionAt(g, by * g.n + bx);
  if (b !== 0) linkOnce(g.regions, last, a, b);
}

function inWindow(w: Window, x: number, y: number): boolean {
  return x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1;
}

function linkOnce(R: Regions, last: { a: number; b: number }, a: number, b: number): void {
  if (last.a === a && last.b === b) return;
  last.a = a;
  last.b = b;
  insertSorted(R.links[a], b, R.key);
  insertSorted(R.links[b], a, R.key);
}

function insertSorted(list: number[], id: number, key: number[]): void {
  if (list.includes(id)) return;
  let i = list.length;
  while (i > 0 && key[list[i - 1]] > key[id]) i--;
  list.splice(i, 0, id);
}

function localPieces(g: CellGrid, cell: number): { count: number; pieceOf: number[] } {
  const own = g.cellRegions[cell];
  const index = new Map(own.map((r, i) => [r, i]));
  const pieceOf = own.map(() => -1);
  let count = 0;
  for (let seed = 0; seed < own.length; seed++) if (pieceOf[seed] === -1) floodPiece(g, own, index, pieceOf, seed, count++);
  return { count, pieceOf };
}

function floodPiece(g: CellGrid, own: number[], index: Map<number, number>, pieceOf: number[], seed: number, piece: number): void {
  const queue = [seed];
  pieceOf[seed] = piece;
  for (let i = 0; i < queue.length; i++)
    for (const t of g.regions.links[own[queue[i]]]) {
      const j = index.get(t) ?? -1;
      if (j === -1 || pieceOf[j] !== -1) continue;
      pieceOf[j] = piece;
      queue.push(j);
    }
}

export function dropCell(g: CellGrid, cell: number): void {
  if (g.built[cell] === 0) return;
  const R = g.regions;
  for (const r of g.cellRegions[cell]) {
    for (const t of R.links[r]) R.links[t] = R.links[t].filter((x) => x !== r);
    R.links[r] = [];
    R.block[r] = -1;
  }
  g.cellRegions[cell] = [];
  const w = cellWindow(g, cell);
  for (let y = w.y0; y <= w.y1; y++) g.local.fill(0, y * g.n + w.x0, y * g.n + w.x1 + 1);
  g.built[cell] = 0;
}

export function buildPieces(src: CellSource, cells: number[]): void {
  const g = src.grid;
  count('route-cell-repieced', cells.length);
  const stale = new Set<number>();
  for (const cell of cells) killPieces(g, cell, stale);
  for (const cell of cells) freshCell(src, cell);
  for (const near of new Set(cells.flatMap((cell) => neighbourCells(g, cell)))) ensureCell(src, near);
  for (const cell of cells) addPortals(g, cell, stale);
  refreshCosts(g, [...stale, ...cells.flatMap((cell) => g.pieces.cells[cell])]);
}

function refreshCosts(g: CellGrid, pieces: number[]): void {
  for (const p of new Set(pieces)) if (g.pieces.cell[p] !== -1) g.pieces.tri[p] = crossCosts(g, p);
  g.pieces.comp = pieceComponents(g);
}

function killPieces(g: CellGrid, cell: number, stale: Set<number>): void {
  const P = g.pieces;
  const T = g.portals;
  for (const p of P.cells[cell]) {
    for (const t of P.ends[p]) {
      const other = T.a[t] === p ? T.b[t] : T.a[t];
      P.ends[other] = P.ends[other].filter((x) => x !== t);
      stale.add(other);
      T.a[t] = -1;
      T.b[t] = -1;
    }
    P.ends[p] = [];
    P.tri[p] = [];
    P.cell[p] = -1;
  }
  P.cells[cell] = [];
}

function freshCell(src: CellSource, cell: number): void {
  const g = src.grid;
  const P = g.pieces;
  dropCell(g, cell);
  const { count, pieceOf } = buildRegions(src, cell);
  const ids = Array.from({ length: count }, (_, local) => addPiece(P, cell, local));
  P.cells[cell] = ids;
  g.cellRegions[cell].forEach((r, i) => (g.regions.piece[r] = ids[pieceOf[i]]));
}

function addPiece(P: Pieces, cell: number, local: number): number {
  P.cell.push(cell);
  P.key.push(cell * KEY_STRIDE + local);
  P.ends.push([]);
  P.tri.push([]);
  return P.cell.length - 1;
}

function neighbourCells(g: CellGrid, cell: number): number[] {
  const cx = cell % g.m;
  const cy = (cell - cx) / g.m;
  const out: number[] = [];
  for (const [dx, dy] of AROUND) {
    const x = cx + dx;
    const y = cy + dy;
    if (x >= 0 && y >= 0 && x < g.m && y < g.m) out.push(y * g.m + x);
  }
  return out;
}

type Crossing = { r: number; t: number; score: number };

function crossingPairs(g: CellGrid, cell: number): Map<number, Crossing[]> {
  const R = g.regions;
  const pairs = new Map<number, Crossing[]>();
  for (const r of g.cellRegions[cell])
    for (const t of R.links[r]) {
      const key = pairKey(g.pieces, R.piece[r], R.piece[t]);
      if (cellOfBlock(g, R.block[t]) === cell || hasPortal(g, R.piece[r], key)) continue;
      pairs.set(key, [...(pairs.get(key) ?? []), { r, t, score: R.slow[r] + R.slow[t] }]);
    }
  return pairs;
}

function addPortals(g: CellGrid, cell: number, stale: Set<number>): void {
  const R = g.regions;
  for (const [key, list] of [...crossingPairs(g, cell)].sort((x, y) => x[0] - y[0])) {
    const best = bestCrossing(R, list);
    const t = addPortal(g, best.r, best.t, key);
    stale.add(g.portals.a[t]);
    stale.add(g.portals.b[t]);
  }
}

function pairKey(P: Pieces, a: number, b: number): number {
  const [lo, hi] = P.key[a] < P.key[b] ? [P.key[a], P.key[b]] : [P.key[b], P.key[a]];
  return lo * PAIR_STRIDE + hi;
}

function hasPortal(g: CellGrid, piece: number, key: number): boolean {
  return g.pieces.ends[piece].some((t) => g.portals.key[t] === key);
}

function bestCrossing(R: Regions, found: Crossing[]): Crossing {
  const order = (c: Crossing) => Math.min(R.key[c.r], R.key[c.t]) * PAIR_STRIDE + Math.max(R.key[c.r], R.key[c.t]);
  const list = [...found].sort((p, q) => order(p) - order(q));
  const cheapest = Math.min(...list.map((c) => c.score));
  const cheap = list.filter((c) => c.score <= cheapest * (1 + 1e-9));
  const mx = list.reduce((s, c) => s + R.x[c.r] + R.x[c.t], 0) / (2 * list.length);
  const my = list.reduce((s, c) => s + R.y[c.r] + R.y[c.t], 0) / (2 * list.length);
  const gap = (c: Crossing) => Math.hypot((R.x[c.r] + R.x[c.t]) / 2 - mx, (R.y[c.r] + R.y[c.t]) / 2 - my);
  return cheap.reduce((best, c) => (gap(c) < gap(best) ? c : best));
}

function addPortal(g: CellGrid, near: number, far: number, key: number): number {
  const R = g.regions;
  const P = g.pieces;
  const T = g.portals;
  const [r, t] = P.key[R.piece[near]] < P.key[R.piece[far]] ? [near, far] : [far, near];
  const id = T.a.length;
  T.a.push(R.piece[r]);
  T.b.push(R.piece[t]);
  T.ra.push(R.key[r] % KEY_STRIDE);
  T.rb.push(R.key[t] % KEY_STRIDE);
  T.x.push((R.x[r] + R.x[t]) / 2);
  T.y.push((R.y[r] + R.y[t]) / 2);
  T.key.push(key);
  insertSorted(P.ends[R.piece[r]], id, T.key);
  insertSorted(P.ends[R.piece[t]], id, T.key);
  return id;
}

export function endRegion(g: CellGrid, portal: number, piece: number): number {
  const T = g.portals;
  const index = T.a[portal] === piece ? T.ra[portal] : T.rb[portal];
  return g.cellRegions[g.pieces.cell[piece]][index];
}

export function triIndex(k: number, i: number, j: number): number {
  const [lo, hi] = i < j ? [i, j] : [j, i];
  return lo * k - (lo * (lo + 1)) / 2 + (hi - lo - 1);
}

function crossCosts(g: CellGrid, piece: number): number[] {
  const ends = g.pieces.ends[piece];
  const k = ends.length;
  const regions = ends.map((t) => endRegion(g, t, piece));
  const tri = new Array<number>((k * (k - 1)) / 2);
  for (let i = 0; i < k; i++) {
    const costOf = costsWithin(g, regions[i]);
    for (let j = i + 1; j < k; j++) tri[triIndex(k, i, j)] = costOf(regions[j]);
  }
  return tri;
}

export function stepCost(R: Regions, a: number, b: number): number {
  return Math.hypot(R.x[b] - R.x[a], R.y[b] - R.y[a]) * ((R.slow[a] + R.slow[b]) / 2);
}

let within = { cost: new Float64Array(0), seen: new Uint32Array(0), shut: new Uint32Array(0), gen: 0 };

function withinRoom(size: number): void {
  if (within.seen.length >= size && within.gen !== 0xffffffff) return;
  within = { cost: new Float64Array(size * 2), seen: new Uint32Array(size * 2), shut: new Uint32Array(size * 2), gen: 0 };
}

export function costsWithin(g: CellGrid, from: number): (r: number) => number {
  const R = g.regions;
  withinRoom(R.block.length);
  const { cost, seen, shut } = within;
  const gen = ++within.gen;
  const piece = R.piece[from];
  const open = new MinHeap();
  cost[from] = 0;
  seen[from] = gen;
  open.push(from, 0);
  while (open.size > 0) {
    const cur = open.pop();
    if (shut[cur] === gen) continue;
    shut[cur] = gen;
    for (const next of R.links[cur]) if (R.piece[next] === piece && shut[next] !== gen) relaxWithin(R, open, gen, cur, next);
  }
  return (r) => {
    if (within.gen !== gen || shut[r] !== gen) throw new Error(`Route region ${r} is not joined to region ${from} inside piece ${piece}`);
    return cost[r];
  };
}

function relaxWithin(R: Regions, open: MinHeap, gen: number, cur: number, next: number): void {
  const { cost, seen } = within;
  const c = cost[cur] + stepCost(R, cur, next);
  if (seen[next] === gen && c >= cost[next]) return;
  seen[next] = gen;
  cost[next] = c;
  open.push(next, c);
}

class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    let i = this.items.length;
    this.items.push(item);
    this.keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.items[i] = this.items[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }

  pop(): number {
    const top = this.items[0];
    const item = this.items.pop()!;
    const key = this.keys.pop()!;
    if (this.items.length > 0) this.sink(item, key);
    return top;
  }

  private sink(item: number, key: number): void {
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= this.items.length) break;
      const right = left + 1;
      const child = right < this.items.length && this.keys[right] < this.keys[left] ? right : left;
      if (this.keys[child] >= key) break;
      this.items[i] = this.items[child];
      this.keys[i] = this.keys[child];
      i = child;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }
}

function pieceComponents(g: CellGrid): Int32Array {
  const P = g.pieces;
  const T = g.portals;
  const comp = new Int32Array(P.cell.length);
  let next = 0;
  for (let seed = 1; seed < P.cell.length; seed++) if (comp[seed] === 0 && P.cell[seed] !== -1) floodComponent(P, T, comp, seed, ++next);
  return comp;
}

function floodComponent(P: Pieces, T: Portals, comp: Int32Array, seed: number, id: number): void {
  comp[seed] = id;
  const queue = [seed];
  for (let i = 0; i < queue.length; i++)
    for (const t of P.ends[queue[i]]) {
      const q = T.a[t] === queue[i] ? T.b[t] : T.a[t];
      if (comp[q] !== 0) continue;
      comp[q] = id;
      queue.push(q);
    }
}

export type PieceTable = { counts: Uint16Array; a: Int32Array; b: Int32Array; ra: Uint16Array; rb: Uint16Array; x: Float32Array; y: Float32Array; tri: Float32Array };

export function pieceTable(g: CellGrid): PieceTable {
  const P = g.pieces;
  const T = g.portals;
  const pieces = P.cells.flat();
  const pieceId = new Map(pieces.map((p, i) => [p, i + 1]));
  const portals = [...new Set(pieces.flatMap((p) => P.ends[p]))].sort((s, t) => T.key[s] - T.key[t]);
  const at = (list: number[], f: (t: number) => number) => list.map(f);
  return {
    counts: Uint16Array.from(P.cells, (ids) => ids.length),
    a: Int32Array.from(at(portals, (t) => pieceId.get(T.a[t])!)),
    b: Int32Array.from(at(portals, (t) => pieceId.get(T.b[t])!)),
    ra: Uint16Array.from(at(portals, (t) => T.ra[t])),
    rb: Uint16Array.from(at(portals, (t) => T.rb[t])),
    x: Float32Array.from(at(portals, (t) => T.x[t])),
    y: Float32Array.from(at(portals, (t) => T.y[t])),
    tri: Float32Array.from(pieces.flatMap((p) => P.tri[p])),
  };
}

export function loadPieces(g: CellGrid, table: PieceTable): void {
  const P = emptyPieces(g.m);
  const T = emptyPortals();
  table.counts.forEach((count, cell) => (P.cells[cell] = Array.from({ length: count }, (_, local) => addPiece(P, cell, local))));
  for (let i = 0; i < table.a.length; i++) {
    const id = T.a.length;
    T.a.push(table.a[i]);
    T.b.push(table.b[i]);
    T.ra.push(table.ra[i]);
    T.rb.push(table.rb[i]);
    T.x.push(table.x[i]);
    T.y.push(table.y[i]);
    T.key.push(pairKey(P, table.a[i], table.b[i]));
    P.ends[table.a[i]].push(id);
    P.ends[table.b[i]].push(id);
  }
  let at = 0;
  for (let p = 1; p < P.cell.length; p++) {
    const k = P.ends[p].length;
    P.tri[p] = Array.from(table.tri.subarray(at, at + (k * (k - 1)) / 2));
    at += (k * (k - 1)) / 2;
  }
  if (at !== table.tri.length) throw new Error(`Route summary holds ${table.tri.length} crossing costs, its pieces need ${at}`);
  g.pieces = P;
  g.portals = T;
  P.comp = pieceComponents(g);
}
