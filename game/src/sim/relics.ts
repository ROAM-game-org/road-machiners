import { PARTS } from '../data/parts';
import { TIME } from '../data/time';
import { claimSpots } from './claims';
import { partWithId } from './factory';
import { hashId } from './rng';
import { modeRules } from './settings';
import type { PartInstance, SalvageStock, World } from './types';
import { isRelic } from './wear';

const RELIC_DEFS = Object.values(PARTS).filter((def) => def.kind === 'relic').map((def) => def.id);

export function relicIdOf(stockId: string): string {
  return `relic-${stockId}`;
}

export function relicDefFor(seed: number, stockId: string): string {
  const roll = hashId(`relic:${seed}:${stockId}`);
  return RELIC_DEFS[Math.floor(roll * RELIC_DEFS.length)];
}

function stockParts(stock: SalvageStock): PartInstance[] {
  return [...stock.parts, ...stock.hidden.parts];
}

function relicsInWorld(world: World): Set<string> {
  const carried = world.vehicles.flatMap((v) => v.items.flatMap((it) => (it.kind === 'part' ? [it.part] : [])));
  const shelved = Object.values(world.shops).flatMap((shop) => shop.stock);
  const all = [...world.salvage.flatMap(stockParts), ...carried, ...world.player.storage, ...shelved];
  return new Set(all.filter(isRelic).map((part) => part.id));
}

export function placeRelics(world: World): void {
  if (!modeRules(world).looting) return;
  const held = relicsInWorld(world);
  for (const stock of claimSpots(world)) {
    const id = relicIdOf(stock.id);
    if (!held.has(id)) stock.hidden.parts.push(partWithId(id, relicDefFor(world.seed, stock.id), 0));
  }
}

export function renewRelics(world: World): void {
  if (world.turn % TIME.workDayTurns === 0) placeRelics(world);
}
