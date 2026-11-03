import { NPC_BEHAVIOR } from '../../data/npcs';
import { playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { judgeDanger } from '../npc-decisions';
import { isOutlaw } from '../relations';
import { vehicleStats } from '../stats';
import type { Vehicle, World } from '../types';

export const HUNT_MARGIN = 4;

const huntedSpeeds = new WeakMap<World, { speed: number | undefined }>();

export function huntedSpeed(world: World): number | undefined {
  const known = huntedSpeeds.get(world);
  if (known) return known.speed;
  const speed = fastestHuntable(world);
  huntedSpeeds.set(world, { speed });
  return speed;
}

function fastestHuntable(world: World): number | undefined {
  const foes = world.vehicles.filter((v) => isOutlaw(v.faction) && v.brain !== null && !isKnockedOut(v) && huntable(world, v));
  return foes.length === 0 ? undefined : Math.max(...foes.map((v) => vehicleStats(world, v).maxSpeed));
}

export function huntable(world: World, foe: Vehicle): boolean {
  const danger = judgeDanger(world, playerVehicle(world), foe) * (1 + NPC_BEHAVIOR.dangerSpread);
  return danger * HUNT_MARGIN <= 1;
}
