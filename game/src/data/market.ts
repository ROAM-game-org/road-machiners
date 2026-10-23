
import { PARTS, type PartDef } from './parts';
import type { TraitId, Weighted } from './npcs';
import type { PropKind } from '../sim/terrain';
import type { OldPlaceType } from './salvage';
import { MEMORY, NPC_BEHAVIOR } from './npc-behavior';
import { MAP_SCALE } from './region';
import { TERRAIN } from './terrain';
import { TIME } from './time';
import type { CrimeOffense } from '../sim/types';


export type Tier = 1 | 2 | 3;

export type ItemKind = 'weapon' | 'engine' | 'armor' | 'accessory' | 'cargo' | 'scanner' | 'store' | 'utility' | 'chassis' | 'good';

export const EFFORT = {
  wage: {
    1: 12.33,
    2: 33.33,
    3: 73.33,
  } as Record<Tier, number>,

  bands: {
    1: {
      weapon: [250, 700],
      engine: [250, 700],
      armor: [250, 700],
      accessory: [250, 700],
      cargo: [250, 700],
      scanner: [250, 700],
      store: [250, 700],
      utility: [250, 700],
      chassis: [5000, 7500],
      good: [40, 100],
    },
    2: {
      weapon: [180, 480],
      engine: [180, 480],
      armor: [180, 480],
      accessory: [180, 480],
      cargo: [180, 480],
      scanner: [180, 480],
      store: [180, 480],
      utility: [180, 480],
      chassis: [2800, 4200],
      good: [50, 100],
    },
    3: {
      weapon: [180, 380],
      engine: [180, 380],
      armor: [180, 380],
      accessory: [180, 380],
      cargo: [180, 380],
      scanner: [180, 380],
      store: [180, 380],
      utility: [180, 380],
      chassis: [1900, 2800],
      good: [40, 80],
    },
  } as Record<Tier, Record<ItemKind, [number, number]>>,

  haulWages: 4,

  refSpeed: 4,

  routeFactor: 1.3,

  handlingTurns: 3,
};

export const CONTRACTS = {
  maxActive: 3,

  pastKept: 30,

  warnTurns: Math.round(TIME.turnsPerDay / 12),

  haul: {
    durationFactor: 2.5,
    slackTurns: Math.round(TIME.turnsPerDay / 4),
    rewardFactor: 24,
    valueShare: 0.05,
    units: [3, 12] as [number, number],
    penaltyShare: 1,
    xpPerEffort: 0.003,
    rush: {
      chance: 0.25,
      durationFactor: 1.5,
      premium: 1.75,
    },
  },

  claim: {
    minTownGap: 15,
    minRoadGap: 5,
    searchTurns: 60,
    travelShare: 0.5,
    rivalLeadFactor: 1,
    rivalRetryTurns: 20,
    clueStepTiles: 62.5,
    clueRadiusShare: 0.4,
    leadStepTiles: 12.5,
    rivalTraits: ['scavenger', 'vulture', 'roamer', 'trader'] as readonly TraitId[],
    durationFactor: 2.5,
    slackTurns: Math.round(TIME.turnsPerDay / 2),
    xpPerEffort: 0.003,
  },

  procure: {
    units: [3, 12] as [number, number],
    travelFactor: 0.5,
    slackTurns: EFFORT.handlingTurns * 2,
    xpPerEffort: 0.003,
  },

  search: {
    durationTurns: [600, 900] as [number, number],
    rewardTurns: 750,
    freshTurns: Math.round(TIME.turnsPerDay / 4),
    awayTiles: TERRAIN.vision.radius,
    xpPerEffort: 0.0045,
  },

  survey: {
    roadGap: 20,
    siteGap: 40,
    range: 36 * MAP_SCALE,
    spread: 18 * MAP_SCALE,
    count: [1, 3] as [number, number],
    surveyTurns: 10,
    searchTurns: 20,
    clue: { range: 36 * MAP_SCALE, roundTiles: 25, band: 40, nearby: 40, layRing: 30, rise: 2, hollow: -1.3 },
    rewardFactor: 15,
    knowledgeRange: 12,
    xpPerEffort: 0.003,
  },
  escort: {
    xpPerEffort: 0.003,
  },

  rescue: {
    range: 26.4 * MAP_SCALE,
    areaRadius: 13,
    areaOffset: 11,
    xpPerEffort: 0.003,
  },
};

export type Threat = Tier;

