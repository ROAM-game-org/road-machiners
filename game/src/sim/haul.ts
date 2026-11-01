
import { GOODS } from '../data/goods';
import { RULES } from '../data/rules';
import { getUpkeepReserve, partSellPrice, roadGoodAsk, roadPartAsk } from './economy';
import { getResources } from './resources';
import { UNITS } from '../data/units';
import { findSpot, freeCells, gridOf, isMounted, type Spot } from './grid';
import { cargoRoom, stowPlace } from './inventory';
import { looseCargo, takeError } from './salvage';
import type { CallVar, GridItem, Vehicle, World } from './types';
import { payoutM } from './money';

type PartItem = Extract<GridItem, { kind: 'part' }>;
type GoodItem = Extract<GridItem, { kind: 'good' }>;

export function removableParts(victim: Vehicle): PartItem[] {
  return victim.items
    .filter((item): item is PartItem => item.kind === 'part' && isMounted(victim.chassisId, item) && takeError(victim, item) === null)
    .sort((a, b) => partSellPrice(b.part) - partSellPrice(a.part));
}

function value(item: GridItem): number {
  if (item.kind === 'parcel') throw new Error(`Parcel ${item.id} is nobody's loot`);
  return item.kind === 'part' ? partSellPrice(item.part) : GOODS[item.good].value;
}

function byValue(items: GridItem[]): GridItem[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => value(b.item) - value(a.item) || a.i - b.i).map((e) => e.item);
}

function inPickupOrder(items: GridItem[]): GridItem[] {
  const parts = items.filter((item) => item.kind === 'part');
  const goods = items.filter((item): item is GoodItem => item.kind === 'good');
  const kinds = [...new Set(goods.map((item) => item.good))];
  return [...parts, ...kinds.flatMap((kind) => goods.filter((item) => item.good === kind))];
}

function placeAll(winner: Vehicle, items: GridItem[]): Vehicle | null {
  const probe: Vehicle = { ...winner, items: [...winner.items] };
  for (const item of inPickupOrder(items)) {
    const spot = item.kind === 'part' ? stowPlace(probe, item) : crateSpot(probe, item);
    if (!spot) return null;
    probe.items.push({ ...item, ...spot });
  }
  return probe;
}

function crateSpot(probe: Vehicle, item: GridItem): Spot | null {
  if (cargoRoom(probe) < 1) return null;
  return findSpot(gridOf(probe), probe.items, item, null, null);
}

function choose(winner: Vehicle, candidates: GridItem[], chosen: GridItem[], limit: number): GridItem[] {
  const picked = [...chosen];
  let probe = placeAll(winner, picked);
  if (!probe) return picked;
  const cells = freeCells(winner);
  for (const item of candidates) {
    if (picked.length - chosen.length >= limit || picked.length >= cells) break;
    if (item.kind === 'part') {
      const rebuilt = placeAll(winner, [...picked, item]);
      if (!rebuilt) continue;
      probe = rebuilt;
    } else {
      const spot = crateSpot(probe, item);
      if (!spot) continue;
      probe.items.push({ ...item, ...spot });
    }
    picked.push(item);
  }
  return picked;
}

export function cargoHaul(winner: Vehicle, loser: Vehicle): GridItem[] {
  return inPickupOrder(choose(winner, byValue(looseCargo(loser)), [], Infinity));
}

export function strippable(winner: Vehicle, loser: Vehicle): boolean {
  return cargoHaul(winner, loser).length > 0 || removableParts(loser).some((item) => placeAll(winner, [item]) !== null);
}

export function haulVar(items: GridItem[]): Extract<CallVar, { kind: 'haul' }> {
  const goods: Record<string, number> = {};
  const parts: string[] = [];
  for (const item of items) {
    if (item.kind === 'parcel') throw new Error(`Parcel ${item.id} is nobody's loot`);
    if (item.kind === 'good') goods[item.good] = (goods[item.good] ?? 0) + 1;
    else parts.push(item.part.defId);
  }
  return { kind: 'haul', goods, parts };
}

export function showsHaul(shown: CallVar | undefined, items: GridItem[]): boolean {
  if (shown?.kind !== 'haul') return false;
  const key = (v: Extract<CallVar, { kind: 'haul' }>) => JSON.stringify([Object.entries(v.goods).sort(), [...v.parts].sort()]);
  return key(shown) === key(haulVar(items));
}

export type Ransom = { haul: GridItem[]; money: number };

export function haulValue(items: GridItem[]): number {
  return items.reduce((sum, item) => sum + value(item), 0);
}

function goodLots(items: GridItem[]): Map<string, number> {
  const lots = new Map<string, number>();
  for (const item of items) {
    if (item.kind === 'parcel') throw new Error(`Parcel ${item.id} is nobody's loot`);
    if (item.kind === 'good') lots.set(item.good, (lots.get(item.good) ?? 0) + 1);
  }
  return lots;
}

export function haulPrice(items: GridItem[]): number {
  if (items.length === 0) throw new Error('A haul price needs a haul');
  const parts = items.reduce((sum, item) => sum + (item.kind === 'part' ? roadPartAsk(item.part) : 0), 0);
  const goods = [...goodLots(items)].reduce((sum, [good, count]) => sum + roadGoodAsk(good, count), 0);
  return parts + goods;
}

export function cashCut(world: World, victim: Vehicle): number {
  const spare = getResources(world, victim).money - getUpkeepReserve(victim);
  if (spare <= 0) return 0;
  const cut = Math.min(RULES.holdUp.cutCap, spare * RULES.holdUp.cutShare);
  return payoutM(cut);
}

export function ransomOf(world: World, robber: Vehicle, victim: Vehicle): Ransom {
  const haul = robber.brain ? cargoHaul(robber, victim) : looseCargo(victim);
  return { haul, money: haul.length > 0 ? haulPrice(haul) : cashCut(world, victim) };
}

export function hasRansom(ransom: Ransom): boolean {
  return ransom.haul.length > 0 || ransom.money > 0;
}
