import { barrelCells } from './barrels';
import { cellKey, gridOf, isMounted, itemCells, itemSize, mountCellsOf, mountSpots, type Cell, type Grid, type Spot } from './grid';
import { partDef } from '../data/parts';
import type { GridItem, Vehicle } from './types';

type PartItem = Extract<GridItem, { kind: 'part' }>;
type Place = { spot: Spot; cells: number[]; lane: number[] };
type Piece = { item: PartItem; shape: string; spots: Place[]; area: number; reach: number[] };
export type RepackMemo = Map<string, Set<string> | false>;

export const REPACK_MEMO: RepackMemo = new Map();
const MEMO_LIMIT = 4000;

const DECK: readonly Cell[] = ['D', 'C'];
const REPACK_STEPS = 20000;
const REPACK_LEAVES = 32;
export function isMovable(v: Vehicle, item: GridItem): item is PartItem {
  return item.kind === 'part' && isMounted(v.chassisId, item) && mountCellsOf(item.part.defId).every((c) => DECK.includes(c));
}

export function repackWith(v: Vehicle, item: PartItem, accept: (next: Vehicle) => boolean, memo: RepackMemo): Vehicle | null {
  const g = gridOf(v);
  const fixed = v.items.filter((it) => !isMovable(v, it));
  const movable = v.items.filter((it): it is PartItem => isMovable(v, it));
  const pieces = [...movable, item].map((it) => pieceOf(g, fixed, it, movable)).sort(byPackOrder);
  const key = memoKey(v, fixed, pieces);
  let known = memo.get(key);
  if (known === undefined) {
    const packs = search(canonical(pieces), sameShape, (placed) => placed.map(placeKey), false);
    known = packs ? new Set(packs) : false;
    if (memo.size >= MEMO_LIMIT) memo.clear();
    memo.set(key, known);
  }
  if (known === false) return null;
  return search(pieces.map((p) => packedFirst(p, known)), samePart, (placed) => {
    const next = { ...v, items: [...fixed, ...placed] };
    return accept(next) ? next : null;
  }, true);
}

const sameShape = (a: Piece, b: Piece) => a.shape === b.shape;
const samePart = (a: Piece, b: Piece) => a.item.part.defId === b.item.part.defId;

type Run<T> = { pieces: Piece[]; same: (a: Piece, b: Piece) => boolean; leaf: (placed: PartItem[]) => T | null; taken: Uint8Array; seen: Int32Array; stamp: number; chosen: Spot[]; lanes: Uint8Array | null; steps: number; leaves: number };

function search<T>(pieces: Piece[], same: (a: Piece, b: Piece) => boolean, leaf: (placed: PartItem[]) => T | null, laned: boolean): T | null {
  const size = 1 + Math.max(0, ...pieces.flatMap((p) => [...p.reach, ...p.spots.flatMap((s) => s.lane)]));
  const run: Run<T> = { pieces, same, leaf, taken: new Uint8Array(size), seen: new Int32Array(size), stamp: 0, chosen: [], lanes: laned ? new Uint8Array(size) : null, steps: 0, leaves: 0 };
  return fill(run, 0, 0);
}

function spent<T>(run: Run<T>): boolean {
  return run.steps > REPACK_STEPS || run.leaves >= REPACK_LEAVES;
}

function fill<T>(run: Run<T>, i: number, from: number): T | null {
  run.steps++;
  if (spent(run)) return null;
  if (i === run.pieces.length) {
    run.leaves++;
    return run.leaf(run.pieces.map((piece, k) => ({ ...piece.item, ...run.chosen[k] })));
  }
  if (!roomFor(run, i)) return null;
  for (let s = firstSpot(run, i, from); s < run.pieces[i].spots.length; s++) {
    const done = place(run, i, s);
    if (done) return done;
  }
  return null;
}

function firstSpot<T>(run: Run<T>, i: number, from: number): number {
  return i > 0 && run.same(run.pieces[i - 1], run.pieces[i]) ? from : 0;
}

function blocked<T>(run: Run<T>, place: Place): boolean {
  const { taken, lanes } = run;
  const { cells, lane } = place;
  for (let k = 0; k < cells.length; k++) if (taken[cells[k]] === 1 || (lanes !== null && lanes[cells[k]] === 1)) return true;
  if (lanes === null) return false;
  for (let k = 0; k < lane.length; k++) if (taken[lane[k]] === 1 || lanes[lane[k]] === 1) return true;
  return false;
}

