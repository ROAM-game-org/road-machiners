import { NPC_BEHAVIOR } from '../data/npc-behavior';
import type { ChaseRecord, NpcActivity, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export function startChase(world: World, vehicle: Vehicle, spot: Vec): ChaseRecord {
  return { turn: world.turn, gap: dist(vehicle.pos, spot) };
}

export function chaseStalled(world: World, vehicle: Vehicle, goal: NpcActivity, spot: Vec, closeEnough: number): boolean {
  if (!goal.chase) throw new Error(`${vehicle.id} chases ${goal.targetId} on a ${goal.kind} goal with no chase record`);
  const gap = dist(vehicle.pos, spot);
  if (gap <= closeEnough || goal.chase.gap - gap >= NPC_BEHAVIOR.chaseGainTiles) goal.chase = { turn: world.turn, gap };
  return world.turn - goal.chase.turn > NPC_BEHAVIOR.chaseStallTurns;
}
