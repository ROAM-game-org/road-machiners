
import type { ModelName } from '../three/render/models';
import type { ChassisDef } from '../data/chassis';
import { GOODS, PARCEL, type GoodDef } from '../data/goods';
import { PARTS, type PartDef, type PartKind } from '../data/parts';
import { hashStr } from './noise';
import { wheelMounts } from '../phys/body';
import type { Body } from '../sim/body';
import type { GridItem, PartInstance } from '../sim/types';
import { maxHp } from '../sim/wear';
import { chassisName, goodName, partName } from '../text/names';
import { t, type Msg } from '../text/msg';
import { resolve } from '../text/resolve';

const enName = (msg: Msg): string => resolve(msg, 'en');

export const PLAN_PAD = 0.5;

export const TRUCK_LOOK = {
  wheelPush: 0.12,
  armorDepth: 0.24,
  armorRise: 0.1,
  armorInset: 0.1,
  cutScale: 1.2,
  lampEndShare: 0.5,
  lampReach: 0.6,
};

export function drawnWheelPoints(b: Body, unit: number): { x: number; y: number; z: number }[] {
  return wheelMounts(b, unit).map((m) => ({ x: m.x, y: m.y, z: m.z + Math.sign(m.z) * TRUCK_LOOK.wheelPush }));
}

const BASE_MODELS: Record<string, ModelName> = {
  scout: 'base_scout',
  hauler: 'base_hauler',
  buggy: 'base_buggy',
  wagon: 'base_wagon',
  courier: 'base_courier',
  van: 'base_van',
  longbed: 'base_longbed',
  carrier: 'base_carrier',
  tractor: 'base_tractor',
  jeep: 'base_jeep',
  convertible: 'base_convertible',
  bus: 'base_bus',
  loader: 'base_loader',
  niva: 'base_niva',
  bukhanka: 'base_bukhanka',
  lincoln: 'base_lincoln',
  semi: 'base_semi',
  sorokonoga: 'base_sorokonoga',
};

const REAR_BASE_MODELS: Record<string, ModelName> = {
  semi: 'base_semi_rear',
  sorokonoga: 'base_sorokonoga_rear',
};

export function baseModel(chassisId: string, unit: number): ModelName {
  const base = unit === 0 ? BASE_MODELS[chassisId] : REAR_BASE_MODELS[chassisId];
  if (!base) throw new Error(`Chassis ${chassisId} has no base model for unit ${unit}`);
  return base;
}

export function baseModels(chassisId: string): ModelName[] {
  return REAR_BASE_MODELS[chassisId] ? [baseModel(chassisId, 0), baseModel(chassisId, 1)] : [baseModel(chassisId, 0)];
}

export const BODY_PARTS: ReadonlySet<string> = new Set(
  Object.values(PARTS).flatMap((p) => (p.kind === 'core' && p.role === 'cab' ? [p.id] : [])),
);

export type ItemTone = 'weapon' | 'armor' | 'cargo' | 'other';

const KIND_TONES: Record<PartKind, ItemTone> = {
  weapon: 'weapon',
  armor: 'armor',
  accessory: 'armor',
  cargo: 'cargo',
  engine: 'other',
  core: 'other',
  scanner: 'other',
  store: 'other',
  utility: 'other',
};

export function itemTone(id: string): ItemTone {
  const part = PARTS[id];
  if (part) return KIND_TONES[part.kind];
  if (id in GOODS || id === PARCEL.id) return 'cargo';
  throw new Error(`No item ${id}, so it has no tone`);
}

