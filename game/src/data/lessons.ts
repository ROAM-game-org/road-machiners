import type { TraitId } from './npcs';

export type LessonTrade = 'hauler' | 'salvager' | 'raider' | 'law' | 'gunHand';
export type Weakness = 'noGuns' | 'bareSide' | 'wornCore' | 'overloaded';

export const WEAKNESSES: readonly Weakness[] = ['noGuns', 'bareSide', 'wornCore', 'overloaded'];
export const LESSON_SALT = 'lesson';
export const LESSON_POOL_SALT = 'lessonPool';
export const WEAKNESS_SHARE = 0.5;

export const LESSON_LINE_IDS = [
  'lessonHaulerNoGuns', 'lessonHaulerBareSide', 'lessonHaulerWornCore', 'lessonHaulerOverloaded', 'lessonHaulerPrices', 'lessonHaulerNoon', 'lessonHaulerBeacon', 'lessonHaulerHaulPay', 'lessonHaulerRush', 'lessonHaulerKeptCrates', 'lessonHaulerLowFuel', 'lessonHaulerRest', 'lessonHaulerRoadNews', 'lessonHaulerTow',
  'lessonSalvagerNoGuns', 'lessonSalvagerBareSide', 'lessonSalvagerWornCore', 'lessonSalvagerOverloaded', 'lessonSalvagerRoads', 'lessonSalvagerJunk', 'lessonSalvagerDust', 'lessonSalvagerPristine', 'lessonSalvagerStarve', 'lessonSalvagerCrawl', 'lessonSalvagerWarnOff', 'lessonSalvagerScrapPlate', 'lessonSalvagerFieldFix', 'lessonSalvagerPicked',
  'lessonRaiderNoGuns', 'lessonRaiderBareSide', 'lessonRaiderWornCore', 'lessonRaiderOverloaded', 'lessonRaiderCheapLoad', 'lessonRaiderCount', 'lessonRaiderPay', 'lessonRaiderSideOn', 'lessonRaiderClunk', 'lessonRaiderTruce', 'lessonRaiderSpill', 'lessonRaiderGrudge', 'lessonRaiderNight', 'lessonRaiderNoCall',
  'lessonLawNoGuns', 'lessonLawBareSide', 'lessonLawWornCore', 'lessonLawOverloaded', 'lessonLawGates', 'lessonLawFirstShot', 'lessonLawLonely', 'lessonLawCab', 'lessonLawBounty', 'lessonLawFlare', 'lessonLawHelp', 'lessonLawCrash', 'lessonLawScrapPatch', 'lessonLawTruceSides',
  'lessonGunHandNoGuns', 'lessonGunHandBareSide', 'lessonGunHandWornCore', 'lessonGunHandOverloaded', 'lessonGunHandRoles', 'lessonGunHandDust', 'lessonGunHandParked', 'lessonGunHandSideOn', 'lessonGunHandRange', 'lessonGunHandRecoil', 'lessonGunHandFirstAid', 'lessonGunHandDriveHome', 'lessonGunHandTallParts', 'lessonGunHandSound',
] as const;
export type LessonLineId = (typeof LESSON_LINE_IDS)[number];

export type TradeLessons = { weak: Record<Weakness, LessonLineId>; general: readonly LessonLineId[] };

export const LESSON_TRADES: Partial<Record<TraitId, LessonTrade>> = {
  trader: 'hauler', supplier: 'hauler',
  scavenger: 'salvager', vulture: 'salvager', roamer: 'salvager',
  raider: 'raider',
  lawman: 'law', guard: 'law', marshal: 'law',
  merc: 'gunHand', courier: 'gunHand',
};

export const LESSONS: Record<LessonTrade, TradeLessons> = {
  hauler: {
    weak: { noGuns: 'lessonHaulerNoGuns', bareSide: 'lessonHaulerBareSide', wornCore: 'lessonHaulerWornCore', overloaded: 'lessonHaulerOverloaded' },
    general: ['lessonHaulerPrices', 'lessonHaulerNoon', 'lessonHaulerBeacon', 'lessonHaulerHaulPay', 'lessonHaulerRush', 'lessonHaulerKeptCrates', 'lessonHaulerLowFuel', 'lessonHaulerRest', 'lessonHaulerRoadNews', 'lessonHaulerTow'],
  },
  salvager: {
    weak: { noGuns: 'lessonSalvagerNoGuns', bareSide: 'lessonSalvagerBareSide', wornCore: 'lessonSalvagerWornCore', overloaded: 'lessonSalvagerOverloaded' },
    general: ['lessonSalvagerRoads', 'lessonSalvagerJunk', 'lessonSalvagerDust', 'lessonSalvagerPristine', 'lessonSalvagerStarve', 'lessonSalvagerCrawl', 'lessonSalvagerWarnOff', 'lessonSalvagerScrapPlate', 'lessonSalvagerFieldFix', 'lessonSalvagerPicked'],
  },
  raider: {
    weak: { noGuns: 'lessonRaiderNoGuns', bareSide: 'lessonRaiderBareSide', wornCore: 'lessonRaiderWornCore', overloaded: 'lessonRaiderOverloaded' },
    general: ['lessonRaiderCheapLoad', 'lessonRaiderCount', 'lessonRaiderPay', 'lessonRaiderSideOn', 'lessonRaiderClunk', 'lessonRaiderTruce', 'lessonRaiderSpill', 'lessonRaiderGrudge', 'lessonRaiderNight', 'lessonRaiderNoCall'],
  },
  law: {
    weak: { noGuns: 'lessonLawNoGuns', bareSide: 'lessonLawBareSide', wornCore: 'lessonLawWornCore', overloaded: 'lessonLawOverloaded' },
    general: ['lessonLawGates', 'lessonLawFirstShot', 'lessonLawLonely', 'lessonLawCab', 'lessonLawBounty', 'lessonLawFlare', 'lessonLawHelp', 'lessonLawCrash', 'lessonLawScrapPatch', 'lessonLawTruceSides'],
  },
  gunHand: {
    weak: { noGuns: 'lessonGunHandNoGuns', bareSide: 'lessonGunHandBareSide', wornCore: 'lessonGunHandWornCore', overloaded: 'lessonGunHandOverloaded' },
    general: ['lessonGunHandRoles', 'lessonGunHandDust', 'lessonGunHandParked', 'lessonGunHandSideOn', 'lessonGunHandRange', 'lessonGunHandRecoil', 'lessonGunHandFirstAid', 'lessonGunHandDriveHome', 'lessonGunHandTallParts', 'lessonGunHandSound'],
  },
};
