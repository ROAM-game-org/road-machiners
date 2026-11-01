
import type { Vec } from '../sim/vec';
import { ARRIVAL, type FarmPiece } from './arrival';
import { CHASSIS, HAULER_CHASSIS } from './chassis';
import { REGION } from './region';
import { RULES } from './rules';
import { UNITS } from './units';

export type StartKit = {
  chassis: string;
  parts: string[];
  placed?: { defId: string; x: number; y: number; rot: 0 | 1 | 2 | 3 }[];
  storage: string[];
  wear: number;
  money: number;
  fuel: number;
  supplies: number;
  cargo: Record<string, number>;
  costBasis: Record<string, number>;
  autoRepair: boolean;
  ranks: number;
  opening: Opening | null;
  intro: Intro | null;
};

export type HaulerKit = { chassis: string; parts: string[]; wear: number; fuel: number; supplies: number };

export type Opening = {
  log: 'stranded';
  wreck: { ahead: number; side: number };
  condition: Record<string, number>;
  stock: { goods: Record<string, number>; parts: string[] };
};

export type Intro = {
  pose: { pos: Vec; heading: number };
  farm: FarmPiece[];
  health: number;
};

const STANDARD_OPENING: Opening = {
  log: 'stranded',
  wreck: REGION.playerStart.wreck,
  condition: { stockEngine: 0.18, cabPickup: 0.3 },
  stock: { goods: { scrap: 0, parts: 3 }, parts: ['cage'] },
};

export const OPENING = { farewellDistance: 80 };

export const HAULER_KIT: HaulerKit = {
  chassis: HAULER_CHASSIS,
  parts: ['workhorseDiesel'],
  wear: 0,
  fuel: CHASSIS[HAULER_CHASSIS].fuelCap,
  supplies: RULES.baseSupplies,
};

const SCOUT_GUN: NonNullable<StartKit['placed']> = [{ defId: 'mg', x: 4, y: 5, rot: 0 }];

const SNOWBALL_GUNS: NonNullable<StartKit['placed']> = [
  { defId: 'mg', x: 1, y: 5, rot: 0 },
  { defId: 'mg', x: 2, y: 6, rot: 0 },
  { defId: 'slugCannon', x: 3, y: 9, rot: 1 },
  { defId: 'shotgun', x: 4, y: 10, rot: 2 },
];

export const START_KITS: Record<string, StartKit> = {
  arrival: {
    chassis: 'scout',
    parts: ['panniers', 'stockEngine'],
    placed: SCOUT_GUN,
    storage: [],
    wear: 2,
    money: 333,
    fuel: ARRIVAL.fuelLiters / UNITS.fuelLiters,
    supplies: ARRIVAL.supplies,
    cargo: { scrap: 2, parts: 2 },
    costBasis: { scrap: 3.33 },
    autoRepair: false,
    ranks: 0,
    opening: { ...STANDARD_OPENING, wreck: ARRIVAL.wreck },
    intro: { pose: ARRIVAL.pose, farm: ARRIVAL.farm, health: ARRIVAL.health },
  },
  standard: {
    chassis: 'scout',
    parts: ['panniers', 'stockEngine'],
    placed: SCOUT_GUN,
    storage: [],
    wear: 2,
    money: 333,
    fuel: CHASSIS.scout.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: { scrap: 2, parts: 2 },
    costBasis: { scrap: 3.33 },
    autoRepair: false,
    ranks: 0,
    opening: STANDARD_OPENING,
    intro: null,
  },
  combat: {
    chassis: 'hauler',
    parts: ['cannon', 'mg', 'stockEngine', 'ram', 'plates', 'plates', 'rack'],
    storage: ['plates', 'cage', 'mg'],
    wear: 0,
    money: 500,
    fuel: 60,
    supplies: RULES.baseSupplies,
    cargo: { scrap: 2 },
    costBasis: { scrap: 3.33 },
    autoRepair: true,
    ranks: 0,
    opening: null,
    intro: null,
  },
  chaosHighway: {
    chassis: 'scout',
    parts: ['stockEngine'],
    placed: SCOUT_GUN,
    storage: [],
    wear: 0,
    money: 80,
    fuel: CHASSIS.scout.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: { parts: 1 },
    costBasis: {},
    autoRepair: true,
    ranks: 1,
    opening: null,
    intro: null,
  },
  midgame: {
    chassis: 'hauler',
    parts: ['trailerBox', 'autocannon', 'mg', 'workhorseDiesel', 'plates', 'plates'],
    storage: [],
    wear: 0,
    money: 30,
    fuel: CHASSIS.hauler.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: { parts: 2 },
    costBasis: {},
    autoRepair: true,
    ranks: 0,
    opening: null,
    intro: null,
  },
  snowball: {
    chassis: 'convertible',
    parts: ['plowRam', 'workhorseDiesel', 'plates', 'plates', 'cage'],
    placed: SNOWBALL_GUNS,
    storage: [],
    wear: 0,
    money: 833,
    fuel: CHASSIS.convertible.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: {},
    costBasis: {},
    autoRepair: true,
    ranks: 0,
    opening: null,
    intro: null,
  },
};

export function startKit(id: string): StartKit {
  const kit = START_KITS[id];
  if (!kit) throw new Error(`Unknown start kit "${id}". Known: ${Object.keys(START_KITS).join(', ')}`);
  return kit;
}

export function kitPartIds(kit: StartKit): string[] {
  return [...(kit.placed ?? []).map((p) => p.defId), ...kit.parts];
}
