import { chassisDef } from '../data/chassis';
import { CRATE_MASS, GOODS } from '../data/goods';
import { GEAR_DRAWS, GEAR_LEVELS, GEAR_LEVEL_IDS, GEAR_WHIM, MIN_NPC_SPEED, NPC_UPKEEP, PRIORITY_TOP, type CargoRoll, type GearLevel, type Load, type LoadoutPriorities, type NpcLoadoutTable, type NpcTemplate, type Weighted } from '../data/npcs';
import { NPC_UTILITY_PARTS } from '../data/npc-utilities';
import { PARTS, partDef, type PartKind } from '../data/parts';
import { everyGunFires } from './armor';
import { makePart, makeVehicle, newId, type PartSpec } from './factory';
import { freeCells, gridOf, mountedItems, MOUNT_CELLS, mountSpots, plateSide, type SideLetter } from './grid';
import { addGoods, mountPart, stowPart } from './inventory';
import { vehicleMass } from './mass';
import { armorQuality, gearScorer } from './npc-gear-score';
import { massRoomAbove, meetsSpeedFloor, npcMassRoom, speedShare, vehicleStats } from './stats';
import { nextRandom, type Rng } from './rng';
import type { GridItem, Vehicle, World } from './types';

export type NpcLoadout = {
  chassisId: string;
  level: GearLevel;
  parts: PartSpec[];
  spares: PartSpec[];
  cargo: Record<string, number>;
};
type Level = (typeof GEAR_LEVELS)[GearLevel];
type PartItem = Extract<GridItem, { kind: 'part' }>;

function validateWeights<T>(pool: Weighted<T>[]): number {
  if (pool.length === 0) throw new Error('Empty NPC equipment pool');
  let total = 0;
  for (const entry of pool) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) throw new Error('NPC equipment weights must be positive and finite');
    total += entry.weight;
  }
  if (!Number.isFinite(total)) throw new Error('NPC equipment weight total is not finite');
  return total;
}

export function sampleWeighted<T>(rng: Rng, pool: Weighted<T>[]): T {
  const total = validateWeights(pool);
  let roll = nextRandom(rng) * total;
  for (const entry of pool) {
    if (roll < entry.weight) return entry.value;
    roll -= entry.weight;
  }
  throw new Error('NPC equipment roll exceeded its weight total');
}

function validatePartPool(pool: Weighted<string | null>[], kind: PartKind): void {
  validateWeights(pool);
  for (const entry of pool) {
    if (entry.value !== null && partDef(entry.value).kind !== kind) throw new Error(`NPC pool requires ${kind} parts`);
  }
}

function utilityPoolOf(template: NpcTemplate): Weighted<string | null>[] {
  const pool = NPC_UTILITY_PARTS[template.id];
  if (!pool) throw new Error(`NPC template ${template.id} has no utility pool`);
  return pool;
}

function validateUtilityPool(pool: Weighted<string | null>[]): void {
  validateWeights(pool);
  const stray = pool.find(({ value }) => value !== null && !isGearPart(value));
  if (stray) throw new Error(`NPC utility pool holds ${stray.value}, not a utility or a line gun`);
}

function isGearPart(defId: string): boolean {
  const def = partDef(defId);
  return def.kind === 'utility' || isLineGun(defId);
}

function isLineGun(defId: string): boolean {
  const def = partDef(defId);
  return def.kind === 'weapon' && def.line !== undefined;
}

function validateSparePool(pool: Weighted<string | null>[]): void {
  validateWeights(pool);
  for (const { value } of pool) {
    if (value !== null && partDef(value).kind === 'core') throw new Error('NPC spare pool cannot offer a core part');
  }
}

function validateGoodsTable(goods: Weighted<CargoRoll | null>[]): void {
  validateWeights(goods);
  for (const { value } of goods) {
    if (value === null) continue;
    if (!GOODS[value.good]) throw new Error(`Unknown NPC cargo ${value.good}`);
    if (!Number.isInteger(value.count) || value.count <= 0) throw new Error('NPC cargo counts must be positive integers');
  }
}

