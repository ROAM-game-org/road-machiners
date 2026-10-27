import { beforeAll, describe, expect, it } from 'vitest';
import { ECONOMY } from '../../data/goods';
import { siteRecipes } from '../../data/market';
import { goodPrice, goodStock, moveStock, shopState } from '../../sim/market';
import { recipeRunning } from '../../sim/production';
import { economyOf, marketLayout, marketSample, referenceTrader, sampleEvents, StockFlows, type Economy } from '../../sim/progression/sim-economy';
import { legRisk } from '../../sim/road-news';
import { affordableBuyCount } from '../../sim/economy';
import { cargoRoom } from '../../sim/inventory';
import { goodValue, siteOf } from '../../sim/market';
import { npcProfile, tradeLegTiles, tradeOutlook, tripFuelCost } from '../../sim/npc-decisions';
import { tradeSkipReason } from './economy-reads';
import { SimRun, simWorld, type FromSim } from '../../sim/progression/sim-mode';
import type { World } from '../../sim/types';
import { TEST_MAP } from '../../test/map';
import { SIM_TEXT } from './sim-text';

const TURNS = 40;
const ID_FIELDS = new Set(['id', 'good', 'recipe', 'cause', 'run', 'truck', 'fromId', 'toId', 'kind', 'outputGoods', 'shop']);

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

  it('samples stock and buying price of every traded good in the layout order', () => {
    const layout = marketLayout();
    const sample = marketSample(end);
    expect(sample).toHaveLength(layout.length * 2);
    layout.forEach(({ shop, good }, i) => {
      const state = shopState(end, shop);
      expect(sample[i * 2], `${shop} ${good}`).toBe(goodStock(state, good));
      expect(sample[i * 2 + 1], `${shop} ${good}`).toBe(goodPrice(shop, state, good, 'buy', ECONOMY.spread));
    });
  });

  it('samples the events that began since the last sample and the site events that are live', () => {
    const world: World = structuredClone(end);
    const made = Object.keys(siteRecipes('pump-station').find((r) => r.id === 'pump')!.outputs)[0];
    world.shops['pump-station'].event = { kind: 'breakdown', recipe: 'pump', until: world.turn + 100 };
    world.roadNews = [{ turn: world.turn - 5, kind: 'robbed', good: made, units: 3, from: 'pump-station', to: 'nose' }, { turn: world.turn - 50, kind: 'destroyed', good: 'rations', units: 2, from: 'granary', to: 'bowl' }];
    const events = sampleEvents(world, world.turn - 20);
    expect(events).toContainEqual({ shop: 'pump-station', kind: 'breakdown', good: made });
    expect(events).toContainEqual({ shop: 'nose', kind: 'robbed', good: made });
    expect(events.some((e) => e.kind === 'destroyed')).toBe(false);
    expect(sampleEvents(world, world.turn)).toEqual([{ shop: 'pump-station', kind: 'breakdown', good: made }]);
  });

  it('lists only price gaps that pay, one best per good, with crates to buy', () => {
    const goods = economy.trades.map((t) => t.good);
    expect(new Set(goods).size).toBe(goods.length);
    for (const trade of economy.trades) {
      expect(trade.gain).toBe(trade.sell - trade.buy);
      expect(trade.gain).toBeGreaterThan(0);
      expect(trade.fromId).not.toBe(trade.toId);
      expect(trade.crates).toBeGreaterThan(0);
      expect(trade.risky).toBe(legRisk(end, trade.fromId, trade.toId) > 0);
    }
    const worth = economy.trades.map((t) => t.worth);
    expect(worth).toEqual([...worth].sort((a, b) => Number(b) - Number(a)));
  });

  it('judges each trade with the numbers an NPC trader computes', () => {
    const trader = referenceTrader(end)!;
    expect(trader).not.toBeNull();
    expect(economy.trader).toBe(SIM_TEXT.truck(end, trader));
    const spend = npcProfile(trader).tradeStake;
    expect(economy.trades.length).toBeGreaterThan(0);
    for (const trade of economy.trades) {
      const plan = { source: trade.fromId, good: trade.good, sellShop: trade.toId };
      const tiles = Math.hypot(siteOf(trade.fromId).pos.x - siteOf(trade.toId).pos.x, siteOf(trade.fromId).pos.y - siteOf(trade.toId).pos.y);
      const count = affordableBuyCount(end, trader, trade.fromId, trade.good, cargoRoom(trader), spend);
      const fuel = tripFuelCost(end, trader, tiles);
      const risk = count * goodValue(trade.good) * legRisk(end, trade.fromId, trade.toId);
      expect(trade.load).toBe(count);
      expect(trade.fuel).toBe(fuel);
      expect(trade.risk).toBe(risk);
      expect(trade.net).toBe(count * trade.gain - fuel - risk);
      expect(trade.tiles).toBe(tradeLegTiles(plan));
      expect(trade.worth).toBe(tradeOutlook(end, trader, plan, spend, tiles).worth);
    }
  });

  it('keeps a trade that traders refuse and marks it', () => {
    const world: World = structuredClone(end);
    const good = economy.trades[0].good;
    const towns = Object.keys(world.shops);
    world.roadNews = towns.flatMap((from) => towns.flatMap((to) => Array.from({ length: 8 }, () => ({ turn: world.turn, kind: 'robbed' as const, good, units: 1, from, to }))));
    const risky = economyOf(world, new StockFlows(world.turn), SIM_TEXT).trades.find((t) => t.good === good)!;
    expect(risky.risky).toBe(true);
    expect(risky.worth).toBe(false);
    expect(risky.net).toBeLessThanOrEqual(0);
    expect(tradeSkipReason(risky)).not.toBeNull();
  });

  it('names the inputs a line lacks, with what the shop holds and what a batch needs', () => {
    const world: World = structuredClone(end);
    const shop = 'nose';
    const forge = siteRecipes(shop).find((r) => Object.keys(r.inputs).length > 0)!;
    const [input, need] = Object.entries(forge.inputs)[0];
    shopState(world, shop).goods[input] = 0;
    const line = economyOf(world, new StockFlows(world.turn), SIM_TEXT).shops.find((s) => s.id === shop)!.lines.find((l) => l.recipe === forge.id)!;
    expect(line.missing).toContainEqual({ good: input, name: SIM_TEXT.good(input), have: 0, need });
    expect(line.outputGoods).toEqual(Object.keys(forge.outputs));
  });

  it('marks the stock at which a good counts as short', () => {
    for (const shop of economy.shops) {
      for (const good of shop.goods) {
        expect(good.stock <= good.shortBelow, `${shop.id} ${good.good}`).toBe(good.tags.some((t) => t.id === 'short'));
      }
    }
  });

  it('lists shipments with units carried and map positions', () => {
    for (const s of economy.shipments) {
      expect(s.units).toBeGreaterThan(0);
      expect(Number.isFinite(s.fromXY.x + s.toXY.y)).toBe(true);
    }
  });
});