export const PART_MODELS: Record<string, ModelName> = {
  transmission: 'transmission',
  transmissionMid: 'transmission',
  transmissionHeavy: 'transmission',
  wheel: 'wheel',
  wheelMid: 'wheel',
  wheelHeavy: 'wheel',
  tank: 'fuel_tank',
  tankLong: 'fuel_tank',
  tankMid: 'fuel_tank',
  tankHeavy: 'fuel_tank',

  stockEngine: 'eng_stock',
  tunedEngine: 'eng_tuned_v8',
  flatFour: 'eng_flat_four',
  workhorseDiesel: 'eng_workhorse_diesel',
  racingV6: 'eng_racing_v6',
  heavyDiesel: 'eng_heavy_diesel',
  turbine: 'eng_turbine',

  plates: 'arm_plates',
  cage: 'arm_cage',
  ram: 'arm_ram',
  scrapPanels: 'arm_scrap_panels',
  ceramicPlates: 'arm_ceramic_plates',
  spacedArmor: 'arm_spaced',
  reinforcedCage: 'arm_reinforced_cage',
  plowRam: 'arm_plow_ram',
  steelPlate: 'arm_plate',
  scrapSheet: 'arm_scrap_sheet',
  ceramicTile: 'arm_ceramic_tile',
  claymoreRam: 'arm_claymore_ram',
  spacedTile: 'arm_spaced_tile',
  cageSection: 'arm_cage_section',
  reinforcedSection: 'arm_reinforced_section',
  spikeCluster: 'arm_spike_cluster',
  spikeStrip: 'arm_spike_strip',

  rack: 'cargo_rack',
  trailerBox: 'cargo_trailer_box',
  panniers: 'cargo_panniers',
  flatbed: 'cargo_flatbed',
  lightFrame: 'cargo_light_frame',
  enclosedFrame: 'cargo_enclosed_frame',
  heavyFrame: 'cargo_heavy_frame',

  scanner: 'scanner',

  jerrycans: 'store_jerrycans',
  supplyLocker: 'store_locker',

  sprout: 'util_sprout',
  caltrops: 'util_caltrops',
  oilSpiller: 'util_oil',
  patcherCrane: 'util_crane',
  smokeMortar: 'util_mortar',
  flareCannon: 'util_flare',
  scrapersKnife: 'util_scraper',
  emitter: 'util_emitter',

  scrap: 'good_scrap',
  salt: 'good_salt',
  meds: 'good_meds',
  grain: 'good_grain',
  textiles: 'good_textiles',
  tools: 'good_tools',
  batteries: 'good_batteries',
  electronics: 'good_electronics',
  parts: 'good_parts',
  fuelDrums: 'good_fuel_drums',
  water: 'good_water',
  rations: 'good_rations',
  relics: 'good_relics',
  [PARCEL.id]: 'parcel',
};

export type WeaponPool = { mount: ModelName[]; receiver: ModelName[]; barrel: ModelName[]; extra: ModelName[] };