function validateSpareTable(spares: NpcLoadoutTable['spares']): void {
  if (!spares) return;
  validateSparePool(spares.pool);
  validateWeights(spares.count);
  for (const { value } of spares.count) {
    if (!Number.isInteger(value) || value < 0) throw new Error('NPC spare counts must be non-negative integers');
  }
}

function validateTable(table: NpcLoadoutTable): void {
  for (const reserve of Object.values(table.haul)) if (!Number.isInteger(reserve) || reserve < 0) throw new Error('NPC haul reserves must be non-negative integers');
  validateWeights(table.chassis);
  for (const entry of table.chassis) chassisDef(entry.value);
  validateWeights(table.levels);
  for (const { value } of table.levels) if (!GEAR_LEVEL_IDS.includes(value)) throw new Error(`Unknown gear level ${value}`);
  validatePriorities(table.priorities);
  validatePartPool(table.cargoPart, 'cargo');
  validateGoodsTable(table.goods);
  validateSpareTable(table.spares);
}

function validatePriorities(p: LoadoutPriorities): void {
  for (const [key, weight] of Object.entries(p)) if (!(weight >= 0 && weight <= PRIORITY_TOP)) throw new Error(`Loadout priority ${key} ${weight} must lie in 0 to ${PRIORITY_TOP}`);
  if (!(p.armor + p.firepower > 0)) throw new Error('Loadout priorities need firepower or armor above 0 for the driver to judge a fight');
}

function rollWear(world: World, rng: Rng, level: Level, v: Vehicle): void {
  for (const item of v.items) {
    if (item.kind !== 'part' || ['core', 'engine'].includes(partDef(item.part.defId).kind)) continue;
    item.part = makePart(world, item.part.defId, wearOf(rng, level));
  }
}

function wearOf(rng: Rng, level: Level): number {
  return sampleWeighted(rng, level.wear);
}

export type GearRules = { armored: boolean; armorFirst: boolean; gunFirst: boolean; gunTier: number; money: number | null; paysFuel: boolean; minSpeed: number; cargoPart: boolean };
export const TOP_GUN_TIER = Math.max(...Object.values(PARTS).filter((d) => d.kind === 'weapon').map((d) => d.tier));
export const OPEN_GEAR: GearRules = { armored: true, armorFirst: false, gunFirst: false, gunTier: TOP_GUN_TIER, money: null, paysFuel: true, minSpeed: MIN_NPC_SPEED, cargoPart: true };

type Build = { world: World; budget: number; engineWear: number; keep: Load; keepShare: number; rules: GearRules };

const NO_RESERVE: Load = { kg: 0, cells: 0 };

function keepsHaul(b: Build, v: Vehicle): boolean {
  return freeCells(v) >= b.keep.cells && massRoomAbove(v, b.keepShare, b.rules.minSpeed) >= b.keep.kg;
}

function equipmentCost(v: Vehicle): number {
  return chassisDef(v.chassisId).value + v.items.reduce((sum, item) => {
    if (item.kind !== 'part' || partDef(item.part.defId).kind === 'core') return sum;
    return sum + partDef(item.part.defId).value;
  }, 0);
}

function fits(b: Build, v: Vehicle): boolean {
  return equipmentCost(v) <= b.budget && vehicleMass(v) <= chassisDef(v.chassisId).ratedMass && meetsSpeedFloor(v, 0, b.rules.minSpeed) && everyGunFires(v) && keepsHaul(b, v);
}

function copyOf(v: Vehicle): Vehicle {
  return { ...v, items: [...v.items] };
}

function mounted(b: Build, v: Vehicle, defId: string, mount?: SideLetter[]): Vehicle | null {
  const next = copyOf(v);
  return mountPart(b.world, next, makePart(b.world, defId, 0), mount) && fits(b, next) ? next : null;
}

