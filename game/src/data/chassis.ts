
import type { Tier } from './market';
import { PARTS } from './parts';

export type AbilityId = 'bed' | 'nimble' | 'racing' | 'offRoad' | 'armored' | 'gunMounts' | 'battle' | 'springs' | 'openTop' | 'tourer' | 'trailer';

export type ChassisAbility = {
  id: AbilityId;
  bedRows?: number;
  accel?: number;
  topSpeed?: number;
  nimble?: number;
  offRoadCut?: number;
  offRoadWear?: number;
  partArmor?: number;
  deckArmor?: number;
  gunPower?: number;
  mountedMass?: number;
  sight?: number;
  range?: number;
  arc?: number;
  reloadCut?: number;
  cargoRows?: number;
};

export const CHASSIS_FEATURES: Record<string, ChassisAbility> = {
  scout: { id: 'bed', bedRows: 1 },
  buggy: { id: 'nimble', accel: 1.25, nimble: 0.0785 },
  courier: { id: 'racing', topSpeed: 1.25 },
  jeep: { id: 'offRoad', offRoadCut: 1, offRoadWear: 0.5 },
  hauler: { id: 'bed', bedRows: 2 },
  wagon: { id: 'gunMounts', gunPower: 1.25 },
  van: { id: 'armored', partArmor: 1 },
  convertible: { id: 'openTop', sight: 1.2, range: 1.2 },
  bus: { id: 'springs', mountedMass: 0.5 },
  niva: { id: 'offRoad', offRoadCut: 1, offRoadWear: 0.5 },
  bukhanka: { id: 'armored', partArmor: 2 },
  longbed: { id: 'bed', bedRows: 3 },
  carrier: { id: 'armored', partArmor: 4 },
  tractor: { id: 'battle', partArmor: 2, gunPower: 1.25 },
  loader: { id: 'gunMounts', gunPower: 1.5 },
  lincoln: { id: 'tourer', sight: 1.25, range: 1.15, topSpeed: 1.15 },
  sorokonoga: { id: 'trailer', arc: 30, reloadCut: 1, cargoRows: 1.5, deckArmor: 1 },
};

export type ChassisDef = {
  id: string;
  maxSpeed: number;
  accel: number;
  brake: number;
  turnSlow: number;
  turnFast: number;
  reverseTurn: number;
  mass: number;
  handlingMass: number;
  ratedMass: number;
  radius: number;
  layout: string[];
  core: { defId: string; x: number; y: number; rot?: 0 | 1 }[];
  fuelCap: number;
  fuelPerTile: number;
  base: number;
  value: number;
  showsCores: boolean;
  showsEngine: boolean;
  tier: Tier;
  coupling?: { row: number };
  look: 'pickup' | 'hauler' | 'buggy' | 'wagon' | 'courier' | 'van' | 'longbed' | 'carrier' | 'tractor' | 'jeep' | 'convertible' | 'bus' | 'loader' | 'niva' | 'bukhanka' | 'lincoln' | 'semi' | 'sorokonoga';
};

export const CHASSIS_PRICE_MODIFIERS = { perDeckCell: 2000, perArmorCell: 1000, perTopSpeed: 2666.67 };

export type ChassisInput = Omit<ChassisDef, 'value' | 'ratedMass'>;

export function chassisModifier(def: ChassisInput): number {
  const cells = def.layout.join('');
  const count = (marks: string) => [...cells].filter((c) => marks.includes(c)).length;
  const m = CHASSIS_PRICE_MODIFIERS;
  return m.perDeckCell * count('D') + m.perArmorCell * count('FBLR') + m.perTopSpeed * def.maxSpeed;
}

export const RATED_KIT = { engine: 'stockEngine', armorKgPerCell: 100, gun: 'mg', gunDeckShare: 0.5 };

export function ratedMassOf(def: ChassisInput): number {
  const cells = def.layout.join('');
  const count = (marks: string) => [...cells].filter((c) => marks.includes(c)).length;
  const core = def.core.reduce((sum, c) => sum + PARTS[c.defId].mass, 0);
  const guns = Math.ceil(count('D') * RATED_KIT.gunDeckShare);
  return def.mass + core + PARTS[RATED_KIT.engine].mass + count('FBLR') * RATED_KIT.armorKgPerCell + guns * PARTS[RATED_KIT.gun].mass;
}

