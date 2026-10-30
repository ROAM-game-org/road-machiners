
import { EFFORT, type Tier } from './market';
import { rationsValue } from './market';
import { MASS_SCALE } from './mass-scale';

export type GoodDef = { id: string; value: number; tier: Tier };

export const CRATE_MASS = 50 * MASS_SCALE.cargo;

export const PARCEL = { id: 'parcel', mass: 5 * MASS_SCALE.cargo };

const BASE_GOODS: Record<string, GoodDef> = {
  scrap: { id: 'scrap', value: 6.33, tier: 1 },
  salt: { id: 'salt', value: 8.67, tier: 1 },
  meds: { id: 'meds', value: 23.33, tier: 2 },
  grain: { id: 'grain', value: 7, tier: 1 },
  textiles: { id: 'textiles', value: 11.67, tier: 1 },
  tools: { id: 'tools', value: 36.67, tier: 3 },
  batteries: { id: 'batteries', value: 25.33, tier: 2 },
  electronics: { id: 'electronics', value: 51.67, tier: 3 },
  parts: { id: 'parts', value: 6.67, tier: 1 },
  fuelDrums: { id: 'fuelDrums', value: 9.33, tier: 1 },
  water: { id: 'water', value: 6, tier: 1 },
  relics: { id: 'relics', value: 44, tier: 3 },
};

const BASE_VALUES = Object.fromEntries(Object.values(BASE_GOODS).map((g) => [g.id, g.value]));

export const GOODS: Record<string, GoodDef> = {
  ...BASE_GOODS,
  rations: { id: 'rations', value: rationsValue(BASE_VALUES, EFFORT.wage[1]), tier: 1 },
};

export const GOOD_IDS = Object.keys(GOODS);


export const ECONOMY = {
  spread: 0.2,
  roadSpread: 0.3,
  supplyPrice: { fuel: 1, supplies: 1.67 } as Record<'fuel' | 'supplies', number>,
  scrapPerKg: 0.0633,
  repairShare: 0.425,
  useRange: 1.5,
  interactionScale: 1.5,
};
