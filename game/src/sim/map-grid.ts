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
