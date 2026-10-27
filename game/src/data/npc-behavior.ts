
import { ENCOUNTERS } from './encounters';
import { RULES } from './rules';
import { TERRAIN } from './terrain';
import { TIME } from './time';
import type { DeedId, HelpDeed, MemoryFact, NpcFactionId, StandingFactionId, WrongDeed } from '../sim/types';

export const NPC_UTILITY = {
  dropReach: 10,
  sproutCab: 0.5,
};
const LAW_GATE_REACH = 12;

export const NPC_BEHAVIOR = {
  stallTurns: 100,
  stallJump: 20,
  progressReach: 4,
  lieUp: { gap: { min: 2, max: 8 }, reach: 1.5, spacing: 1.5 },
  weakDecline: 20,
  escortWaitGap: 12,
  escortCatchUpGap: 40,
  pairWaitLimit: 150,
  followReaimShare: 0.25,
  lawGateReach: LAW_GATE_REACH,
  patrolRadius: LAW_GATE_REACH + TERRAIN.vision.radius * 4,
  patrolSpacing: 4,
  followGap: RULES.yieldDistance + 1,
  fleeCondition: 0.3,
  fleeKeepAngle: 45,
  fight: { angles: 16, rings: [0.25, 0.5, 0.75, 1], arcWeight: 2, threatWeight: 1, travelWeight: 1, circleWeight: 1, rammedWeight: 2, ramWeight: 2, circlePace: 3, whimTurns: 4 },
  revengeChance: 0.33,
  recoverCondition: 0.5,
  threatRatio: 1,
  dangerSpread: 0.25,
  threatFlee: 20,
  weakFlee: 20,
  hunterFlee: 0.1,
  trappedFlee: 0.2,
  hurtFullFlee: 0.1,
  missFlee: 0.5,
  manageableFight: 5,
  threatLeave: 10,
  warnAnswerTurns: 5,
  keepWork: 400,
  noticeMemory: 3,
  fleeMemory: 30,
  fightSearchTurns: 6,
  closeInTiles: 0.5,
  fleeCalmTurns: 6,
  fightStallTurns: 20,
  fightWearShare: 0.05,
  crippledInvestigate: 0.01,
  lootedResume: 0.01,
  ram: {
    partWeight: { cab: 4, wheel: 2, transmission: 2, tank: 1, engine: 3, weapon: 3, armor: 0.25, accessory: 0.25, scanner: 1, store: 1, cargo: 1, utility: 1 },
    gunWeight: 1,
    valueScale: 0.3,
    riskyRam: 0.001,
    dodge: 0.3,
  },
  visibleSalvage: 10,
  robStronger: 0.015,
  robNearGuards: 0.015,
  lootAppeal: {
    rob: { poor: 5000, rich: 16667, poorMul: 0.02 },
    raid: { poor: 0, rich: 13333, poorMul: 0.002 },
    hunt: { poor: 0, rich: 6667, poorMul: 0.002 },
  },
  fightNearGuards: 0.001,
  towNearTown: { factor: 0.02, crawl: 15, far: 60 },
  mateRetaliate: 0.1,
  threatTruce: 5,
  weakBeg: 40,
  threatAccept: 5,
  robberRefuse: 20,
  winningTruce: 0.01,
  threatComply: 20,
  guardedComply: 0.1,
};

export const LOOK_OVER = {
  turns: 1,
  reach: TERRAIN.vision.radius / 2,
  guessShare: 0.4,
  holdShare: 0.7,
};

export const NPC_UPKEEP = {
  businessTurns: 3,
  repairParts: 2,
  shadeSearchRadius: 6,
  fuelReserve: 1.5,
  fuelSense: 0.35,
  lowSupplies: RULES.lowFuelThreshold,
  reserveLoads: 1,
  tradeReserve: 0.5,
};

export const AID = {
  fillShare: 0.25,
  giftShare: 0.25,
  poorCondition: 0.5,
  poorValue: 133333,
  handoverTurns: 1,
};

