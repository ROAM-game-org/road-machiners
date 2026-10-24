
import type { Weighted } from './npcs';
import { scalePoint } from './region';
import type { Vec } from '../sim/vec';

export type LootRange = [number, number];

export type RareSpare = {
  share: number;
  parts: string[];
  wear: Weighted<number>[];
};

const RARE_WEAR: Weighted<number>[] = [
  { value: 0, weight: 1 },
  { value: 1, weight: 2 },
];

export type LootTable = {
  goods: Record<string, LootRange>;
  parts: LootRange;
  sparePartChance: number;
  spareParts: string[];
  rare: RareSpare | null;
  relicChance: number;
  fuel: LootRange;
  supplies: LootRange;
};

export const FIELD_SPARE_WEAR: Weighted<number>[] = [
  { value: 0, weight: 1 },
  { value: 1, weight: 3 },
  { value: 2, weight: 4 },
  { value: 3, weight: 3 },
  { value: 4, weight: 2 },
];

export type OldPlaceType = 'homestead' | 'hamlet' | 'lookout' | 'hulks' | 'boats';
export const OLD_PLACE_TYPES: readonly OldPlaceType[] = ['homestead', 'hamlet', 'lookout', 'hulks', 'boats'];

export const OLD_PLACES = {
  seedOffset: 7351,
  buildingGap: 12,
  tankGap: 10,
  boatGap: 14,
  roadGap: 5,
  chance: { homestead: 0.5, hamlet: 0.35, lookout: 0.4, hulks: 0.25, boats: 0.2 } as Record<OldPlaceType, number>,
  npcShare: 0.3,
  npcRange: 120,
};

const LANDMARK_TABLE = {
  goods: { scrap: [1, 2], salt: [0, 1], meds: [0, 1] },
  parts: [1, 2],
  sparePartChance: 0.2,
  spareParts: ['stockEngine', 'plates', 'cage', 'mg', 'emitter', 'emitter', 'scrapersKnife', 'scrapersKnife', 'patcherCrane', 'patcherCrane'],
  rare: null,
  relicChance: 0,
  fuel: [0, 8],
  supplies: [0, 3],
} as LootTable;

export const SALVAGE = {
  unitsPerTurn: 2,
  pileTurns: 400,
  claimTurns: 60,
  pileSearchTurns: 1,
  coreValueShare: 0.03,
  restockShare: 0.08,
  wreckClearDays: 1,
  landmark: LANDMARK_TABLE,
  hullCache: { ...LANDMARK_TABLE, relicChance: 0.14 } as LootTable,
  roadWreck: {
    goods: { scrap: [1, 1] },
    parts: [0, 1],
    sparePartChance: 0.1,
    spareParts: ['mg', 'cage', 'rack', 'flatFour', 'caltrops', 'caltrops'],
    rare: null,
    relicChance: 0,
    fuel: [0, 4],
    supplies: [0, 1],
  } as LootTable,
  hullScrap: {
    goods: { scrap: [1, 2] },
    parts: [0, 1],
    sparePartChance: 0.1,
    spareParts: ['mg', 'cage', 'plates', 'flatFour', 'oilSpiller', 'oilSpiller'],
    rare: null,
    relicChance: 0.05,
    fuel: [0, 4],
    supplies: [0, 1],
  } as LootTable,
  farmStores: {
    goods: { grain: [0, 1], textiles: [0, 1], scrap: [0, 1] },
    parts: [0, 1],
    sparePartChance: 0.05,
    spareParts: ['flatFour', 'rack'],
    rare: null,
    relicChance: 0,
    fuel: [0, 4],
    supplies: [0, 2],
  } as LootTable,
  armyStores: {
    goods: { scrap: [0, 1], meds: [0, 1] },
    parts: [0, 1],
    sparePartChance: 0.15,
    spareParts: ['mg', 'plates', 'cage', 'sprout', 'sprout', 'flareCannon', 'flareCannon', 'smokeMortar', 'smokeMortar', 'harpoon', 'harpoon'],
    rare: null,
    relicChance: 0,
    fuel: [0, 2],
    supplies: [0, 2],
  } as LootTable,
  engineScrap: {
    goods: { scrap: [1, 2], batteries: [0, 1] },
    parts: [1, 2],
    sparePartChance: 0.2,
    spareParts: ['stockEngine', 'flatFour', 'plates', 'cage'],
    rare: null,
    relicChance: 0,
    fuel: [0, 4],
    supplies: [0, 1],
  } as LootTable,
  cityStores: {
    goods: { textiles: [0, 1], water: [0, 1], meds: [0, 1], scrap: [0, 1] },
    parts: [0, 1],
    sparePartChance: 0.05,
    spareParts: ['rack', 'flatFour'],
    rare: null,
    relicChance: 0,
    fuel: [0, 2],
    supplies: [0, 2],
  } as LootTable,
};

