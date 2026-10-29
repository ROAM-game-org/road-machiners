
import type { StartKit } from '../data/start';
import type { BakedMap } from '../sim/terrain';
import { carriedWorld, type Carried, type CarriedItem, type CarriedPaint, type CarriedPart, type CarriedRun } from '../sim/world';
import { mapAt } from '../sim/highway';
import type { World } from '../sim/types';
import type { SlotId } from './save-slots';
import { savedMisfit, savedRevisionsOf, savedRunId, saveOf, storedSave, writeSave } from './save';
import { LAYOUTS_2_34 } from './save-layouts-2-34';
import { relaidTrucks_1_2, withWideMg_42_43 } from './save-migrations';
import { withSquareGrid_121_122 } from './save-step-square-grid';
import { armorRowOfItem_120_121, chaosHighwayMode_113_114, mutedColor_96_97, paintOfPreset_95_96, withOddFronts_102_103 } from './save-steps-late';
import type { SaveSlots } from './save-db';

type Json = Record<string, unknown>;

const CENTS_PER_MONEY_29_30 = 100 / 3;
const XP_TO_REACH_9_10 = [0, 200, 600, 1200, 2000, 3000];

function pooledSkills_9_10(skills: Record<string, number>): { xp: number; ranks: Record<string, number> } {
  let xp = 0;
  const ranks: Record<string, number> = {};
  for (const [skill, total] of Object.entries(skills)) {
    let level = 0;
    while (level < XP_TO_REACH_9_10.length - 1 && total >= XP_TO_REACH_9_10[level + 1]) level++;
    ranks[skill] = level;
    xp += total - XP_TO_REACH_9_10[level];
  }
  return { xp, ranks };
}

export const RETIRED_PRICES_RESCUE: Readonly<Record<string, number>> = {};

const RENAMED_PARTS_RESCUE: Readonly<Record<string, string>> = { cabOver: 'cabPickup', cabRow: 'cabPickup', cabWide: 'cabPickup', cabNarrow: 'cabPickup' };
const RENAMED_PERKS_RESCUE: Readonly<Record<string, string>> = { bountyTalk: 'bountyHunter' };
const RENAMED_NOTES_RESCUE: Readonly<Record<string, string>> = { wagonPin: 'wagonRod', talkOnePin: 'talkBrakeRod' };

type VarRename = { before: number; quest: string | null; from: string; to: string };

const RENAMED_VARS_RESCUE: readonly VarRename[] = [
  { before: 56, quest: 'bowl_hattie', from: 'hattie_sunward', to: 'hattie_glass' },
  { before: 79, quest: null, from: 'wagon_pin', to: 'wagon_rod' },
  { before: 79, quest: 'nose_lena', from: 'asked_pins', to: 'asked_rods' },
  { before: 89, quest: 'nose_kovac', from: 'heard_gate_law', to: 'heard_mounts' },
  { before: 89, quest: 'nose_kovac', from: 'asked_gate_law', to: 'asked_mounts' },
];

const HATTIE_MET_BEFORE = 78;
const FIRST_MODE_NAME_BEFORE = 49;
const CHAOS_HIGHWAY_NAME_BEFORE = 114;
const GEAR_GROWTH_BEFORE = 58;
const GEAR_GROWTH_START = 1;

function formatBefore(format: number, minor: number): boolean {
  return format < 2000 + minor;
}

function renamedIn(table: Readonly<Record<string, string>>, id: string): string {
  return Object.hasOwn(table, id) ? table[id] : id;
}

