import { MAP_GRID, REGION } from '../data/region';
import type { Vec } from './vec';

export type GridSquare = { column: number; row: number };

export function gridSquareTiles(): number {
  return REGION.size / MAP_GRID.squares;
}

function gridIndex(at: number): number {
  if (!(at >= 0 && at <= REGION.size)) throw new Error(`Map position ${at} is off the map of ${REGION.size} tiles`);
  return Math.min(MAP_GRID.squares - 1, Math.floor(at / gridSquareTiles()));
}

export function gridSquareOf(pos: Vec): GridSquare {
  return { column: gridIndex(pos.x), row: gridIndex(pos.y) };
}

export function sameGridSquare(a: GridSquare, b: GridSquare): boolean {
  return a.column === b.column && a.row === b.row;
}

export type GridBox = { x0: number; y0: number; x1: number; y1: number };

export function gridSquares(): GridSquare[] {
  const squares: GridSquare[] = [];
  for (let row = 0; row < MAP_GRID.squares; row++) for (let column = 0; column < MAP_GRID.squares; column++) squares.push({ column, row });
  return squares;
}

function requireOnGrid(square: GridSquare): void {
  for (const index of [square.column, square.row])
    if (!Number.isInteger(index) || index < 0 || index >= MAP_GRID.squares)
      throw new Error(`Grid square ${square.column},${square.row} is off the grid of ${MAP_GRID.squares} squares`);
}

function edge(index: number, round: (at: number) => number): number {
  return index === MAP_GRID.squares ? REGION.size : round(index * gridSquareTiles());
}

function gridBox(square: GridSquare, round: (at: number) => number): GridBox {
  requireOnGrid(square);
  return {
    x0: edge(square.column, round),
    y0: edge(square.row, round),
    x1: edge(square.column + 1, round),
    y1: edge(square.row + 1, round),
  };
}

export function gridSquareArea(square: GridSquare): GridBox {
  return gridBox(square, (at) => at);
}

export function gridSquareSpan(square: GridSquare): GridBox {
  return gridBox(square, Math.ceil);
}

export type GridEntry = { pos: Vec; seg: number; t: number; square: GridSquare };

type LineCrossing = { t: number; axis: 'column' | 'row'; index: number };

const CORNER_GAP = 1e-9;
const ARRIVAL_NUDGE = 1e-6;
const ARRIVAL_DIRECTION_MIN = 1e-4;

function lineCrossings(from: number, to: number, axis: LineCrossing['axis']): LineCrossing[] {
  const size = gridSquareTiles();
  const first = gridIndex(from);
  const last = gridIndex(to);
  const crossings: LineCrossing[] = [];
  for (let k = first + 1; k <= last; k++) crossings.push({ t: (k * size - from) / (to - from), axis, index: k });
  for (let k = first; k > last; k--) crossings.push({ t: (k * size - from) / (to - from), axis, index: k - 1 });
  return crossings;
}

function entriesOfSegment(a: Vec, b: Vec, seg: number): GridEntry[] {
  const crossings = [...lineCrossings(a.x, b.x, 'column'), ...lineCrossings(a.y, b.y, 'row')].sort((p, q) => p.t - q.t);
  const square = gridSquareOf(a);
  const entries: GridEntry[] = [];
  crossings.forEach((c, i) => {
    square[c.axis] = c.index;
    const corner = (crossings[i - 1] && c.t - crossings[i - 1].t < CORNER_GAP) || (crossings[i + 1] && crossings[i + 1].t - c.t < CORNER_GAP);
    if (!corner) entries.push({ pos: { x: a.x + (b.x - a.x) * c.t, y: a.y + (b.y - a.y) * c.t }, seg, t: c.t, square: { ...square } });
  });
  return entries;
}

export function gridEntries(points: readonly Vec[]): GridEntry[] {
  return points.slice(1).flatMap((b, i) => entriesOfSegment(points[i], b, i));
}

function nudged(from: Vec, toward: Vec, gap: number): Vec {
  const length = Math.hypot(toward.x - from.x, toward.y - from.y);
  return { x: from.x + ((toward.x - from.x) / length) * gap, y: from.y + ((toward.y - from.y) / length) * gap };
}

export function gridArrival(points: readonly Vec[]): GridSquare | null {
  const end = points[points.length - 1];
  const before = [...points].reverse().find((p) => Math.hypot(end.x - p.x, end.y - p.y) >= ARRIVAL_DIRECTION_MIN);
  if (!before) return null;
  const behind = nudged(end, before, ARRIVAL_NUDGE);
  const ahead = nudged(end, before, -ARRIVAL_NUDGE);
  const [from, into] = [gridSquareOf(behind), gridSquareOf(ahead)];
  if (sameGridSquare(from, into) || (from.column !== into.column && from.row !== into.row)) return null;
  const route = [...points.slice(0, -1), behind];
  const visited = [gridSquareOf(points[0]), ...gridEntries(route).map((e) => e.square)];
  return visited.some((square) => sameGridSquare(square, into)) ? null : into;
}