function finishChassis(def: ChassisInput): ChassisDef {
  const value = Math.round(def.base + chassisModifier(def));
  if (value <= 0) throw new Error(`Chassis ${def.id} prices at ${value}. Raise its base.`);
  return { ...def, value, ratedMass: ratedMassOf(def) };
}

const CHASSIS_INPUTS: Record<string, ChassisInput> = {
  scout: {
    id: 'scout',
    maxSpeed: 7.8,
    accel: 2,
    brake: 3,
    turnSlow: 110,
    turnFast: 40,
    reverseTurn: 60,
    mass: 680,
    handlingMass: 2100,
    radius: 0.6,
    layout: [' FFFFF ', 'L.....R', 'LXEEDXR', 'LXEEDXR', 'LDXXXDR', 'LDXXXDR', 'LXXXXXR', 'LXXXXXR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 4 },
      { defId: 'transmission', x: 2, y: 6 },
      { defId: 'tank', x: 4, y: 6 },
      { defId: 'wheel', x: 1, y: 2 },
      { defId: 'wheel', x: 5, y: 2 },
      { defId: 'wheel', x: 1, y: 6 },
      { defId: 'wheel', x: 5, y: 6 },
    ],
    fuelCap: 40,
    fuelPerTile: 0.25,
    base: 22667, showsCores: true, showsEngine: true, tier: 1,
    look: 'pickup',
  },
  hauler: {
    id: 'hauler',
    maxSpeed: 5.2,
    accel: 1,
    brake: 2,
    turnSlow: 80,
    turnFast: 25,
    reverseTurn: 45,
    mass: 2730,
    handlingMass: 5800,
    radius: 0.8,
    layout: [' FFFFFFF ', 'L.......R', 'LXDEEXXXR', 'LXDEEXXXR', 'LDDXXXXDR', 'LDDXXDDDR', 'LDDDDDDDR', 'LXDDDXDXR', 'LXDDDXDXR', 'L.......R', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 5, y: 2, rot: 1 },
      { defId: 'transmissionMid', x: 3, y: 4 },
      { defId: 'tankMid', x: 5, y: 7 },
      { defId: 'wheelMid', x: 1, y: 2 },
      { defId: 'wheelMid', x: 7, y: 2 },
      { defId: 'wheelMid', x: 1, y: 7 },
      { defId: 'wheelMid', x: 7, y: 7 },
    ],
    fuelCap: 80,
    fuelPerTile: 0.4,
    base: 26667, showsCores: false, showsEngine: true, tier: 2,
    look: 'hauler',
  },
  buggy: {
    id: 'buggy',
    maxSpeed: 9.1,
    accel: 3,
    brake: 3,
    turnSlow: 120,
    turnFast: 45,
    reverseTurn: 90,
    mass: 230,
    handlingMass: 900,
    radius: 0.5,
    layout: [' FFFFF ', 'L.....R', 'LXEE.XR', 'LXEE.XR', 'LDDXX.R', 'LDDXX.R', 'LXXX.XR', 'LXXX.XR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cab', x: 3, y: 4 },
      { defId: 'transmission', x: 2, y: 6 },
      { defId: 'tank', x: 4, y: 4 },
      { defId: 'wheel', x: 1, y: 2 },
      { defId: 'wheel', x: 5, y: 2 },
      { defId: 'wheel', x: 1, y: 6 },
      { defId: 'wheel', x: 5, y: 6 },
    ],
    fuelCap: 30,
    fuelPerTile: 0.2,
    base: 6000, showsCores: false, showsEngine: false, tier: 1,
    look: 'buggy',
  },
  wagon: {
    id: 'wagon',
    maxSpeed: 3.9,
    accel: 1,
    brake: 2,
    turnSlow: 70,
    turnFast: 25,
    reverseTurn: 45,
    mass: 2130,
    handlingMass: 3700,
    radius: 0.8,
    layout: [' FFFFFFF ', 'L.......R', 'LXDXXXDXR', 'LXDXXXDXR', 'LDEEDDXDR', 'LDEEDDXDR', 'LDDDXXDDR', 'LXDDXXDXR', 'LXDDDDDXR', 'L.......R', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 3, y: 2 },
      { defId: 'transmissionHeavy', x: 4, y: 6 },
      { defId: 'tankHeavy', x: 6, y: 4 },
      { defId: 'wheelHeavy', x: 1, y: 2 },
      { defId: 'wheelHeavy', x: 7, y: 2 },
      { defId: 'wheelHeavy', x: 1, y: 7 },
      { defId: 'wheelHeavy', x: 7, y: 7 },
    ],
    fuelCap: 60,
    fuelPerTile: 0.4,
    base: 8333, showsCores: true, showsEngine: true, tier: 2,
    look: 'wagon',
  },
  courier: {
    id: 'courier', maxSpeed: 9.75, accel: 3, brake: 3, turnSlow: 125, turnFast: 42, reverseTurn: 80,
    mass: 280, handlingMass: 1100, radius: 0.5,
    layout: [' FFFFF ', 'L.....R', 'LX.XXXR', 'LX.XXXR', 'LDEE.XR', 'LDEE.XR', 'LDXX.DR', 'LXDD.XR', 'LXDD.XR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cab', x: 2, y: 6, rot: 1 },
      { defId: 'transmission', x: 3, y: 2 },
      { defId: 'tank', x: 5, y: 4 },
      { defId: 'wheel', x: 1, y: 2 },
      { defId: 'wheel', x: 5, y: 2 },
      { defId: 'wheel', x: 1, y: 7 },
      { defId: 'wheel', x: 5, y: 7 },
    ],
    fuelCap: 24, fuelPerTile: 0.18, base: 7333, showsCores: true, showsEngine: true, tier: 1, look: 'courier',
  },
  van: {
    id: 'van', maxSpeed: 6.5, accel: 1.5, brake: 3, turnSlow: 100, turnFast: 35, reverseTurn: 65,
    mass: 1100, handlingMass: 3000, radius: 0.7,
    layout: [' FFFFF ', 'L.....R', 'LXEEDXR', 'LXEEDXR', 'LDXXDDR', 'LDXXDDR', 'LDXXDDR', 'LXXXXXR', 'LXXXXXR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 4, rot: 1 },
      { defId: 'transmissionMid', x: 2, y: 7 },
      { defId: 'tankMid', x: 4, y: 7 },
      { defId: 'wheelMid', x: 1, y: 2 },
      { defId: 'wheelMid', x: 5, y: 2 },
      { defId: 'wheelMid', x: 1, y: 7 },
      { defId: 'wheelMid', x: 5, y: 7 },
    ],
    fuelCap: 55, fuelPerTile: 0.24, base: 35333, showsCores: false, showsEngine: true, tier: 2, look: 'van',
  },
  longbed: {
    id: 'longbed', maxSpeed: 4.55, accel: 0.8, brake: 1.8, turnSlow: 70, turnFast: 20, reverseTurn: 40,
    mass: 2900, handlingMass: 7200, radius: 0.95,
    layout: [' FFFFFFF ', 'L.......R', 'LXDEEDDXR', 'LXDEEDDXR', 'LDDXXXDDR', 'LDDXXXDDR', 'LDDDDDDDR', 'LDDXXXDDR', 'LDDXXXDDR', 'LXDDDDDXR', 'LXDDDDDXR', 'L.......R', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 3, y: 4 },
      { defId: 'transmissionHeavy', x: 3, y: 7 },
      { defId: 'tankHeavy', x: 5, y: 7 },
      { defId: 'wheelHeavy', x: 1, y: 2 },
      { defId: 'wheelHeavy', x: 7, y: 2 },
      { defId: 'wheelHeavy', x: 1, y: 9 },
      { defId: 'wheelHeavy', x: 7, y: 9 },
    ],
    fuelCap: 100, fuelPerTile: 0.48, base: 53333, showsCores: false, showsEngine: true, tier: 3, look: 'longbed',
  },
  carrier: {
    id: 'carrier', maxSpeed: 5.2, accel: 1, brake: 2.5, turnSlow: 75, turnFast: 28, reverseTurn: 50,
    mass: 3200, handlingMass: 5200, radius: 0.85,
    layout: [' FFFFFFF ', 'L.......R', 'LXDXXD.XR', 'LXDXXD.XR', 'LDEEXX.DR', 'LDEEXX.DR', 'LDDDXX.DR', 'LXDDXX.XR', 'LXDDDD.XR', 'L.......R', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 4, y: 4, rot: 1 },
      { defId: 'transmissionHeavy', x: 3, y: 2 },
      { defId: 'tankHeavy', x: 4, y: 7, rot: 1 },
      { defId: 'wheelHeavy', x: 1, y: 2 },
      { defId: 'wheelHeavy', x: 7, y: 2 },
      { defId: 'wheelHeavy', x: 1, y: 7 },
      { defId: 'wheelHeavy', x: 7, y: 7 },
    ],
    fuelCap: 70, fuelPerTile: 0.5, base: 80667, showsCores: false, showsEngine: true, tier: 3, look: 'carrier',
  },
  tractor: {
    id: 'tractor', maxSpeed: 3.9, accel: 1.8, brake: 2, turnSlow: 65, turnFast: 22, reverseTurn: 55,
    mass: 3600, handlingMass: 6500, radius: 0.9,
    layout: [' FFFFFFF ', 'L.......R', 'LXDEEDDXR', 'LXDEEDDXR', 'LDDXXXDDR', 'LDDXXXDDR', 'LDDDDXDDR', 'LXDXXXDXR', 'LXDXXDDXR', 'L.......R', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 3, y: 4 },
      { defId: 'transmissionHeavy', x: 3, y: 7 },
      { defId: 'tankHeavy', x: 5, y: 6 },
      { defId: 'wheelHeavy', x: 1, y: 2 },
      { defId: 'wheelHeavy', x: 7, y: 2 },
      { defId: 'wheelHeavy', x: 1, y: 7 },
      { defId: 'wheelHeavy', x: 7, y: 7 },
    ],
    fuelCap: 120, fuelPerTile: 0.6, base: 53667, showsCores: false, showsEngine: true, tier: 3, look: 'tractor',
  },
  jeep: {
    id: 'jeep', maxSpeed: 8.2, accel: 2.5, brake: 3, turnSlow: 115, turnFast: 42, reverseTurn: 80,
    mass: 450, handlingMass: 1400, radius: 0.55,
    layout: [' FFFFF ', 'L.....R', 'LX.XXXR', 'LX.XXXR', 'LD.XDDR', 'LD.XDDR', 'LX.EEXR', 'LX.EEXR', 'LD.XXDR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cab', x: 3, y: 4 },
      { defId: 'transmission', x: 3, y: 2 },
      { defId: 'tank', x: 3, y: 8, rot: 1 },
      { defId: 'wheel', x: 1, y: 2 },
      { defId: 'wheel', x: 5, y: 2 },
      { defId: 'wheel', x: 1, y: 6 },
      { defId: 'wheel', x: 5, y: 6 },
    ],
    fuelCap: 35, fuelPerTile: 0.2, base: 7000, showsCores: false, showsEngine: true, tier: 1, look: 'jeep',
  },
  convertible: {
    id: 'convertible', maxSpeed: 9.4, accel: 2.5, brake: 3, turnSlow: 110, turnFast: 40, reverseTurn: 70,
    mass: 750, handlingMass: 2000, radius: 0.6,
    layout: [' FFFFF ', 'L.....R', 'LXXXXXR', 'LXXXXXR', 'LDXXDDR', 'LDXXDDR', 'LDXXDDR', 'LXEEDXR', 'LXEEDXR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cabHardtop', x: 2, y: 4, rot: 1 },
      { defId: 'transmission', x: 2, y: 2 },
      { defId: 'tankLong', x: 4, y: 2 },
      { defId: 'wheel', x: 1, y: 2 },
      { defId: 'wheel', x: 5, y: 2 },
      { defId: 'wheel', x: 1, y: 7 },
      { defId: 'wheel', x: 5, y: 7 },
    ],
    fuelCap: 45, fuelPerTile: 0.26, base: 24667, showsCores: false, showsEngine: true, tier: 2, look: 'convertible',
  },
  bus: {
    id: 'bus', maxSpeed: 5.5, accel: 0.9, brake: 2, turnSlow: 65, turnFast: 22, reverseTurn: 40,
    mass: 3000, handlingMass: 6800, radius: 0.9,
    layout: [' FFFFFFF ', 'L.......R', 'LXXXXD.XR', 'LXXXXD.XR', 'LDDDDD.DR', 'LDDDDD.DR', 'LDDDDD.DR', 'LDDXXXXDR', 'LDDXX..DR', 'LDDEED.DR', 'LXDEED.XR', 'LXDDDD.XR', 'L.......R', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 2 },
      { defId: 'transmissionMid', x: 3, y: 7 },
      { defId: 'tankMid', x: 5, y: 7, rot: 1 },
      { defId: 'wheelMid', x: 1, y: 2 },
      { defId: 'wheelMid', x: 7, y: 2 },
      { defId: 'wheelMid', x: 1, y: 10 },
      { defId: 'wheelMid', x: 7, y: 10 },
    ],
    fuelCap: 110, fuelPerTile: 0.45, base: 2000, showsCores: false, showsEngine: true, tier: 2, look: 'bus',
  },
  loader: {
    id: 'loader', maxSpeed: 3.6, accel: 1.6, brake: 2.5, turnSlow: 85, turnFast: 30, reverseTurn: 60,
    mass: 4200, handlingMass: 7000, radius: 0.9,
    layout: [' FFFFFFF ', 'L.......R', 'LXDDDDDXR', 'LXXXDDDXR', 'LDXXXXDDR', 'LDXXXXDDR', 'LDXEEDDDR', 'LXXEEDDXR', 'LXDDDDDXR', 'L.......R', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 3, rot: 1 },
      { defId: 'transmissionHeavy', x: 4, y: 4 },
      { defId: 'tankHeavy', x: 2, y: 6 },
      { defId: 'wheelHeavy', x: 1, y: 2 },
      { defId: 'wheelHeavy', x: 7, y: 2 },
      { defId: 'wheelHeavy', x: 1, y: 7 },
      { defId: 'wheelHeavy', x: 7, y: 7 },
    ],
    fuelCap: 130, fuelPerTile: 0.65, base: 78000, showsCores: false, showsEngine: true, tier: 3, look: 'loader',
  },
  niva: {
    id: 'niva', maxSpeed: 7.6, accel: 2.2, brake: 3, turnSlow: 115, turnFast: 40, reverseTurn: 80,
    mass: 520, handlingMass: 1700, radius: 0.55,
    layout: [' FFFFF ', 'L.....R', 'LX.EEXR', 'LX.EEXR', 'LD.XDDR', 'LD.XDDR', 'LDX.DDR', 'LDX.DDR', 'LX.XXXR', 'LX.XXXR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cab', x: 3, y: 4 },
      { defId: 'transmissionMid', x: 3, y: 8 },
      { defId: 'tank', x: 2, y: 6 },
      { defId: 'wheelMid', x: 1, y: 2 },
      { defId: 'wheelMid', x: 5, y: 2 },
      { defId: 'wheelMid', x: 1, y: 8 },
      { defId: 'wheelMid', x: 5, y: 8 },
    ],
    fuelCap: 42, fuelPerTile: 0.21, base: 30667, showsCores: false, showsEngine: true, tier: 2, look: 'niva',
  },
  bukhanka: {
    id: 'bukhanka', maxSpeed: 6.0, accel: 1.4, brake: 2.5, turnSlow: 95, turnFast: 30, reverseTurn: 60,
    mass: 1250, handlingMass: 3300, radius: 0.65,
    layout: [' FFFFF ', 'L.....R', 'LXXXXXR', 'LXXXXXR', 'LDEEDDR', 'LDEEDDR', 'LDDDDDR', 'LDXXXDR', 'LXXXXXR', 'LXDDDXR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 2 },
      { defId: 'transmissionMid', x: 2, y: 7 },
      { defId: 'tankMid', x: 4, y: 7 },
      { defId: 'wheelMid', x: 1, y: 2 },
      { defId: 'wheelMid', x: 5, y: 2 },
      { defId: 'wheelMid', x: 1, y: 8 },
      { defId: 'wheelMid', x: 5, y: 8 },
    ],
    fuelCap: 78, fuelPerTile: 0.30, base: 37000, showsCores: false, showsEngine: true, tier: 2, look: 'bukhanka',
  },
  lincoln: {
    id: 'lincoln', maxSpeed: 8.6, accel: 2.0, brake: 2.2, turnSlow: 80, turnFast: 26, reverseTurn: 45,
    mass: 900, handlingMass: 2400, radius: 0.85,
    layout: [' FFFFF ', 'L.....R', 'LXDDDXR', 'LXEEDXR', 'LDEEDDR', 'LDXXDDR', 'LDXXDDR', 'LDXXDDR', 'LDXXXDR', 'LXXXXXR', 'LXDDDXR', 'L.....R', ' BBBBB '],
    core: [
      { defId: 'cabHardtop', x: 2, y: 5, rot: 1 },
      { defId: 'transmission', x: 2, y: 8 },
      { defId: 'tankLong', x: 4, y: 8 },
      { defId: 'wheel', x: 1, y: 2 },
      { defId: 'wheel', x: 5, y: 2 },
      { defId: 'wheel', x: 1, y: 9 },
      { defId: 'wheel', x: 5, y: 9 },
    ],
    fuelCap: 85, fuelPerTile: 0.36, base: 46000, showsCores: false, showsEngine: true, tier: 3, look: 'lincoln',
  },
  semi: {
    id: 'semi', maxSpeed: 6.0, accel: 0.8, brake: 1.5, turnSlow: 60, turnFast: 18, reverseTurn: 30,
    mass: 9000, handlingMass: 14100, radius: 1.2,
    layout: [
      ' FFFFFFF ',
      'L.......R',
      'LCCCCCCCR',
      'LXCEEECXR',
      'LXCEEECXR',
      'LCCCCCCCR',
      'LCCXXXCCR',
      'LCCXXXCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCXXXCCR',
      'LCCXXXCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LXCCCCCXR',
      'LXCCCCCXR',
      'L.......R',
      ' BBBBBBB ',
    ],
    core: [
      { defId: 'cabPickup', x: 3, y: 6 },
      { defId: 'transmissionMid', x: 3, y: 10 },
      { defId: 'tankMid', x: 5, y: 10 },
      { defId: 'wheelMid', x: 1, y: 3 },
      { defId: 'wheelMid', x: 7, y: 3 },
      { defId: 'wheelMid', x: 1, y: 27 },
      { defId: 'wheelMid', x: 7, y: 27 },
    ],
    fuelCap: 160, fuelPerTile: 0.5, base: 52000, showsCores: false, showsEngine: true, tier: 3, coupling: { row: 12 }, look: 'semi',
  },
  sorokonoga: {
    id: 'sorokonoga', maxSpeed: 3.4, accel: 0.7, brake: 1.6, turnSlow: 75, turnFast: 24, reverseTurn: 25,
    mass: 4100, handlingMass: 8400, radius: 1.0,
    layout: [
      ' FFFFFFF ',
      'L.......R',
      'LX.....XR',
      'LX.XXX.XR',
      'L..XXX..R',
      'L.EEXXX.R',
      'L.EEXXX.R',
      'L.......R',
      'LDDDDDDDR',
      'LDDDDDDDR',
      'LDDDDDDDR',
      'L.......R',
      'L.......R',
      'LDDDDDDDR',
      'LX.DDD.XR',
      'LX.DDD.XR',
      'L.......R',
      ' BBBBBBB ',
    ],
    core: [
      { defId: 'cabPickup', x: 3, y: 3 },
      { defId: 'transmissionHeavy', x: 4, y: 5 },
      { defId: 'tankHeavy', x: 6, y: 5 },
      { defId: 'wheelHeavy', x: 1, y: 2 },
      { defId: 'wheelHeavy', x: 7, y: 2 },
      { defId: 'wheelHeavy', x: 1, y: 14 },
      { defId: 'wheelHeavy', x: 7, y: 14 },
    ],
    fuelCap: 140, fuelPerTile: 0.55, base: 53500, showsCores: false, showsEngine: true, tier: 3, coupling: { row: 8 }, look: 'sorokonoga',
  },
};

