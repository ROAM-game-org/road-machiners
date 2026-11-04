import { describe, expect, it } from 'vitest';
import { GOODS_STORE, shopDef } from '../data/market';
import { playerVehicle } from './damage';
import { goodsCount } from './grid';
import { addGoods, stowSpot } from './inventory';
import { shopAt, siteOf } from './market';
import { sitePads } from './sites';
import { emptyWorld, parkedAtOutpost, spotWorld } from './testkit';
import { sellStoredGood, storedCrates, storedHere, storeGood, storeRoom, takeStoredGood } from './goods-store';
import { buyGood, sellGood } from './economy';
import { collectSalvage } from './salvage';
import type { Contract } from './market';
import type { GridItem, Refusal, World } from './types';
import { Refused } from './world';

function parkedAt(shopId: string): World {
  const w = emptyWorld(sitePads(siteOf(shopId))[0]);
  if (shopAt(w) !== shopId) throw new Error(`The test truck is not parked at ${shopId}`);
  w.player.money = 1000;
  return w;
}

const shopIds = Object.keys(emptyWorld().shops).sort();
const tradedGood = (shopId: string) => shopDef(shopId).goods[0];
const crateOf = (w: World, good: string): GridItem => playerVehicle(w).items.find((it) => it.kind === 'good' && it.good === good)!;
const haul = (good: string, units: number): Contract => ({ id: 'ct-haul', shop: 'bowl', kind: 'haul', good, units, to: 'nose', reward: 100, deadline: 5000, window: 500, rush: false, tier: 1 });

function loaded(shopId: string, good: string, n: number): World {
  const w = parkedAt(shopId);
  playerVehicle(w).items = playerVehicle(w).items.filter((it) => it.kind !== 'good');
  addGoods(w, playerVehicle(w), good, n);
  return w;
}

function refusalOf(command: () => unknown): Refusal | null {
  try {
    command();
    return null;
  } catch (err) {
    if (err instanceof Refused) return err.refusal;
    throw err;
  }
}

function takeOne(w: World, good: string): World {
  const spot = stowSpot(playerVehicle(w), { id: 'probe', x: 0, y: 0, rot: 0, kind: 'good', good });
  if (!spot) throw new Error('No stow spot for a crate');
  return takeStoredGood(w, good, spot);
}

describe('the crate store at a shop', () => {
  it.each(shopIds)('at %s, storing a crate and taking it out leaves money, XP, basis and the shop as they were', (shopId) => {
    const good = tradedGood(shopId);
    const w = loaded(shopId, good, 2);
    w.player.costBasis[good] = 7;
    const stored = storeGood(w, crateOf(w, good).id);
    expect(storedHere(stored)).toEqual({ [good]: 1 });
    expect(goodsCount(playerVehicle(stored))[good]).toBe(1);
    const back = takeOne(stored, good);
    expect(back.player.storedGoods).toEqual({});
    expect(goodsCount(playerVehicle(back))).toEqual(goodsCount(playerVehicle(w)));
    expect(back.player.money).toBe(w.player.money);
    expect(back.player.xp).toBe(w.player.xp);
    expect(back.player.costBasis).toEqual(w.player.costBasis);
    expect(back.shops).toEqual(w.shops);
    expect(back.events).toEqual(w.events);
  });

  it('keeps a crate stored at Nose out of the Bowl store, and Bowl cannot hand it out', () => {
    const atNose = loaded('nose', 'salt', 1);
    const stored = storeGood(atNose, crateOf(atNose, 'salt').id);
    const atBowl = structuredClone(stored);
    const bowlPad = sitePads(siteOf('bowl'))[0];
    playerVehicle(atBowl).pos = { ...bowlPad };
    expect(shopAt(atBowl)).toBe('bowl');
    expect(storedHere(atBowl)).toEqual({});
    expect(storedCrates(atBowl)).toEqual({ salt: 1 });
    expect(() => takeOne(atBowl, 'salt')).toThrow('Cannot take 1 salt from the store at bowl');
  });

  it('has no store away from a shop', () => {
    const w = emptyWorld();
    addGoods(w, playerVehicle(w), 'salt', 1);
    expect(shopAt(w)).toBeNull();
    expect(storedHere(w)).toEqual({});
    expect(() => storeGood(w, crateOf(w, 'salt').id)).toThrow('Not parked at a garage');
  });

  it('takes no crate at a Chaos Highway outpost, where parts storage still works', () => {
    const w = parkedAtOutpost();
    addGoods(w, playerVehicle(w), 'scrap', 1);
    expect(() => storeGood(w, crateOf(w, 'scrap').id)).toThrow('Crates are stored only at a shop');
  });

  it('refuses a crate a haul owes', () => {
    const w = loaded('nose', 'salt', 2);
    w.player.contracts = [haul('salt', 2)];
    expect(() => storeGood(w, crateOf(w, 'salt').id)).toThrow('Refused: cargoOwed');
  });

  it('refuses a crate past the cap and names the cap', () => {
    const w = loaded('nose', 'salt', 1);
    w.player.storedGoods = { nose: { scrap: GOODS_STORE.crates } };
    expect(storeRoom(w, 'nose')).toBe(0);
    expect(refusalOf(() => storeGood(w, crateOf(w, 'salt').id))).toEqual({ id: 'storeFull', cap: GOODS_STORE.crates });
  });

  it('keeps a store over the cap and only refuses new crates', () => {
    const w = loaded('nose', 'salt', 1);
    w.player.storedGoods = { nose: { scrap: GOODS_STORE.crates + 3 } };
    expect(storeRoom(w, 'nose')).toBe(0);
    const back = takeOne(w, 'scrap');
    expect(back.player.storedGoods).toEqual({ nose: { scrap: GOODS_STORE.crates + 2 } });
  });

  it('fills the store up to the cap across goods', () => {
    const w = loaded('nose', 'salt', 1);
    w.player.storedGoods = { nose: { scrap: GOODS_STORE.crates - 1 } };
    const stored = storeGood(w, crateOf(w, 'salt').id);
    expect(stored.player.storedGoods).toEqual({ nose: { scrap: GOODS_STORE.crates - 1, salt: 1 } });
    expect(storeRoom(stored, 'nose')).toBe(0);
  });
});

