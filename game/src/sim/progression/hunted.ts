import { NPC_BEHAVIOR, SPAWN } from '../../data/npcs';
import { playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { fightOdds } from '../fight-odds';
import { strengthRatio } from '../npc-decisions';
import { isAlly, isOutlaw } from '../relations';
import { vehicleStats } from '../stats';
import type { Vehicle, World } from '../types';
import { dist } from '../vec';

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
  const group = world.vehicles.filter((v) => v.id === foe.id || (!isKnockedOut(v) && dist(v.pos, foe.pos) <= SPAWN.neighborHelp && isAlly(world, v, foe)));
  const danger = strengthRatio(fightOdds(world, [playerVehicle(world)], group)) * (1 + NPC_BEHAVIOR.dangerSpread);
  return danger * HUNT_MARGIN <= 1;
}
