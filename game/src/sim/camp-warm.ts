import { getKnownSite, huntingGrounds, raiderGrounds, raiderPatrolPosts } from './npc-decisions';
import { turfClaimants } from './hunting-spots';
import type { World } from './types';

export function campWarmSteps(world: World): (() => void)[] {
  const steps: (() => void)[] = [() => void huntingGrounds(world)];
  for (const { id } of turfClaimants()) {
    steps.push(() => void raiderGrounds(world, getKnownSite(id)));
    steps.push(() => void raiderPatrolPosts(world, getKnownSite(id)));
  }
  return steps;
}
