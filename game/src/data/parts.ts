import type { Tier } from './market';
import { UNPRICED_WEAPONS } from './weapons';
import { itemValue } from './units';
import { CLAYMORE, oilSlickLength, UNPRICED_UTILITIES } from './utilities';
import { MASS_SCALE } from './mass-scale';

export type PartKind =
  | "weapon"
  | "engine"
  | "armor"
  | "accessory"
  | "cargo"
  | "core"
  | "scanner"
  | "store"
  | "utility";

type PartBase = {
  id: string;
  hp: number;
  base: number;
  value: number;
  tier: Tier;
  w: number;
  h: number;
  mass: number;
  armor: number;
  tall: boolean;
};

export type WeaponClass = "damager" | "chip" | "precision";

export type WeaponRound = {
  damage: number;
  pen: number;
  blast: boolean;
  speed: number;
  splashRadius: number;
  splashDamage: number;
  splashPen: number;
  armorShare: number;
  craterRadius: number;
};

export type WeaponDef = PartBase & {
  kind: "weapon";
  draw: number;
  range: number;
  cooldown: number;
  magazine: number;
  reload: number;
  arc: number;
  spread: number;
  rounds: number;
  recoil: number;
  shake: number;
  stray: number;
  round: WeaponRound;
  classes: WeaponClass[];
  line?: { turns: number };
};

export type EngineDef = PartBase & {
  kind: "engine";
  speedBonus: number;
  accelBonus: number;
  capacity: number;
  fuelMult: number;
  noise: number;
  heat: number;
};

export type ClaymoreDef = {
  minImpact: number;
  blast: { damage: number; pen: number; radius: number };
  selfBlast: { damage: number; pen: number };
  throw: { impulse: number; lift: number };
  reload: number;
};

export type FieldRepair = "full" | "capped" | "none";

export type ArmorDef = PartBase & {
  kind: "armor";
  blastArmor: number;
  fieldRepair: FieldRepair;
  ramMult: number;
  look: "plates" | "cage";
};

export type EdgeLetter = "F" | "B" | "L" | "R";

export type AccessoryDef = PartBase & {
  kind: "accessory";
  blastArmor: number;
  fieldRepair: FieldRepair;
  ramMult: number;
  look: "ram" | "spikes";
  mounts: EdgeLetter[];
  claymore?: ClaymoreDef;
};

export type ShieldDef = ArmorDef | AccessoryDef;

export function isShield(def: PartDef): def is ShieldDef {
  return def.kind === "armor" || def.kind === "accessory";
}

export function isLineGun(def: PartDef): boolean {
  return def.kind === "weapon" && def.line !== undefined;
}

export type CargoDef = PartBase & {
  kind: "cargo";
  extraRows: number;
  look: "rack" | "box";
};

export type CoreDef = PartBase & {
  kind: "core";
  role: "cab" | "transmission" | "wheel" | "tank";
};

export type ScannerDef = PartBase & {
  kind: "scanner";
  range: number;
};

export type StoreDef = PartBase & {
  kind: "store";
  holds: "fuel" | "supplies";
  amount: number;
};

export type UtilityEffect =
  | { type: 'sprout'; radius: number; turns: number }
  | { type: 'mortar'; radius: number; turns: number; minRange: number; maxRange: number }
  | { type: 'caltrops'; radius: number; turns: number; behind: number }
  | { type: 'oil'; turns: number; behind: number; fuel: number }
  | { type: 'emitter'; radius: number; turns: number }
  | { type: 'flare'; radius: number; turns: number; minRange: number; maxRange: number }
  | { type: 'crane' }
  | { type: 'scraper' };
export type UtilityEffectType = UtilityEffect['type'];

export type UtilityDef = PartBase & {
  kind: "utility";
  effect: UtilityEffect;
  reload: number | null;
};

export type PartDef =
  | WeaponDef
  | EngineDef
  | ArmorDef
  | AccessoryDef
  | CargoDef
  | CoreDef
  | ScannerDef
  | StoreDef
  | UtilityDef;

export type Unpriced<T> = T extends unknown ? Omit<T, 'value'> : never;

export const PART_PRICE_MODIFIERS = {
  weapon: { perDamagePerTurn: 0.6667, perRange: 0.6667 },
  engine: { perSpeedBonus: 20, perAccelBonus: 13.3333 },
  armor: { perArmorCell: 0.6667 },
  cargo: { perExtraRow: 16.6667 },
  store: { perAmount: 1.6667 },
  scanner: { perRange: 0.3333 },
  core: { perHp: 0.3333 },
  utility: { perEffectTurn: 1.6667, perReachTile: 0.6667 },
};