function place<T>(run: Run<T>, i: number, s: number): T | null {
  const at = run.pieces[i].spots[s];
  if (blocked(run, at)) return null;
  const { cells, lane } = at;
  for (const c of cells) run.taken[c] = 1;
  if (run.lanes) for (const c of lane) run.lanes[c] = 1;
  run.chosen.push(at.spot);
  const done = fill(run, i + 1, s + 1);
  run.chosen.pop();
  for (const c of cells) run.taken[c] = 0;
  if (run.lanes) for (const c of lane) run.lanes[c] = 0;
  return done;
}

function pieceOf(g: Grid, fixed: GridItem[], item: PartItem, movable: PartItem[]): Piece {
  const held = movable.filter((it) => it.part.defId === item.part.defId);
  const isHeld = (s: Spot) => held.some((it) => it.x === s.x && it.y === s.y && it.rot === s.rot);
  const all = mountSpots(g, fixed, item, mountCellsOf(item.part.defId));
  const spots = [...all.filter(isHeld), ...all.filter((s) => !isHeld(s))].map((spot) => placeOf(g, item, spot));
  return { item, shape: shapeOf(item), spots, area: spots[0]?.cells.length ?? Infinity, reach: [...new Set(spots.flatMap((s) => s.cells))] };
}

function placeOf(g: Grid, item: PartItem, spot: Spot): Place {
  const placed = { ...item, ...spot };
  const lane = partDef(item.part.defId).kind === 'weapon' ? barrelCells(g.chassisId, placed) : [];
  return { spot, cells: itemCells(placed).map((c) => cellKey(c.x, c.y)), lane: lane.map((c) => cellKey(c.x, c.y)) };
}

function shapeOf(item: PartItem): string {
  const { w, h } = itemSize({ ...item, rot: 0 });
  return `${Math.min(w, h)}x${Math.max(w, h)}:${mountCellsOf(item.part.defId).join('')}`;
}

function canonical(pieces: Piece[]): Piece[] {
  return pieces.map((p) => ({ ...p, spots: distinctCells(p.spots) })).sort((a, b) => b.area - a.area || a.shape.localeCompare(b.shape));
}

function placeKey(item: PartItem): string {
  return `${shapeOf(item)}@${itemCells(item).map((c) => cellKey(c.x, c.y)).sort((a, b) => a - b).join(',')}`;
}

function packedFirst(piece: Piece, packed: Set<string>): Piece {
  const hit = (p: Place) => packed.has(`${piece.shape}@${[...p.cells].sort((a, b) => a - b).join(',')}`);
  return { ...piece, spots: [...piece.spots.filter(hit), ...piece.spots.filter((p) => !hit(p))] };
}

function distinctCells(spots: Place[]): Place[] {
  const seen = new Set<string>();
  return [...spots].sort((a, b) => a.cells[0] - b.cells[0] || a.cells.length - b.cells.length).filter((p) => {
    const k = [...p.cells].sort((a, b) => a - b).join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function memoKey(v: Vehicle, fixed: GridItem[], pieces: Piece[]): string {
  const held = fixed.map((it) => `${itemId(it)}@${it.x},${it.y},${it.rot}`).sort().join(';');
  return `${v.chassisId}|${held}|${pieces.map((p) => `${p.shape}${partDef(p.item.part.defId).kind === 'weapon' ? 'w' : ''}`).sort().join(';')}`;
}

function itemId(it: GridItem): string {
  if (it.kind === 'part') return it.part.defId;
  return it.kind === 'good' ? it.good : it.contract;
}

function byPackOrder(a: Piece, b: Piece): number {
  return b.area - a.area || a.shape.localeCompare(b.shape) || a.spots.length - b.spots.length || a.item.part.defId.localeCompare(b.item.part.defId);
}

function roomFor<T>(run: Run<T>, from: number): boolean {
  const stamp = ++run.stamp;
  let reached = 0;
  let need = 0;
  for (let i = from; i < run.pieces.length; i++) {
    const piece = run.pieces[i];
    if (!piece.spots.some((s) => s.cells.every((c) => run.taken[c] !== 1))) return false;
    need += piece.area;
    for (const c of piece.reach) {
      if (run.taken[c] === 1 || run.seen[c] === stamp) continue;
      run.seen[c] = stamp;
      reached++;
    }
  }
  return reached >= need;
}
