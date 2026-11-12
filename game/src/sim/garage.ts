import { truckFor } from './damage';
import { reachedOutpostAt } from './chaos-highway';
import { shopAt } from './market';
import type { World } from './types';

export function atGarage(world: World, truckId?: string): boolean {
  const truck = truckFor(world, truckId);
  if (truck.id !== world.player.vehicleId) return reachedOutpostAt(world, truck) !== null;
  return shopAt(world) !== null || reachedOutpostAt(world) !== null;
}

export function requireGarage(world: World, truckId?: string): void {
  if (!atGarage(world, truckId)) throw new Error('Not parked at a garage');
}