function storedCount(w: World, good: string, n: number): World {
  let next = w;
  for (let i = 0; i < n; i++) next = storeGood(next, crateOf(next, good).id);
  return next;
}

const saleOutcome = (before: World, after: World, shopId: string) => ({
  money: after.player.money - before.player.money,
  xp: after.player.xpBySource,
  ranks: after.player.ranks,
  shop: after.shops[shopId],
  events: after.events.slice(before.events.length),
});

describe('a sale from the crate store', () => {
  it.each(shopIds)('at %s, pays, teaches and moves the market like the same sale from the truck', (shopId) => {
    const good = tradedGood(shopId);
    const w = loaded(shopId, good, 3);
    w.player.costBasis[good] = 1;
    const fromTruck = sellGood(w, good, 2);
    const stored = storedCount(w, good, 2);
    const fromStore = sellStoredGood(stored, good, 2);
    expect(saleOutcome(stored, fromStore, shopId)).toEqual(saleOutcome(w, fromTruck, shopId));
    expect(fromStore.player.money).toBeGreaterThan(w.player.money);
    expect(fromStore.player.storedGoods).toEqual({});
    expect(goodsCount(playerVehicle(fromStore))[good]).toBe(1);
  });

  it('sells no more than this shop holds, and nothing stored at another shop', () => {
    const w = storedCount(loaded('nose', 'salt', 2), 'salt', 2);
    expect(() => sellStoredGood(w, 'salt', 3)).toThrow('Cannot take 3 salt from the store at nose');
    const atBowl = structuredClone(w);
    playerVehicle(atBowl).pos = { ...sitePads(siteOf('bowl'))[0] };
    expect(() => sellStoredGood(atBowl, 'salt', 1)).toThrow('Cannot take 1 salt from the store at bowl');
  });

  it('sells nothing a shop does not trade, and keeps the crates stored', () => {
    const shopId = shopIds.find((id) => !shopDef(id).goods.includes('salt'))!;
    const w = parkedAt(shopId);
    w.player.storedGoods = { [shopId]: { salt: 2 } };
    expect(() => sellStoredGood(w, 'salt', 1)).toThrow(`${shopId} does not trade salt`);
    expect(w.player.storedGoods).toEqual({ [shopId]: { salt: 2 } });
  });

  it('needs a shop', () => {
    const w = emptyWorld();
    w.player.storedGoods = { nose: { salt: 1 } };
    expect(() => sellStoredGood(w, 'salt', 1)).toThrow('Not parked at a shop');
  });
});

describe('the cost basis with stored crates', () => {
  it('a buy averages over stored crates as if every crate were on the truck', () => {
    const good = 'salt';
    const w = loaded('nose', good, 4);
    w.player.costBasis[good] = 1;
    const allAboard = buyGood(w, good, 2);
    const partlyStored = buyGood(storedCount(w, good, 3), good, 2);
    expect(partlyStored.player.costBasis[good]).toBe(allAboard.player.costBasis[good]);
    expect(allAboard.player.costBasis[good]).not.toBe(1);
  });

  it('salvage averages over stored crates as if every crate were on the truck', () => {
    const { w, stock } = spotWorld();
    stock.parts = [];
    stock.goods = { scrap: 2 };
    w.player.costBasis.scrap = 50;
    const aboard = structuredClone(w);
    addGoods(aboard, playerVehicle(aboard), 'scrap', 3);
    w.player.storedGoods = { nose: { scrap: 3 } };
    collectSalvage(aboard, playerVehicle(aboard), stock.id, 2);
    collectSalvage(w, playerVehicle(w), stock.id, 2);
    expect(w.player.costBasis.scrap).toBe(aboard.player.costBasis.scrap);
    expect(aboard.player.costBasis.scrap).toBeLessThan(50);
  });

  it('storing and taking out leaves the basis as it was', () => {
    const w = loaded('nose', 'salt', 2);
    w.player.costBasis.salt = 3;
    expect(takeOne(storedCount(w, 'salt', 2), 'salt').player.costBasis).toEqual(w.player.costBasis);
  });
});