export const WEAPON_POOLS: Record<string, WeaponPool> = {
  mg: {
    mount: ['wmount_ring_small', 'wmount_pintle'],
    receiver: ['wrec_mg_a', 'wrec_mg_b'],
    barrel: ['wbar_mg_short', 'wbar_mg_long', 'wbar_twin'],
    extra: ['wext_shield', 'wext_drum'],
  },
  shotgun: {
    mount: ['wmount_ring_small', 'wmount_pintle'],
    receiver: ['wrec_shotgun'],
    barrel: ['wbar_shotgun', 'wbar_twin'],
    extra: ['wext_shield', 'wext_drum'],
  },
  autocannon: {
    mount: ['wmount_ring_wide'],
    receiver: ['wrec_autocannon'],
    barrel: ['wbar_autocannon', 'wbar_twin'],
    extra: ['wext_drum', 'wext_shield'],
  },
  cannon: {
    mount: ['wmount_cradle'],
    receiver: ['wrec_cannon'],
    barrel: ['wbar_cannon'],
    extra: ['wext_shield', 'wext_scope'],
  },
  tankGun: {
    mount: ['wmount_cradle'],
    receiver: ['wrec_tank'],
    barrel: ['wbar_tank'],
    extra: ['wext_shield'],
  },
  rocketRack: {
    mount: ['wmount_ring_wide'],
    receiver: ['wrec_rocket_pod'],
    barrel: ['wbar_rocket_tubes'],
    extra: [],
  },
  sniperCannon: {
    mount: ['wmount_cradle'],
    receiver: ['wrec_sniper'],
    barrel: ['wbar_sniper'],
    extra: ['wext_scope'],
  },
  longRifle: {
    mount: ['wmount_pintle'],
    receiver: ['wrec_mg_b'],
    barrel: ['wbar_mg_long'],
    extra: ['wext_scope'],
  },
  flamer: {
    mount: ['wmount_ring_small'],
    receiver: ['wrec_shotgun'],
    barrel: ['wbar_shotgun'],
    extra: ['wext_drum'],
  },
  pneumobolter: {
    mount: ['wmount_ring_small', 'wmount_pintle'],
    receiver: ['wrec_autocannon'],
    barrel: ['wbar_autocannon'],
    extra: ['wext_drum', 'wext_shield'],
  },
  slugCannon: {
    mount: ['wmount_ring_wide'],
    receiver: ['wrec_autocannon'],
    barrel: ['wbar_cannon'],
    extra: ['wext_shield'],
  },
  heavyMg: {
    mount: ['wmount_ring_small'],
    receiver: ['wrec_mg_a', 'wrec_mg_b'],
    barrel: ['wbar_mg_long', 'wbar_twin'],
    extra: ['wext_shield', 'wext_drum'],
  },
  amRifle: {
    mount: ['wmount_cradle'],
    receiver: ['wrec_sniper'],
    barrel: ['wbar_sniper'],
    extra: ['wext_scope'],
  },
  recoilless: {
    mount: ['wmount_ring_wide'],
    receiver: ['wrec_cannon'],
    barrel: ['wbar_cannon'],
    extra: ['wext_shield'],
  },
  battleRifle: {
    mount: ['wmount_pintle'],
    receiver: ['wrec_mg_b'],
    barrel: ['wbar_mg_long'],
    extra: ['wext_scope', 'wext_drum'],
  },
  gatling: {
    mount: ['wmount_ring_wide'],
    receiver: ['wrec_autocannon'],
    barrel: ['wbar_twin'],
    extra: ['wext_drum'],
  },
  grenadeLauncher: {
    mount: ['wmount_ring_wide'],
    receiver: ['wrec_shotgun'],
    barrel: ['wbar_autocannon'],
    extra: ['wext_drum'],
  },
  flechette: {
    mount: ['wmount_ring_small'],
    receiver: ['wrec_mg_a'],
    barrel: ['wbar_mg_long'],
    extra: ['wext_scope'],
  },
  harpoon: {
    mount: ['wmount_pintle', 'wmount_ring_small'],
    receiver: ['wrec_harpoon'],
    barrel: ['wbar_harpoon'],
    extra: [],
  },
};

const TRUCK_FITTINGS: readonly ModelName[] = ['bumper_front', 'bumper_rear', 'wmount_riser', 'antenna', 'tow_chain', 'wheel', 'coilover', 'axle'];

export const SURFACE_MODELS: readonly ModelName[] = [
  ...new Set([
    ...Object.values(BASE_MODELS),
    ...Object.values(REAR_BASE_MODELS),
    ...Object.values(PART_MODELS),
    ...Object.values(WEAPON_POOLS).flatMap((p) => [...p.mount, ...p.receiver, ...p.barrel, ...p.extra]),
    ...TRUCK_FITTINGS,
  ]),
];

export type WeaponLook = { mount: ModelName; receiver: ModelName; barrel: ModelName; extra: ModelName | null };

export function itemLookId(item: GridItem): string {
  if (item.kind === 'part') return item.part.defId;
  return item.kind === 'good' ? item.good : PARCEL.id;
}

export function partModel(defId: string): ModelName {
  if (BODY_PARTS.has(defId)) throw new Error(`Part ${defId} is drawn by the truck body and has no model`);
  const name = PART_MODELS[defId];
  if (!name) throw new Error(`No model for part or good ${defId}. Add it to PART_MODELS.`);
  return name;
}

export function weaponLook(partId: string, defId: string): WeaponLook {
  const pool = WEAPON_POOLS[defId];
  if (!pool) throw new Error(`No weapon pool for ${defId}. Add it to WEAPON_POOLS.`);
  const pick = (slot: keyof WeaponPool): ModelName => {
    const options = pool[slot];
    return options[Math.floor(hashStr(`${partId}:${slot}`) * options.length)];
  };
  return {
    mount: pick('mount'),
    receiver: pick('receiver'),
    barrel: pick('barrel'),
    extra: pool.extra.length === 0 ? null : pick('extra'),
  };
}

