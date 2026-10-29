import { HUNT } from '../data/npc-behavior';
import type { NpcActivity, NpcBrain } from './types';

const OFF_ROAD_GOALS: ReadonlySet<NpcActivity['kind']> = new Set(HUNT.offRoadGoals);

export function huntsOffRoad(brain: NpcBrain | undefined): boolean {
  if (!brain?.traits.includes('raider')) return false;
  const top = brain.goals.at(-1);
  return top !== undefined && OFF_ROAD_GOALS.has(top.kind);
}
