import { getKnownSite, huntingGrounds, raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import { turfClaimants } from './hunting-spots';
import { hasExplorationMap } from './settings';
import type { World } from './types';

export function campWarmSteps(world: World): (() => void)[] {
  if (!hasExplorationMap(world)) return [];
  const steps: (() => void)[] = [() => void huntingGrounds(world)];
  for (const { id } of turfClaimants()) {
    steps.push(() => void raiderGrounds(world, getKnownSite(id)));
    steps.push(() => void raiderPatrolPosts(world, getKnownSite(id)));
  }
  return steps;
}
