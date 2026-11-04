import { describe, expect, it } from 'vitest';
import { GOODS } from '../data/goods';
import { START_KITS } from '../data/start';
import { payoutM } from '../sim/money';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { carriedWorld, newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { readCarried } from './save-rescue';

function storingWorld(): World {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  w.player.storedGoods = { nose: { salt: 3, scrap: 1 }, bowl: { parts: 2 } };
  w.player.costBasis.salt = 6;
  return w;
}

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('stored crates in a save', () => {
  it('load gives back the same stores and awards nothing', () => {
    const w = storingWorld();
    const loaded = roundTrip(w);
    expect(loaded.player.storedGoods).toEqual(w.player.storedGoods);
    expect(loaded.player.costBasis.salt).toBe(6);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('the rescue carries each store and its basis, and pays out a store at a shop the world lacks', () => {
    const w = storingWorld();
    w.player.storedGoods.goneShop = { salt: 2 };
    const raw = JSON.parse(JSON.stringify(saveOf(w)));
    const carried = readCarried(raw);
    expect(carried.storedGoods).toEqual(w.player.storedGoods);
    const rescued = carriedWorld(carried, START_KITS.standard, () => TEST_MAP, () => 4242);
    expect(rescued.player.storedGoods).toEqual({ nose: { salt: 3, scrap: 1 }, bowl: { parts: 2 } });
    expect(rescued.player.costBasis.salt).toBe(6);
    const withoutGone = carriedWorld({ ...carried, storedGoods: {} }, START_KITS.standard, () => TEST_MAP, () => 4242);
    expect(rescued.player.money - withoutGone.player.money).toBe(payoutM(2 * GOODS.salt.value));
  });

  it('the rescue refunds a retired good in a store at its price', () => {
    const w = storingWorld();
    w.player.storedGoods.nose.oldOre = 3;
    const carried = readCarried(JSON.parse(JSON.stringify(saveOf(w))), { oldOre: 3 });
    expect(carried.storedGoods).toEqual({ nose: { salt: 3, scrap: 1 }, bowl: { parts: 2 } });
    expect(carried.refunded).toBe(9);
  });
});
