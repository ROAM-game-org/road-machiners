import { describe, expect, it } from 'vitest';
import { CellPages } from './cell-pages';

const SIDE = 100;
const PAGE = 32;

function bytes(blank = 0): CellPages<Uint8Array> {
  return new CellPages<Uint8Array>(SIDE, PAGE, (length) => new Uint8Array(length), blank);
}

describe('a grid kept one page per cell', () => {
  it('reads its blank value everywhere before any write, and holds no page', () => {
    const grid = new CellPages(SIDE, PAGE, (length) => new Float64Array(length), NaN);
    expect(grid.at(0)).toBeNaN();
    expect(grid.atXY(SIDE - 1, SIDE - 1)).toBeNaN();
    expect(grid.pageCount()).toBe(0);
  });

  it('gives back each write by flat index and by x and y, on both sides of a page edge', () => {
    const grid = bytes();
    grid.set(5 * SIDE + PAGE - 1, 7);
    grid.setXY(PAGE, 5, 9);
    expect(grid.atXY(PAGE - 1, 5)).toBe(7);
    expect(grid.at(5 * SIDE + PAGE)).toBe(9);
    expect(grid.atXY(PAGE + 1, 5)).toBe(0);
  });

  it('makes a page only in the cells it was written in', () => {
    const grid = bytes();
    grid.setXY(1, 1, 1);
    grid.setXY(2, 2, 1);
    grid.setXY(SIDE - 1, SIDE - 1, 1);
    expect(grid.pageCount()).toBe(2);
    expect(grid.bytes()).toBe(2 * PAGE * PAGE);
  });

  it('fills a new page with the blank value, so the rest of its cell still reads blank', () => {
    const grid = bytes(255);
    grid.setXY(3, 3, 1);
    expect(grid.atXY(4, 3)).toBe(255);
  });

  it('fills a row span across pages, and a blank fill makes no page', () => {
    const grid = bytes();
    grid.fillRow(10, PAGE - 2, PAGE + 1, 4);
    expect([PAGE - 3, PAGE - 2, PAGE - 1, PAGE, PAGE + 1, PAGE + 2].map((x) => grid.atXY(x, 10))).toEqual([0, 4, 4, 4, 4, 0]);
    expect(grid.pageCount()).toBe(2);
    grid.fillRow(40, 0, SIDE - 1, 0);
    expect(grid.pageCount()).toBe(2);
  });

  it('computes a page from its filler on the first read of its cell', () => {
    const grid = new CellPages(SIDE, PAGE, (length) => new Float32Array(length), 0, (page, x0, y0) => {
      for (let y = 0; y < PAGE; y++) for (let x = 0; x < PAGE; x++) page[y * PAGE + x] = (y0 + y) * SIDE + x0 + x;
    });
    expect(grid.atXY(70, 40)).toBe(40 * SIDE + 70);
    expect(grid.at(99 * SIDE + 99)).toBe(99 * SIDE + 99);
    expect(grid.pageCount()).toBe(2);
  });

  it('reads blank again after a release, and releases only when it holds more pages than allowed', () => {
    const grid = bytes();
    grid.setXY(1, 1, 1);
    grid.setXY(50, 50, 1);
    grid.releaseOver(2);
    expect(grid.atXY(1, 1)).toBe(1);
    grid.releaseOver(1);
    expect(grid.atXY(1, 1)).toBe(0);
    expect(grid.pageCount()).toBe(0);
  });

  it('throws on an index outside the grid', () => {
    const grid = bytes();
    expect(() => grid.at(SIDE * SIDE)).toThrow(/outside/);
    expect(() => grid.at(-1)).toThrow(/outside/);
    expect(() => grid.atXY(SIDE, 0)).toThrow(/outside/);
    expect(() => grid.setXY(0, 1.5, 1)).toThrow(/outside/);
    expect(() => grid.fillRow(0, 0, SIDE, 1)).toThrow(/outside/);
  });

  it('refuses a page side that is not a power of two', () => {
    expect(() => new CellPages(SIDE, 30, (length) => new Uint8Array(length), 0)).toThrow(/power of two/);
  });
});
