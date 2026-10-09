
import type { Vec } from '../sim/vec';
import { ARRIVAL, type FarmPiece } from './arrival';
import { CHASSIS } from './chassis';
import { REGION } from './region';
import { RULES } from './rules';

export type StartKit = {
  name: string;
  chassis: string;
  parts: string[];
  storage: string[];
  money: number;
  fuel: number;
  supplies: number;
  cargo: Record<string, number>;
  costBasis: Record<string, number>;
  autoRepair: boolean;
  opening: Opening | null;
  intro: Intro | null;
};

export type Opening = {
  log: string;
  wreck: { ahead: number; side: number };
  condition: Record<string, number>;
  stock: { goods: Record<string, number>; parts: string[] };
};

export type Intro = {
  pose: { pos: Vec; heading: number };
  farm: FarmPiece[];
  withoutIntro: string;
};

const STANDARD_OPENING: Opening = {
  log: 'You find yourself stranded in an unfamiliar land. Not your finest moment.',
  wreck: REGION.playerStart.wreck,
  condition: { stockEngine: 0.18, cabPickup: 0.3 },
  stock: { goods: { scrap: 0, parts: 3 }, parts: ['cage'] },
};

export const START_KITS: Record<string, StartKit> = {
  arrival: {
    name: 'Your truck',
    chassis: 'scout',
    parts: ['panniers', 'mg', 'stockEngine'],
    storage: [],
    money: 33300,
    fuel: CHASSIS.scout.fuelCap,
    supplies: RULES.baseSupplies,
    cargo: { scrap: 2, parts: 2 },
    costBasis: { scrap: 333 },
    autoRepair: false,
    opening: { ...STANDARD_OPENING, log: 'The pickup idles rough and coughs.', wreck: ARRIVAL.wreck },
    intro: { pose: ARRIVAL.pose, farm: ARRIVAL.farm, withoutIntro: 'standard' },
  },
  standard: {
    name: 'Your truck',
    chassis: 'scout',
    parts: ['panniers', 'mg', 'stockEngine'],
    storage: [],
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
    name: 'Your truck',
    chassis: 'hauler',
    parts: ['cannon', 'mg', 'stockEngine', 'ram', 'plates', 'plates', 'rack'],
    storage: ['plates', 'cage', 'mg'],
    money: 50000,
    fuel: 60,
    supplies: RULES.baseSupplies,
    cargo: { scrap: 2 },
    costBasis: { scrap: 333 },
    autoRepair: true,
    opening: null,
    intro: null,
  },
  midgame: {
    name: 'Your truck',
    chassis: 'hauler',
    parts: ['trailerBox', 'autocannon', 'mg', 'workhorseDiesel', 'plates', 'plates'],
    storage: [],
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
    name: 'Your truck',
    chassis: 'convertible',
    parts: ['mg', 'mg', 'slugCannon', 'shotgun', 'plowRam', 'workhorseDiesel', 'plates', 'plates', 'cage'],
    storage: [],
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