export const CHASSIS: Record<string, ChassisDef> = Object.fromEntries(
  Object.entries(CHASSIS_INPUTS).map(([id, def]) => [id, finishChassis(def)]),
);

export const PLAYER_CHASSIS = ['scout', 'hauler', 'courier', 'van', 'longbed', 'carrier', 'tractor', 'jeep', 'convertible', 'bus', 'loader', 'niva', 'bukhanka', 'lincoln', 'buggy', 'wagon', 'sorokonoga'];

export const TOWN_CHASSIS: Record<string, readonly string[]> = {
  bowl: ['scout', 'buggy', 'courier', 'van', 'hauler', 'bus', 'convertible', 'longbed', 'tractor', 'loader', 'sorokonoga'],
  nose: ['scout', 'buggy', 'courier', 'jeep', 'niva', 'bukhanka', 'wagon', 'carrier', 'lincoln'],
};

export const HAULER_CHASSIS = 'semi';

const knownDefs = new Map<string, ChassisDef>();

export function chassisDef(id: string): ChassisDef {
  const known = knownDefs.get(id);
  if (known) return known;
  const def = CHASSIS[id];
  if (!def) throw new Error(`Unknown chassis ${id}`);
  knownDefs.set(id, def);
  return def;
}

const ABILITY_FACTORS = ['accel', 'topSpeed', 'gunPower', 'mountedMass', 'sight', 'range', 'cargoRows'] as const;

