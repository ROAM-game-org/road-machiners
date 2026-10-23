import { afterEach, describe, expect, it } from 'vitest';
import { CONTRACTS, EFFORT, SHOPS, shopDef } from '../data/market';
import { GOODS } from '../data/goods';
import { REGION } from '../data/region';
import { playerVehicle } from './damage';
import { goodsCount } from './grid';
import { addGoods } from './inventory';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain, practiceOf, setShopPressure } from './testkit';
import { affordableBuyCount, buyGood, sellGood } from './economy';
import { Refused, update } from './world';
import {
  acceptContract,
  advanceContracts,
  contractReward,
  contractXp,
  deliverContract,
  estimateTurns,
  haulWindow,
  nearestMaker,
  pressureOf,
  procureCandidates,
  procureReward,
  procureTrip,
  procureWindow,
  rollContract,
  siteOf,
  standingPrice,
  stockForSale,
  stockTarget,
  watchStock,
  type Contract,
} from './market';
import type { World } from './types';

type Procure = Extract<Contract, { kind: 'procure' }>;

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const nose = REGION.towns.find((t) => t.id === 'nose')!;

function atShop(shopId: string): World {
  return emptyWorld(sitePads(siteOf(shopId))[0]);
}

function order(over: Partial<Procure> = {}): Procure {
  return { id: 'ct-procure', shop: 'bowl', kind: 'procure', good: 'salt', units: 4, cratePay: 800, reward: 5000, deadline: 500, window: 500, tier: 1, ...over };
}

function rollOnly(w: World, shopId: string): Contract | null {
  const candidates = procureCandidates(w, shopId, w.shops[shopId]);
  return rollContract(w, { id: shopId, pos: siteOf(shopId).pos }, { procure: candidates });
}

afterEach(() => watchStock(null));

describe('procureCandidates', () => {
  it('names a good the shop trades, does not make, another shop makes and is short of', () => {
    const w = emptyWorld();
    setShopPressure(w, 'bowl', 'salt', 0.4);
    expect(procureCandidates(w, 'bowl', w.shops.bowl)).toContain('salt');
  });

  it('leaves out a good that is not short', () => {
    const w = emptyWorld();
    setShopPressure(w, 'bowl', 'salt', 0);
    expect(procureCandidates(w, 'bowl', w.shops.bowl)).not.toContain('salt');
  });

  it('leaves out a good the shop makes itself, however short', () => {
    const w = emptyWorld();
    setShopPressure(w, 'bowl', 'grain', 0.6);
    expect(shopDef('bowl').makes).toContain('grain');
    expect(procureCandidates(w, 'bowl', w.shops.bowl)).not.toContain('grain');
  });

  it('leaves out a found good that has no maker, though its stock is empty', () => {
    const w = emptyWorld();
    w.shops.nose.goods.relics = 0;
    expect(procureCandidates(w, 'nose', w.shops.nose)).not.toContain('relics');
  });

  it('leaves out a good already on order at the shop, on its board or held by the player', () => {
    const w = emptyWorld();
    setShopPressure(w, 'bowl', 'salt', 0.4);
    w.shops.bowl.contracts = [order()];
    expect(procureCandidates(w, 'bowl', w.shops.bowl)).not.toContain('salt');
    w.shops.bowl.contracts = [];
    w.player.contracts = [order()];
    expect(procureCandidates(w, 'bowl', w.shops.bowl)).not.toContain('salt');
  });

  it('leaves out a good whose shortfall is under the smallest order', () => {
    const w = emptyWorld();
    w.shops['green-pit'].goods.salt = stockTarget('green-pit', 'salt') - CONTRACTS.procure.units[0] + 1;
    expect(procureCandidates(w, 'green-pit', w.shops['green-pit'])).not.toContain('salt');
  });
});

