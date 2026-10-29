import { cellKey, gridOf, isMounted, itemCells, itemSize, mountCellsOf, mountSpots, type Cell, type Grid, type Spot } from './grid';
import type { GridItem, Vehicle } from './types';

type PartItem = Extract<GridItem, { kind: 'part' }>;
type Place = { spot: Spot; cells: number[] };
type Piece = { item: PartItem; shape: string; spots: Place[]; area: number; reach: Set<number> };
export type RepackMemo = Map<string, Set<string> | false>;

const DECK: readonly Cell[] = ['D', 'C'];
export const REPACK_STEPS = 20000;
export const REPACK_LEAVES = 32;
export const REPACK_TALLY = { searches: 0, capped: 0, steps: 0 };
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
    const packs = search(canonical(pieces), sameShape, (placed) => placed.map(placeKey));
    known = packs ? new Set(packs) : false;
    memo.set(key, known);
  }
  if (known === false) return null;
  return search(pieces.map((p) => packedFirst(p, known)), samePart, (placed) => {
    const next = { ...v, items: [...fixed, ...placed] };
    return accept(next) ? next : null;
  });
}

const sameShape = (a: Piece, b: Piece) => a.shape === b.shape;
const samePart = (a: Piece, b: Piece) => a.item.part.defId === b.item.part.defId;

type Run<T> = { pieces: Piece[]; same: (a: Piece, b: Piece) => boolean; leaf: (placed: PartItem[]) => T | null; taken: Set<number>; placed: PartItem[]; steps: number; leaves: number };

function search<T>(pieces: Piece[], same: (a: Piece, b: Piece) => boolean, leaf: (placed: PartItem[]) => T | null): T | null {
  const run: Run<T> = { pieces, same, leaf, taken: new Set(), placed: [], steps: 0, leaves: 0 };
  const found = fill(run, 0, 0);
  REPACK_TALLY.searches++;
  REPACK_TALLY.steps += run.steps;
  if (found === null && spent(run)) REPACK_TALLY.capped++;
  return found;
}

function spent<T>(run: Run<T>): boolean {
  return run.steps > REPACK_STEPS || run.leaves >= REPACK_LEAVES;
}

function fill<T>(run: Run<T>, i: number, from: number): T | null {
  run.steps++;
  if (spent(run)) return null;
  if (i === run.pieces.length) {
    run.leaves++;
    return run.leaf(run.placed);
  }
  if (!roomFor(run.pieces, i, run.taken)) return null;
  for (let s = firstSpot(run, i, from); s < run.pieces[i].spots.length; s++) {
    const done = place(run, i, s);
    if (done) return done;
  }
  return null;
}

function firstSpot<T>(run: Run<T>, i: number, from: number): number {
  return i > 0 && run.same(run.pieces[i - 1], run.pieces[i]) ? from : 0;
}

function place<T>(run: Run<T>, i: number, s: number): T | null {
  const piece = run.pieces[i];
  const { spot, cells } = piece.spots[s];
  if (cells.some((c) => run.taken.has(c))) return null;
  for (const c of cells) run.taken.add(c);
  run.placed.push({ ...piece.item, ...spot });
  const done = fill(run, i + 1, s + 1);
  run.placed.pop();
  for (const c of cells) run.taken.delete(c);
  return done;
}

function pieceOf(g: Grid, fixed: GridItem[], item: PartItem, movable: PartItem[]): Piece {
  const held = movable.filter((it) => it.part.defId === item.part.defId);
  const isHeld = (s: Spot) => held.some((it) => it.x === s.x && it.y === s.y && it.rot === s.rot);
  const all = mountSpots(g, fixed, item, mountCellsOf(item.part.defId));
  const spots = [...all.filter(isHeld), ...all.filter((s) => !isHeld(s))].map((spot) => ({ spot, cells: itemCells({ ...item, ...spot }).map((c) => cellKey(c.x, c.y)) }));
  return { item, shape: shapeOf(item), spots, area: spots[0]?.cells.length ?? Infinity, reach: new Set(spots.flatMap((s) => s.cells)) };
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
  const onDeck = fixed.filter((it) => it.kind !== 'part' || !isMounted(v.chassisId, it)).map((it) => `${it.x},${it.y},${it.rot},${itemSize(it).w}x${itemSize(it).h}`);
  return `${v.chassisId}|${onDeck.sort().join(';')}|${pieces.map((p) => p.shape).sort().join(';')}`;
}

function byPackOrder(a: Piece, b: Piece): number {
  return b.area - a.area || a.shape.localeCompare(b.shape) || a.spots.length - b.spots.length || a.item.part.defId.localeCompare(b.item.part.defId);
}

function roomFor(pieces: Piece[], from: number, taken: Set<number>): boolean {
  const reach = new Set<number>();
  let need = 0;
  for (let i = from; i < pieces.length; i++) {
    if (!pieces[i].spots.some((s) => s.cells.every((c) => !taken.has(c)))) return false;
    need += pieces[i].area;
    for (const c of pieces[i].reach) if (!taken.has(c)) reach.add(c);
  }
  return reach.size >= need;
}
