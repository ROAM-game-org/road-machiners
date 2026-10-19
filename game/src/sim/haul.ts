
import { GOODS } from '../data/goods';
import { RULES } from '../data/rules';
import { getUpkeepReserve, partSellPrice } from './economy';
import { getResources } from './resources';
import { UNITS } from '../data/units';
import { findSpot, freeCells, gridOf, isMounted } from './grid';
import { cargoRoom, stowPlace } from './inventory';
import { looseCargo, takeError } from './salvage';
import type { CallVar, GridItem, Vehicle, World } from './types';

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

function fitsAll(winner: Vehicle, items: GridItem[]): boolean {
  const probe: Vehicle = { ...winner, items: [...winner.items] };
  for (const item of inPickupOrder(items)) {
    if (item.kind === 'part') {
      const spot = stowPlace(probe, item);
      if (!spot) return false;
      probe.items.push({ ...item, ...spot });
      continue;
    }
    if (cargoRoom(probe) < 1) return false;
    const spot = findSpot(gridOf(probe), probe.items, item, null, null);
    if (!spot) return false;
    probe.items.push({ ...item, ...spot });
  }
  return true;
}

function choose(winner: Vehicle, candidates: GridItem[], chosen: GridItem[], limit: number): GridItem[] {
  const picked = [...chosen];
  const cells = freeCells(winner);
  for (const item of candidates) {
    if (picked.length - chosen.length >= limit || picked.length >= cells) break;
    if (fitsAll(winner, [...picked, item])) picked.push(item);
  }
  return picked;
}

export function cargoHaul(winner: Vehicle, loser: Vehicle): GridItem[] {
  return inPickupOrder(choose(winner, byValue(looseCargo(loser)), [], Infinity));
}

export function surrenderHaul(winner: Vehicle, loser: Vehicle): GridItem[] {
  const cargo = cargoHaul(winner, loser);
  return inPickupOrder(choose(winner, removableParts(loser), cargo, RULES.surrenderParts));
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

export function cashCut(world: World, victim: Vehicle): number {
  const spare = getResources(world, victim).money - getUpkeepReserve(victim);
  if (spare <= 0) return 0;
  const cut = Math.min(RULES.holdUp.cutCap, spare * RULES.holdUp.cutShare);
  return Math.floor(cut / UNITS.centsPerM) * UNITS.centsPerM;
}

export function ransomOf(world: World, robber: Vehicle, victim: Vehicle): Ransom {
  const haul = robber.brain ? cargoHaul(robber, victim) : looseCargo(victim);
  return { haul, money: haul.length > 0 ? haulValue(haul) : cashCut(world, victim) };
}

export function hasRansom(ransom: Ransom): boolean {
  return ransom.haul.length > 0 || ransom.money > 0;
}
