
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

export type OldGrid = { deck: number; armor: number; width: number };

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
  spareRows?: number;
  oldGrid: OldGrid;
  look: 'pickup' | 'hauler' | 'buggy' | 'wagon' | 'courier' | 'van' | 'longbed' | 'carrier' | 'tractor' | 'jeep' | 'convertible' | 'bus' | 'loader' | 'niva' | 'bukhanka' | 'lincoln' | 'semi' | 'sorokonoga';
};

export const CHASSIS_PRICE_MODIFIERS = { perDeckCell: 2000, perArmorCell: 1000, perTopSpeed: 2666.67 };

export type ChassisInput = Omit<ChassisDef, 'value' | 'ratedMass'>;

export function chassisModifier(def: ChassisInput): number {
  const m = CHASSIS_PRICE_MODIFIERS;
  return m.perDeckCell * def.oldGrid.deck + m.perArmorCell * def.oldGrid.armor + m.perTopSpeed * def.maxSpeed;
}

export const RATED_KIT = { engine: 'stockEngine', armorKgPerCell: 100, gun: 'mg', gunDeckShare: 0.5 };

export function ratedMassOf(def: ChassisInput): number {
  const core = def.core.reduce((sum, c) => sum + PARTS[c.defId].mass, 0);
  const guns = Math.ceil(def.oldGrid.deck * RATED_KIT.gunDeckShare);
  return def.mass + core + PARTS[RATED_KIT.engine].mass + def.oldGrid.armor * RATED_KIT.armorKgPerCell + guns * PARTS[RATED_KIT.gun].mass;
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
    layout: [' FFFF ', 'L.  .R', 'L.DDDR', 'LXEEXR', 'LXEEXR', 'LDEEDR', 'LXXXDR', 'LXXXDR', 'LXXXXR', 'LDDDXR', 'LXXXXR', 'LXXXXR', 'L....R', ' BBBB '],
    core: [
      { defId: 'cabPickup', x: 1, y: 6 },
      { defId: 'transmission', x: 2, y: 10 },
      { defId: 'tank', x: 4, y: 8 },
      { defId: 'wheel', x: 1, y: 3 },
      { defId: 'wheel', x: 4, y: 3 },
      { defId: 'wheel', x: 1, y: 10 },
      { defId: 'wheel', x: 4, y: 10 },
    ],
    oldGrid: { deck: 6, armor: 26, width: 7 },
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
    layout: [' FFFFFF ', 'L.  XXXR', 'LDDDXXXR', 'L EEXXXR', 'LXEE.DXR', 'LXEE.DXR', 'LXDXXDXR', 'LDDXXDDR', 'LDDXXDDR', 'LDDDDDDR', 'LDDDDDDR', 'LXXXXDXR', 'LXDDDDXR', 'LXDDDDXR', 'L.    .R', ' BBBBBB '],
    core: [
      { defId: 'wheelMid', x: 1, y: 4 },
      { defId: 'wheelMid', x: 6, y: 4 },
      { defId: 'wheelMid', x: 1, y: 11 },
      { defId: 'wheelMid', x: 6, y: 11 },
      { defId: 'cabPickup', x: 4, y: 1 },
      { defId: 'transmissionMid', x: 3, y: 6 },
      { defId: 'tankMid', x: 2, y: 11, rot: 1 },
    ],
    oldGrid: { deck: 25, armor: 32, width: 9 },
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
    layout: [' FFFF ', 'LX..XR', 'LXEEXR', 'L.EEXR', 'LXEEXR', 'LXDDDR', 'L.DDDR', 'LXXXXR', 'LXXXXR', 'L....R', ' BBBB '],
    core: [
      { defId: 'cab', x: 1, y: 4 },
      { defId: 'transmission', x: 2, y: 7 },
      { defId: 'tank', x: 4, y: 3 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 4, y: 1 },
      { defId: 'wheel', x: 1, y: 7 },
      { defId: 'wheel', x: 4, y: 7 },
    ],
    oldGrid: { deck: 4, armor: 26, width: 7 },
    spareRows: 1,
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
    layout: [' FFFFFF ', 'L.  XXXR', 'LDDDXXXR', 'LDDDXXXR', 'LXDDD XR', 'LXEED XR', 'LXEED XR', 'LDEEDXDR', 'LDDDDXDR', 'LDDXXXDR', 'LXDXXDXR', 'LXDXXDXR', 'LXDDDDXR', 'LDDDDDDR', 'L.    .R', ' BBBBBB '],
    core: [
      { defId: 'wheelHeavy', x: 1, y: 4 },
      { defId: 'wheelHeavy', x: 6, y: 4 },
      { defId: 'wheelHeavy', x: 1, y: 10 },
      { defId: 'wheelHeavy', x: 6, y: 10 },
      { defId: 'cabPickup', x: 4, y: 1 },
      { defId: 'transmissionHeavy', x: 3, y: 9 },
      { defId: 'tankHeavy', x: 5, y: 7 },
    ],
    oldGrid: { deck: 25, armor: 32, width: 9 },
    fuelCap: 60,
    fuelPerTile: 0.4,
    base: 8333, showsCores: true, showsEngine: true, tier: 2,
    look: 'wagon',
  },
  courier: {
    id: 'courier', maxSpeed: 9.75, accel: 3, brake: 3, turnSlow: 125, turnFast: 42, reverseTurn: 80,
    mass: 280, handlingMass: 1100, radius: 0.5,
    layout: [' FFFF ', 'LXEEXR', 'LXEEXR', 'LDEEDR', 'LDD DR', 'LDD.DR', 'LDDXXR', 'L.XX.R', 'LXXXXR', 'LXXXXR', ' BBBB '],
    core: [
      { defId: 'cab', x: 3, y: 6, rot: 1 },
      { defId: 'transmission', x: 2, y: 8 },
      { defId: 'tank', x: 2, y: 7, rot: 1 },
      { defId: 'wheel', x: 1, y: 1 },
      { defId: 'wheel', x: 4, y: 1 },
      { defId: 'wheel', x: 1, y: 8 },
      { defId: 'wheel', x: 4, y: 8 },
    ],
    oldGrid: { deck: 8, armor: 28, width: 7 },
    spareRows: 2,
    fuelCap: 24, fuelPerTile: 0.18, base: 7333, showsCores: true, showsEngine: true, tier: 1, look: 'courier',
  },
  van: {
    id: 'van', maxSpeed: 6.5, accel: 1.5, brake: 3, turnSlow: 100, turnFast: 35, reverseTurn: 65,
    mass: 1100, handlingMass: 3000, radius: 0.7,
    layout: [' FFFFF ', 'L.   .R', 'L DDD R', 'LXDEEXR', 'LXDEEXR', 'LXDEEXR', 'L..DDDR', 'LXXXDDR', 'LXXXDDR', 'LXXXDDR', 'LXXXXXR', 'LXXXXXR', 'LXXXXXR', 'L.   .R', ' BBBBB '],
    core: [
      { defId: 'wheelMid', x: 1, y: 3 },
      { defId: 'wheelMid', x: 5, y: 3 },
      { defId: 'wheelMid', x: 1, y: 10 },
      { defId: 'wheelMid', x: 5, y: 10 },
      { defId: 'cabPickup', x: 1, y: 7 },
      { defId: 'transmissionMid', x: 2, y: 10 },
      { defId: 'tankMid', x: 4, y: 10 },
    ],
    oldGrid: { deck: 11, armor: 28, width: 7 },
    fuelCap: 55, fuelPerTile: 0.24, base: 35333, showsCores: false, showsEngine: true, tier: 2, look: 'van',
  },
  longbed: {
    id: 'longbed', maxSpeed: 4.55, accel: 0.8, brake: 1.8, turnSlow: 70, turnFast: 20, reverseTurn: 40,
    mass: 2900, handlingMass: 7200, radius: 0.95,
    layout: [' FFFFFF ', 'LDDDDDDR', 'LDDEEDDR', 'LDDEEDDR', 'LX EEDXR', 'LX DDDXR', 'LXXXXDXR', 'LDXXXDDR', 'LDXXXDDR', 'LDXXXDDR', 'LDXXXDDR', 'LDXXXDDR', 'LDDDDDDR', 'LXDDDDXR', 'LXDDDDXR', 'LXDDDDXR', 'LDDDDDDR', ' BBBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 6 },
      { defId: 'transmissionHeavy', x: 3, y: 9 },
      { defId: 'tankHeavy', x: 2, y: 9 },
      { defId: 'wheelHeavy', x: 1, y: 4 },
      { defId: 'wheelHeavy', x: 6, y: 4 },
      { defId: 'wheelHeavy', x: 1, y: 13 },
      { defId: 'wheelHeavy', x: 6, y: 13 },
    ],
    oldGrid: { deck: 39, armor: 36, width: 9 },
    fuelCap: 100, fuelPerTile: 0.48, base: 53333, showsCores: false, showsEngine: true, tier: 3, look: 'longbed',
  },
  carrier: {
    id: 'carrier', maxSpeed: 5.2, accel: 1, brake: 2.5, turnSlow: 75, turnFast: 28, reverseTurn: 50,
    mass: 3200, handlingMass: 5200, radius: 0.85,
    layout: [' FFFFFF ', 'L.   ..R', 'LD.XXD.R', 'LD.XXD.R', 'LD.XXD.R', 'LXEEDDXR', 'LXEEDXXR', 'LXEEDXXR', 'LXXXXXXR', 'LXXXXDXR', 'LXXXXDXR', 'L.DDDD.R', 'L..DDDDR', 'LDDDDDDR', ' BBBBBB '],
    core: [
      { defId: 'wheelHeavy', x: 1, y: 5 },
      { defId: 'wheelHeavy', x: 6, y: 5 },
      { defId: 'wheelHeavy', x: 1, y: 8 },
      { defId: 'wheelHeavy', x: 6, y: 8 },
      { defId: 'cabPickup', x: 2, y: 8 },
      { defId: 'transmissionHeavy', x: 3, y: 2 },
      { defId: 'tankHeavy', x: 5, y: 6 },
    ],
    oldGrid: { deck: 18, armor: 32, width: 9 },
    fuelCap: 70, fuelPerTile: 0.5, base: 80667, showsCores: false, showsEngine: true, tier: 3, look: 'carrier',
  },
  tractor: {
    id: 'tractor', maxSpeed: 3.9, accel: 1.8, brake: 2, turnSlow: 65, turnFast: 22, reverseTurn: 55,
    mass: 3600, handlingMass: 6500, radius: 0.9,
    layout: [' FFFFFF ', 'L.    .R', 'LXEEDDXR', 'LXEEDDXR', 'LXEEDDXR', 'LDDDDDDR', 'LDDXXXDR', 'LDDXXXDR', 'LDXXXXDR', 'LDXDDDDR', 'LDXDDDDR', 'LXDXXDXR', 'LXDXXDXR', 'LXDXXDXR', 'L.    .R', ' BBBBBB '],
    core: [
      { defId: 'cabPickup', x: 3, y: 6 },
      { defId: 'transmissionHeavy', x: 3, y: 11 },
      { defId: 'tankHeavy', x: 2, y: 8 },
      { defId: 'wheelHeavy', x: 1, y: 2 },
      { defId: 'wheelHeavy', x: 6, y: 2 },
      { defId: 'wheelHeavy', x: 1, y: 11 },
      { defId: 'wheelHeavy', x: 6, y: 11 },
    ],
    oldGrid: { deck: 25, armor: 32, width: 9 },
    fuelCap: 120, fuelPerTile: 0.6, base: 53667, showsCores: false, showsEngine: true, tier: 3, look: 'tractor',
  },
  jeep: {
    id: 'jeep', maxSpeed: 8.2, accel: 2.5, brake: 3, turnSlow: 115, turnFast: 42, reverseTurn: 80,
    mass: 450, handlingMass: 1400, radius: 0.55,
    layout: [' FFFF ', 'L.  .R', 'LXXXXR', 'LXXXXR', 'LXDDDR', 'LXDDDR', 'LDDD R', 'LXEEXR', 'LXEEXR', 'LXEE.R', 'LX  .R', ' BBBB '],
    core: [
      { defId: 'cab', x: 1, y: 4 },
      { defId: 'transmission', x: 2, y: 2 },
      { defId: 'tank', x: 1, y: 9 },
      { defId: 'wheel', x: 1, y: 2 },
      { defId: 'wheel', x: 4, y: 2 },
      { defId: 'wheel', x: 1, y: 7 },
      { defId: 'wheel', x: 4, y: 7 },
    ],
    oldGrid: { deck: 8, armor: 28, width: 7 },
    spareRows: 2,
    fuelCap: 35, fuelPerTile: 0.2, base: 7000, showsCores: false, showsEngine: true, tier: 1, look: 'jeep',
  },
  convertible: {
    id: 'convertible', maxSpeed: 9.4, accel: 2.5, brake: 3, turnSlow: 110, turnFast: 40, reverseTurn: 70,
    mass: 750, handlingMass: 2000, radius: 0.6,
    layout: [' FFFFF ', 'L.   .R', 'L XXX R', 'LXXXXXR', 'LX  XXR', 'LDDD  R', 'LDDXXXR', 'LDDXXXR', 'LDDXXXR', 'L EED R', 'L.EED.R', 'LXEEDXR', 'LXDDDXR', 'L.   .R', ' BBBBB '],
    core: [
      { defId: 'cabHardtop', x: 3, y: 6, rot: 1 },
      { defId: 'transmission', x: 2, y: 2 },
      { defId: 'tankLong', x: 4, y: 2 },
      { defId: 'wheel', x: 1, y: 3 },
      { defId: 'wheel', x: 5, y: 3 },
      { defId: 'wheel', x: 1, y: 11 },
      { defId: 'wheel', x: 5, y: 11 },
    ],
    oldGrid: { deck: 11, armor: 28, width: 7 },
    fuelCap: 45, fuelPerTile: 0.26, base: 24667, showsCores: false, showsEngine: true, tier: 2, look: 'convertible',
  },
  bus: {
    id: 'bus', maxSpeed: 5.5, accel: 0.9, brake: 2, turnSlow: 65, turnFast: 22, reverseTurn: 40,
    mass: 3000, handlingMass: 6800, radius: 0.9,
    layout: [' FFFFF ', 'LDDDD.R', 'LXXXXXR', 'LXXXXXR', 'LXXXXXR', 'LDDDD R', 'LDXXXDR', 'LDDDDDR', 'LDXXDDR', 'LDXXDDR', 'LDXXDDR', 'LDDDDDR', 'LDEEDDR', 'LDEEDDR', 'LDEEDDR', 'LXDDDXR', 'LXDDDXR', 'LXDDDXR', 'LDDDD R', 'LDDDD.R', ' BBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 2 },
      { defId: 'transmissionMid', x: 2, y: 8 },
      { defId: 'tankMid', x: 2, y: 6, rot: 1 },
      { defId: 'wheelMid', x: 1, y: 2 },
      { defId: 'wheelMid', x: 5, y: 2 },
      { defId: 'wheelMid', x: 1, y: 15 },
      { defId: 'wheelMid', x: 5, y: 15 },
    ],
    oldGrid: { deck: 36, armor: 38, width: 9 },
    spareRows: 1,
    fuelCap: 110, fuelPerTile: 0.45, base: 2000, showsCores: false, showsEngine: true, tier: 2, look: 'bus',
  },
  loader: {
    id: 'loader', maxSpeed: 3.6, accel: 1.6, brake: 2.5, turnSlow: 85, turnFast: 30, reverseTurn: 60,
    mass: 4200, handlingMass: 7000, radius: 0.9,
    layout: [' FFFFFF ', 'L.    .R', 'LDDDDDDR', 'LXXXXDXR', 'LXXXXDXR', 'LXXXXDXR', 'LDXXXDDR', 'LDXXXDDR', 'LDXXXDDR', 'LDDDDDDR', 'LDDDDDDR', 'LXDEEDXR', 'LXDEEDXR', 'LXDEEDXR', 'L.    .R', ' BBBBBB '],
    core: [
      { defId: 'cabPickup', x: 2, y: 3 },
      { defId: 'transmissionHeavy', x: 3, y: 6 },
      { defId: 'tankHeavy', x: 2, y: 6 },
      { defId: 'wheelHeavy', x: 1, y: 3 },
      { defId: 'wheelHeavy', x: 6, y: 3 },
      { defId: 'wheelHeavy', x: 1, y: 11 },
      { defId: 'wheelHeavy', x: 6, y: 11 },
    ],
    oldGrid: { deck: 25, armor: 32, width: 9 },
    fuelCap: 130, fuelPerTile: 0.65, base: 78000, showsCores: false, showsEngine: true, tier: 3, look: 'loader',
  },
  niva: {
    id: 'niva', maxSpeed: 7.6, accel: 2.2, brake: 3, turnSlow: 115, turnFast: 40, reverseTurn: 80,
    mass: 520, handlingMass: 1700, radius: 0.55,
    layout: [' FFFF ', 'LXEEXR', 'LXEEXR', 'LXEEXR', 'LXXXXR', 'LDDDDR', 'LDDDDR', 'LDDDDR', 'LXXXXR', 'LXXXXR', 'LXXXXR', ' BBBB '],
    core: [
      { defId: 'cab', x: 1, y: 4, rot: 1 },
      { defId: 'transmissionMid', x: 2, y: 8 },
      { defId: 'tank', x: 3, y: 4, rot: 1 },
      { defId: 'wheelMid', x: 1, y: 1 },
      { defId: 'wheelMid', x: 4, y: 1 },
      { defId: 'wheelMid', x: 1, y: 8 },
      { defId: 'wheelMid', x: 4, y: 8 },
    ],
    oldGrid: { deck: 12, armor: 30, width: 7 },
    spareRows: 3,
    fuelCap: 42, fuelPerTile: 0.21, base: 30667, showsCores: false, showsEngine: true, tier: 2, look: 'niva',
  },
  bukhanka: {
    id: 'bukhanka', maxSpeed: 6.0, accel: 1.4, brake: 2.5, turnSlow: 95, turnFast: 30, reverseTurn: 60,
    mass: 1250, handlingMass: 3300, radius: 0.65,
    layout: [' FFFFF ', 'LXXXXXR', 'LXXXXXR', 'LXXXXXR', 'LDEEDDR', 'LDEEDDR', 'LDEEDDR', 'LDDDDDR', 'LD.D.DR', 'LDDDDDR', 'LXXXXXR', 'LXXXXXR', 'LXXXXXR', ' BBBBB '],
    core: [
      { defId: 'wheelMid', x: 1, y: 1 },
      { defId: 'wheelMid', x: 5, y: 1 },
      { defId: 'wheelMid', x: 1, y: 10 },
      { defId: 'wheelMid', x: 5, y: 10 },
      { defId: 'cabPickup', x: 2, y: 1 },
      { defId: 'transmissionMid', x: 2, y: 10 },
      { defId: 'tankMid', x: 4, y: 10 },
    ],
    spareRows: 1,
    oldGrid: { deck: 16, armor: 30, width: 7 },
    fuelCap: 78, fuelPerTile: 0.30, base: 37000, showsCores: false, showsEngine: true, tier: 2, look: 'bukhanka',
  },
  lincoln: {
    id: 'lincoln', maxSpeed: 8.6, accel: 2.0, brake: 2.2, turnSlow: 80, turnFast: 26, reverseTurn: 45,
    mass: 900, handlingMass: 2400, radius: 0.85,
    layout: [' FFFFF ', 'L.   .R', 'L DDD R', 'L DEE R', 'LXDEEXR', 'LXDEEXR', 'L XXXDR', 'LDXXXDR', 'LDXXXDR', 'LDDDDDR', 'LDDDDDR', 'L  XDDR', 'LXDXDXR', 'LXDX XR', 'L DXX R', 'L DXX R', 'L.   .R', ' BBBBB '],
    core: [
      { defId: 'wheel', x: 1, y: 4 },
      { defId: 'wheel', x: 5, y: 4 },
      { defId: 'wheel', x: 1, y: 12 },
      { defId: 'wheel', x: 5, y: 12 },
      { defId: 'cabHardtop', x: 2, y: 6, rot: 1 },
      { defId: 'transmission', x: 3, y: 14 },
      { defId: 'tankLong', x: 3, y: 11 },
    ],
    oldGrid: { deck: 21, armor: 32, width: 7 },
    fuelCap: 85, fuelPerTile: 0.36, base: 46000, showsCores: false, showsEngine: true, tier: 3, look: 'lincoln',
  },
  semi: {
    id: 'semi', maxSpeed: 6.0, accel: 0.8, brake: 1.5, turnSlow: 60, turnFast: 18, reverseTurn: 30,
    mass: 9000, handlingMass: 14100, radius: 1.2,
    layout: [
      ' FFFFFFF ',
      'L.     .R',
      'L   CCC R',
      'L C CCC R',
      'LX EEE XR',
      'LX EEE XR',
      'LX  CC XR',
      'L   CCCCR',
      'LCC CCCCR',
      'LCCXXXCCR',
      'LCCXXX  R',
      'L  XXX  R',
      'L CCCC  R',
      'L CCC   R',
      'L C  CCCR',
      'L C  CCCR',
      'LCCCXXXCR',
      'LCCCXXX R',
      'L   XXX R',
      'LCCCC   R',
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
      'LCCC CCCR',
      'LCCC CCCR',
      'LCCC CCCR',
      'LCCC CCCR',
      'L    CCCR',
      'LCCCCCCCR',
      'L CCCCCCR',
      'LCC  CCCR',
      'LCC  CCCR',
      'LCC CCCCR',
      'LCCCCCCCR',
      'LCCCCCCCR',
      'LX     XR',
      'LX     XR',
      'LX     XR',
      'L.     .R',
      ' BBBBBBB ',
    ],
    core: [
      { defId: 'cabPickup', x: 3, y: 9 },
      { defId: 'transmissionMid', x: 4, y: 16 },
      { defId: 'tankMid', x: 6, y: 16 },
      { defId: 'wheelMid', x: 1, y: 4 },
      { defId: 'wheelMid', x: 7, y: 4 },
      { defId: 'wheelMid', x: 1, y: 43 },
      { defId: 'wheelMid', x: 7, y: 43 },
    ],
    oldGrid: { deck: 0, armor: 72, width: 9 },
    fuelCap: 160, fuelPerTile: 0.5, base: 52000, showsCores: false, showsEngine: true, tier: 3, coupling: { row: 18 }, look: 'semi',
  },
  sorokonoga: {
    id: 'sorokonoga', maxSpeed: 3.4, accel: 0.7, brake: 1.6, turnSlow: 75, turnFast: 24, reverseTurn: 25,
    mass: 4100, handlingMass: 8400, radius: 1.0,
    layout: [
      ' FFFFF ',
      'L. ...R',
      'L.....R',
      'LXXXXXR',
      'LXXXXXR',
      'LXXXXXR',
      'L.EEX.R',
      'L.EEX.R',
      'L.EEX.R',
      'L..XX.R',
      'L..XX.R',
      'L.DXX.R',
      'LDDDDDR',
      'LDDDDDR',
      'LD...DR',
      'LDDD.DR',
      'LDD.DDR',
      'LDDDDDR',
      'LDDDDDR',
      'LD.DDDR',
      'LDDDD.R',
      'LDDDDDR',
      'LXD.DXR',
      'LXD.DXR',
      'LX..DXR',
      'L.....R',
      ' BBBBB ',
    ],
    core: [
      { defId: 'wheelHeavy', x: 1, y: 3 },
      { defId: 'wheelHeavy', x: 5, y: 3 },
      { defId: 'wheelHeavy', x: 1, y: 22 },
      { defId: 'wheelHeavy', x: 5, y: 22 },
      { defId: 'cabPickup', x: 2, y: 3 },
      { defId: 'tankHeavy', x: 4, y: 6 },
      { defId: 'transmissionHeavy', x: 3, y: 9 },
    ],
    oldGrid: { deck: 34, armor: 46, width: 9 },
    fuelCap: 140, fuelPerTile: 0.55, base: 53500, showsCores: false, showsEngine: true, tier: 3, coupling: { row: 12 }, look: 'sorokonoga',
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