type UnpricedByKind = {
  weapon: Omit<WeaponDef, 'value'>;
  engine: Omit<EngineDef, 'value'>;
  armor: Omit<ArmorDef, 'value'>;
  accessory: Omit<AccessoryDef, 'value'>;
  cargo: Omit<CargoDef, 'value'>;
  store: Omit<StoreDef, 'value'>;
  scanner: Omit<ScannerDef, 'value'>;
  core: Omit<CoreDef, 'value'>;
  utility: Omit<UtilityDef, 'value'>;
};
const m = PART_PRICE_MODIFIERS;
const MODIFIERS: { [K in PartKind]: (def: UnpricedByKind[K]) => number } = {
  weapon: (d) => m.weapon.perDamagePerTurn * sustainedDamage(d) + m.weapon.perRange * d.range,
  engine: (d) => m.engine.perSpeedBonus * d.speedBonus + m.engine.perAccelBonus * d.accelBonus,
  armor: shieldModifier,
  accessory: shieldModifier,
  cargo: (d) => m.cargo.perExtraRow * d.extraRows,
  store: (d) => m.store.perAmount * d.amount,
  scanner: (d) => m.scanner.perRange * d.range,
  core: (d) => m.core.perHp * d.hp,
  utility: (d) => m.utility.perEffectTurn * effectTurns(d.effect) + m.utility.perReachTile * utilityReach(d),
};

function shieldModifier(d: Unpriced<ShieldDef>): number {
  return m.armor.perArmorCell * (d.armor + d.blastArmor) * d.w * d.h;
}

function effectTurns(e: UtilityEffect): number {
  return 'turns' in e ? e.turns : 0;
}

function utilityReach(d: Omit<UtilityDef, 'value'>): number {
  const e = d.effect;
  if ('maxRange' in e) return e.maxRange;
  if (e.type === 'oil') return oilSlickLength();
  return 'radius' in e ? e.radius : 0;
}

export function sustainedDamage(d: Pick<WeaponDef, 'round' | 'rounds' | 'cooldown' | 'magazine' | 'reload'>): number {
  return (d.round.damage * d.rounds * d.magazine) / (d.magazine * d.cooldown + d.reload);
}

function kindModifier<K extends PartKind>(kind: K, def: UnpricedByKind[K]): number {
  return MODIFIERS[kind](def);
}

export function partModifier(def: Unpriced<PartDef>): number {
  return kindModifier(def.kind, def);
}

function pricePart(def: Unpriced<PartDef>): PartDef {
  const value = itemValue(def.base + partModifier(def));
  if (value <= 0) throw new Error(`Part ${def.id} prices at ${value}. Raise its base.`);
  return { ...def, value };
}

const RAM_MOUNTS: EdgeLetter[] = ["F", "B"];

