import { describe, expect, it } from 'vitest';
import { PLAYER_CHASSIS } from '../data/chassis';
import { GOODS } from '../data/goods';
import { GOODS_STORE } from '../data/market';
import { playerVehicle } from './damage';
import { checkKnockout } from './defeat';
import { chassisSwapRefusal, swapChassis } from './economy';
import { storedCrates } from './goods-store';
import { corePart, goodsCount } from './grid';
import { addGoods } from './inventory';
import { deliverContract, siteOf, type Contract } from './market';
import { payoutM } from './money';
import { yieldTo } from './parley';
import { repairContent } from './save-repair';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { World } from './types';
import { cloneWorld } from './world';

const BIG = 'sorokonoga';
let bigAtBowl: World | undefined;

function fullBigTruck(): World {
  bigAtBowl ??= (() => {
    const w = emptyWorld(sitePads(siteOf('bowl'))[0]);
    w.player.money = 10_000_000;
    swapChassis(w, BIG);
    addGoods(w, playerVehicle(w), 'scrap', 1000);
    return w;
  })();
  return cloneWorld(bigAtBowl);
}

const crates = (w: World) => goodsCount(playerVehicle(w)).scrap ?? 0;
const smaller = PLAYER_CHASSIS.filter((id) => id !== BIG);
const haul = (units: number): Contract => ({ id: 'ct-haul', shop: 'nose', kind: 'haul', good: 'scrap', units, to: 'bowl', reward: 100, deadline: 50_000, window: 500, rush: false, tier: 1 });

describe('a chassis swap at a shop with more crates than the new truck holds', () => {
  it.each(smaller)('to %s leaves the overflow in this shop store', (chassisId) => {
    const w = fullBigTruck();
    const before = crates(w);
    expect(chassisSwapRefusal(w, chassisId)).toBeNull();
    swapChassis(w, chassisId);
    const stored = w.player.storedGoods.bowl?.scrap ?? 0;
    expect(stored).toBeGreaterThan(0);
    expect(stored).toBeLessThanOrEqual(GOODS_STORE.crates);
    expect(crates(w) + stored).toBe(before);
  });

  it.each(smaller)('to %s refuses when the overflow is past the store room', (chassisId) => {
    const w = fullBigTruck();
    w.player.storedGoods = { bowl: { salt: GOODS_STORE.crates - 1 } };
    expect(chassisSwapRefusal(w, chassisId)).toEqual({ id: 'noCargoRoom' });
    expect(() => swapChassis(cloneWorld(w), chassisId)).toThrow('Refused: noCargoRoom');
  });

  it.each(smaller)('to %s refuses rather than store crates a haul owes', (chassisId) => {
    const w = fullBigTruck();
    w.player.contracts = [haul(crates(w))];
    expect(chassisSwapRefusal(w, chassisId)).toEqual({ id: 'noCargoRoom' });
  });

  it('stores only the crates the haul does not owe', () => {
    const w = fullBigTruck();
    w.player.contracts = [haul(10)];
    swapChassis(w, 'scout');
    expect(crates(w)).toBeGreaterThanOrEqual(10);
    expect(w.player.storedGoods.bowl.scrap).toBeGreaterThan(0);
  });

  it('swaps from a smaller truck into the big one with nothing stored', () => {
    const w = emptyWorld(sitePads(siteOf('bowl'))[0]);
    w.player.money = 10_000_000;
    swapChassis(w, BIG);
    expect(w.player.storedGoods).toEqual({});
  });
});

describe('the loss rules leave the crate store alone', () => {
  it('a knockout takes nothing from a store', () => {
    const w = fullBigTruck();
    w.player.storedGoods = { nose: { salt: 4 } };
    corePart(playerVehicle(w), 'cab').hp = 0;
    checkKnockout(w);
    expect(w.player.state).toBe('knockedOut');
    expect(w.player.storedGoods).toEqual({ nose: { salt: 4 } });
  });

  it('a robbery takes crates from the truck and none from a store', () => {
    const w = fullBigTruck();
    w.player.storedGoods = { nose: { salt: 4 } };
    const me = playerVehicle(w);
    const robber = addVehicle(w, 'scrapjaw', 'wagon', ['mg', 'stockEngine'], { x: me.pos.x + 8, y: me.pos.y });
    robber.brain = npcBrain('scavenger', robber.pos, ['scavenger', 'scumbag']);
    const before = crates(w);
    yieldTo(w, me, robber);
    expect(crates(w)).toBeLessThan(before);
    expect(w.player.storedGoods).toEqual({ nose: { salt: 4 } });
  });

  it('a haul is handed in from the truck, and a store of that good does not count', () => {
    const w = emptyWorld(sitePads(siteOf('bowl'))[0]);
    w.player.contracts = [haul(2)];
    w.player.storedGoods = { bowl: { scrap: 5 } };
    playerVehicle(w).items = playerVehicle(w).items.filter((it) => it.kind !== 'good');
    expect(() => deliverContract(w, 'ct-haul')).toThrow('Needs 2 scrap');
    addGoods(w, playerVehicle(w), 'scrap', 2);
    const delivered = deliverContract(w, 'ct-haul');
    expect(delivered.player.contracts).toEqual([]);
    expect(crates(delivered)).toBe(0);
    expect(delivered.player.storedGoods).toEqual({ bowl: { scrap: 5 } });
  });
});

describe('save repair of the crate store', () => {
  it('drops a good the game no longer has and pays out the crates of a shop it no longer has', () => {
    const w = emptyWorld();
    w.player.storedGoods = { bowl: { salt: 2, ghostGood: 3 }, goneShop: { scrap: 4 } };
    const money = w.player.money;
    repairContent(w);
    expect(w.player.storedGoods).toEqual({ bowl: { salt: 2 } });
    expect(w.player.money).toBe(money + payoutM(4 * GOODS.scrap.value));
    expect(storedCrates(w)).toEqual({ salt: 2 });
  });
});