export const WEAR_LOOK_STEPS = 4;
export const WORN_GRAY = 0x8c8a84;
export const GRAY_MAX = 0.35;
export const DENT_DEPTH = 0.35;
export const DENT_MAX = 0.15;
export const DENT_REACH = 0.3;
export const DENT_BAND = 0.2;
export const DENTS_PER_STEP = 3;
export const DENT_AREA = 32;
export const DENT_REACH_MAX = 1.6;
export const DENT_CLEAR = 0.15;
export const DENT_COLUMN = 0.25;
export const HULK_TONE = 0.45;
export const HULK_TILT = 0.06;

export type BreakSignature = 'ammo' | 'air' | 'fire';

export function wearLookStep(part: PartInstance): number {
  const max = maxHp(part);
  if (max <= 0) throw new Error(`Part ${part.id} has max HP ${max}`);
  if (part.hp <= 0) return WEAR_LOOK_STEPS;
  const share = Math.min(1, Math.max(0, 1 - part.hp / max));
  return Math.min(WEAR_LOOK_STEPS - 1, Math.ceil(share * (WEAR_LOOK_STEPS - 1)));
}

export function wearShare(step: number): number {
  return Math.sqrt(Math.min(step, WEAR_LOOK_STEPS) / WEAR_LOOK_STEPS);
}

export function grayShare(step: number): number {
  return GRAY_MAX * wearShare(step);
}

