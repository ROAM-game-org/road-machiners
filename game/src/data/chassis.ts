
import type { Tier } from './market';
import { PARTS } from './parts';

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
  bedRows: number;
  value: number;
  showsCores: boolean;
  tier: Tier;
  coupling?: { row: number };
  look: 'pickup' | 'hauler' | 'buggy' | 'wagon' | 'courier' | 'van' | 'longbed' | 'carrier' | 'tractor' | 'jeep' | 'convertible' | 'bus' | 'loader' | 'niva' | 'bukhanka' | 'lincoln' | 'semi' | 'sorokonoga';
};

export const CHASSIS_PRICE_MODIFIERS = { perDeckCell: 2000, perArmorCell: 1000, perTopSpeed: 2666.67, perBedCell: 400 };

export type ChassisInput = Omit<ChassisDef, 'value' | 'ratedMass'>;

export function chassisModifier(def: ChassisInput): number {
  const cells = def.layout.join('');
  const count = (marks: string) => [...cells].filter((c) => marks.includes(c)).length;
  const m = CHASSIS_PRICE_MODIFIERS;
  return m.perDeckCell * count('D') + m.perArmorCell * count('FBLR') + m.perTopSpeed * def.maxSpeed + m.perBedCell * def.bedRows * Math.max(...def.layout.map((r) => r.length));
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
  if (!Number.isInteger(def.bedRows) || def.bedRows < 0) throw new Error(`Chassis ${def.id} has bedRows ${def.bedRows}. Use a whole number of at least 0.`);
  const value = Math.round(def.base + chassisModifier(def));
  if (value <= 0) throw new Error(`Chassis ${def.id} prices at ${value}. Raise its base.`);
  return { ...def, value, ratedMass: ratedMassOf(def) };
}

