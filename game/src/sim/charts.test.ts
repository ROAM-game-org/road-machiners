import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { atlasOf, atlasSites } from './atlas';
import { buyChart, chartPrice, chartSeller, chartsOnSale, unexploredIn } from './charts';
import { gridSquareOf, gridSquareSpan, gridSquares, sameGridSquare, type GridSquare } from './map-grid';
import { sitePads } from './sites';
import { emptyWorld } from './testkit';
import { TEST_MAP } from '../test/map';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const atBowl = () => {
  const w = emptyWorld(sitePads(bowl)[0]);
  w.player.money = 100000;
  w.player.explored.fill(0);
  w.player.discovered = [];
  return w;
};
const squareOf = (p: { x: number; y: number }) => gridSquareOf(p);
const fill = (w: ReturnType<typeof atBowl>, square: GridSquare) => {
  const b = gridSquareSpan(square);
  for (let y = b.y0; y < b.y1; y++) w.player.explored.fill(1, y * w.size + b.x0, y * w.size + b.x1);
};

describe('charts', () => {
  it('gives every grid square exactly one seller', () => {
    const atlas = atlasOf(TEST_MAP.terrain);
    const squares = gridSquares();
    expect(squares).toHaveLength(64);
    const sellers = new Set(squares.map((s) => chartSeller(atlas, s)));
    expect([...sellers].sort()).toEqual(['bowl', 'nose']);
  });

  it('throws on a map with no chart town', () => {
    const atlas = { ...atlasOf(TEST_MAP.terrain), towns: [], locations: [] };
    expect(() => chartSeller(atlas, { column: 0, row: 0 })).toThrow(/charts/);
  });

  it('refuses a world that is not the size of the map grid', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.size = 250;
    expect(() => unexploredIn(w, { column: 0, row: 0 })).toThrow(/map grid/);
  });

  it('sells only squares with unexplored land, in the nearest town', () => {
    const w = atBowl();
    const home = squareOf(bowl.pos);
    const offers = chartsOnSale(w, 'bowl');
    expect(offers.some((o) => sameGridSquare(o.square, home))).toBe(true);
    expect(chartsOnSale(w, 'salvage-yard')).toEqual([]);
    fill(w, home);
    expect(chartsOnSale(w, 'bowl').some((o) => sameGridSquare(o.square, home))).toBe(false);
  });

  it('prices a fully unexplored square of the most tiles', () => {
    const w = atBowl();
    const biggest = gridSquares().find((s) => {
      const b = gridSquareSpan(s);
      return b.x1 - b.x0 === 98 && b.y1 - b.y0 === 98;
    })!;
    expect(chartPrice(unexploredIn(w, biggest))).toBe(740);
  });

  it('prices by the unexplored share', () => {
    expect(chartPrice(0)).toBe(0);
    expect(chartPrice(10000)).toBeGreaterThan(0);
    expect(Math.abs(chartPrice(5000) * 2 - chartPrice(10000))).toBeLessThanOrEqual(1);
  });

  it('charts the square, its sites and nothing else', () => {
    const w = atBowl();
    const square = squareOf(bowl.pos);
    const price = chartPrice(unexploredIn(w, square));
    const xp = JSON.stringify(w.player.xp);
    const after = buyChart(w, square);
    expect(unexploredIn(after, square)).toBe(0);
    expect(after.player.discovered).toContain('bowl');
    expect(after.player.money).toBe(w.player.money - price);
    expect(JSON.stringify(after.player.xp)).toBe(xp);
    expect(after.player.rumored).toEqual(w.player.rumored);
    expect(after.events.every((e) => e.t === 'discover')).toBe(true);
    const b = gridSquareSpan(square);
    for (let y = 0; y < w.size; y++)
      for (let x = 0; x < w.size; x++) {
        const inside = x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
        if (!inside) expect(after.player.explored[y * w.size + x]).toBe(w.player.explored[y * w.size + x]);
      }
  });

  it('discovers exactly the sites that the grid places in the square', () => {
    const w = atBowl();
    const square = squareOf(bowl.pos);
    const after = buyChart(w, square);
    const expected = atlasSites(atlasOf(w.terrain))
      .filter((site) => sameGridSquare(gridSquareOf(site.pos), square))
      .map((site) => site.id);
    expect([...after.player.discovered].sort()).toEqual(expected.sort());
  });

  it('refuses when away from the seller, a square of the other town, an empty square or no money', () => {
    const w = atBowl();
    const nose = REGION.towns.find((t) => t.id === 'nose')!;
    expect(() => buyChart(w, squareOf(nose.pos))).toThrow(/does not sell/);
    expect(() => buyChart({ ...emptyWorld({ x: 30, y: 30 }) }, { column: 0, row: 0 })).toThrow(/shop/);
    const square = squareOf(bowl.pos);
    const done = buyChart(w, square);
    expect(() => buyChart(done, square)).toThrow(/already explored/);
    const poor = atBowl();
    poor.player.money = 1;
    expect(() => buyChart(poor, square)).toThrow('Refused: noMoney');
  });
});