const valueOr = (value: number | undefined, fallback: number): number => value ?? fallback;

function checkAbility(chassisId: string, ability: ChassisAbility): void {
  if (!CHASSIS[chassisId]) throw new Error(`Ability row ${chassisId} is not a chassis`);
  if (ABILITY_FACTORS.some((key) => valueOr(ability[key], 1) <= 0)) throw new Error(`${chassisId} has a factor of 0 or less`);
  if (valueOr(ability.range, 1) > valueOr(ability.sight, 1)) throw new Error(`${chassisId} outreaches its sight`);
  if (valueOr(ability.arc, 0) > 360) throw new Error(`${chassisId} has an arc bonus above 360`);
  if (valueOr(ability.reloadCut, 0) < 0) throw new Error(`${chassisId} lengthens the reload`);
}

function checkAbilities(): void {
  for (const [chassisId, ability] of Object.entries(CHASSIS_FEATURES)) checkAbility(chassisId, ability);
}

checkAbilities();

export type Paint = { top: number; side: number; cab: number; cabSide: number };

export const PALETTE_IDS = ['tan', 'olive', 'sand', 'chalk', 'umber', 'oxblood', 'bottle', 'slate', 'petrol'] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export const PALETTE: Record<PaletteId, number> = {
  tan: 0x9c7a3e,
  olive: 0x7e8a5a,
  sand: 0xc8a46c,
  chalk: 0xf0ece2,
  umber: 0x6a4430,
  oxblood: 0x5a2026,
  bottle: 0x2c4636,
  slate: 0x4a5060,
  petrol: 0x1e5258,
};

