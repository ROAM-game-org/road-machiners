import { beforeAll, describe, expect, it } from 'vitest';
import { ECONOMY } from '../../data/goods';
import { siteRecipes } from '../../data/market';
import { goodPrice, goodStock, moveStock, shopState } from '../../sim/market';
import { recipeRunning } from '../../sim/production';
import { economyOf, StockFlows, type Economy } from '../../sim/progression/sim-economy';
import { SimRun, simWorld, type FromSim } from '../../sim/progression/sim-mode';
import type { World } from '../../sim/types';
import { TEST_MAP } from '../../test/map';
import { SIM_TEXT } from './sim-text';

const TURNS = 40;
const ID_FIELDS = new Set(['id', 'good', 'recipe', 'cause', 'run', 'truck']);

function stocks(world: World): Record<string, number> {
  return Object.fromEntries(Object.entries(world.shops).flatMap(([shop, state]) => Object.entries(state.goods).map(([good, n]) => [`${shop}|${good}`, n])));
}

function strings(value: unknown, key = ''): string[] {
  if (typeof value === 'string') return ID_FIELDS.has(key) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((v) => strings(v, key));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, k));
  return [];
}

describe('simulation mode economy', () => {
  let start: World;
  let end: World;
  let startStocks: Record<string, number>;
  let posted: Economy[];
  let economy: Economy;
  beforeAll(() => {
    start = simWorld(TEST_MAP, 1);
    startStocks = stocks(start);
    const messages: FromSim[] = [];
    const run = new SimRun(start, SIM_TEXT, (m: FromSim) => messages.push(m));
    for (let i = 0; i < TURNS; i++) run.handle({ kind: 'step' });
    run.handle({ kind: 'economy' });
    expect(messages.some((m) => m.kind === 'failed')).toBe(false);
    posted = messages.flatMap((m) => (m.kind === 'economy' ? [m.economy] : []));
    economy = posted[posted.length - 1];
    end = run.current().world;
  }, 120000);

  it('answers the economy request and never sends it with a frame', () => {
    expect(posted.length).toBeGreaterThan(0);
    expect(economy.turn).toBe(end.turn);
    expect(economy.shops.map((s) => s.id).sort()).toEqual(Object.keys(end.shops).sort());
  });

  it('tallies flows that turn the starting stock into the ending stock', () => {
    const endStocks = stocks(end);
    let moved = 0;
    for (const shop of economy.shops) {
      for (const good of shop.goods) {
        const key = `${shop.id}|${good.good}`;
        const net = shop.flows.filter((f) => f.good === good.good).reduce((sum, f) => sum + f.units, 0);
        moved += Math.abs(net);
        expect(startStocks[key] + net, key).toBe(endStocks[key]);
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(economy.flowHours).toBe(TURNS / (450 / 24));
  });

  it('reports the prices and recipe states the game computes', () => {
    for (const shop of economy.shops) {
      const state = shopState(end, shop.id);
      for (const good of shop.goods) {
        expect(good.stock).toBe(goodStock(state, good.good));
        expect(good.buy).toBe(goodPrice(shop.id, state, good.good, 'buy', ECONOMY.spread));
        expect(good.sell).toBe(goodPrice(shop.id, state, good.good, 'sell', ECONOMY.spread));
        expect(good.buyText).toBe(SIM_TEXT.money(good.buy));
      }
      expect(shop.lines.map((l) => l.recipe)).toEqual(siteRecipes(shop.id).map((r) => r.id));
      for (const line of shop.lines) expect(line.run).toBe(recipeRunning(end, shop.id, line.recipe));
    }
  });

  it('does not change the world', () => {
    const before = JSON.stringify(end);
    economyOf(end, new StockFlows(end.turn), SIM_TEXT);
    expect(JSON.stringify(end)).toBe(before);
  });

  it('holds no raw id in any word', () => {
    const ids = new Set([...Object.keys(end.shops), ...economy.shops.flatMap((s) => [...s.goods.map((g) => g.good), ...s.lines.map((l) => l.recipe)])]);
    for (const word of strings(economy)) {
      expect(ids.has(word), word).toBe(false);
      expect(word, word).not.toMatch(/[a-z][A-Z]|[a-z]-[a-z]/);
    }
    expect(economy.shops.every((s) => s.name !== s.id && s.lines.every((l) => l.name !== l.recipe))).toBe(true);
  });

  it('never leaves a stock watcher behind', () => {
    const shop = economy.shops[0].id;
    const good = economy.shops[0].goods[0].good;
    const state = shopState(end, shop);
    moveStock({ ...state, goods: { ...state.goods } }, shop, good, 1, 'trade');
    const after: FromSim[] = [];
    const again = new SimRun(start, SIM_TEXT, (m: FromSim) => after.push(m));
    again.handle({ kind: 'economy' });
    const sent = after.flatMap((m) => (m.kind === 'economy' ? [m.economy] : []));
    expect(sent[0].shops.every((s) => s.flows.length === 0)).toBe(true);
  });

  it('lists shipments with units carried and map positions', () => {
    for (const s of economy.shipments) {
      expect(s.units).toBeGreaterThan(0);
      expect(Number.isFinite(s.fromXY.x + s.toXY.y)).toBe(true);
    }
  });
});
