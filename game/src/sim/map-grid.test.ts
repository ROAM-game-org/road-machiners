import { describe, expect, it } from 'vitest';
import { MAP_GRID, REGION } from '../data/region';
import { gridSquareOf, gridSquareTiles } from './map-grid';

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
});
