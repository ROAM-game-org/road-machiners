import type { TraitId } from './npcs';

export type LessonTrade = 'hauler' | 'salvager' | 'law' | 'gunHand';
export type Weakness = 'noGuns' | 'bareSide' | 'wornCore' | 'overloaded';

export const WEAKNESSES: readonly Weakness[] = ['noGuns', 'bareSide', 'wornCore', 'overloaded'];
export const LESSON_SALT = 'lesson';

export const LESSON_LINE_IDS = [
  'lessonHaulerNoGuns', 'lessonHaulerBareSide', 'lessonHaulerWornCore', 'lessonHaulerOverloaded', 'lessonHaulerPrices', 'lessonHaulerNoon', 'lessonHaulerBeacon',
  'lessonSalvagerNoGuns', 'lessonSalvagerBareSide', 'lessonSalvagerWornCore', 'lessonSalvagerOverloaded', 'lessonSalvagerRoads', 'lessonSalvagerJunk', 'lessonSalvagerDust',
  'lessonLawNoGuns', 'lessonLawBareSide', 'lessonLawWornCore', 'lessonLawOverloaded', 'lessonLawGates', 'lessonLawFirstShot', 'lessonLawLonely',
  'lessonGunHandNoGuns', 'lessonGunHandBareSide', 'lessonGunHandWornCore', 'lessonGunHandOverloaded', 'lessonGunHandRoles', 'lessonGunHandDust', 'lessonGunHandParked',
] as const;
export type LessonLineId = (typeof LESSON_LINE_IDS)[number];

export type TradeLessons = { weak: Record<Weakness, LessonLineId>; general: readonly [LessonLineId, LessonLineId, LessonLineId] };

export const LESSON_TRADES: Partial<Record<TraitId, LessonTrade>> = {
  trader: 'hauler', supplier: 'hauler',
  scavenger: 'salvager', vulture: 'salvager', roamer: 'salvager',
  lawman: 'law', guard: 'law', marshal: 'law',
  merc: 'gunHand', courier: 'gunHand',
};

export const LESSONS: Record<LessonTrade, TradeLessons> = {
  hauler: {
    weak: { noGuns: 'lessonHaulerNoGuns', bareSide: 'lessonHaulerBareSide', wornCore: 'lessonHaulerWornCore', overloaded: 'lessonHaulerOverloaded' },
    general: ['lessonHaulerPrices', 'lessonHaulerNoon', 'lessonHaulerBeacon'],
  },
  salvager: {
    weak: { noGuns: 'lessonSalvagerNoGuns', bareSide: 'lessonSalvagerBareSide', wornCore: 'lessonSalvagerWornCore', overloaded: 'lessonSalvagerOverloaded' },
    general: ['lessonSalvagerRoads', 'lessonSalvagerJunk', 'lessonSalvagerDust'],
  },
  law: {
    weak: { noGuns: 'lessonLawNoGuns', bareSide: 'lessonLawBareSide', wornCore: 'lessonLawWornCore', overloaded: 'lessonLawOverloaded' },
    general: ['lessonLawGates', 'lessonLawFirstShot', 'lessonLawLonely'],
  },
  gunHand: {
    weak: { noGuns: 'lessonGunHandNoGuns', bareSide: 'lessonGunHandBareSide', wornCore: 'lessonGunHandWornCore', overloaded: 'lessonGunHandOverloaded' },
    general: ['lessonGunHandRoles', 'lessonGunHandDust', 'lessonGunHandParked'],
  },
};