export const ESCORT_JOB = {
  postTurns: 75,
  graceTurns: 40,
  stuckTurns: 120,
  holdTurns: 90,
  apartGap: NPC_BEHAVIOR.escortCatchUpGap,
  threatReach: 40,
  minWin: { 1: 0.55, 2: 0.65, 3: 0.75 } as Record<Threat, number>,
  threatPremium: { 1: 0.6, 2: 1, 3: 1.5 } as Record<Threat, number>,
  postWeight: { 1: 0.2, 2: 1, 3: 2 } as Record<Threat, number>,
};

export type ClaimLook = 'armyTruck' | 'deadTruck' | 'tank' | 'shipWreck';

export const CLAIM_LOOKS: Partial<Record<PropKind | OldPlaceType, ClaimLook>> = {
  armyTruck: 'armyTruck',
  deadTruck: 'deadTruck',
  tank: 'tank',
  hulks: 'tank',
  shipCache: 'shipWreck',
  hullCache: 'shipWreck',
  engineCache: 'shipWreck',
};

export type ShopKind = 'garage' | 'stall';

export const PRICE_FACTOR = { make: 0.75 };

export const DISTANCE_PREMIUM = { perTile: 0.0021 };

const GARAGE_WEAR: Weighted<number>[] = [
  { value: 0, weight: 1 },
  { value: 1, weight: 4 },
  { value: 2, weight: 3 },
  { value: 3, weight: 1 },
];
const STALL_WEAR: Weighted<number>[] = [
  { value: 1, weight: 2 },
  { value: 2, weight: 4 },
  { value: 3, weight: 3 },
  { value: 4, weight: 1 },
];

const NON_CORE_PARTS = Object.values(PARTS).filter((def) => def.kind !== 'core');
const PART_SHELF_WEIGHT = { utility: 3, emitter: 0.6, other: 1 };
const GARAGE_PARTS: Weighted<string>[] = NON_CORE_PARTS.map((def) => ({ value: def.id, weight: shelfWeightOf(def) }));

function shelfWeightOf(def: PartDef): number {
  if (def.id === 'emitter') return PART_SHELF_WEIGHT.emitter;
  return def.kind === 'utility' ? PART_SHELF_WEIGHT.utility : PART_SHELF_WEIGHT.other;
}

export type PartStockTable = { parts: Weighted<string>[]; wear: Weighted<number>[] };

export const GARAGE_STOCK: PartStockTable = { parts: GARAGE_PARTS, wear: GARAGE_WEAR };

export type ShopDef = {
  id: string;
  kind: ShopKind;
  makes: string[];
  needs: string[];
  goods: string[];
  priceFactor: typeof PRICE_FACTOR;
  partStock: PartStockTable;
  stockSize: [number, number];
  restockTurns: number;
  contractSlots: number;
  supplies: ('fuel' | 'supplies')[];
  charts: boolean;
  staples: string[];
};

export const PRESSURE_MAX = 0.6;

export const SHORT_PRESSURE = 0.2;

type ShopData = Omit<ShopDef, 'makes' | 'needs' | 'goods'>;