export const HUNT = {
  roadSpacing: 60,
  siteDistance: 40,
  lawReach: NPC_BEHAVIOR.patrolRadius + TERRAIN.vision.radius,
  offRoadGoals: ['raid', 'patrol', 'investigate', 'sizeUp'] as const,
  postRoadGap: 6,
  postRings: [7, 10, 14, 18, 22],
  roadSample: 4,
  postBearings: 12,
  patrolPostSpacing: 20,
  watchTurns: 40,
};

export const CREW = {
  size: 3,
  musterTurns: 40,
  huntTurns: 300,
  retryTurns: 150,
  campReach: 12,
  askReach: 10,
  initiative: 0.1,
  strongerLeader: 2,
  lowAppetite: 0.5,
};

export const HIRE = {
  turns: TIME.turnsPerDay,
};

export const MEMORY = {
  turns: { prices: TIME.turnsPerDay, stripped: TIME.turnsPerDay, wronged: ENCOUNTERS.wrongedTurns, helped: 2 * TIME.turnsPerDay, sighting: TIME.turnsPerDay, witnessed: 3 * TIME.turnsPerDay } satisfies Record<MemoryFact['kind'], number>,
};

export const TRADE_TIP = { share: 0.2 };

export const FIRST_NAMES: readonly string[] = [
  'Abe', 'Ada', 'Anya', 'Arlo', 'Bea', 'Bo', 'Boris', 'Cal', 'Cass', 'Clem', 'Dace', 'Dmitri', 'Dora', 'Earl',
  'Edda', 'Elias', 'Faye', 'Fenn', 'Gus', 'Hank', 'Hester', 'Ida', 'Igor', 'Ivy', 'Jed', 'Jonah', 'Juno', 'Kat',
  'Lev', 'Lorna', 'Lupe', 'Mack', 'Mae', 'Mira', 'Nell', 'Nico', 'Oleg', 'Opal', 'Pike', 'Pru', 'Quill', 'Raya',
  'Rook', 'Ruth', 'Sal', 'Sasha', 'Silas', 'Tam', 'Tess', 'Ugo', 'Vera', 'Vic', 'Wade', 'Wren', 'Yuri', 'Zeke',
  'Zoya',
];

export const FEMALE_NAMES: ReadonlySet<string> = new Set([
  'Ada', 'Anya', 'Bea', 'Cass', 'Dora', 'Edda', 'Faye', 'Hester', 'Ida', 'Ivy', 'Juno', 'Kat', 'Lorna', 'Lupe',
  'Mae', 'Mira', 'Nell', 'Opal', 'Pru', 'Raya', 'Ruth', 'Tess', 'Vera', 'Wren', 'Zoya',
]);

export const SURNAMES: readonly string[] = [
  'Ash', 'Baines', 'Barrow', 'Boyle', 'Brandt', 'Cobb', 'Crane', 'Culver', 'Dawes', 'Drummond', 'Dust', 'Fisk',
  'Flint', 'Gage', 'Garza', 'Grell', 'Harrow', 'Hatch', 'Holt', 'Irons', 'Jarvis', 'Kane', 'Kessler', 'Kovac',
  'Lark', 'Lowry', 'Marsh', 'Mercer', 'Morozov', 'Nash', 'Oakes', 'Orlov', 'Pell', 'Quarry', 'Radek', 'Reyes',
  'Rusk', 'Salt', 'Sokol', 'Stroud', 'Tallow', 'Thorne', 'Tulloch', 'Vance', 'Volkov', 'Wick', 'Yates', 'Zane',
];

export type FactionDef = { organized: boolean; outlaw: boolean };

export const FACTIONS: Record<NpcFactionId, FactionDef> = {
  bowl: { organized: true, outlaw: false },
  nose: { organized: true, outlaw: false },
  guidestar: { organized: true, outlaw: false },
  administrators: { organized: true, outlaw: false },
  scrapjaw: { organized: true, outlaw: true },
  kiln: { organized: true, outlaw: true },
  sunward: { organized: true, outlaw: true },
  marshals: { organized: true, outlaw: false },
  independent: { organized: false, outlaw: false },
};