function chooseOptionalPart(b: Build, rng: Rng, v: Vehicle, pool: Weighted<string | null>[]): Vehicle {
  const choices: Weighted<Vehicle>[] = [];
  for (const entry of pool) {
    const candidate = entry.value === null ? v : withinTier(b.rules, entry.value) ? mounted(b, v, entry.value) : null;
    if (candidate) choices.push({ value: candidate, weight: entry.weight });
  }
  if (!choices.length) throw new Error(`No eligible optional equipment for ${v.chassisId}. Add an explicit empty outcome or a fitting part.`);
  return sampleWeighted(rng, choices);
}

const ENGINES = Object.values(PARTS).filter((d) => d.kind === 'engine').map((d) => d.id);
const GUNS = Object.values(PARTS).filter((d) => d.kind === 'weapon' && !isLineGun(d.id)).map((d) => d.id);

function gunsFor(rules: GearRules): string[] {
  return GUNS.filter((id) => withinTier(rules, id));
}

function withinTier(rules: GearRules, defId: string): boolean {
  const def = partDef(defId);
  return def.kind !== 'weapon' || def.tier <= rules.gunTier;
}
const ARMOR = Object.values(PARTS).filter((d) => d.kind === 'armor').map((d) => d.id);
const SIDE_GROUPS: SideLetter[][] = [['F'], ['L', 'R'], ['B']];

function withEngine(b: Build, v: Vehicle, defId: string): Vehicle | null {
  const old = mountedItems(v, 'engine')[0];
  const next = { ...v, items: v.items.filter((item) => item !== old) };
  return mountPart(b.world, next, makePart(b.world, defId, b.engineWear)) && fits(b, next) ? next : null;
}

function withGun(b: Build, score: (v: Vehicle) => number, v: Vehicle, defId: string): Vehicle | null {
  if (!affords(b, v, partDef(defId))) return null;
  const item: PartItem = { id: newId(b.world, 'i'), x: 0, y: 0, rot: 0, kind: 'part', part: makePart(b.world, defId, 0) };
  return bestGunSpot(b, v, item, score);
}

function affords(b: Build, v: Vehicle, def: { value: number; mass: number }): boolean {
  return equipmentCost(v) + def.value <= b.budget && vehicleMass(v) + def.mass <= chassisDef(v.chassisId).ratedMass;
}

function bestGunSpot(b: Build, v: Vehicle, item: PartItem, score: (v: Vehicle) => number): Vehicle | null {
  const spots = mountSpots(gridOf(v), v.items, item, MOUNT_CELLS.weapon);
  let best: Vehicle | null = null;
  let bestScore = -Infinity;
  for (const spot of spots) {
    const next = { ...v, items: [...v.items, { ...item, ...spot }] };
    if (!everyGunFires(next) || !keepsHaul(b, next)) continue;
    if (best === null && !meetsSpeedFloor(next, 0, b.rules.minSpeed)) return null;
    const value = score(next);
    if (value > bestScore) [best, bestScore] = [next, value];
  }
  return best;
}

function withArmor(b: Build, v: Vehicle, defId: string, sides: SideLetter[]): Vehicle | null {
  const next = copyOf(v);
  for (const side of sides) if (!mountPart(b.world, next, makePart(b.world, defId, 0), [side])) return null;
  return fits(b, next) ? next : null;
}

function withBetterArmor(b: Build, v: Vehicle, defId: string, sides: SideLetter[]): Vehicle | null {
  const quality = (item: PartItem) => armorQuality(b.world, item.part.defId, item.part.wear);
  let next = v;
  for (const side of sides) {
    const onSide = mountedItems(next, 'armor').filter((item) => plateSide(next.chassisId, item) === side);
    if (!onSide.length) return null;
    const worst = onSide.reduce((a, c) => (quality(c) < quality(a) ? c : a));
    if (armorQuality(b.world, defId, 0) <= quality(worst)) return null;
    next = { ...next, items: next.items.filter((item) => item !== worst) };
    if (!mountPart(b.world, next, makePart(b.world, defId, 0), [side])) return null;
  }
  return fits(b, next) ? next : null;
}

type GearMove = (v: Vehicle) => Vehicle | null;

function gearMoves(b: Build, score: (v: Vehicle) => number): GearMove[] {
  const moves: GearMove[] = gunsFor(b.rules).map((id) => (v: Vehicle) => withGun(b, score, v, id));
  if (b.rules.armored) moves.push(...armorMoves(b));
  for (const id of ENGINES) moves.push((v) => withEngine(b, v, id));
  return moves;
}