const SHOP_DATA: Record<string, ShopData> = {
  bowl: {
    id: 'bowl',
    kind: 'garage',
    priceFactor: PRICE_FACTOR,
    partStock: { parts: GARAGE_PARTS, wear: GARAGE_WEAR },
    stockSize: [8, 12],
    restockTurns: 400,
    contractSlots: 3,
    supplies: ['fuel', 'supplies'],
    charts: true,
    staples: ['stockEngine'],
  },
  nose: {
    id: 'nose',
    kind: 'garage',
    priceFactor: PRICE_FACTOR,
    partStock: { parts: GARAGE_PARTS, wear: GARAGE_WEAR },
    stockSize: [8, 12],
    restockTurns: 400,
    contractSlots: 3,
    supplies: ['fuel', 'supplies'],
    charts: true,
    staples: ['stockEngine'],
  },
  'salvage-yard': {
    id: 'salvage-yard',
    kind: 'stall',
    priceFactor: PRICE_FACTOR,
    partStock: {
      parts: ([
        'plates', 'steelPlate', 'cage', 'scrapPanels', 'scrapSheet', 'ram', 'plowRam', 'mg', 'shotgun', 'rack', 'panniers',
        'caltrops', 'oilSpiller', 'scrapersKnife', 'patcherCrane', 'claymoreRam', 'spikeCluster', 'spikeStrip', 'cageSection',
      ] as const).map((id) => ({ value: id, weight: 1 })),
      wear: STALL_WEAR,
    },
    stockSize: [2, 4],
    restockTurns: 300,
    contractSlots: 1,
    supplies: ['fuel', 'supplies'],
    charts: false,
    staples: [],
  },
  granary: {
    id: 'granary',
    kind: 'stall',
    priceFactor: PRICE_FACTOR,
    partStock: {
      parts: (['rack', 'panniers', 'flatbed', 'scrapPanels', 'scrapSheet', 'cage', 'supplyLocker', 'patcherCrane'] as const).map((id) => ({ value: id, weight: 1 })),
      wear: STALL_WEAR,
    },
    stockSize: [2, 4],
    restockTurns: 300,
    contractSlots: 1,
    supplies: ['fuel', 'supplies'],
    charts: false,
    staples: [],
  },
  'pump-station': {
    id: 'pump-station',
    kind: 'stall',
    priceFactor: PRICE_FACTOR,
    partStock: {
      parts: (['stockEngine', 'flatFour', 'workhorseDiesel', 'scanner', 'plates', 'jerrycans', 'oilSpiller', 'flareCannon'] as const).map((id) => ({ value: id, weight: 1 })),
      wear: STALL_WEAR,
    },
    stockSize: [2, 4],
    restockTurns: 300,
    contractSlots: 1,
    supplies: ['fuel', 'supplies'],
    charts: false,
    staples: [],
  },
  dustwell: {
    id: 'dustwell',
    kind: 'stall',
    priceFactor: PRICE_FACTOR,
    partStock: {
      parts: (['jerrycans', 'supplyLocker', 'rack', 'panniers', 'scrapPanels', 'plates', 'mg', 'scanner'] as const).map((id) => ({ value: id, weight: 1 })),
      wear: STALL_WEAR,
    },
    stockSize: [2, 4],
    restockTurns: 300,
    contractSlots: 1,
    supplies: ['fuel', 'supplies'],
    charts: false,
    staples: [],
  },
  'green-pit': {
    id: 'green-pit',
    kind: 'stall',
    priceFactor: PRICE_FACTOR,
    partStock: {
      parts: (['supplyLocker', 'jerrycans', 'flatbed', 'cage', 'scrapSheet', 'shotgun', 'caltrops', 'patcherCrane'] as const).map((id) => ({ value: id, weight: 1 })),
      wear: STALL_WEAR,
    },
    stockSize: [2, 4],
    restockTurns: 300,
    contractSlots: 1,
    supplies: ['fuel', 'supplies'],
    charts: false,
    staples: [],
  },
};


export type Recipe = {
  id: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  everyCycles: number;
  fallback?: Record<string, number>;
  upkeep: string[];
  upkeepBatches: number;
  wornEvery: number;
};

export type SiteEconomy = {
  recipes: Recipe[];
  found?: string[];
  demand: Record<string, number>;
  serviceDaily: Record<string, number>;
};

export const PRODUCTION = {
  cycleTurns: Math.round(TIME.turnsPerDay / 24),
  elasticity: 0.6,
  bufferDays: 1.5,
  fullShare: 1.6,
  minTarget: { garage: 120, stall: 30 } as Record<'garage' | 'stall', number>,
};

export const CYCLES_PER_DAY = TIME.turnsPerDay / PRODUCTION.cycleTurns;

export const SERVICE_GOOD: Record<'fuel' | 'supplies', string> = { fuel: 'fuelDrums', supplies: 'rations' };

export const ESSENTIAL_GOODS: readonly string[] = ['water', 'grain', 'rations', 'fuelDrums'];

export const RELIEF = {
  delayTurns: Math.round(TIME.turnsPerDay * 1.5),
  everyCycles: 4,
  ceilingShare: 0.15,
};

export type SiteEventKind = 'surge' | 'breakdown';

export type SiteEventDef = { kind: SiteEventKind; site: string; recipe: string; cadenceScale: number; days: number; dailyChance: number; repairTurns: number };

export const SITE_EVENTS: readonly SiteEventDef[] = [
  { kind: 'surge', site: 'pump-station', recipe: 'pump', cadenceScale: 0.5, days: 1, dailyChance: 0.08, repairTurns: 0 },
  { kind: 'breakdown', site: 'pump-station', recipe: 'pump', cadenceScale: 4, days: 2, dailyChance: 0.05, repairTurns: 90 },
  { kind: 'surge', site: 'bowl', recipe: 'sorgut', cadenceScale: 0.5, days: 1, dailyChance: 0.08, repairTurns: 0 },
  { kind: 'breakdown', site: 'dustwell', recipe: 'well', cadenceScale: 4, days: 2, dailyChance: 0.05, repairTurns: 90 },
  { kind: 'breakdown', site: 'salvage-yard', recipe: 'yard', cadenceScale: 4, days: 2, dailyChance: 0.05, repairTurns: 90 },
];

