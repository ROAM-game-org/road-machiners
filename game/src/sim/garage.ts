import { truckFor } from './damage';
import { reachedOutpostAt } from './chaos-highway';
import { shopAt } from './market';
import { CHAOS_HIGHWAY } from '../data/modes';
import { partDef } from '../data/parts';
import type { PartInstance, Refusal, World } from './types';

export function atGarage(world: World, truckId?: string): boolean {
  const truck = truckFor(world, truckId);
  if (truck.id !== world.player.vehicleId) return reachedOutpostAt(world, truck) !== null;
  return shopAt(world) !== null || reachedOutpostAt(world) !== null;
}

export function requireGarage(world: World, truckId?: string): void {
  if (!atGarage(world, truckId)) throw new Error('Not parked at a garage');
}

export function haulerTakes(part: Pick<PartInstance, 'defId'>): boolean {
  return CHAOS_HIGHWAY.hauler.kinds.includes(partDef(part.defId).kind);
}

export function haulerRefusal(world: World, truckId: string | undefined, part: PartInstance): Refusal | null {
  const isHauler = truckId !== undefined && truckId === world.chaosHighway?.hauler.id;
  return isHauler && !haulerTakes(part) ? { id: 'haulerRefuses' } : null;
}