function armorMoves(b: Build): GearMove[] {
  return ARMOR.flatMap((id) => SIDE_GROUPS.flatMap((sides): GearMove[] => [(v) => withArmor(b, v, id, sides), (v) => withBetterArmor(b, v, id, sides)]));
}

function takeStep(b: Build, rng: Rng, v: Vehicle, moves: GearMove[], score: (v: Vehicle) => number, now: number, mustAct = false): Vehicle | null {
  const drawn = drawOffers(b, rng, v, moves, (next) => {
    const gain = score(next) - now;
    return gain > 0 || (mustAct && gain === 0) ? gain : null;
  });
  if (!drawn.length) return null;
  if (nextRandom(rng) < GEAR_WHIM) return drawn[Math.floor(nextRandom(rng) * drawn.length)].v;
  return drawn.reduce((a, c) => (c.worth > a.worth ? c : a)).v;
}

function drawOffers(b: Build, rng: Rng, v: Vehicle, moves: GearMove[], gainOf: (next: Vehicle) => number | null): { v: Vehicle; worth: number }[] {
  const order = [...moves];
  const drawn: { v: Vehicle; worth: number }[] = [];
  for (let i = 0; i < order.length && drawn.length < GEAR_DRAWS; i++) {
    const pick = i + Math.floor(nextRandom(rng) * (order.length - i));
    [order[i], order[pick]] = [order[pick], order[i]];
    const next = order[i](v);
    const gain = next && gainOf(next);
    if (next && gain !== null) drawn.push({ v: next, worth: gain / used(b, v, next) });
  }
  return drawn;
}

function used(b: Build, v: Vehicle, next: Vehicle): number {
  const money = (equipmentCost(next) - equipmentCost(v)) / Math.max(1, b.budget - equipmentCost(v));
  const mass = (vehicleMass(next) - vehicleMass(v)) / Math.max(1, massRoom(b, v));
  return Math.max(money, mass, MIN_USED);
}
const MIN_USED = 1e-3;

function massRoom(b: Build, v: Vehicle): number {
  return mountedItems(v, 'engine').length ? massRoomAbove(v, 0, b.rules.minSpeed) : chassisDef(v.chassisId).ratedMass - vehicleMass(v);
}

function chooseEngine(b: Build, rng: Rng, p: LoadoutPriorities, bare: Vehicle): Vehicle {
  const offers = ENGINES.map((id) => withEngine(b, bare, id));
  const options = offers.filter((v): v is Vehicle => v !== null);
  if (!options.length) throw new Error(`No engine keeps the speed floor on ${bare.chassisId} at wear ${b.engineWear} within the gear money`);
  const fastest = options.reduce((a, c) => (vehicleStats(b.world, c).maxSpeed > vehicleStats(b.world, a).maxSpeed ? c : a));
  const score = gearScorer(b.world, p, fastest, b.rules.paysFuel);
  const engine = takeStep(b, rng, bare, ENGINES.map((id) => (v: Vehicle) => withEngine(b, v, id)), score, 0, true);
  if (!engine) throw new Error(`No engine adds speed to ${bare.chassisId}`);
  return engine;
}

function chooseVehicle(probe: World, rng: Rng, wearRng: Rng, template: NpcTemplate, chassisId: string | null, gear: GearLevel, rules: GearRules): Vehicle {
  const table = template.loadout;
  const level = GEAR_LEVELS[gear];
  const chassis = chassisId ?? sampleWeighted(rng, fastEnough(template, rules.minSpeed));
  const bare = makeVehicle(probe, { faction: 'independent', chassisId: chassis, parts: [], spares: [], cargo: {}, pos: { x: 0, y: 0 }, heading: 0, brain: null });
  const keepShare = speedShare(table.priorities);
  const open: Build = { world: probe, budget: chassisDef(chassis).value + (rules.money ?? level.money), engineWear: wearOf(wearRng, level), keep: NO_RESERVE, keepShare, rules };
  const powered = chooseEngine(open, rng, table.priorities, bare);
  const b: Build = { ...open, keep: keepsHaul({ ...open, keep: table.haul }, powered) ? table.haul : NO_RESERVE };
  return pickGear(b, rng, table.priorities, withFirstPicks(b, rng, template, powered), powered);
}

