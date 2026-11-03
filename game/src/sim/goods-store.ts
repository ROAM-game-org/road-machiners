import { GOODS_STORE } from '../data/market';
import { playerVehicle, truckFor } from './damage';
import { newId } from './factory';
import { requireGarage } from './garage';
import { goodsCount, gridOf, placementError, type Spot } from './grid';
import { afterRefit, requireIdleRefit } from './inventory';
import { requireSpareGoods, shopAt } from './market';
import type { GridItem, World } from './types';
import { playerCommand, Refused } from './world';

export function storedHere(world: World): Record<string, number> {
  const shopId = shopAt(world);
  return shopId ? { ...(world.player.storedGoods[shopId] ?? {}) } : {};
}

export function storedCrates(world: World): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const store of Object.values(world.player.storedGoods)) {
    for (const [good, n] of Object.entries(store)) totals[good] = (totals[good] ?? 0) + n;
  }
  return totals;
}

function storeTotal(world: World, shopId: string): number {
  return Object.values(world.player.storedGoods[shopId] ?? {}).reduce((sum, n) => sum + n, 0);
}

export function storeRoom(world: World, shopId: string): number {
  return Math.max(0, GOODS_STORE.crates - storeTotal(world, shopId));
}

export function heldCrates(world: World, good: string): number {
  return (goodsCount(playerVehicle(world))[good] ?? 0) + (storedCrates(world)[good] ?? 0);
}

export function addStored(world: World, shopId: string, good: string, n: number): number {
  const added = Math.min(n, storeRoom(world, shopId));
  if (added <= 0) return 0;
  const store = (world.player.storedGoods[shopId] ??= {});
  store[good] = (store[good] ?? 0) + added;
  return added;
}

export function takeStored(world: World, shopId: string, good: string, n: number): void {
  const store = world.player.storedGoods[shopId];
  const held = store?.[good] ?? 0;
  if (!Number.isInteger(n) || n <= 0 || n > held) throw new Error(`Cannot take ${n} ${good} from the store at ${shopId}, holding ${held}`);
  store[good] = held - n;
  if (store[good] === 0) delete store[good];
  if (Object.keys(store).length === 0) delete world.player.storedGoods[shopId];
}

function requireStoreShop(world: World, truckId?: string): string {
  requireGarage(world, truckId);
  const shopId = shopAt(world);
  if (!shopId || truckFor(world, truckId).id !== world.player.vehicleId) throw new Error('Crates are stored only at a shop');
  return shopId;
}

export function storeGood(world: World, itemId: string, truckId?: string): World {
  return playerCommand(world, (w) => {
    const shopId = requireStoreShop(w, truckId);
    const me = truckFor(w, truckId);
    requireIdleRefit(me);
    const item = me.items.find((it) => it.id === itemId);
    if (!item) throw new Error(`No item ${itemId}`);
    if (item.kind !== 'good') throw new Error('Only crates go into the crate store');
    requireSpareGoods(w, me, item.good, 1);
    if (storeRoom(w, shopId) === 0) throw new Refused({ id: 'storeFull', cap: GOODS_STORE.crates });
    me.items = me.items.filter((it) => it.id !== itemId);
    addStored(w, shopId, item.good, 1);
    afterRefit(w, me);
  });
}

export function takeStoredGood(world: World, good: string, to: Spot, truckId?: string): World {
  return playerCommand(world, (w) => {
    const shopId = requireStoreShop(w, truckId);
    const me = truckFor(w, truckId);
    requireIdleRefit(me);
    takeStored(w, shopId, good, 1);
    const item: GridItem = { id: newId(w, 'i'), kind: 'good', good, ...to };
    const err = placementError(gridOf(me), me.items, item, null);
    if (err) throw new Refused(err);
    me.items.push(item);
    afterRefit(w, me);
  });
}
