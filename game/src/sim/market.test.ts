import { describe, expect, it } from 'vitest';
import { ECONOMY, GOODS } from '../data/goods';
import { partDef } from '../data/parts';
import { DISTANCE_PREMIUM, EFFORT, PRICE_FACTOR, PRESSURE_MAX, SHOPS, SHORT_PRESSURE } from '../data/market';
import { dist } from './vec';
import { emptyWorld, addVehicle } from './testkit';
import type { Vehicle, World } from './types';
import { bareGrid, baseGrid, freeCells } from './grid';
import {
  addStockPart,
  advanceShop,
  estimateTurns,
  goodBasePrice,
  goodPrice,
  goodStock,
  initShop,
  moveStock,
  pressureOf,
  priceAtPressure,
  stockTarget,
  lotPrice,
  recordTrade,
  shortHere,
  siteOf,
  takeStockPart,
  type ShopState,
} from './market';

const layoutLoad = (v: Vehicle) => freeCells(v) - (bareGrid(v.chassisId).h - baseGrid(v.chassisId).h) * bareGrid(v.chassisId).w;

describe('market', () => {
  it('lowers stock on buying and raises it on selling', () => {
    const w = emptyWorld();
    const state = initShop(w, 'bowl');
    expect(state.goods.scrap).toBe(stockTarget('bowl', 'scrap'));
    recordTrade('bowl', state, 'scrap', 10, 'buy');
    expect(state.goods.scrap).toBe(stockTarget('bowl', 'scrap') - 10);
    recordTrade('bowl', state, 'scrap', 4, 'sell');
    expect(state.goods.scrap).toBe(stockTarget('bowl', 'scrap') - 6);
  });

  it('prices a good dearer as its stock falls and cheaper as it grows', () => {
    const w = emptyWorld();
    const state = initShop(w, 'granary');
    const atTarget = goodPrice('granary', state, 'grain', 'buy', ECONOMY.spread);
    recordTrade('granary', state, 'grain', 10, 'buy');
    const short = goodPrice('granary', state, 'grain', 'buy', ECONOMY.spread);
    recordTrade('granary', state, 'grain', 30, 'sell');
    const flooded = goodPrice('granary', state, 'grain', 'buy', ECONOMY.spread);
    expect(short).toBeGreaterThan(atTarget);
    expect(flooded).toBeLessThan(atTarget);
  });

  it('absorbs a full hauler load at a garage before the price moves halfway to its floor or ceiling', () => {
    const w = emptyWorld();
    const load = layoutLoad(addVehicle(w, 'scrapjaw', 'hauler', [], { x: 0, y: 0 }));
    const state = initShop(w, 'bowl');
    const before = goodPrice('bowl', state, 'scrap', 'sell', ECONOMY.spread);
    recordTrade('bowl', state, 'scrap', load, 'sell');
    const after = goodPrice('bowl', state, 'scrap', 'sell', ECONOMY.spread);
    expect(before - after).toBeLessThan(before * (PRESSURE_MAX / 2));
  });

  it('saturates a stall on a far smaller lot than a garage', () => {
    const w = emptyWorld();
    const units = 6;
    const stall = initShop(w, 'salvage-yard');
    const garage = initShop(w, 'nose');
    recordTrade('salvage-yard', stall, 'scrap', units, 'sell');
    recordTrade('nose', garage, 'scrap', units, 'sell');
    expect(Math.abs(pressureOf('salvage-yard', 'scrap', stall.goods.scrap))).toBeGreaterThan(Math.abs(pressureOf('nose', 'scrap', garage.goods.scrap)));
  });

  it('clamps the pressure a stock gives to PRESSURE_MAX on both sides', () => {
    expect(pressureOf('bowl', 'scrap', 0)).toBe(PRESSURE_MAX);
    expect(pressureOf('bowl', 'scrap', 100000)).toBe(-PRESSURE_MAX);
    expect(pressureOf('bowl', 'scrap', stockTarget('bowl', 'scrap'))).toBe(0);
  });

  it('keeps every price within the distance gradient times one plus or minus PRESSURE_MAX', () => {
    for (const shop of Object.values(SHOPS)) {
      for (const good of shop.goods) {
        for (const stock of [0, 1, stockTarget(shop.id, good), 10 * stockTarget(shop.id, good)]) {
          const price = priceAtPressure(shop.id, good, pressureOf(shop.id, good, stock), 'buy', 0);
          expect(price).toBeGreaterThanOrEqual(Math.floor(goodBasePrice(shop.id, good) * (1 - PRESSURE_MAX)));
          expect(price).toBeLessThanOrEqual(Math.ceil(goodBasePrice(shop.id, good) * (1 + PRESSURE_MAX)));
        }
      }
    }
  });

  it('keeps every staple on a garage shelf after each roll and adds none to a stall', () => {
    const w = emptyWorld();
    for (const id of ['bowl', 'nose']) {
      const state = initShop(w, id);
      for (let roll = 0; roll < 60; roll++) {
        expect(state.stock.some((p) => p.defId === 'stockEngine')).toBe(true);
        w.turn = state.restockAt;
        advanceShop(w, id, state);
      }
    }
    expect(SHOPS['salvage-yard'].staples).toEqual([]);
    expect(initShop(w, 'salvage-yard').stock.length).toBeLessThanOrEqual(SHOPS['salvage-yard'].stockSize[1]);
  });

  it('walks a lot through stock one crate at a time', () => {
    const w = emptyWorld();
    const state = initShop(w, 'granary');
    const lot = lotPrice('granary', state, 'grain', 'buy', ECONOMY.spread, 5);
    let summed = 0;
    for (let i = 0; i < 5; i++) {
      summed += goodPrice('granary', state, 'grain', 'buy', ECONOMY.spread);
      recordTrade('granary', state, 'grain', 1, 'buy');
    }
    expect(lot).toBe(summed);
  });

  it('throws pricing a buy of more crates than the stock holds', () => {
    const w = emptyWorld();
    const state = initShop(w, 'granary');
    expect(() => lotPrice('granary', state, 'grain', 'buy', ECONOMY.spread, state.goods.grain + 1)).toThrow();
  });

  it('throws on a stock change that would go below zero or is not a whole crate', () => {
    const w = emptyWorld();
    const state = initShop(w, 'granary');
    expect(() => moveStock(state, 'granary', 'grain', -state.goods.grain - 1, 'trade')).toThrow();
    expect(() => moveStock(state, 'granary', 'grain', 0.5, 'trade')).toThrow();
    expect(() => goodStock(state, 'electronics')).toThrow();
  });

  it('rolls a finite stock that restocking replaces deterministically for a given rng state', () => {
    const w1 = emptyWorld();
    const w2 = emptyWorld();
    const s1 = initShop(w1, 'salvage-yard');
    const s2 = initShop(w2, 'salvage-yard');
    expect(s1.stock.map((p) => [p.defId, p.wear])).toEqual(s2.stock.map((p) => [p.defId, p.wear]));
    expect(s1.stock.length).toBeGreaterThanOrEqual(SHOPS['salvage-yard'].stockSize[0]);
    expect(s1.stock.length).toBeLessThanOrEqual(SHOPS['salvage-yard'].stockSize[1]);

    s1.restockAt = w1.turn;
    s2.restockAt = w2.turn;
    advanceShop(w1, 'salvage-yard', s1);
    advanceShop(w2, 'salvage-yard', s2);
    expect(s1.stock.map((p) => [p.defId, p.wear])).toEqual(s2.stock.map((p) => [p.defId, p.wear]));
  });

  it.each(Object.values(SHOPS).filter((shop) => shop.kind === 'garage').map((shop) => shop.id))('shows a utility on at least 80%% of %s shelves across 50 restocks', (shopId) => {
    const w = emptyWorld();
    const state = initShop(w, shopId);
    let withUtility = 0;
    for (let restock = 0; restock < 50; restock++) {
      state.restockAt = w.turn;
      advanceShop(w, shopId, state);
      if (state.stock.some((p) => partDef(p.defId).kind === 'utility')) withUtility++;
    }

    expect(withUtility / 50).toBeGreaterThanOrEqual(0.8);
  });

  it('takeStockPart removes a part and addStockPart inserts one', () => {
    const w = emptyWorld();
    const state = initShop(w, 'bowl');
    const before = state.stock.length;
    const target = state.stock[0];
    const taken = takeStockPart(state, target.id);
    expect(taken).toBe(target);
    expect(state.stock.length).toBe(before - 1);
    expect(state.stock.find((p) => p.id === target.id)).toBeUndefined();
    addStockPart(state, taken);
    expect(state.stock.length).toBe(before);
    expect(state.stock.find((p) => p.id === target.id)).toBe(taken);
  });

  it('throws taking a part id that is not in stock', () => {
    const w = emptyWorld();
    const state = initShop(w, 'bowl');
    expect(() => takeStockPart(state, 'no-such-part')).toThrow();
  });

  it('throws pricing a good a shop does not trade', () => {
    const w = emptyWorld();
    const state = initShop(w, 'granary');
    expect(() => goodBasePrice('granary', 'electronics')).toThrow();
    expect(() => goodPrice('granary', state, 'electronics', 'buy', 0.2)).toThrow();
    expect(() => recordTrade('granary', state, 'electronics', 1, 'buy')).toThrow();
  });

  it('throws for an unknown shop', () => {
    expect(() => goodBasePrice('no-such-shop', 'scrap')).toThrow();
  });

  it('always prices a sell strictly below the buy at the same shop', () => {
    const w = emptyWorld();
    const state: ShopState = initShop(w, 'nose');
    for (const good of SHOPS.nose.goods) {
      const buy = goodPrice('nose', state, good, 'buy', 0.2);
      const sell = goodPrice('nose', state, good, 'sell', 0.2);
      expect(sell).toBeLessThan(buy);
    }
  });

  it('prices a good made locally below the same good sold farther from any maker', () => {
    expect(goodBasePrice('bowl', 'grain')).toBeLessThan(goodBasePrice('granary', 'grain'));
    expect(goodBasePrice('nose', 'salt')).toBeLessThan(goodBasePrice('bowl', 'salt'));
  });

  it('prices a good higher the farther a shop sits from its nearest maker', () => {
    const nose = goodBasePrice('nose', 'salt');
    const granary = goodBasePrice('granary', 'salt');
    const bowl = goodBasePrice('bowl', 'salt');
    expect(nose).toBeLessThan(granary);
    expect(granary).toBeLessThan(bowl);
  });

  it('prices fuel drums by the distance to the Pump Station that makes them', () => {
    const toPump = dist(siteOf('bowl').pos, siteOf('pump-station').pos);
    const expected = GOODS.fuelDrums.value * (PRICE_FACTOR.make + DISTANCE_PREMIUM.perTile * toPump);
    expect(goodBasePrice('bowl', 'fuelDrums')).toBeCloseTo(expected, 9);
  });

  it('prices water by the nearer of its two wells', () => {
    const toWell = Math.min(...['dustwell', 'green-pit'].map((id) => dist(siteOf('nose').pos, siteOf(id).pos)));
    const expected = GOODS.water.value * (PRICE_FACTOR.make + DISTANCE_PREMIUM.perTile * toWell);
    expect(goodBasePrice('nose', 'water')).toBeCloseTo(expected, 9);
  });

  it('pays a full truck load of a haul about haulWages tier wages times the trip turns, lot pressure included', () => {
    const w = emptyWorld();
    const units = layoutLoad(addVehicle(w, 'scrapjaw', 'scout', [], { x: 0, y: 0 }));
    const buy = lotPrice('nose', initShop(w, 'nose'), 'salt', 'buy', ECONOMY.spread, units);
    const sell = lotPrice('bowl', initShop(w, 'bowl'), 'salt', 'sell', ECONOMY.spread, units);
    const turns = estimateTurns(siteOf('nose').pos, siteOf('bowl').pos);
    const target = turns * EFFORT.wage[1] * EFFORT.haulWages;
    expect(sell - buy).toBeGreaterThan(target * 0.7);
    expect(sell - buy).toBeLessThan(target * 1.3);
  });

  it('pays a shorter haul less in total, but not less per turn, than a longer one', () => {
    const w = emptyWorld();
    const units = 5;
    const routeProfit = (sellShop: string) => {
      const buy = lotPrice('nose', initShop(w, 'nose'), 'salt', 'buy', ECONOMY.spread, units);
      const sell = lotPrice(sellShop, initShop(w, sellShop), 'salt', 'sell', ECONOMY.spread, units);
      const turns = estimateTurns(siteOf('nose').pos, siteOf(sellShop).pos);
      return { profit: sell - buy, turns };
    };
    const long = routeProfit('bowl');
    const short = routeProfit('granary');
    expect(long.turns).toBeGreaterThan(short.turns);
    expect(long.profit).toBeGreaterThan(short.profit);
    expect(long.profit / long.turns).toBeGreaterThanOrEqual(short.profit / short.turns);
  });
});

describe('a short good', () => {
  it('is short once its pressure reaches the short level, not at its target', () => {
    const w = emptyWorld();
    const target = stockTarget('granary', 'grain');
    w.shops.granary.goods.grain = target;
    expect(shortHere(w, 'granary', 'grain')).toBe(false);
    w.shops.granary.goods.grain = 0;
    expect(shortHere(w, 'granary', 'grain')).toBe(true);
    w.shops.granary.goods.grain = Math.floor(target * (1 - SHORT_PRESSURE / 0.6));
    expect(pressureOf('granary', 'grain', w.shops.granary.goods.grain)).toBeGreaterThanOrEqual(SHORT_PRESSURE);
    expect(shortHere(w, 'granary', 'grain')).toBe(true);
  });

  it('throws for a good the shop does not trade', () => {
    expect(() => shortHere(emptyWorld(), 'granary', 'electronics')).toThrow();
  });
});
