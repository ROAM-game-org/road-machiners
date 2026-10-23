import { chassisDef } from '../data/chassis';
import type { LineId } from '../data/dialogue';
import { LESSON_SALT, LESSON_TRADES, LESSONS, WEAKNESSES, type LessonTrade, type Weakness } from '../data/lessons';
import { bareSides } from './armor';
import { vehicleMass } from './mass';
import { firepower, npcTraits } from './npc-decisions';
import { canTakeWornPatch } from './patch';
import { charCodes, hashRandom } from './rng';
import type { Vehicle, World } from './types';

const CHECKS: Record<Weakness, (world: World, v: Vehicle) => boolean> = {
  noGuns: (world, v) => firepower(world, v) <= 0,
  bareSide: (_world, v) => bareSides(v).length > 0,
  wornCore: (world, v) => canTakeWornPatch(world, v),
  overloaded: (_world, v) => vehicleMass(v) > chassisDef(v.chassisId).ratedMass,
};

export function truckWeaknesses(world: World, v: Vehicle): Weakness[] {
  return WEAKNESSES.filter((weakness) => CHECKS[weakness](world, v));
}

export function lessonTrade(npc: Vehicle): LessonTrade {
  for (const trait of npcTraits(npc)) {
    const trade = LESSON_TRADES[trait];
    if (trade) return trade;
  }
  throw new Error(`${npc.id} has no trait with a lesson trade`);
}

export function pickLesson(world: World, npc: Vehicle, listener: Vehicle): LineId {
  const lessons = LESSONS[lessonTrade(npc)];
  const roll = hashRandom(world.seed, ...charCodes(npc.id), ...charCodes(LESSON_SALT));
  const weak = truckWeaknesses(world, listener);
  if (weak.length > 0) return lessons.weak[weak[Math.floor(roll * weak.length)]];
  return lessons.general[Math.floor(roll * lessons.general.length)];
}