const UNPRICED_PARTS: Record<string, Unpriced<PartDef>> = {
  ...UNPRICED_WEAPONS,
  ...UNPRICED_UTILITIES,
  stockEngine: {
    id: "stockEngine",
    kind: "engine",
    hp: 50,
    base: 50,
    tier: 1,
    w: 2,
    h: 2,
    mass: 360,
    armor: 4,
    tall: false,
    speedBonus: 0,
    accelBonus: 0,
    capacity: 7,
    fuelMult: 1,
    noise: 1,
    heat: 1,
  },
  tunedEngine: {
    id: "tunedEngine",
    kind: "engine",
    hp: 40,
    base: 76.67,
    tier: 2,
    w: 2,
    h: 2,
    mass: 300,
    armor: 4,
    tall: false,
    speedBonus: 1.3,
    accelBonus: 1,
    capacity: 10,
    fuelMult: 1.4,
    noise: 1.3,
    heat: 1.2,
  },
  flatFour: {
    id: "flatFour",
    kind: "engine",
    hp: 36,
    base: 60,
    tier: 1,
    w: 2,
    h: 2,
    mass: 224,
    armor: 2,
    tall: false,
    speedBonus: -1.3,
    accelBonus: 0,
    capacity: 5,
    fuelMult: 0.75,
    noise: 0.7,
    heat: 0.7,
  },
  workhorseDiesel: {
    id: "workhorseDiesel",
    kind: "engine",
    hp: 80,
    base: 90,
    tier: 2,
    w: 2,
    h: 2,
    mass: 320,
    armor: 6,
    tall: false,
    speedBonus: -0.65,
    accelBonus: 0.5,
    capacity: 10,
    fuelMult: 0.7,
    noise: 1.2,
    heat: 0.6,
  },
  racingV6: {
    id: "racingV6",
    kind: "engine",
    hp: 32,
    base: 93.33,
    tier: 2,
    w: 2,
    h: 2,
    mass: 240,
    armor: 2,
    tall: false,
    speedBonus: 1.95,
    accelBonus: 0.5,
    capacity: 8,
    fuelMult: 1.25,
    noise: 1.4,
    heat: 1.6,
  },
  heavyDiesel: {
    id: "heavyDiesel",
    kind: "engine",
    hp: 110,
    base: 156.67,
    tier: 3,
    w: 2,
    h: 2,
    mass: 280,
    armor: 8,
    tall: false,
    speedBonus: -1.3,
    accelBonus: 1.5,
    capacity: 16,
    fuelMult: 1.1,
    noise: 1.5,
    heat: 0.8,
  },
  turbine: {
    id: "turbine",
    kind: "engine",
    hp: 44,
    base: 170,
    tier: 3,
    w: 2,
    h: 2,
    mass: 220,
    armor: 3,
    tall: false,
    speedBonus: 2.6,
    accelBonus: 2,
    capacity: 13,
    fuelMult: 2.2,
    noise: 1.8,
    heat: 2,
  },
  plates: {
    id: "plates",
    kind: "armor",
    hp: 53,
    base: 35.55,
    tier: 2,
    w: 1,
    h: 2,
    mass: 75,
    armor: 12,
    tall: false,
    blastArmor: 12,
    fieldRepair: "capped",
    ramMult: 1,
    look: "plates",
  },
  cage: {
    id: "cage",
    kind: "armor",
    hp: 60,
    base: 43.33,
    tier: 1,
    w: 1,
    h: 2,
    mass: 55,
    armor: 2,
    tall: false,
    blastArmor: 20,
    fieldRepair: "capped",
    ramMult: 1,
    look: "cage",
  },
  ram: {
    id: "ram",
    kind: "accessory",
    hp: 100,
    base: 53.33,
    tier: 2,
    w: 3,
    h: 1,
    mass: 135,
    armor: 8,
    tall: false,
    blastArmor: 8,
    fieldRepair: "capped",
    ramMult: 2,
    look: "ram",
    mounts: RAM_MOUNTS,
  },
  scrapPanels: {
    id: "scrapPanels",
    kind: "armor",
    hp: 44,
    base: 36.67,
    tier: 1,
    w: 1,
    h: 2,
    mass: 80,
    armor: 5,
    tall: false,
    blastArmor: 5,
    fieldRepair: "full",
    ramMult: 1,
    look: "plates",
  },
  ceramicPlates: {
    id: "ceramicPlates",
    kind: "armor",
    hp: 44,
    base: 110,
    tier: 2,
    w: 1,
    h: 2,
    mass: 50,
    armor: 14,
    tall: false,
    blastArmor: 8,
    fieldRepair: "none",
    ramMult: 1,
    look: "plates",
  },
  spacedArmor: {
    id: "spacedArmor",
    kind: "armor",
    hp: 55,
    base: 20,
    tier: 2,
    w: 1,
    h: 2,
    mass: 65,
    armor: 10,
    tall: false,
    blastArmor: 28,
    fieldRepair: "capped",
    ramMult: 1,
    look: "plates",
  },
  reinforcedCage: {
    id: "reinforcedCage",
    kind: "armor",
    hp: 86,
    base: 37.78,
    tier: 2,
    w: 1,
    h: 2,
    mass: 60,
    armor: 4,
    tall: false,
    blastArmor: 26,
    fieldRepair: "capped",
    ramMult: 1.2,
    look: "cage",
  },
  plowRam: {
    id: "plowRam",
    kind: "accessory",
    hp: 170,
    base: 126.67,
    tier: 3,
    w: 3,
    h: 1,
    mass: 126,
    armor: 10,
    tall: false,
    blastArmor: 10,
    fieldRepair: "none",
    ramMult: 2.8,
    look: "ram",
    mounts: RAM_MOUNTS,
  },
  claymoreRam: {
    id: "claymoreRam",
    kind: "accessory",
    hp: 80,
    base: 100,
    tier: 2,
    w: 3,
    h: 1,
    mass: 380,
    armor: 14,
    tall: false,
    blastArmor: 6,
    fieldRepair: "capped",
    ramMult: 1.5,
    look: "ram",
    mounts: RAM_MOUNTS,
    claymore: CLAYMORE,
  },
  steelPlate: {
    id: "steelPlate",
    kind: "armor",
    hp: 28,
    base: 50,
    tier: 2,
    w: 1,
    h: 1,
    mass: 40,
    armor: 12,
    tall: false,
    blastArmor: 12,
    fieldRepair: "capped",
    ramMult: 1,
    look: "plates",
  },
  scrapSheet: {
    id: "scrapSheet",
    kind: "armor",
    hp: 22,
    base: 26.67,
    tier: 1,
    w: 1,
    h: 1,
    mass: 40,
    armor: 5,
    tall: false,
    blastArmor: 5,
    fieldRepair: "full",
    ramMult: 1,
    look: "plates",
  },
  ceramicTile: {
    id: "ceramicTile",
    kind: "armor",
    hp: 22,
    base: 66.67,
    tier: 2,
    w: 1,
    h: 1,
    mass: 25,
    armor: 14,
    tall: false,
    blastArmor: 8,
    fieldRepair: "none",
    ramMult: 1,
    look: "plates",
  },
  spacedTile: {
    id: "spacedTile",
    kind: "armor",
    hp: 28,
    base: 50,
    tier: 2,
    w: 1,
    h: 1,
    mass: 33,
    armor: 10,
    tall: false,
    blastArmor: 28,
    fieldRepair: "capped",
    ramMult: 1,
    look: "plates",
  },
  cageSection: {
    id: "cageSection",
    kind: "armor",
    hp: 30,
    base: 26.67,
    tier: 1,
    w: 1,
    h: 1,
    mass: 27.5,
    armor: 2,
    tall: false,
    blastArmor: 20,
    fieldRepair: "capped",
    ramMult: 1,
    look: "cage",
  },
  reinforcedSection: {
    id: "reinforcedSection",
    kind: "armor",
    hp: 43,
    base: 50,
    tier: 2,
    w: 1,
    h: 1,
    mass: 30,
    armor: 4,
    tall: false,
    blastArmor: 26,
    fieldRepair: "capped",
    ramMult: 1.2,
    look: "cage",
  },
  spikeCluster: {
    id: "spikeCluster",
    kind: "accessory",
    hp: 20,
    base: 30,
    tier: 1,
    w: 1,
    h: 1,
    mass: 30,
    armor: 3,
    tall: false,
    blastArmor: 3,
    fieldRepair: "full",
    ramMult: 1.5,
    look: "spikes",
    mounts: ["F", "B", "L", "R"],
  },
  spikeStrip: {
    id: "spikeStrip",
    kind: "accessory",
    hp: 40,
    base: 45,
    tier: 1,
    w: 1,
    h: 2,
    mass: 60,
    armor: 3,
    tall: false,
    blastArmor: 3,
    fieldRepair: "full",
    ramMult: 1.5,
    look: "spikes",
    mounts: ["F", "B", "L", "R"],
  },
  rack: {
    id: "rack",
    kind: "cargo",
    hp: 30,
    base: 33.33,
    tier: 1,
    w: 2,
    h: 1,
    mass: 60,
    armor: 1,
    tall: false,
    extraRows: 2,
    look: "rack",
  },
  trailerBox: {
    id: "trailerBox",
    kind: "cargo",
    hp: 60,
    base: 36.67,
    tier: 2,
    w: 2,
    h: 2,
    mass: 135,
    armor: 1,
    tall: true,
    extraRows: 5,
    look: "box",
  },
  panniers: {
    id: "panniers",
    kind: "cargo",
    hp: 20,
    base: 16.67,
    tier: 1,
    w: 1,
    h: 1,
    mass: 60,
    armor: 1,
    tall: false,
    extraRows: 1,
    look: "box",
  },
  flatbed: {
    id: "flatbed",
    kind: "cargo",
    hp: 50,
    base: 33.33,
    tier: 1,
    w: 2,
    h: 1,
    mass: 120,
    armor: 1,
    tall: false,
    extraRows: 2,
    look: "rack",
  },
  lightFrame: {
    id: "lightFrame",
    kind: "cargo",
    hp: 24,
    base: 43.33,
    tier: 2,
    w: 2,
    h: 2,
    mass: 90,
    armor: 1,
    tall: false,
    extraRows: 5,
    look: "rack",
  },
  enclosedFrame: {
    id: "enclosedFrame",
    kind: "cargo",
    hp: 110,
    base: 50,
    tier: 2,
    w: 2,
    h: 2,
    mass: 165,
    armor: 8,
    tall: true,
    extraRows: 5,
    look: "box",
  },
  heavyFrame: {
    id: "heavyFrame",
    kind: "cargo",
    hp: 90,
    base: 60,
    tier: 3,
    w: 2,
    h: 2,
    mass: 150,
    armor: 3,
    tall: true,
    extraRows: 6,
    look: "box",
  },
  jerrycans: {
    id: "jerrycans",
    kind: "store",
    hp: 30,
    base: 23.33,
    tier: 1,
    w: 1,
    h: 1,
    mass: 70,
    armor: 1,
    tall: false,
    holds: "fuel",
    amount: 12,
  },
  supplyLocker: {
    id: "supplyLocker",
    kind: "store",
    hp: 30,
    base: 26.67,
    tier: 1,
    w: 1,
    h: 1,
    mass: 60,
    armor: 2,
    tall: false,
    holds: "supplies",
    amount: 10,
  },
  cab: {
    id: "cab", kind: "core", hp: 120, base: 26.67, tier: 1, w: 1, h: 2, mass: 80, armor: 3, tall: true, role: "cab",
  },
  cabPickup: {
    id: "cabPickup", kind: "core", hp: 120, base: 26.67, tier: 1, w: 3, h: 2, mass: 80, armor: 3, tall: true, role: "cab",
  },
  cabHardtop: {
    id: "cabHardtop", kind: "core", hp: 120, base: 26.67, tier: 1, w: 3, h: 2, mass: 80, armor: 3, tall: true, role: "cab",
  },
  transmission: {
    id: "transmission", kind: "core", hp: 40, base: 36.67, tier: 1, w: 2, h: 2, mass: 60, armor: 3, tall: false, role: "transmission",
  },
  transmissionMid: {
    id: "transmissionMid", kind: "core", hp: 60, base: 36.67, tier: 1, w: 2, h: 2, mass: 60, armor: 4, tall: false, role: "transmission",
  },
  transmissionHeavy: {
    id: "transmissionHeavy", kind: "core", hp: 90, base: 36.67, tier: 1, w: 2, h: 2, mass: 60, armor: 6, tall: false, role: "transmission",
  },
  wheel: {
    id: "wheel", kind: "core", hp: 30, base: 3.33, tier: 1, w: 1, h: 2, mass: 25, armor: 2, tall: false, role: "wheel",
  },
  wheelMid: {
    id: "wheelMid", kind: "core", hp: 50, base: 3.33, tier: 1, w: 1, h: 2, mass: 25, armor: 3, tall: false, role: "wheel",
  },
  wheelHeavy: {
    id: "wheelHeavy", kind: "core", hp: 80, base: 3.33, tier: 1, w: 1, h: 2, mass: 25, armor: 5, tall: false, role: "wheel",
  },
  tank: {
    id: "tank", kind: "core", hp: 30, base: 10, tier: 1, w: 1, h: 2, mass: 30, armor: 1, tall: false, role: "tank",
  },
  tankLong: {
    id: "tankLong", kind: "core", hp: 30, base: 10, tier: 1, w: 1, h: 2, mass: 30, armor: 1, tall: false, role: "tank",
  },
  tankMid: {
    id: "tankMid", kind: "core", hp: 50, base: 10, tier: 1, w: 1, h: 2, mass: 30, armor: 3, tall: false, role: "tank",
  },
  tankHeavy: {
    id: "tankHeavy", kind: "core", hp: 80, base: 10, tier: 1, w: 1, h: 2, mass: 30, armor: 6, tall: false, role: "tank",
  },
  scanner: {
    id: "scanner",
    kind: "scanner",
    hp: 30,
    base: 63.33,
    tier: 2,
    w: 1,
    h: 1,
    mass: 30,
    armor: 2,
    tall: false,
    range: 160,
  },
};

export const PARTS: Record<string, PartDef> = Object.fromEntries(
  Object.entries(UNPRICED_PARTS).map(([id, def]) => [id, pricePart(scaleMass(def))]),
);

function scaleMass(def: Unpriced<PartDef>): Unpriced<PartDef> {
  if (def.kind === "armor" || def.kind === "accessory") return { ...def, mass: def.mass * MASS_SCALE.armor };
  if (def.kind === "weapon") return { ...def, mass: def.mass * MASS_SCALE.weapon };
  return def;
}

export function partDef(id: string): PartDef {
  const def = PARTS[id];
  if (!def) throw new Error(`Unknown part ${id}`);
  return def;
}