describe('the terms of a supply order', () => {
  it('pays the crates at the standing shortage price plus rush travel pay for the round trip to the nearest maker', () => {
    const w = emptyWorld();
    for (const good of shopDef('bowl').goods) setShopPressure(w, 'bowl', good, 0);
    setShopPressure(w, 'bowl', 'salt', 0.4);
    const pressure = pressureOf('bowl', 'salt', w.shops.bowl.goods.salt);
    const c = rollOnly(w, 'bowl') as Procure;
    const trip = 2 * estimateTurns(bowl.pos, siteOf(nearestMaker('bowl', 'salt')).pos);
    expect(c.kind).toBe('procure');
    expect(c.good).toBe('salt');
    expect(c.cratePay).toBe(Math.round(standingPrice('bowl', 'salt', pressure)));
    expect(procureTrip('bowl', 'salt')).toBeCloseTo(trip, 6);
    expect(c.reward).toBe(procureReward(c.units, c.cratePay, trip));
    expect(c.reward).toBe(c.units * c.cratePay + Math.round(contractReward(trip, 0, true) * CONTRACTS.procure.travelFactor));
    expect(c.window).toBe(procureWindow(trip));
    expect(c.window).toBe(haulWindow(trip, true) + CONTRACTS.procure.slackTurns);
    expect(c.deadline).toBe(w.turn + c.window);
    expect(c.tier).toBe(GOODS.salt.tier);
  });

  it('asks for a crate count between the smallest order and the shortfall', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = emptyWorld();
      w.marketRng.rngState = seed;
      for (const good of shopDef('green-pit').goods) setShopPressure(w, 'green-pit', good, 0);
      setShopPressure(w, 'green-pit', 'salt', 0.2);
      const shortfall = stockTarget('green-pit', 'salt') - w.shops['green-pit'].goods.salt;
      const c = rollOnly(w, 'green-pit') as Procure;
      expect(shortfall).toBeLessThan(CONTRACTS.procure.units[1]);
      expect(c.units).toBeGreaterThanOrEqual(CONTRACTS.procure.units[0]);
      expect(c.units).toBeLessThanOrEqual(shortfall);
    }
  });

  it('pays more than the crates would fetch over the counter at the shortage', () => {
    const w = atShop('bowl');
    for (const good of shopDef('bowl').goods) setShopPressure(w, 'bowl', good, 0);
    setShopPressure(w, 'bowl', 'salt', 0.4);
    const c = rollOnly(w, 'bowl') as Procure;
    addGoods(w, playerVehicle(w), 'salt', c.units);
    const before = w.player.money;
    const sold = sellGood(w, 'salt', c.units);
    expect(sold.player.money - before).toBeLessThan(c.units * c.cratePay);
  });

  it('names no place but the posting shop', () => {
    const w = emptyWorld();
    for (const good of shopDef('bowl').goods) setShopPressure(w, 'bowl', good, 0);
    setShopPressure(w, 'bowl', 'salt', 0.4);
    const c = rollOnly(w, 'bowl') as Procure;
    const values = Object.values(c).filter((v) => typeof v === 'string');
    for (const shop of Object.keys(SHOPS)) if (shop !== 'bowl') expect(values).not.toContain(shop);
  });

  it('throws when rolled for a good that is not a candidate', () => {
    const w = emptyWorld();
    setShopPressure(w, 'bowl', 'salt', 0);
    expect(() => rollContract(w, { id: 'bowl', pos: bowl.pos }, { procure: ['salt'] })).toThrow();
  });
});

describe('the withheld good', () => {
  it('sells nothing of an ordered good while the order is on the board, to the player or an NPC', () => {
    const w = atShop('bowl');
    w.shops.bowl.contracts = [order()];
    expect(w.shops.bowl.goods.salt).toBeGreaterThan(0);
    expect(stockForSale(w, 'bowl', 'salt')).toBe(0);
    expect(() => buyGood(w, 'salt', 1)).toThrow(Refused);
    try { buyGood(w, 'salt', 1); } catch (e) { expect((e as Refused).refusal).toEqual({ id: 'onOrder' }); }
    const npc = addVehicle(w, 'independent', 'scout', [], { ...sitePads(bowl)[0] });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    expect(affordableBuyCount(w, npc, 'bowl', 'salt', 10, 1_000_000)).toBe(0);
  });

  it('sells nothing of an ordered good while the player holds the order', () => {
    const w = atShop('bowl');
    w.player.contracts = [order()];
    expect(stockForSale(w, 'bowl', 'salt')).toBe(0);
    expect(() => buyGood(w, 'salt', 1)).toThrow(Refused);
  });

  it('still sells the good at another shop and other goods at the posting shop', () => {
    const w = atShop('bowl');
    w.shops.bowl.contracts = [order()];
    expect(stockForSale(w, 'nose', 'salt')).toBe(w.shops.nose.goods.salt);
    expect(stockForSale(w, 'bowl', 'water')).toBe(w.shops.bowl.goods.water);
    expect(() => buyGood(w, 'water', 1)).not.toThrow();
  });

  it('still buys the ordered good from the player', () => {
    const w = atShop('bowl');
    w.player.contracts = [order()];
    addGoods(w, playerVehicle(w), 'salt', 2);
    const stock = w.shops.bowl.goods.salt;
    const sold = sellGood(w, 'salt', 2);
    expect(sold.shops.bowl.goods.salt).toBe(stock + 2);
  });

  it('throws for a good the shop does not trade', () => {
    const w = emptyWorld();
    expect(() => stockForSale(w, 'dustwell', 'electronics')).toThrow();
  });
});