export const ROAD_NEWS = {
  max: 16,
  days: 1.5,
  riskShare: 0.25,
};

const NO_UPKEEP = { upkeep: [], upkeepBatches: 1, wornEvery: 1 };

export const SITE_ECONOMY: Record<string, SiteEconomy> = {
  dustwell: {
    recipes: [{ id: 'well', inputs: {}, outputs: { water: 2 }, everyCycles: 3, upkeep: ['tools'], upkeepBatches: 16, wornEvery: 6 }],
    demand: { meds: 24, rations: 12 },
    serviceDaily: { fuelDrums: 10, rations: 1 },
  },
  'green-pit': {
    recipes: [{ id: 'well', inputs: {}, outputs: { water: 1 }, everyCycles: 6, ...NO_UPKEEP }],
    demand: { salt: 24, textiles: 24, rations: 12 },
    serviceDaily: { fuelDrums: 10, rations: 1 },
  },
  bowl: {
    recipes: [
      { id: 'sorgut', inputs: { water: 1 }, outputs: { grain: 3 }, everyCycles: 3, fallback: { grain: 1 }, ...NO_UPKEEP },
      { id: 'weavers', inputs: {}, outputs: { textiles: 1 }, everyCycles: 8, ...NO_UPKEEP },
      { id: 'clinic', inputs: {}, outputs: { meds: 1 }, everyCycles: 12, ...NO_UPKEEP },
      { id: 'machinists', inputs: { scrap: 1 }, outputs: { parts: 1 }, everyCycles: 6, ...NO_UPKEEP },
      { id: 'workshop', inputs: { batteries: 1, scrap: 1 }, outputs: { electronics: 1 }, everyCycles: 24, ...NO_UPKEEP },
    ],
    demand: { salt: 12, tools: 24, rations: 2 },
    serviceDaily: { fuelDrums: 45, rations: 1 },
  },
  granary: {
    recipes: [{ id: 'rations', inputs: { grain: 2, salt: 1, water: 1 }, outputs: { rations: 3 }, everyCycles: 3, upkeep: ['tools'], upkeepBatches: 24, wornEvery: 6 }],
    demand: {},
    serviceDaily: { fuelDrums: 10, rations: 1 },
  },
  nose: {
    recipes: [
      { id: 'pans', inputs: {}, outputs: { salt: 1 }, everyCycles: 2, ...NO_UPKEEP },
      { id: 'forge', inputs: { scrap: 2, fuelDrums: 1 }, outputs: { tools: 1 }, everyCycles: 6, ...NO_UPKEEP },
      { id: 'cells', inputs: { parts: 1, fuelDrums: 1 }, outputs: { batteries: 1 }, everyCycles: 8, ...NO_UPKEEP },
    ],
    demand: { rations: 4, water: 8, textiles: 12, meds: 24, electronics: 24, relics: 24 },
    serviceDaily: { fuelDrums: 45, rations: 1 },
  },
  'pump-station': {
    recipes: [{ id: 'pump', inputs: {}, outputs: { fuelDrums: 12 }, everyCycles: 2, upkeep: ['tools', 'batteries'], upkeepBatches: 24, wornEvery: 4 }],
    demand: { rations: 12 },
    serviceDaily: { fuelDrums: 10, rations: 1 },
  },
  'salvage-yard': {
    recipes: [{ id: 'yard', inputs: {}, outputs: { scrap: 2, parts: 1 }, everyCycles: 3, upkeep: ['tools'], upkeepBatches: 16, wornEvery: 6 }],
    found: ['relics'],
    demand: { rations: 12 },
    serviceDaily: { fuelDrums: 10, rations: 1 },
  },
};

export function isFoundGood(good: string): boolean {
  return Object.values(SITE_ECONOMY).some((site) => site.found?.includes(good));
}

export function siteEconomy(shopId: string): SiteEconomy {
  const site = SITE_ECONOMY[shopId];
  if (!site) throw new Error(`No production data for ${shopId}`);
  return site;
}

export function siteRecipes(shopId: string): readonly Recipe[] {
  return siteEconomy(shopId).recipes;
}

