
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

export const HAULER_KIT: HaulerKit = {
  chassis: HAULER_CHASSIS,
  parts: ['workhorseDiesel'],
  wear: 0,
  fuel: CHASSIS[HAULER_CHASSIS].fuelCap,
  supplies: RULES.baseSupplies,
};

export const START_KITS: Record<string, StartKit> = {
  arrival: {
    chassis: 'scout',
    parts: ['panniers', 'mg', 'stockEngine'],
    storage: [],
    wear: 2,
    money: 33300,
    fuel: ARRIVAL.fuelLiters / UNITS.fuelLiters,
    supplies: ARRIVAL.supplies,
    cargo: { scrap: 2, parts: 2 },
    costBasis: { scrap: 333 },
    autoRepair: false,
    opening: { ...STANDARD_OPENING, wreck: ARRIVAL.wreck },
    intro: { pose: ARRIVAL.pose, farm: ARRIVAL.farm, health: ARRIVAL.health },
  },
  standard: {
    chassis: 'scout',
    parts: ['panniers', 'mg', 'stockEngine'],
    storage: [],
    wear: 2,
    money: 33300,
    fuel: CHASSIS.scout.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: { scrap: 2, parts: 2 },
    costBasis: { scrap: 333 },
    autoRepair: false,
    opening: STANDARD_OPENING,
    intro: null,
  },
  combat: {
    chassis: 'hauler',
    parts: ['cannon', 'mg', 'stockEngine', 'ram', 'plates', 'plates', 'rack'],
    storage: ['plates', 'cage', 'mg'],
    wear: 0,
    money: 50000,
    fuel: 60,
    supplies: RULES.baseSupplies,
    cargo: { scrap: 2 },
    costBasis: { scrap: 333 },
    autoRepair: true,
    opening: null,
    intro: null,
  },
  furyRoad: {
    chassis: 'scout',
    parts: ['mg', 'stockEngine'],
    storage: [],
    wear: 0,
    money: 8000,
    fuel: CHASSIS.scout.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: { parts: 4 },
    costBasis: {},
    autoRepair: true,
    opening: null,
    intro: null,
  },
  midgame: {
    chassis: 'hauler',
    parts: ['trailerBox', 'autocannon', 'mg', 'workhorseDiesel', 'plates', 'plates'],
    storage: [],
    wear: 0,
    money: 3000,
    fuel: CHASSIS.hauler.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: { parts: 2 },
    costBasis: {},
    autoRepair: true,
    opening: null,
    intro: null,
  },
  snowball: {
    chassis: 'convertible',
    parts: ['mg', 'mg', 'slugCannon', 'shotgun', 'plowRam', 'workhorseDiesel', 'plates', 'plates', 'cage'],
    storage: [],
    wear: 0,
    money: 83300,
    fuel: CHASSIS.convertible.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: {},
    costBasis: {},
    autoRepair: true,
    opening: null,
    intro: null,
  },
};

export function startKit(id: string): StartKit {
  const kit = START_KITS[id];
  if (!kit) throw new Error(`Unknown start kit "${id}". Known: ${Object.keys(START_KITS).join(', ')}`);
  return kit;
}