const CHASSIS_INPUTS: Record<string, ChassisInput> = {
  scout: {
    id: 'scout',
    bedRows: 1,
    maxSpeed: 7.8,
    accel: 2,
    brake: 3,
    turnSlow: 110,
    turnFast: 40,
    reverseTurn: 60,
    mass: 680,
    handlingMass: 2100,
    radius: 0.6,
    layout: [' FFFFF ', 'LXEEDXR', 'LXEEDXR', 'LDXXXDR', 'LDXXXDR', 'LXXXXXR', 'LXXXXXR', ' BBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 3 },
      { defId: 'transmission', x: 2, y: 5 },
      { defId: 'tank', x: 4, y: 5 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 5, y: 1 },
      { defId: 'wheel', x: 1, y: 5 },
      { defId: 'wheel', x: 5, y: 5 },
    ],
    fuelCap: 40,
    fuelPerTile: 0.25,
    base: 26667, showsCores: true, tier: 1,
    look: 'pickup',
  },
  hauler: {
    id: 'hauler',
    bedRows: 2,
    maxSpeed: 5.2,
    accel: 1,
    brake: 2,
    turnSlow: 80,
    turnFast: 25,
    reverseTurn: 45,
    mass: 2730,
    handlingMass: 5800,
    radius: 0.8,
    layout: [' FFFFFFF ', 'LXDEEXXXR', 'LXDEEXXXR', 'LDDXXXXDR', 'LDDXXDDDR', 'LDDDDDDDR', 'LXDDDXDXR', 'LXDDDXDXR', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 5, y: 1, rot: 1 },
      { defId: 'transmissionMid', x: 3, y: 3 },
      { defId: 'tankMid', x: 5, y: 6 },
      { defId: 'wheelMid', x: 1, y: 1 },
      { defId: 'wheelMid', x: 7, y: 1 },
      { defId: 'wheelMid', x: 1, y: 6 },
      { defId: 'wheelMid', x: 7, y: 6 },
    ],
    fuelCap: 80,
    fuelPerTile: 0.4,
    base: 30667, showsCores: false, tier: 2,
    look: 'hauler',
  },
  buggy: {
    id: 'buggy',
    bedRows: 0,
    maxSpeed: 9.1,
    accel: 3,
    brake: 3,
    turnSlow: 120,
    turnFast: 45,
    reverseTurn: 90,
    mass: 230,
    handlingMass: 900,
    radius: 0.5,
    layout: [' FFFFF ', 'LXEE.XR', 'LXEE.XR', 'LDDXX.R', 'LDDXX.R', 'LXXX.XR', 'LXXX.XR', ' BBBBB '],
    core: [
      { defId: 'cab', x: 3, y: 3 },
      { defId: 'transmission', x: 2, y: 5 },
      { defId: 'tank', x: 4, y: 3 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 5, y: 1 },
      { defId: 'wheel', x: 1, y: 5 },
      { defId: 'wheel', x: 5, y: 5 },
    ],
    fuelCap: 30,
    fuelPerTile: 0.2,
    base: 10000, showsCores: false, tier: 1,
    look: 'buggy',
  },
  wagon: {
    id: 'wagon',
    bedRows: 0,
    maxSpeed: 3.9,
    accel: 1,
    brake: 2,
    turnSlow: 70,
    turnFast: 25,
    reverseTurn: 45,
    mass: 2130,
    handlingMass: 3700,
    radius: 0.8,
    layout: [' FFFFFFF ', 'LXDXXXDXR', 'LXDXXXDXR', 'LDEEDDXDR', 'LDEEDDXDR', 'LDDDXXDDR', 'LXDDXXDXR', 'LXDDDDDXR', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 3, y: 1 },
      { defId: 'transmissionHeavy', x: 4, y: 5 },
      { defId: 'tankHeavy', x: 6, y: 3 },
      { defId: 'wheelHeavy', x: 1, y: 1 },
      { defId: 'wheelHeavy', x: 7, y: 1 },
      { defId: 'wheelHeavy', x: 1, y: 6 },
      { defId: 'wheelHeavy', x: 7, y: 6 },
    ],
    fuelCap: 60,
    fuelPerTile: 0.4,
    base: 12333, showsCores: true, tier: 2,
    look: 'wagon',
  },
  courier: {
    id: 'courier', bedRows: 0, maxSpeed: 9.75, accel: 3, brake: 3, turnSlow: 125, turnFast: 42, reverseTurn: 80,
    mass: 280, handlingMass: 1100, radius: 0.5,
    layout: [' FFFFF ', 'LX.XXXR', 'LX.XXXR', 'LDEE.XR', 'LDEE.XR', 'LDXX.DR', 'LXDD.XR', 'LXDD.XR', ' BBBBB '],
    core: [
      { defId: 'cab', x: 2, y: 5, rot: 1 },
      { defId: 'transmission', x: 3, y: 1 },
      { defId: 'tank', x: 5, y: 3 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 5, y: 1 },
      { defId: 'wheel', x: 1, y: 6 },
      { defId: 'wheel', x: 5, y: 6 },
    ],
    fuelCap: 24, fuelPerTile: 0.18, base: 11333, showsCores: true, tier: 1, look: 'courier',
  },
  van: {
    id: 'van', bedRows: 1, maxSpeed: 6.5, accel: 1.5, brake: 3, turnSlow: 100, turnFast: 35, reverseTurn: 65,
    mass: 1100, handlingMass: 3000, radius: 0.7,
    layout: [' FFFFF ', 'LXEEDXR', 'LXEEDXR', 'LDXXDDR', 'LDXXDDR', 'LDXXDDR', 'LXXXXXR', 'LXXXXXR', ' BBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 3, rot: 1 },
      { defId: 'transmissionMid', x: 2, y: 6 },
      { defId: 'tankMid', x: 4, y: 6 },
      { defId: 'wheelMid', x: 1, y: 1 },
      { defId: 'wheelMid', x: 5, y: 1 },
      { defId: 'wheelMid', x: 1, y: 6 },
      { defId: 'wheelMid', x: 5, y: 6 },
    ],
    fuelCap: 55, fuelPerTile: 0.24, base: 39333, showsCores: false, tier: 2, look: 'van',
  },
  longbed: {
    id: 'longbed', bedRows: 2, maxSpeed: 4.55, accel: 0.8, brake: 1.8, turnSlow: 70, turnFast: 20, reverseTurn: 40,
    mass: 2900, handlingMass: 7200, radius: 0.95,
    layout: [' FFFFFFF ', 'LXDEEDDXR', 'LXDEEDDXR', 'LDDXXXDDR', 'LDDXXXDDR', 'LDDDDDDDR', 'LDDXXXDDR', 'LDDXXXDDR', 'LXDDDDDXR', 'LXDDDDDXR', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 3, y: 3 },
      { defId: 'transmissionHeavy', x: 3, y: 6 },
      { defId: 'tankHeavy', x: 5, y: 6 },
      { defId: 'wheelHeavy', x: 1, y: 1 },
      { defId: 'wheelHeavy', x: 7, y: 1 },
      { defId: 'wheelHeavy', x: 1, y: 8 },
      { defId: 'wheelHeavy', x: 7, y: 8 },
    ],
    fuelCap: 100, fuelPerTile: 0.48, base: 57333, showsCores: false, tier: 3, look: 'longbed',
  },
  carrier: {
    id: 'carrier', bedRows: 0, maxSpeed: 5.2, accel: 1, brake: 2.5, turnSlow: 75, turnFast: 28, reverseTurn: 50,
    mass: 3200, handlingMass: 5200, radius: 0.85,
    layout: [' FFFFFFF ', 'LXDXXD.XR', 'LXDXXD.XR', 'LDEEXX.DR', 'LDEEXX.DR', 'LDDDXX.DR', 'LXDDXX.XR', 'LXDDDD.XR', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 4, y: 3, rot: 1 },
      { defId: 'transmissionHeavy', x: 3, y: 1 },
      { defId: 'tankHeavy', x: 4, y: 6, rot: 1 },
      { defId: 'wheelHeavy', x: 1, y: 1 },
      { defId: 'wheelHeavy', x: 7, y: 1 },
      { defId: 'wheelHeavy', x: 1, y: 6 },
      { defId: 'wheelHeavy', x: 7, y: 6 },
    ],
    fuelCap: 70, fuelPerTile: 0.5, base: 84667, showsCores: false, tier: 3, look: 'carrier',
  },
  tractor: {
    id: 'tractor', bedRows: 0, maxSpeed: 3.9, accel: 1.8, brake: 2, turnSlow: 65, turnFast: 22, reverseTurn: 55,
    mass: 3600, handlingMass: 6500, radius: 0.9,
    layout: [' FFFFFFF ', 'LXDEEDDXR', 'LXDEEDDXR', 'LDDXXXDDR', 'LDDXXXDDR', 'LDDDDXDDR', 'LXDXXXDXR', 'LXDXXDDXR', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 3, y: 3 },
      { defId: 'transmissionHeavy', x: 3, y: 6 },
      { defId: 'tankHeavy', x: 5, y: 5 },
      { defId: 'wheelHeavy', x: 1, y: 1 },
      { defId: 'wheelHeavy', x: 7, y: 1 },
      { defId: 'wheelHeavy', x: 1, y: 6 },
      { defId: 'wheelHeavy', x: 7, y: 6 },
    ],
    fuelCap: 120, fuelPerTile: 0.6, base: 57667, showsCores: false, tier: 3, look: 'tractor',
  },
  jeep: {
    id: 'jeep', bedRows: 0, maxSpeed: 8.2, accel: 2.5, brake: 3, turnSlow: 115, turnFast: 42, reverseTurn: 80,
    mass: 450, handlingMass: 1400, radius: 0.55,
    layout: [' FFFFF ', 'LX.XXXR', 'LX.XXXR', 'LD.XDDR', 'LD.XDDR', 'LX.EEXR', 'LX.EEXR', 'LD.XXDR', ' BBBBB '],
    core: [
      { defId: 'cab', x: 3, y: 3 },
      { defId: 'transmission', x: 3, y: 1 },
      { defId: 'tank', x: 3, y: 7, rot: 1 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 5, y: 1 },
      { defId: 'wheel', x: 1, y: 5 },
      { defId: 'wheel', x: 5, y: 5 },
    ],
    fuelCap: 35, fuelPerTile: 0.2, base: 11000, showsCores: false, tier: 1, look: 'jeep',
  },
  convertible: {
    id: 'convertible', bedRows: 0, maxSpeed: 9.4, accel: 2.5, brake: 3, turnSlow: 110, turnFast: 40, reverseTurn: 70,
    mass: 750, handlingMass: 2000, radius: 0.6,
    layout: [' FFFFF ', 'LXXXXXR', 'LXXXXXR', 'LDXXDDR', 'LDXXDDR', 'LDXXDDR', 'LXEEDXR', 'LXEEDXR', ' BBBBB '],
    core: [
      { defId: 'cabHardtop', x: 2, y: 3, rot: 1 },
      { defId: 'transmission', x: 2, y: 1 },
      { defId: 'tankLong', x: 4, y: 1 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 5, y: 1 },
      { defId: 'wheel', x: 1, y: 6 },
      { defId: 'wheel', x: 5, y: 6 },
    ],
    fuelCap: 45, fuelPerTile: 0.26, base: 28667, showsCores: false, tier: 2, look: 'convertible',
  },
  bus: {
    id: 'bus', bedRows: 2, maxSpeed: 5.5, accel: 0.9, brake: 2, turnSlow: 65, turnFast: 22, reverseTurn: 40,
    mass: 3000, handlingMass: 6800, radius: 0.9,
    layout: [' FFFFFFF ', 'LXXXXD.XR', 'LXXXXD.XR', 'LDDDDD.DR', 'LDDDDD.DR', 'LDDDDD.DR', 'LDDXXXXDR', 'LDDXX..DR', 'LDDEED.DR', 'LXDEED.XR', 'LXDDDD.XR', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 1 },
      { defId: 'transmissionMid', x: 3, y: 6 },
      { defId: 'tankMid', x: 5, y: 6, rot: 1 },
      { defId: 'wheelMid', x: 1, y: 1 },
      { defId: 'wheelMid', x: 7, y: 1 },
      { defId: 'wheelMid', x: 1, y: 9 },
      { defId: 'wheelMid', x: 7, y: 9 },
    ],
    fuelCap: 110, fuelPerTile: 0.45, base: 6000, showsCores: false, tier: 2, look: 'bus',
  },
  loader: {
    id: 'loader', bedRows: 0, maxSpeed: 3.6, accel: 1.6, brake: 2.5, turnSlow: 85, turnFast: 30, reverseTurn: 60,
    mass: 4200, handlingMass: 7000, radius: 0.9,
    layout: [' FFFFFFF ', 'LXDDDDDXR', 'LXXXDDDXR', 'LDXXXXDDR', 'LDXXXXDDR', 'LDXEEDDDR', 'LXXEEDDXR', 'LXDDDDDXR', ' BBBBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 2, rot: 1 },
      { defId: 'transmissionHeavy', x: 4, y: 3 },
      { defId: 'tankHeavy', x: 2, y: 5 },
      { defId: 'wheelHeavy', x: 1, y: 1 },
      { defId: 'wheelHeavy', x: 7, y: 1 },
      { defId: 'wheelHeavy', x: 1, y: 6 },
      { defId: 'wheelHeavy', x: 7, y: 6 },
    ],
    fuelCap: 130, fuelPerTile: 0.65, base: 82000, showsCores: false, tier: 3, look: 'loader',
  },
  niva: {
    id: 'niva', bedRows: 0, maxSpeed: 7.6, accel: 2.2, brake: 3, turnSlow: 115, turnFast: 40, reverseTurn: 80,
    mass: 520, handlingMass: 1700, radius: 0.55,
    layout: [' FFFFF ', 'LX.EEXR', 'LX.EEXR', 'LD.XDDR', 'LD.XDDR', 'LDX.DDR', 'LDX.DDR', 'LX.XXXR', 'LX.XXXR', ' BBBBB '],
    core: [
      { defId: 'cab', x: 3, y: 3 },
      { defId: 'transmissionMid', x: 3, y: 7 },
      { defId: 'tank', x: 2, y: 5 },
      { defId: 'wheelMid', x: 1, y: 1 },
      { defId: 'wheelMid', x: 5, y: 1 },
      { defId: 'wheelMid', x: 1, y: 7 },
      { defId: 'wheelMid', x: 5, y: 7 },
    ],
    fuelCap: 42, fuelPerTile: 0.21, base: 34667, showsCores: false, tier: 2, look: 'niva',
  },
  bukhanka: {
    id: 'bukhanka', bedRows: 0, maxSpeed: 6.0, accel: 1.4, brake: 2.5, turnSlow: 95, turnFast: 30, reverseTurn: 60,
    mass: 1250, handlingMass: 3300, radius: 0.65,
    layout: [' FFFFF ', 'LXXXXXR', 'LXXXXXR', 'LDEEDDR', 'LDEEDDR', 'LDDDDDR', 'LDXXXDR', 'LXXXXXR', 'LXDDDXR', ' BBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 1 },
      { defId: 'transmissionMid', x: 2, y: 6 },
      { defId: 'tankMid', x: 4, y: 6 },
      { defId: 'wheelMid', x: 1, y: 1 },
      { defId: 'wheelMid', x: 5, y: 1 },
      { defId: 'wheelMid', x: 1, y: 7 },
      { defId: 'wheelMid', x: 5, y: 7 },
    ],
    fuelCap: 78, fuelPerTile: 0.30, base: 41000, showsCores: false, tier: 2, look: 'bukhanka',
  },
  lincoln: {
    id: 'lincoln', bedRows: 0, maxSpeed: 8.6, accel: 2.0, brake: 2.2, turnSlow: 80, turnFast: 26, reverseTurn: 45,
    mass: 900, handlingMass: 2400, radius: 0.85,
    layout: [' FFFFF ', 'LXDDDXR', 'LXEEDXR', 'LDEEDDR', 'LDXXDDR', 'LDXXDDR', 'LDXXDDR', 'LDXXXDR', 'LXXXXXR', 'LXDDDXR', ' BBBBB '],
    core: [
      { defId: 'cabHardtop', x: 2, y: 4, rot: 1 },
      { defId: 'transmission', x: 2, y: 7 },
      { defId: 'tankLong', x: 4, y: 7 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 5, y: 1 },
      { defId: 'wheel', x: 1, y: 8 },
      { defId: 'wheel', x: 5, y: 8 },
    ],
    fuelCap: 85, fuelPerTile: 0.36, base: 50000, showsCores: false, tier: 3, look: 'lincoln',
  },
  semi: {
    id: 'semi', bedRows: 0, maxSpeed: 6.0, accel: 0.8, brake: 1.5, turnSlow: 60, turnFast: 18, reverseTurn: 30,
    mass: 9000, handlingMass: 14100, radius: 1.2,
    layout: [
      ' FFFFFFF ',
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
      ' BBBBBBB ',
    ],
    core: [
      { defId: 'cabPickup', x: 3, y: 5 },
      { defId: 'transmissionMid', x: 3, y: 9 },
      { defId: 'tankMid', x: 5, y: 9 },
      { defId: 'wheelMid', x: 1, y: 2 },
      { defId: 'wheelMid', x: 7, y: 2 },
      { defId: 'wheelMid', x: 1, y: 26 },
      { defId: 'wheelMid', x: 7, y: 26 },
    ],
    fuelCap: 160, fuelPerTile: 0.5, base: 56000, showsCores: false, tier: 3, coupling: { row: 11 }, look: 'semi',
  },
  sorokonoga: {
    id: 'sorokonoga', bedRows: 0, maxSpeed: 3.4, accel: 0.7, brake: 1.6, turnSlow: 75, turnFast: 24, reverseTurn: 25,
    mass: 4100, handlingMass: 8400, radius: 1.0,
    layout: [
      ' FFFFFFF ',
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
      ' BBBBBBB ',
    ],
    core: [
      { defId: 'cabPickup', x: 3, y: 2 },
      { defId: 'transmissionHeavy', x: 4, y: 4 },
      { defId: 'tankHeavy', x: 6, y: 4 },
      { defId: 'wheelHeavy', x: 1, y: 1 },
      { defId: 'wheelHeavy', x: 7, y: 1 },
      { defId: 'wheelHeavy', x: 1, y: 13 },
      { defId: 'wheelHeavy', x: 7, y: 13 },
    ],
    fuelCap: 140, fuelPerTile: 0.55, base: 57500, showsCores: false, tier: 3, coupling: { row: 7 }, look: 'sorokonoga',
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

export function chassisDef(id: string): ChassisDef {
  const def = CHASSIS[id];
  if (!def) throw new Error(`Unknown chassis ${id}`);
  return def;
}

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
