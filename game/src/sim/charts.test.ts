import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { atlasOf } from './atlas';
import { buyChart, chartPrice, chartSeller, chartSheets, chartsOnSale, sheetAt, sheetTiles, unexploredIn } from './charts';
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
const sheetOf = (p: { x: number; y: number }) => sheetAt(REGION.size, p);

describe('charts', () => {
  it('gives every Icarus sheet exactly one seller', () => {
    const atlas = atlasOf(TEST_MAP.terrain);
    const sheets = chartSheets(REGION.size);
    expect(sheets).toHaveLength(36);
    const sellers = new Set(sheets.map((s) => chartSeller(atlas, s, REGION.size)));
    expect([...sellers].sort()).toEqual(['bowl', 'nose']);
  });

  it('throws on a map with no chart town', () => {
    const atlas = { ...atlasOf(TEST_MAP.terrain), towns: [], locations: [] };
    expect(() => chartSeller(atlas, { col: 0, row: 0 }, REGION.size)).toThrow(/charts/);
  });

  it('refuses a size that does not split into whole sheets', () => {
    expect(() => chartSheets(250)).toThrow(/whole sheets/);
    expect(sheetTiles(REGION.size, { col: 5, row: 5 }).x1).toBe(REGION.size);
  });

  it('sells only sheets with unexplored land, in the nearest town', () => {
    const w = atBowl();
    const home = sheetOf(bowl.pos);
    const offers = chartsOnSale(w, 'bowl');
    expect(offers.some((o) => o.sheet.col === home.col && o.sheet.row === home.row)).toBe(true);
    expect(chartsOnSale(w, 'salvage-yard')).toEqual([]);
    const b = sheetTiles(w.size, home);
    for (let y = b.y0; y < b.y1; y++) w.player.explored.fill(1, y * w.size + b.x0, y * w.size + b.x1);
    expect(chartsOnSale(w, 'bowl').some((o) => o.sheet.col === home.col && o.sheet.row === home.row)).toBe(false);
  });

  it('prices by the unexplored share', () => {
    expect(chartPrice(0)).toBe(0);
    expect(chartPrice(10000)).toBeGreaterThan(0);
    expect(Math.abs(chartPrice(5000) * 2 - chartPrice(10000))).toBeLessThanOrEqual(1);
  });

  it('charts the sheet, its sites and nothing else', () => {
    const w = atBowl();
    const sheet = sheetOf(bowl.pos);
    const price = chartPrice(unexploredIn(w, sheet));
    const xp = JSON.stringify(w.player.xp);
    const after = buyChart(w, sheet);
    expect(unexploredIn(after, sheet)).toBe(0);
    expect(after.player.discovered).toContain('bowl');
    expect(after.player.money).toBe(w.player.money - price);
    expect(JSON.stringify(after.player.xp)).toBe(xp);
    expect(after.player.rumored).toEqual(w.player.rumored);
    expect(after.events.every((e) => e.t === 'discover')).toBe(true);
  });

  it('refuses when away from the seller, a sheet of the other town, an empty sheet or no money', () => {
    const w = atBowl();
    const nose = REGION.towns.find((t) => t.id === 'nose')!;
    expect(() => buyChart(w, sheetOf(nose.pos))).toThrow(/does not sell/);
    expect(() => buyChart({ ...emptyWorld({ x: 30, y: 30 }) }, { col: 0, row: 0 })).toThrow(/shop/);
    const sheet = sheetOf(bowl.pos);
    const done = buyChart(w, sheet);
    expect(() => buyChart(done, sheet)).toThrow(/already explored/);
    const poor = atBowl();
    poor.player.money = 1;
    expect(() => buyChart(poor, sheet)).toThrow('Refused: noMoney');
  });
});