describe('taking and handing in a supply order', () => {
  it('takes an order with no free cells and in debt, and moves no goods or money', () => {
    let w = atShop('bowl');
    w.shops.bowl.contracts = [order()];
    w.player.money = -500;
    const stock = w.shops.bowl.goods.salt;
    w = acceptContract(w, 'ct-procure');
    expect(w.player.contracts.map((c) => c.id)).toEqual(['ct-procure']);
    expect(w.player.money).toBe(-500);
    expect(w.shops.bowl.goods.salt).toBe(stock);
    expect(goodsCount(playerVehicle(w)).salt ?? 0).toBe(0);
  });

  it('moves exactly the ordered crates into the posting shop with cause contract, and pays and trains once', () => {
    let w = atShop('bowl');
    w.player.contracts = [order({ units: 4, reward: 5000, cratePay: 800 })];
    addGoods(w, playerVehicle(w), 'salt', 6);
    const stock = w.shops.bowl.goods.salt;
    const money = w.player.money;
    const basis = w.player.costBasis.salt;
    const moves: [string, string, number, string][] = [];
    watchStock((shop, good, delta, cause) => moves.push([shop, good, delta, cause]));
    w = deliverContract(w, 'ct-procure');
    expect(moves).toEqual([['bowl', 'salt', 4, 'contract']]);
    expect(w.shops.bowl.goods.salt).toBe(stock + 4);
    expect(goodsCount(playerVehicle(w)).salt).toBe(2);
    expect(w.player.money).toBe(money + 5000);
    expect(w.player.costBasis.salt).toBe(basis);
    expect(w.events.filter((e) => e.t === 'money')).toHaveLength(1);
    expect(practiceOf(w, 'contract')).toHaveLength(1);
    expect(w.player.contracts).toHaveLength(0);
    expect(w.player.pastContracts.at(-1)).toMatchObject({ outcome: 'done', amount: 5000 });
  });

  it('refuses a hand-in short of crates and leaves the world alone', () => {
    const w = atShop('bowl');
    w.player.contracts = [order({ units: 4 })];
    addGoods(w, playerVehicle(w), 'salt', 3);
    expect(() => deliverContract(w, 'ct-procure')).toThrow();
    expect(goodsCount(playerVehicle(w)).salt).toBe(3);
    expect(w.player.contracts).toHaveLength(1);
  });

  it('refuses a hand-in away from the posting shop', () => {
    const w = emptyWorld(sitePads(nose)[0]);
    w.player.contracts = [order({ units: 3 })];
    addGoods(w, playerVehicle(w), 'salt', 3);
    expect(() => deliverContract(w, 'ct-procure')).toThrow();
  });

  it('fails at the deadline with no money moved and the crates kept', () => {
    let w = atShop('bowl');
    w.player.contracts = [order({ units: 3, deadline: 10 })];
    addGoods(w, playerVehicle(w), 'salt', 3);
    const money = w.player.money;
    const stock = w.shops.bowl.goods.salt;
    w = update(w, (d) => { d.turn = 11; advanceContracts(d); });
    expect(w.player.contracts).toHaveLength(0);
    expect(w.player.money).toBe(money);
    expect(w.shops.bowl.goods.salt).toBe(stock);
    expect(goodsCount(playerVehicle(w)).salt).toBe(3);
    expect(w.player.pastContracts.at(-1)).toMatchObject({ outcome: 'failed', amount: 0 });
  });

  it('trains Social from the travel pay only, not the crates', () => {
    const c = order({ units: 4, cratePay: 800, reward: 5000 });
    expect(contractXp(c)).toBe(Math.round((5000 - 4 * 800) * CONTRACTS.procure.xpPerEffort));
  });

  it('pays a round trip to the maker at least what a rush haul on that road pays', () => {
    const trip = procureTrip('bowl', 'salt');
    const travel = procureReward(5, 800, trip) - 5 * 800;
    expect(travel).toBeGreaterThanOrEqual(Math.round(contractReward(trip / 2, 0, true)));
    expect(EFFORT.handlingTurns).toBeGreaterThan(0);
  });
});