export type TruckPaint = { body: PaletteId; cab: PaletteId; gear: PaletteId };

export const PAINT_SLOTS = ['body', 'cab', 'gear'] as const satisfies readonly (keyof TruckPaint)[];

export const PAINT = {
  share: 0.05,
  standard: { body: 'tan', cab: 'olive', gear: 'tan' } as const satisfies TruckPaint,
  minApart: 15,
  minBetween: 15,
  earthHue: [15, 120] as const,
  earthChroma: 40,
  coolChroma: 20,
  paleLight: 60,
  paleMinHue: 60,
  minLight: 20,
  maxLight: 95,
  schemeContrast: 20,
};

export const PAINT_SCHEMES: readonly TruckPaint[] = [
  PAINT.standard,
  { body: 'sand', cab: 'umber', gear: 'umber' },
  { body: 'bottle', cab: 'sand', gear: 'bottle' },
  { body: 'slate', cab: 'chalk', gear: 'slate' },
  { body: 'oxblood', cab: 'sand', gear: 'umber' },
  { body: 'petrol', cab: 'chalk', gear: 'petrol' },
];

export function isPaletteId(id: unknown): id is PaletteId {
  return typeof id === 'string' && (PALETTE_IDS as readonly string[]).includes(id);
}

export function isTruckPaint(x: unknown): x is TruckPaint {
  if (typeof x !== 'object' || x === null) return false;
  const paint = x as Record<string, unknown>;
  return PAINT_SLOTS.every((slot) => isPaletteId(paint[slot]));
}

export function samePaint(a: TruckPaint, b: TruckPaint): boolean {
  return PAINT_SLOTS.every((slot) => a[slot] === b[slot]);
}