function withFirstPicks(b: Build, rng: Rng, template: NpcTemplate, powered: Vehicle): Vehicle {
  const table = template.loadout;
  let v = b.rules.gunFirst ? chooseFirstGun(b, rng, table.priorities, powered) : powered;
  if (b.rules.cargoPart) v = chooseOptionalPart(b, rng, v, table.cargoPart);
  v = chooseOptionalPart(b, rng, v, utilityPoolOf(template));
  return b.rules.armorFirst ? pickWith(b, rng, armorMoves(b), gearScorer(b.world, table.priorities, powered, b.rules.paysFuel), v) : v;
}

const SPEED_HEADROOM = 1.15;

function fastEnough(template: NpcTemplate, minSpeed: number): Weighted<string>[] {
  const fast = template.loadout.chassis.filter((entry) => chassisDef(entry.value).maxSpeed >= minSpeed * SPEED_HEADROOM);
  if (!fast.length) throw new Error(`${template.id} has no chassis as fast as ${minSpeed}`);
  return fast;
}

function chooseFirstGun(b: Build, rng: Rng, p: LoadoutPriorities, powered: Vehicle): Vehicle {
  const score = gearScorer(b.world, p, powered, b.rules.paysFuel);
  const now = score(powered);
  const gunsOn = (v: Vehicle) => drawOffers(b, rng, v, gunsFor(b.rules).map((id) => (x: Vehicle) => withGun(b, score, x, id)), (next) => score(next) - now);
  let drawn = gunsOn(powered);
  if (!drawn.length) drawn = ENGINES.map((id) => withEngine(b, powered, id)).filter((v): v is Vehicle => v !== null).flatMap(gunsOn);
  if (!drawn.length) throw new Error(`No gun fits on ${powered.chassisId} with any engine within the gear money`);
  return drawn.reduce((a, c) => (c.worth > a.worth ? c : a)).v;
}

function pickGear(b: Build, rng: Rng, p: LoadoutPriorities, v: Vehicle, powered: Vehicle): Vehicle {
  const score = gearScorer(b.world, p, powered, b.rules.paysFuel);
  return pickWith(b, rng, gearMoves(b, score), score, v);
}

function pickWith(b: Build, rng: Rng, moves: GearMove[], score: (v: Vehicle) => number, v: Vehicle): Vehicle {
  for (;;) {
    const next = takeStep(b, rng, v, moves, score, score(v));
    if (!next) return v;
    v = next;
  }
}

export type Refit = { priorities: LoadoutPriorities; money: number; allowed: (v: Vehicle) => boolean; paysFuel: boolean };

export function refitLoadout(world: World, rng: Rng, truck: Vehicle, refit: Refit): Vehicle {
  const probe = { ...world };
  const b: Build = { world: probe, budget: equipmentCost(truck) + refit.money, engineWear: 0, keep: NO_RESERVE, keepShare: speedShare(refit.priorities), rules: { ...OPEN_GEAR, paysFuel: refit.paysFuel } };
  const powered = { ...truck, items: truck.items.filter((it) => it.kind === 'part' && ['core', 'engine'].includes(partDef(it.part.defId).kind)) };
  const score = gearScorer(probe, refit.priorities, powered, refit.paysFuel);
  const moves = gearMoves(b, score).map((move): GearMove => (v) => {
    const next = move(v);
    return next && refit.allowed(next) ? next : null;
  });
  let v = truck;
  for (let next = takeStep(b, rng, v, moves, score, score(v)); next; next = takeStep(b, rng, v, moves, score, score(v))) v = next;
  return v;
}