export function grayed(hex: number, share: number): number {
  const mix = (shift: number): number => {
    const c = (hex >> shift) & 255;
    const w = (WORN_GRAY >> shift) & 255;
    return Math.round(c + (w - c) * share);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export type Point = { x: number; y: number; z: number };

export type PartBox = { min: Point; max: Point };

export type DentAxis = 'x' | 'y' | 'z';

export type Dent = { axis: DentAxis; sign: 1 | -1; hit: Point | null; reach: number; depth: number };

export type DentSurface = { box: PartBox; points: readonly Point[]; tops: readonly Point[] | null; keepOut: readonly PartBox[] };

type Side = { axis: DentAxis; sign: Dent['sign'] };

const SIDES: readonly Side[] = [
  { axis: 'x', sign: 1 },
  { axis: 'x', sign: -1 },
  { axis: 'z', sign: 1 },
  { axis: 'z', sign: -1 },
];

const TOP: Side = { axis: 'y', sign: 1 };

export function dentsOf(partId: string, step: number, surface: DentSurface): Dent[] {
  if (surface.points.length === 0) throw new Error(`Part ${partId} has no points to dent`);
  const dents: Dent[] = [];
  const count = Math.round(WEAR_LOOK_STEPS * dentsPerStep(surface) * wearShare(step));
  const hits = new Map<Side, readonly Point[]>();
  const hitsFor = (side: Side): readonly Point[] => {
    const found = hits.get(side) ?? hitsOf(side, surface).filter((p) => clearOf(surface.keepOut, p) > 0);
    hits.set(side, found);
    return found;
  };
  for (let i = 0; i < count; i++) dents.push(dentAt(`${partId}:dent:${i}`, surface, hitsFor));
  return dents;
}

function dentsPerStep(surface: DentSurface): number {
  const size = sizeOf(surface.box);
  const sides = surface.tops === null ? SIDES : [...SIDES, TOP];
  const area = sides.reduce((sum, s) => sum + areaOf(s, size), 0);
  return Math.max(DENTS_PER_STEP, Math.round((DENTS_PER_STEP * area) / DENT_AREA));
}

export function columnTops(points: readonly Point[]): Point[] {
  const key = (p: Point): string => `${Math.floor(p.x / DENT_COLUMN)},${Math.floor(p.z / DENT_COLUMN)}`;
  const highest = new Map<string, number>();
  for (const p of points) highest.set(key(p), Math.max(highest.get(key(p)) ?? -Infinity, p.y));
  return points.filter((p) => p.y === highest.get(key(p)));
}

function sizeOf(box: PartBox): Point {
  return { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
}

function areaOf(side: Side, size: Point): number {
  if (side.axis === 'y') return size.x * size.z;
  return size.y * (side.axis === 'x' ? size.z : size.x);
}

function sideOf(roll: number, size: Point, top: boolean): Side {
  const sides = top ? [...SIDES, TOP] : SIDES;
  const areas = sides.map((s) => areaOf(s, size));
  let left = roll * areas.reduce((a, b) => a + b, 0);
  const index = areas.findIndex((a) => (left -= a) < 0);
  return sides[index === -1 ? sides.length - 1 : index];
}

function hitsOf(side: Side, surface: DentSurface): readonly Point[] {
  if (side.axis === 'y') return surface.tops ?? [];
  const { box, points } = surface;
  const face = side.sign > 0 ? box.max[side.axis] : box.min[side.axis];
  const band = DENT_BAND * (box.max[side.axis] - box.min[side.axis]);
  return points.filter((p) => Math.abs(face - p[side.axis]) <= band);
}

function dentAt(key: string, surface: DentSurface, hitsFor: (side: Side) => readonly Point[]): Dent {
  const size = sizeOf(surface.box);
  const side = sideOf(hashStr(`${key}:side`), size, surface.tops !== null);
  const near = hitsFor(side);
  const hit = near.length > 0 ? near[Math.floor(hashStr(`${key}:hit`) * near.length)] : null;
  const across = side.axis === 'y' ? Math.max(size.x, size.z) : Math.max(side.axis === 'x' ? size.z : size.x, size.y);
  return { ...side, hit: hit ? { ...hit } : null, reach: Math.min(DENT_REACH_MAX, DENT_REACH * across), depth: dentDepth(surface.box, side.axis) };
}

export function dentOffset(dents: readonly Dent[], surface: DentSurface, p: Point): Point {
  const push = { x: 0, y: 0, z: 0 };
  const clear = clearOf(surface.keepOut, p);
  if (clear === 0) return push;
  for (const d of dents) push[d.axis] += dentPush(d, surface.box, p) * clear;
  return { x: clampInward(push.x, surface.box, 'x'), y: clampInward(push.y, surface.box, 'y'), z: clampInward(push.z, surface.box, 'z') };
}

function clearOf(keepOut: readonly PartBox[], p: Point): number {
  let clear = 1;
  for (const k of keepOut) {
    const dx = Math.max(k.min.x - p.x, 0, p.x - k.max.x);
    const dz = Math.max(k.min.z - p.z, 0, p.z - k.max.z);
    clear = Math.min(clear, Math.hypot(dx, dz) / DENT_CLEAR);
  }
  return Math.min(1, clear);
}

function dentPush(d: Dent, box: PartBox, p: Point): number {
  if (!d.hit) return 0;
  const t = Math.hypot(p.x - d.hit.x, p.y - d.hit.y, p.z - d.hit.z) / d.reach;
  if (t >= 1) return 0;
  return -d.sign * d.depth * (1 - t * t) ** 2 * reachInto(d, d.hit, box, p);
}

function reachInto(d: Dent, hit: Point, box: PartBox, p: Point): number {
  if (d.axis === 'y') return Math.min(1, Math.max(0, 1 - (hit.y - p.y) / (DENT_BAND * (box.max.y - box.min.y))));
  const half = (box.max[d.axis] - box.min[d.axis]) / 2;
  const out = d.sign * (p[d.axis] - (box.max[d.axis] + box.min[d.axis]) / 2);
  return out <= 0 || half <= 0 ? 0 : Math.min(1, out / half);
}

function dentDepth(box: PartBox, axis: DentAxis): number {
  return Math.min(DENT_MAX, (DENT_DEPTH * (box.max[axis] - box.min[axis])) / 2);
}

function clampInward(push: number, box: PartBox, axis: DentAxis): number {
  const most = dentDepth(box, axis);
  return Math.max(-most, Math.min(most, push));
}

const CORE_BREAKS: Partial<Record<string, BreakSignature>> = { wheel: 'air', tank: 'fire' };

export function breakSignature(def: PartDef): BreakSignature | null {
  if (def.kind === 'weapon') return 'ammo';
  if (def.kind === 'core') return CORE_BREAKS[def.role] ?? null;
  return def.kind === 'store' && def.holds === 'fuel' ? 'fire' : null;
}

export type IconSection = 'weapon' | 'engine' | 'armor' | 'cargo' | 'store' | 'core' | 'good' | 'chassis';

export const ICON_SECTIONS: readonly IconSection[] = ['weapon', 'engine', 'armor', 'cargo', 'store', 'core', 'good', 'chassis'];

export type IconEntry = {
  id: string;
  section: IconSection;
  label: string;
  models: ModelName[];
  bulk: { w: number; h: number };
  rank: number;
  weapon: WeaponLook | null;
};

export const ICON_WEAPON_PICKS: Record<string, WeaponLook> = {
  mg: { mount: 'wmount_ring_small', receiver: 'wrec_mg_a', barrel: 'wbar_mg_short', extra: 'wext_drum' },
  shotgun: { mount: 'wmount_pintle', receiver: 'wrec_shotgun', barrel: 'wbar_shotgun', extra: 'wext_shield' },
  longRifle: { mount: 'wmount_pintle', receiver: 'wrec_mg_b', barrel: 'wbar_mg_long', extra: 'wext_scope' },
  flamer: { mount: 'wmount_ring_small', receiver: 'wrec_shotgun', barrel: 'wbar_shotgun', extra: 'wext_drum' },
  pneumobolter: { mount: 'wmount_ring_small', receiver: 'wrec_autocannon', barrel: 'wbar_autocannon', extra: 'wext_drum' },
  slugCannon: { mount: 'wmount_ring_wide', receiver: 'wrec_autocannon', barrel: 'wbar_cannon', extra: 'wext_shield' },
  heavyMg: { mount: 'wmount_ring_small', receiver: 'wrec_mg_a', barrel: 'wbar_twin', extra: 'wext_drum' },
  cannon: { mount: 'wmount_cradle', receiver: 'wrec_cannon', barrel: 'wbar_cannon', extra: 'wext_scope' },
  amRifle: { mount: 'wmount_cradle', receiver: 'wrec_sniper', barrel: 'wbar_sniper', extra: 'wext_scope' },
  autocannon: { mount: 'wmount_ring_wide', receiver: 'wrec_autocannon', barrel: 'wbar_autocannon', extra: 'wext_shield' },
  recoilless: { mount: 'wmount_ring_wide', receiver: 'wrec_cannon', barrel: 'wbar_cannon', extra: 'wext_shield' },
  battleRifle: { mount: 'wmount_pintle', receiver: 'wrec_mg_b', barrel: 'wbar_mg_long', extra: 'wext_drum' },
  gatling: { mount: 'wmount_ring_wide', receiver: 'wrec_autocannon', barrel: 'wbar_twin', extra: 'wext_drum' },
  rocketRack: { mount: 'wmount_ring_wide', receiver: 'wrec_rocket_pod', barrel: 'wbar_rocket_tubes', extra: null },
  sniperCannon: { mount: 'wmount_cradle', receiver: 'wrec_sniper', barrel: 'wbar_sniper', extra: 'wext_scope' },
  grenadeLauncher: { mount: 'wmount_ring_wide', receiver: 'wrec_shotgun', barrel: 'wbar_autocannon', extra: 'wext_drum' },
  tankGun: { mount: 'wmount_cradle', receiver: 'wrec_tank', barrel: 'wbar_tank', extra: 'wext_shield' },
  flechette: { mount: 'wmount_ring_small', receiver: 'wrec_mg_a', barrel: 'wbar_mg_long', extra: 'wext_scope' },
  harpoon: { mount: 'wmount_pintle', receiver: 'wrec_harpoon', barrel: 'wbar_harpoon', extra: null },
};

const PART_SECTION: Record<PartDef['kind'], IconSection> = {
  weapon: 'weapon',
  engine: 'engine',
  armor: 'armor',
  accessory: 'armor',
  cargo: 'cargo',
  store: 'store',
  scanner: 'store',
  utility: 'store',
  core: 'core',
};

export const CHASSIS_SHEET = 'chassis.png';
export const CHASSIS_MASK = 'chassis-paint.png';

export function iconCatalog(
  parts: Record<string, PartDef>,
  goods: Record<string, GoodDef>,
  chassis: Record<string, ChassisDef>,
  picks: Record<string, WeaponLook>,
): IconEntry[] {
  const drafts: IconDraft[] = [
    ...Object.values(parts).map((def) => partDraft(def, picks)),
    ...Object.values(goods).map(goodDraft),
    parcelDraft(),
    ...Object.values(chassis).map(chassisDraft),
  ];
  checkUniqueIds(drafts);
  return withRanks(drafts);
}

type IconDraft = { entry: Omit<IconEntry, 'rank'>; hp: number };

const CAB_ICON_MODELS: Record<string, ModelName> = { cab: 'cab_seat', cabPickup: 'cab_pickup', cabHardtop: 'cab_hardtop' };

function iconModel(defId: string): ModelName {
  if (!BODY_PARTS.has(defId)) return partModel(defId);
  const name = CAB_ICON_MODELS[defId];
  if (!name) throw new Error(`No icon model for cab ${defId}. Add it to CAB_ICON_MODELS.`);
  return name;
}

function partDraft(def: PartDef, picks: Record<string, WeaponLook>): IconDraft {
  const base = { id: def.id, section: PART_SECTION[def.kind], label: enName(partName(def.id)), bulk: def.bulk };
  if (def.kind !== 'weapon') return { entry: { ...base, models: [iconModel(def.id)], weapon: null }, hp: def.hp };
  const weapon = picks[def.id] ?? weaponLook(`icon:${def.id}`, def.id);
  return { entry: { ...base, models: weaponModels(weapon), weapon }, hp: def.hp };
}

function goodDraft(def: GoodDef): IconDraft {
  return { entry: { id: def.id, section: 'good', label: enName(goodName(def.id)), models: [partModel(def.id)], bulk: { w: 1, h: 1 }, weapon: null }, hp: 0 };
}

function parcelDraft(): IconDraft {
  return { entry: { id: PARCEL.id, section: 'good', label: enName(t('item.parcel')), models: [partModel(PARCEL.id)], bulk: { w: 1, h: 1 }, weapon: null }, hp: 0 };
}

const PORTRAIT_MODELS: readonly ModelName[] = ['coilover', 'axle', 'antenna', 'tow_chain'];

function chassisDraft(def: ChassisDef): IconDraft {
  const bulk = { w: def.layout[0].length, h: def.layout.length };
  const cores = def.core.filter((c) => !BODY_PARTS.has(c.defId)).map((c) => partModel(c.defId));
  const models = [...new Set([...baseModels(def.id), ...cores, ...PORTRAIT_MODELS])];
  return { entry: { id: def.id, section: 'chassis', label: enName(chassisName(def.id)), models, bulk, weapon: null }, hp: 0 };
}

function checkUniqueIds(drafts: readonly IconDraft[]): void {
  const ids = new Set<string>();
  for (const { entry } of drafts) {
    if (ids.has(entry.id)) throw new Error(`Icon id ${entry.id} is used twice across parts, goods and chassis`);
    ids.add(entry.id);
  }
}

function weaponModels(look: WeaponLook): ModelName[] {
  return look.extra ? [look.mount, look.receiver, look.barrel, look.extra] : [look.mount, look.receiver, look.barrel];
}

function withRanks(drafts: readonly IconDraft[]): IconEntry[] {
  const groups = new Map<string, IconDraft[]>();
  for (const d of drafts) {
    const key = d.entry.models.join('+');
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const ranks = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length === 1) continue;
    group.sort((a, b) => a.hp - b.hp || a.entry.id.localeCompare(b.entry.id)).forEach((d, i) => ranks.set(d.entry.id, i + 1));
  }
  return drafts.map((d) => ({ ...d.entry, rank: ranks.get(d.entry.id) ?? 0 }));
}

export function renderKey(e: IconEntry): string {
  const bulk = e.weapon ? `@${e.bulk.w}x${e.bulk.h}` : '';
  return `${e.models.join('+')}${bulk}#${e.rank}`;
}