function objectOf(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function countOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function flagOf(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function idOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function paintOf(value: unknown): CarriedPaint | null {
  const preset = idOf(value);
  const slots = preset === null ? objectOf(value) : paintOfPreset_95_96(preset);
  if (!slots) return null;
  return Object.fromEntries((['body', 'cab', 'gear'] as const).flatMap((slot) => {
    const id = idOf(slots[slot]);
    return id === null ? [] : [[slot, mutedColor_96_97(id)]];
  }));
}

function countsOf(value: unknown): Record<string, number> {
  const entries = Object.entries(objectOf(value) ?? {}).map(([key, n]) => [key, countOf(n)] as const);
  return Object.fromEntries(entries.filter((e): e is [string, number] => e[1] !== null));
}

function partOf(value: unknown): CarriedPart | null {
  const part = objectOf(value);
  const defId = idOf(part?.defId);
  if (!part || defId === null) return null;
  return { defId: renamedIn(RENAMED_PARTS_RESCUE, defId), wear: countOf(part.wear) ?? 0, hp: countOf(part.hp) ?? 0, rebuilt: part.rebuilt === true };
}

function isGridInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function spotOf(item: Json): { x: number; y: number; rot: 0 | 1 | 2 | 3 } | null {
  return isGridInt(item.x) && isGridInt(item.y) ? { x: item.x, y: item.y, rot: item.rot === 1 || item.rot === 2 || item.rot === 3 ? item.rot : 0 } : null;
}

function itemOf(value: unknown): CarriedItem | null {
  const item = objectOf(value);
  const spot = item && spotOf(item);
  if (!item || !spot) return null;
  return item.kind === 'part' ? partItemOf(item, spot) : goodItemOf(item, spot);
}

function partItemOf(item: Json, spot: NonNullable<ReturnType<typeof spotOf>>): CarriedItem | null {
  const part = partOf(item.part);
  return part && { ...spot, kind: 'part', part };
}

function goodItemOf(item: Json, spot: NonNullable<ReturnType<typeof spotOf>>): CarriedItem | null {
  const good = idOf(item.good);
  return item.kind === 'good' && good !== null ? { ...spot, kind: 'good', good } : null;
}

function vehicleOf(world: Json, id: unknown): Json | null {
  return listOf(world.vehicles).map(objectOf).find((v) => v !== null && v.id === id) ?? null;
}

const RELAID_BEFORE = 2;
const WIDE_MG_BEFORE = 43;
const ODD_FRONTS_BEFORE = 103;
const ARMOR_ROWS_OUTSIDE_BEFORE = 121;
const SQUARE_GRID_BEFORE = 122;
const OFF_GRID = -1;
const RESCUED_ID = 'rescued';
const NO_PLAYER_VEHICLE = 'none';

type Placed = { items: CarriedItem[]; storage: CarriedPart[]; money: number };
type WorldStep = { before: number; known: (chassisId: string) => boolean; step: (world: Json) => Json };

const WORLD_STEPS: readonly WorldStep[] = [
  { before: RELAID_BEFORE, known: () => true, step: relaidTrucks_1_2 },
  { before: WIDE_MG_BEFORE, known: (chassisId) => Object.hasOwn(LAYOUTS_2_34, chassisId), step: withWideMg_42_43 },
  { before: ODD_FRONTS_BEFORE, known: () => true, step: withOddFronts_102_103 },
];

function savedPartOf(part: CarriedPart, id: string): Json {
  return { id, defId: part.defId, hp: part.hp, wear: part.wear, rebuilt: part.rebuilt };
}

function savedItemOf(item: CarriedItem, i: number): Json {
  const spot = { id: `item${i}`, x: item.x, y: item.y, rot: item.rot };
  if (item.kind === 'good') return { ...spot, kind: 'good', good: item.good };
  return { ...spot, kind: 'part', part: savedPartOf(item.part, `part${i}`) };
}

function savedVehicleOf(chassisId: string, items: CarriedItem[]): Json {
  return { id: RESCUED_ID, faction: 'player', chassisId, items: items.map(savedItemOf) };
}

function throughStep({ known, step }: WorldStep, chassisId: string | null, placed: Placed, player: boolean): Placed {
  if (chassisId !== null && !known(chassisId)) return placed;
  if (!player) return { ...placed, items: itemsAfter(step(miniWorld(chassisId, placed.items, NO_PLAYER_VEHICLE, [])), chassisId, placed.items) };
  const moved = step(miniWorld(chassisId, placed.items, RESCUED_ID, placed.storage));
  return { items: itemsAfter(moved, chassisId, placed.items), ...garageAndMoney(moved.player as Json, placed.money) };
}

function miniWorld(chassisId: string | null, items: CarriedItem[], vehicleId: string, stored: CarriedPart[]): Json {
  return {
    player: { vehicleId, storage: stored.map((part, i) => savedPartOf(part, `stored${i}`)), money: 0 },
    vehicles: chassisId === null ? [] : [savedVehicleOf(chassisId, items)],
  };
}

function itemsAfter(moved: Json, chassisId: string | null, before: CarriedItem[]): CarriedItem[] {
  return chassisId === null ? before : ((moved.vehicles as Json[])[0].items as Json[]).flatMap((it) => itemOf(it) ?? []);
}

function garageAndMoney(player: Json, money: number): Pick<Placed, 'storage' | 'money'> {
  return { storage: (player.storage as Json[]).flatMap((p) => partOf(p) ?? []), money: money + (player.money as number) };
}

function onSquareGrid(chassisId: string, items: CarriedItem[]): CarriedItem[] {
  const moved = withSquareGrid_121_122({ player: { vehicleId: RESCUED_ID, storage: [] }, vehicles: [savedVehicleOf(chassisId, items)] });
  const spots = new Map(((moved.vehicles as Json[])[0].items as Json[]).map((it) => [it.id, it]));
  return items.map((item, i) => {
    const spot = spots.get(`item${i}`);
    return spot ? { ...item, x: spot.x as number, y: spot.y as number, rot: spot.rot as CarriedItem['rot'] } : { ...item, x: OFF_GRID, y: OFF_GRID };
  });
}

function placedOn(vehicle: Json | null, format: number, player: boolean, storage: CarriedPart[]): Placed {
  const read = listOf(vehicle?.items).map(itemOf).filter((it): it is CarriedItem => it !== null);
  const chassisId = idOf(vehicle?.chassisId);
  const early = WORLD_STEPS.filter((s) => formatBefore(format, s.before)).reduce((placed, s) => throughStep(s, chassisId, placed, player), { items: read, storage, money: 0 });
  if (chassisId === null) return early;
  const outside = formatBefore(format, ARMOR_ROWS_OUTSIDE_BEFORE) ? early.items.map((it) => (it.y < 0 ? it : { ...it, y: armorRowOfItem_120_121(chassisId, it.y, it.kind === 'part' ? it.part.defId : null) })) : early.items;
  return { ...early, items: formatBefore(format, SQUARE_GRID_BEFORE) ? onSquareGrid(chassisId, outside) : outside };
}

function truckOf(world: Json, player: Json, format: number): { truck: Carried['truck']; storage: CarriedPart[]; money: number } {
  const vehicle = vehicleOf(world, player.vehicleId);
  const chassisId = idOf(vehicle?.chassisId);
  const placed = placedOn(vehicle, format, true, listOf(player.storage).flatMap((p) => partOf(p) ?? []));
  return { truck: chassisId === null ? null : { chassisId, items: placed.items }, storage: placed.storage, money: placed.money };
}

const HAULER_FORMAT_2_60 = 2060;

function runOf(world: Json, format: number): CarriedRun | null {
  const saved = formatBefore(format, CHAOS_HIGHWAY_NAME_BEFORE) ? world.furyRoad : world.chaosHighway;
  if (saved === null || saved === undefined) return null;
  const run = objectOf(saved) ?? {};
  if (!('hauler' in run) && format < HAULER_FORMAT_2_60) return null;
  return readRun(world, run, format);
}

type RunTotals = { window: number; earned: number; wrecks: number };

function readRun(world: Json, run: Json, format: number): CarriedRun {
  const [window, earned, wrecks] = [windowOf(run.window), countOf(run.earned), countOf(run.wrecks)];
  const hauler = vehicleOf(world, objectOf(run.hauler)?.id);
  if (window === null || earned === null || wrecks === null || !hauler) throw new Error('The Chaos Highway run in this save has no readable window, totals or hauler, so it cannot be rescued');
  return carriedRun(run, { window, earned, wrecks }, hauler, format);
}

function windowOf(value: unknown): number | null {
  return isGridInt(value) && value >= 0 ? value : null;
}

function carriedRun(run: Json, { window, earned, wrecks }: RunTotals, hauler: Json, format: number): CarriedRun {
  const from = waitsAtNext(run, window) ? window + 1 : window;
  return { from, earned, wrecks, trucksSold: soldAt(run, from), hauler: haulerTruckOf(hauler, format) };
}

function waitsAtNext(run: Json, window: number): boolean {
  if (run.waitingAt !== undefined) return run.waitingAt === window + 1;
  return listOf(run.outposts).map(objectOf).some((o) => o !== null && o.milestone === window + 1 && o.paid === true);
}

function haulerTruckOf(hauler: Json, format: number): CarriedRun['hauler'] {
  const stores = objectOf(hauler.resources);
  return { items: placedOn(hauler, format, false, []).items, fuel: countOf(stores?.fuel), supplies: countOf(stores?.supplies) };
}

function soldAt(run: Json, milestone: number): string[] {
  const post = listOf(run.outposts).map(objectOf).find((o) => o !== null && o.milestone === milestone);
  return listOf(post?.trucksSold).flatMap((id) => idOf(id) ?? []);
}

const NO_CARRIED: Carried = {
  seed: null, money: null, xp: null, ranks: {}, xpBySource: {}, perks: [], paint: null, discovered: [], knockouts: null, autoFire: null,
  autoRepair: null, fuel: null, supplies: null, costBasis: {}, truck: null, storage: [], setup: undefined, quests: { world: {}, local: {} }, run: null, notes: [], revisions: {}, refunded: 0,
};

export function readCarried(raw: unknown, prices: Readonly<Record<string, number>> = RETIRED_PRICES_RESCUE): Carried {
  const world = objectOf(objectOf(raw)?.world);
  const player = objectOf(world?.player);
  if (!world || !player) return NO_CARRIED;
  return refundedRetired(readFormatted(raw, world, player), prices);
}

function readFormatted(raw: unknown, world: Json, player: Json): Carried {
  const format = formatNumber(raw);
  const scale = formatBefore(format, 30) ? CENTS_PER_MONEY_29_30 : 1;
  const mounted = truckOf(world, player, format);
  return {
    seed: isGridInt(world.seed) ? world.seed : null,
    money: centsOf(player.money, mounted.money, scale),
    ...pooledOf(player),
    xpBySource: countsOf(player.xpBySource),
    perks: listOf(player.perks).flatMap((id) => idOf(id) ?? []).map((id) => renamedIn(RENAMED_PERKS_RESCUE, id)),
    paint: paintOf(player.paint),
    discovered: listOf(player.discovered).flatMap((id) => idOf(id) ?? []),
    knockouts: countOf(player.knockouts),
    autoFire: flagOf(player.autoFire),
    autoRepair: flagOf(player.autoRepair),
    fuel: countOf(player.fuel),
    supplies: countOf(player.supplies),
    costBasis: Object.fromEntries(Object.entries(countsOf(player.costBasis)).map(([good, basis]) => [good, basis * scale])),
    truck: mounted.truck,
    storage: mounted.storage,
    setup: setupOf(world.setup, format),
    quests: questVarsOf(player.quests, format),
    run: runOf(world, format),
    notes: [...new Set(listOf(player.notes).flatMap(noteOf))],
    revisions: savedRevisionsOf(raw),
    refunded: 0,
  };
}

function noteOf(value: unknown): string[] {
  const id = idOf(objectOf(value)?.id);
  return id === null ? [] : [renamedIn(RENAMED_NOTES_RESCUE, id)];
}

function questVarsOf(value: unknown, format: number): Carried['quests'] {
  const quests = objectOf(value);
  const local = Object.entries(objectOf(quests?.local) ?? {}).flatMap(([id, vars]) => (objectOf(vars) ? [[id, objectOf(vars) as Json] as const] : []));
  const read = { world: objectOf(quests?.world) ?? {}, local: Object.fromEntries(local) };
  return withHattieMet(RENAMED_VARS_RESCUE.filter((r) => formatBefore(format, r.before)).reduce(withRenamedVar, read), format);
}

function withRenamedVar(quests: Carried['quests'], { quest, from, to }: VarRename): Carried['quests'] {
  const vars = quest === null ? quests.world : quests.local[quest];
  if (!vars || !(from in vars) || to in vars) return quests;
  const { [from]: value, ...rest } = vars;
  const moved = { ...rest, [to]: value };
  return quest === null ? { ...quests, world: moved } : { ...quests, local: { ...quests.local, [quest]: moved } };
}

function withHattieMet(quests: Carried['quests'], format: number): Carried['quests'] {
  const knowsHer = quests.world.towed_to_bowl === true || Object.keys(quests.local.bowl_hattie ?? {}).length > 0;
  return formatBefore(format, HATTIE_MET_BEFORE) && knowsHer ? { ...quests, world: { ...quests.world, hattie_met: true } } : quests;
}

function setupOf(setup: unknown, format: number): unknown {
  const read = objectOf(setup);
  if (!read) return setup;
  const firstNamed = formatBefore(format, FIRST_MODE_NAME_BEFORE) && read.mode === 'gauntlet' ? 'furyRoad' : read.mode;
  const mode = formatBefore(format, CHAOS_HIGHWAY_NAME_BEFORE) ? chaosHighwayMode_113_114(firstNamed) : firstNamed;
  const settings = formatBefore(format, GEAR_GROWTH_BEFORE) ? { enemyGearGrowth: GEAR_GROWTH_START, ...objectOf(read.settings) } : read.settings;
  return { ...read, mode, settings };
}

const idOfItem = (item: CarriedItem): string => (item.kind === 'part' ? item.part.defId : item.good);

function refundedRetired(carried: Carried, prices: Readonly<Record<string, number>>): Carried {
  const retired = (id: string): boolean => Object.hasOwn(prices, id);
  const gone = retiredIdsOf(carried).filter(retired);
  return { ...carried, ...withoutRetired(carried, retired), refunded: gone.reduce((sum, id) => sum + prices[id], 0) };
}

function retiredIdsOf(carried: Carried): string[] {
  const hauled = carried.run ? carried.run.hauler.items : [];
  const mounted = carried.truck ? carried.truck.items : [];
  return [...mounted, ...hauled].map(idOfItem).concat(carried.storage.map((p) => p.defId));
}

function withoutRetired(carried: Carried, retired: (id: string) => boolean): Pick<Carried, 'truck' | 'storage' | 'run'> {
  const kept = (items: CarriedItem[]): CarriedItem[] => items.filter((item) => !retired(idOfItem(item)));
  const { truck, run } = carried;
  return {
    truck: truck && { ...truck, items: kept(truck.items) },
    storage: carried.storage.filter((p) => !retired(p.defId)),
    run: run && { ...run, hauler: { ...run.hauler, items: kept(run.hauler.items) } },
  };
}

function formatNumber(raw: unknown): number {
  const format = objectOf(objectOf(raw)?.format);
  const part = (key: 'major' | 'minor'): number => (typeof format?.[key] === 'number' ? format[key] : 0);
  return part('major') * 1000 + part('minor');
}

function centsOf(value: unknown, refund: number, scale: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round((value + refund) * scale) : null;
}

function pooledOf(player: Json): Pick<Carried, 'xp' | 'ranks'> {
  if (objectOf(player.ranks)) return { xp: countOf(player.xp), ranks: countsOf(player.ranks) };
  return pooledSkills_9_10(countsOf(player.skills));
}

type Carry = { world: World; runId: string };

export function carriedSave(slots: SaveSlots, slot: SlotId, icarus: BakedMap, kit: StartKit, freshSeed: () => number, freshRunId: () => string): Carry | null {
  const parsed = storedSave(slots, slot);
  if (objectOf(parsed) === null) return null;
  const world = carriedWorld(readCarried(parsed), kit, (setup, seed, window) => mapAt(setup, seed, window, icarus), freshSeed);
  const misfit = savedMisfit(saveOf(world).world);
  if (misfit) throw misfit;
  return { world, runId: savedRunId(parsed) ?? freshRunId() };
}

export function rescueSave(slots: SaveSlots, slot: SlotId, icarus: BakedMap, kit: StartKit, freshSeed: () => number, freshRunId: () => string, savedAt: number): Carry | null {
  const carried = carriedSave(slots, slot, icarus, kit, freshSeed, freshRunId);
  if (carried) writeSave(slots, slot, carried.world, carried.runId, savedAt);
  return carried;
}