export const OLD_TABLES: Record<OldPlaceType, LootTable> = {
  homestead: {
    goods: { grain: [0, 1], textiles: [0, 1] },
    parts: [0, 1],
    sparePartChance: 0.12,
    spareParts: ['flatFour', 'rack'],
    rare: { share: 0.25, parts: ['workhorseDiesel', 'heavyDiesel'], wear: RARE_WEAR },
    relicChance: 0,
    fuel: [0, 1],
    supplies: [0, 1],
  },
  hamlet: {
    goods: { scrap: [0, 1], textiles: [0, 1] },
    parts: [0, 1],
    sparePartChance: 0.12,
    spareParts: ['stockEngine', 'rack', 'plates'],
    rare: { share: 0.25, parts: ['tunedEngine', 'racingV6'], wear: RARE_WEAR },
    relicChance: 0,
    fuel: [0, 1],
    supplies: [0, 1],
  },
  lookout: {
    goods: { scrap: [0, 1], meds: [0, 1] },
    parts: [0, 0],
    sparePartChance: 0.12,
    spareParts: ['mg', 'cage', 'stockEngine'],
    rare: { share: 0.25, parts: ['tunedEngine', 'racingV6'], wear: RARE_WEAR },
    relicChance: 0,
    fuel: [0, 1],
    supplies: [0, 1],
  },
  hulks: {
    goods: { scrap: [1, 2] },
    parts: [0, 1],
    sparePartChance: 0.1,
    spareParts: ['plates', 'mg', 'cage'],
    rare: { share: 0.25, parts: ['heavyDiesel', 'workhorseDiesel'], wear: RARE_WEAR },
    relicChance: 0,
    fuel: [0, 1],
    supplies: [0, 1],
  },
  boats: {
    goods: { scrap: [1, 2] },
    parts: [0, 1],
    sparePartChance: 0.05,
    spareParts: ['plates', 'rack'],
    rare: { share: 0.25, parts: ['workhorseDiesel'], wear: RARE_WEAR },
    relicChance: 0,
    fuel: [0, 1],
    supplies: [0, 1],
  },
};
export const STRIP = {
  yieldShare: 0.5,
  turns: 3,
};

export type StoryWreck = {
  id: string;
  pos: Vec;
  r: number;
  chassisId: string;
  yaw: number;
  goods: Record<string, number>;
  fuel: number;
  supplies: number;
  part: { id: string; defId: string; wear: number };
};

export const WAGON_SEVEN = 'story-wagon-seven';

export const STORY_WRECKS: StoryWreck[] = [
  {
    id: WAGON_SEVEN,
    pos: scalePoint({ x: 34.2, y: 76.2 }),
    r: 0.8,
    chassisId: 'wagon',
    yaw: 2.2,
    goods: { scrap: 3, meds: 1, parts: 1 },
    fuel: 10,
    supplies: 4,
    part: { id: 'story-wagon-seven-cannon', defId: 'cannon', wear: 2 },
  },
];