export const NPC_FACTION_IDS = Object.keys(FACTIONS) as NpcFactionId[];
export const STANDING_FACTION_IDS = NPC_FACTION_IDS.filter((id): id is StandingFactionId => FACTIONS[id].organized);

export const NEUTRAL = 0;

export const ATTITUDE: Record<NpcFactionId, Record<NpcFactionId, number>> = {
  bowl: { bowl: 60, nose: -25, guidestar: 20, administrators: NEUTRAL, scrapjaw: -40, kiln: -30, sunward: -30, marshals: NEUTRAL, independent: 5 },
  nose: { bowl: -5, nose: 60, guidestar: 20, administrators: -20, scrapjaw: -40, kiln: -40, sunward: -30, marshals: NEUTRAL, independent: 5 },
  guidestar: { bowl: 20, nose: 20, guidestar: 60, administrators: 5, scrapjaw: -30, kiln: -30, sunward: -20, marshals: NEUTRAL, independent: 10 },
  administrators: { bowl: NEUTRAL, nose: -35, guidestar: 5, administrators: 60, scrapjaw: -5, kiln: -5, sunward: -10, marshals: NEUTRAL, independent: 10 },
  scrapjaw: { bowl: -30, nose: -40, guidestar: -25, administrators: -5, scrapjaw: 60, kiln: -10, sunward: -20, marshals: NEUTRAL, independent: -30 },
  kiln: { bowl: -10, nose: -40, guidestar: -20, administrators: -5, scrapjaw: -10, kiln: 60, sunward: -20, marshals: NEUTRAL, independent: -30 },
  sunward: { bowl: -20, nose: -20, guidestar: -20, administrators: -20, scrapjaw: -20, kiln: -20, sunward: 60, marshals: -20, independent: -20 },
  marshals: { bowl: NEUTRAL, nose: NEUTRAL, guidestar: NEUTRAL, administrators: NEUTRAL, scrapjaw: NEUTRAL, kiln: NEUTRAL, sunward: NEUTRAL, marshals: 60, independent: NEUTRAL },
  independent: { bowl: 5, nose: 5, guidestar: 10, administrators: 5, scrapjaw: -30, kiln: -30, sunward: -20, marshals: NEUTRAL, independent: NEUTRAL },
};

export type Band = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'allied';

export const BANDS = { hostile: -50, unfriendly: -15, friendly: 15, allied: 50 } as const;
export const SCORE_LIMIT = 100;
export const LAW_CAP = BANDS.hostile;

export const PERSONAL: Record<WrongDeed | HelpDeed, number> = {
  attacked: -40, robbed: -50, stole: -30,
  aided: 30, towed: 30, patched: 30, defended: 40,
};
export const PERSONAL_RANGE = { min: -60, max: 40 } as const;

export const STANDING_DELTA: Record<DeedId, number> = {
  attacked: -15, robbed: -20, stole: -10, killed: -30,
  aided: 5, towed: 5, patched: 5, defended: 8, contract: 3, failedContract: -5,
};

export const DEEDS = { repeatTurns: TIME.turnsPerDay };

export const STANDING = { dailyDrift: 10, dailyGainCap: 15 };

export const INTERVENE = { range: 10, friendly: 0.25 };

export const HELP_CALL = { allied: 450, friendly: 27, law: 450, oddsPower: 2.2, oddsCap: 4, cowardEdge: 3 };

export const REFUSE_KNOWN_AT = -15;

export const SITE_FACTIONS: Partial<Record<string, NpcFactionId>> = {
  bowl: 'bowl',
  nose: 'nose',
  scrapjaw: 'scrapjaw',
  kiln: 'kiln',
  'marshal-post': 'marshals',
};

export const TOWN_TRADER_SHARE = 1 / 3;

export function startStanding(): Record<StandingFactionId, number> {
  return Object.fromEntries(STANDING_FACTION_IDS.map((id) => [id, ATTITUDE[id].independent])) as Record<StandingFactionId, number>;
}