export function madeGoods(shopId: string): string[] {
  return unique([...siteRecipes(shopId).flatMap((r) => [...Object.keys(r.outputs), ...Object.keys(r.fallback ?? {})]), ...(siteEconomy(shopId).found ?? [])]);
}

export function usedGoods(shopId: string): string[] {
  const site = siteEconomy(shopId);
  const recipeUse = site.recipes.flatMap((r) => [...Object.keys(r.inputs), ...r.upkeep]);
  return unique([...recipeUse, ...Object.keys(site.demand), ...Object.keys(site.serviceDaily)]).filter((good) => !madeGoods(shopId).includes(good));
}

export function tradedGoods(shopId: string): string[] {
  return unique([...madeGoods(shopId), ...usedGoods(shopId)]);
}

export function dailyFlow(shopId: string, good: string): number {
  const site = siteEconomy(shopId);
  const recipeFlow = site.recipes.reduce((sum, r) => sum + ((r.outputs[good] ?? 0) + (r.inputs[good] ?? 0)) * (CYCLES_PER_DAY / r.everyCycles) + upkeepFlow(r, good), 0);
  const demand = site.demand[good] ? CYCLES_PER_DAY / site.demand[good] : 0;
  return recipeFlow + demand + (site.serviceDaily[good] ?? 0);
}

function upkeepFlow(r: Recipe, good: string): number {
  return r.upkeep.includes(good) ? CYCLES_PER_DAY / r.everyCycles / r.upkeepBatches : 0;
}

export function rationsValue(values: Record<string, number>, wage: number): number {
  const recipe = siteRecipes('granary').find((r) => r.id === 'rations');
  if (!recipe) throw new Error('The Granary has no rations recipe');
  const inputs = Object.entries(recipe.inputs).reduce((sum, [good, n]) => sum + n * requireValue(values, good), 0);
  const work = recipe.everyCycles * PRODUCTION.cycleTurns * wage;
  return Math.round((inputs + work) / recipe.outputs.rations);
}

function requireValue(values: Record<string, number>, good: string): number {
  const value = values[good];
  if (value === undefined) throw new Error(`No value for ${good}`);
  return value;
}

export type GraphEdge = { good: string; from: string; to: string };

export function graphEdges(): readonly GraphEdge[] {
  const shops = Object.keys(SITE_ECONOMY);
  return shops.flatMap((from) => madeGoods(from).flatMap((good) => shops.filter((to) => to !== from && usedGoods(to).includes(good)).map((to) => ({ good, from, to }))));
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

export const SHOPS: Record<string, ShopDef> = Object.fromEntries(
  Object.entries(SHOP_DATA).map(([id, data]) => [id, { ...data, makes: madeGoods(id), needs: usedGoods(id), goods: tradedGoods(id) }]),
);

export function shopDef(id: string): ShopDef {
  const def = SHOPS[id];
  if (!def) throw new Error(`Unknown shop ${id}`);
  return def;
}

export const TOWN_MARKETS = Object.keys(SHOPS);
export const STALL_MARKETS = Object.values(SHOPS).filter((s) => s.kind === 'stall').map((s) => s.id);

const BOUNTY_WAGE = EFFORT.wage[1];
const wageOf = (turns: number): number => Math.round(turns * BOUNTY_WAGE);
const FINE_TURNS: Record<CrimeOffense, number> = { attacked: 450, robbed: 900, killed: 2700 };

export const CRIME = {
  fine: Object.fromEntries(Object.entries(FINE_TURNS).map(([offense, turns]) => [offense, wageOf(turns)])) as Record<CrimeOffense, number>,
  purseShare: 0.5,
  minStake: wageOf(60),
  maxOwed: wageOf(4 * FINE_TURNS.robbed),
  feeShare: 0.2,
  reportSites: ['bowl', 'nose', 'dustwell', 'granary', 'pump-station', 'green-pit', 'salvage-yard', 'marshal-post'] as readonly string[],
  post: 'marshal-post',
  keepClosedTurns: MEMORY.turns.witnessed,
  settleWage: 1,
  wage: BOUNTY_WAGE,
};

export const BOUNTY = {
  lapseTurns: 5 * TIME.turnsPerDay,
  huntTurns: TIME.turnsPerDay / 2,
  retryTurns: TIME.turnsPerDay / 2,
  offerGapTurns: TIME.turnsPerDay,
  stopTurns: 10,
  searchReach: 60,
  leadReach: 6,
  postTurns: 60,
};
