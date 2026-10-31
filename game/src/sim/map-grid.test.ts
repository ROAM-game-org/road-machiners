import { describe, expect, it } from 'vitest';
import { MAP_GRID, REGION } from '../data/region';
import { gridSquareArea, gridSquareOf, gridSquareSpan, gridSquareTiles, gridSquares } from './map-grid';

describe('map grid', () => {
  const side = gridSquareTiles();
  const last = MAP_GRID.squares - 1;

  it('splits the map into equal squares that cover it', () => {
    expect(side * MAP_GRID.squares).toBe(REGION.size);
  });

  it('puts the north west corner in the first square and the south east corner in the last', () => {
    expect(gridSquareOf({ x: 0, y: 0 })).toEqual({ column: 0, row: 0 });
    expect(gridSquareOf({ x: REGION.size, y: REGION.size })).toEqual({ column: last, row: last });
    expect(gridSquareOf({ x: REGION.size, y: 0 })).toEqual({ column: last, row: 0 });
  });

  it('gives a point on a grid line to the square east and south of it', () => {
    expect(gridSquareOf({ x: side * 2, y: side * 3 })).toEqual({ column: 2, row: 3 });
    expect(gridSquareOf({ x: side * 2 - 0.01, y: side * 3 - 0.01 })).toEqual({ column: 1, row: 2 });
  });

  it('names columns west to east and rows north to south', () => {
    expect(gridSquareOf({ x: REGION.size / 2 + 1, y: side / 2 })).toEqual({ column: MAP_GRID.squares / 2, row: 0 });
    expect(gridSquareOf({ x: side / 2, y: REGION.size - 1 })).toEqual({ column: 0, row: last });
  });

  it('throws on a position off the map', () => {
    expect(() => gridSquareOf({ x: -0.1, y: 10 })).toThrow(/off the map/);
    expect(() => gridSquareOf({ x: 10, y: REGION.size + 0.1 })).toThrow(/off the map/);
    expect(() => gridSquareOf({ x: Number.NaN, y: 10 })).toThrow(/off the map/);
  });

  it('lists every square once', () => {
    expect(gridSquares()).toHaveLength(MAP_GRID.squares ** 2);
  });

  it('draws a square on the grid lines', () => {
    const area = gridSquareArea({ column: 1, row: 2 });
    expect(area).toEqual({ x0: side, y0: side * 2, x1: side * 2, y1: side * 3 });
    expect(gridSquareArea({ column: last, row: last }).x1).toBe(REGION.size);
  });

  it('gives every tile to the one square that holds its origin', () => {
    const owner = (axis: 'x' | 'y') => {
      const owners: number[] = new Array(REGION.size).fill(0);
      for (let index = 0; index < MAP_GRID.squares; index++) {
        const span = gridSquareSpan(axis === 'x' ? { column: index, row: 0 } : { column: 0, row: index });
        const [from, to] = axis === 'x' ? [span.x0, span.x1] : [span.y0, span.y1];
        for (let at = from; at < to; at++) {
          owners[at]++;
          const named = gridSquareOf({ x: at, y: at });
          expect(axis === 'x' ? named.column : named.row).toBe(index);
        }
      }
      return owners;
    };
    expect(owner('x').every((n) => n === 1)).toBe(true);
    expect(owner('y').every((n) => n === 1)).toBe(true);
  });

  it('keeps a span within half a tile of its area', () => {
    for (const square of gridSquares()) {
      const area = gridSquareArea(square);
      const span = gridSquareSpan(square);
      for (const key of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(span[key] - area[key])).toBeLessThanOrEqual(0.5);
    }
  });

  it('throws on a square off the grid', () => {
    expect(() => gridSquareArea({ column: MAP_GRID.squares, row: 0 })).toThrow(/off the grid/);
    expect(() => gridSquareSpan({ column: 0, row: -1 })).toThrow(/off the grid/);
    expect(() => gridSquareSpan({ column: 0.5, row: 0 })).toThrow(/off the grid/);
  });
});
