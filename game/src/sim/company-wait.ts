import { NPC_BEHAVIOR, NPCS } from '../data/npcs';
import { AWAITED_KINDS, followersOf } from './companies';
import { traderWaits } from './escort-job';
import { goalsOf, topGoal } from './npc-activities';
import { isStranded } from './stats';
import { isOnRope } from './tow';
import type { NpcActivity, Vehicle, World } from './types';
import { dist } from './vec';

const UPKEEP_KINDS: readonly NpcActivity['kind'][] = ['repair', 'resupply'];

export function waitsForFollowers(world: World, leader: Vehicle, activity: NpcActivity): boolean {
  if (activity.kind === 'fight' || activity.kind === 'flee' || activity.kind === 'resupply') return false;
  return followersOf(world, leader.id, AWAITED_KINDS).some((f) => (f.brain ? waitsForNpcFollower(world, leader, f) : traderWaits(world, leader, f)));
}

function waitsForNpcFollower(world: World, leader: Vehicle, follower: Vehicle): boolean {
  if (isStranded(world, follower) || isOnRope(world, follower.id)) return false;
  const gap = dist(follower.pos, leader.pos);
  if (gap > waitLimit(leader)) return false;
  if (keepsUp(follower)) return true;
  return topGoal(follower)?.kind === 'follow' && gap > NPC_BEHAVIOR.escortWaitGap;
}

function keepsUp(follower: Vehicle): boolean {
  const goals = goalsOf(follower);
  const top = goals[goals.length - 1];
  return top !== undefined && UPKEEP_KINDS.includes(top.kind) && goals.some((g, i) => i < goals.length - 1 && g.kind === 'follow');
}

function waitLimit(leader: Vehicle): number {
  return NPCS[leader.brain!.templateId]?.pairs ? NPC_BEHAVIOR.pairWaitLimit : NPC_BEHAVIOR.escortCatchUpGap;
}