function mountedNonCore(v: Vehicle): PartSpec[] {
  return v.items.flatMap((item) =>
    item.kind === 'part' && partDef(item.part.defId).kind !== 'core' ? [{ defId: item.part.defId, wear: item.part.wear, at: { x: item.x, y: item.y, rot: item.rot } }] : [],
  );
}

type Room = { cells: number; mass: number };

function chooseGoods(rng: Rng, table: NpcLoadoutTable, level: Level, room: Room): CargoRoll | null {
  const goods = table.goods.filter(({ value }) => value === null || (value.count <= room.cells && CRATE_MASS * value.count <= room.mass));
  if (!goods.length) throw new Error('No fitting cargo outcome for this NPC template');
  const roll = sampleWeighted(rng, goods);
  if (!roll) return null;
  const count = Math.min(Math.max(1, Math.round(roll.count * level.cargo)), room.cells, Math.floor(room.mass / CRATE_MASS));
  return { good: roll.good, count };
}

function chooseCargo(world: World, rng: Rng, wearRng: Rng, table: NpcLoadoutTable, level: Level, v: Vehicle, rules: GearRules): { spares: PartSpec[]; carried: Record<string, number> } {
  const load = { ...v, items: [...v.items] };
  const share = speedShare(table.priorities);
  const massLeft = () => Math.max(0, Math.min(chassisDef(v.chassisId).ratedMass - vehicleMass(load), npcMassRoom(load, share)) - table.haul.kg);
  const cellsLeft = () => Math.max(0, freeCells(load) - table.haul.cells);
  const carried: Record<string, number> = {};
  const addGood = (good: string, n: number) => {
    const added = addGoods(world, load, good, n);
    if (added > 0) carried[good] = (carried[good] ?? 0) + added;
  };
  addGood('parts', Math.min(NPC_UPKEEP.repairParts, Math.floor(massLeft() / CRATE_MASS), cellsLeft()));
  const cargo = chooseGoods(rng, table, level, { cells: cellsLeft(), mass: massLeft() });
  if (cargo) addGood(cargo.good, cargo.count);
  return { spares: addSpareParts(world, wearRng, table, level, load, { mass: massLeft, cells: cellsLeft }, rules), carried };
}

type Left = { mass: () => number; cells: () => number };

function spareAllowed(defId: string | null, left: Left, rules: GearRules): defId is string {
  if (defId === null) return false;
  const def = partDef(defId);
  if (!rules.armored && def.kind === 'armor') return false;
  if (!withinTier(rules, defId)) return false;
  return def.mass <= left.mass() && def.w * def.h <= left.cells();
}

function addSpareParts(world: World, rng: Rng, table: NpcLoadoutTable, level: Level, load: Vehicle, left: Left, rules: GearRules): PartSpec[] {
  if (!table.spares) return [];
  const added: PartSpec[] = [];
  const count = Math.round(sampleWeighted(rng, table.spares.count) * level.cargo);
  for (let i = 0; i < count; i++) {
    const defId = sampleWeighted(rng, table.spares.pool);
    if (!spareAllowed(defId, left, rules)) continue;
    const part = makePart(world, defId, wearOf(rng, level));
    if (stowPart(world, load, part)) added.push({ defId, wear: part.wear });
  }
  return added;
}

export function generateNpcLoadout(world: World, template: NpcTemplate, chassisId: string | null = null, level: GearLevel | null = null, rules: GearRules = OPEN_GEAR): NpcLoadout {
  const table = template.loadout;
  validateTable(table);
  validateUtilityPool(utilityPoolOf(template));
  const probe = { ...world };
  const rng = { rngState: world.rngState };
  const wearRng = { rngState: world.marketRng.rngState };
  const gear = level ?? sampleWeighted(rng, table.levels);
  const v = chooseVehicle(probe, rng, wearRng, template, chassisId, gear, rules);
  rollWear(probe, wearRng, GEAR_LEVELS[gear], v);
  const { spares, carried } = chooseCargo(probe, rng, wearRng, table, GEAR_LEVELS[gear], v, rules);
  world.rngState = rng.rngState;
  world.marketRng = wearRng;
  return { chassisId: v.chassisId, level: gear, parts: mountedNonCore(v), spares, cargo: carried };
}
