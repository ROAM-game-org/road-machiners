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
