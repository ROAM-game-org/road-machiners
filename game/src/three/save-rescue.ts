
import type { StartKit } from '../data/start';
import type { BakedMap } from '../sim/terrain';
import { carriedWorld, type Carried, type CarriedItem, type CarriedPaint, type CarriedPart, type CarriedRun, type CarryReport } from '../sim/world';
import { mapAt } from '../sim/highway';
import type { World } from '../sim/types';
import type { SlotId } from './save-slots';
import { CENTS_PER_MONEY_29_30, pooledSkills_9_10 } from './save-migrations';
import { savedRevisionsOf, savedRunId, storedSave, writeSave } from './save';
import { mutedColor_96_97, paintOfPreset_95_96 } from './save-steps-late';
import type { SaveSlots } from './save-db';

type Json = Record<string, unknown>;

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
  return { defId, wear: countOf(part.wear) ?? 0, hp: countOf(part.hp) ?? 0, rebuilt: part.rebuilt === true };
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

function itemsOf(vehicle: Json): CarriedItem[] {
  return listOf(vehicle.items).map(itemOf).filter((it): it is CarriedItem => it !== null);
}

function truckOf(world: Json, player: Json): Carried['truck'] {
  const vehicle = vehicleOf(world, player.vehicleId);
  const chassisId = idOf(vehicle?.chassisId);
  if (!vehicle || chassisId === null) return null;
  return { chassisId, items: itemsOf(vehicle) };
}

const HAULER_FORMAT_2_60 = 2060;

function runOf(world: Json, format: number): CarriedRun | null {
  if (world.furyRoad === null || world.furyRoad === undefined) return null;
  const run = objectOf(world.furyRoad) ?? {};
  if (!('hauler' in run) && format < HAULER_FORMAT_2_60) return null;
  return readRun(world, run);
}

type RunTotals = { window: number; earned: number; wrecks: number };

function readRun(world: Json, run: Json): CarriedRun {
  const [window, earned, wrecks] = [windowOf(run.window), countOf(run.earned), countOf(run.wrecks)];
  const hauler = vehicleOf(world, objectOf(run.hauler)?.id);
  if (window === null || earned === null || wrecks === null || !hauler) throw new Error('The Chaos Highway run in this save has no readable window, totals or hauler, so it cannot be rescued');
  return carriedRun(run, { window, earned, wrecks }, hauler);
}

function windowOf(value: unknown): number | null {
  return isGridInt(value) && value >= 0 ? value : null;
}

function carriedRun(run: Json, { window, earned, wrecks }: RunTotals, hauler: Json): CarriedRun {
  const from = waitsAtNext(run, window) ? window + 1 : window;
  return { from, earned, wrecks, trucksSold: soldAt(run, from), hauler: haulerTruckOf(hauler) };
}

function waitsAtNext(run: Json, window: number): boolean {
  if (run.waitingAt !== undefined) return run.waitingAt === window + 1;
  return listOf(run.outposts).map(objectOf).some((o) => o !== null && o.milestone === window + 1 && o.paid === true);
}

function haulerTruckOf(hauler: Json): CarriedRun['hauler'] {
  const stores = objectOf(hauler.resources);
  return { items: itemsOf(hauler), fuel: countOf(stores?.fuel), supplies: countOf(stores?.supplies) };
}

function soldAt(run: Json, milestone: number): string[] {
  const post = listOf(run.outposts).map(objectOf).find((o) => o !== null && o.milestone === milestone);
  return listOf(post?.trucksSold).flatMap((id) => idOf(id) ?? []);
}

const NO_CARRIED: Carried = {
  seed: null, money: null, xp: null, ranks: {}, xpBySource: {}, perks: [], paint: null, discovered: [], knockouts: null, autoFire: null,
  autoRepair: null, fuel: null, supplies: null, costBasis: {}, truck: null, storage: [], setup: undefined, quests: { world: {}, local: {} }, run: null, notes: [], revisions: {},
};

export function readCarried(raw: unknown): Carried {
  const world = objectOf(objectOf(raw)?.world);
  const player = objectOf(world?.player);
  if (!world || !player) return NO_CARRIED;
  const scale = moneyScale_29_30(raw);
  return {
    seed: isGridInt(world.seed) ? world.seed : null,
    money: centsOf(player.money, scale),
    ...pooledOf(player),
    xpBySource: countsOf(player.xpBySource),
    perks: listOf(player.perks).flatMap((id) => idOf(id) ?? []),
    paint: paintOf(player.paint),
    discovered: listOf(player.discovered).flatMap((id) => idOf(id) ?? []),
    knockouts: countOf(player.knockouts),
    autoFire: flagOf(player.autoFire),
    autoRepair: flagOf(player.autoRepair),
    fuel: countOf(player.fuel),
    supplies: countOf(player.supplies),
    costBasis: Object.fromEntries(Object.entries(countsOf(player.costBasis)).map(([good, basis]) => [good, basis * scale])),
    truck: truckOf(world, player),
    storage: listOf(player.storage).flatMap((p) => partOf(p) ?? []),
    setup: world.setup,
    quests: questVarsOf(player.quests),
    run: runOf(world, formatNumber(raw)),
    notes: listOf(player.notes).flatMap(noteOf),
    revisions: savedRevisionsOf(raw),
  };
}

function noteOf(value: unknown): string[] {
  const id = idOf(objectOf(value)?.id);
  return id === null ? [] : [id];
}

function questVarsOf(value: unknown): Carried['quests'] {
  const quests = objectOf(value);
  const local = Object.entries(objectOf(quests?.local) ?? {}).flatMap(([id, vars]) => (objectOf(vars) ? [[id, objectOf(vars) as Json] as const] : []));
  return { world: objectOf(quests?.world) ?? {}, local: Object.fromEntries(local) };
}

function formatNumber(raw: unknown): number {
  const format = objectOf(objectOf(raw)?.format);
  const part = (key: 'major' | 'minor'): number => (typeof format?.[key] === 'number' ? format[key] : 0);
  return part('major') * 1000 + part('minor');
}

function moneyScale_29_30(raw: unknown): number {
  return formatNumber(raw) < 2030 ? CENTS_PER_MONEY_29_30 : 1;
}

function centsOf(value: unknown, scale: number): number | null {
  const money = countOf(value);
  return money === null ? null : Math.round(money * scale);
}

function pooledOf(player: Json): Pick<Carried, 'xp' | 'ranks'> {
  if (objectOf(player.ranks)) return { xp: countOf(player.xp), ranks: countsOf(player.ranks) };
  return pooledSkills_9_10(countsOf(player.skills));
}

export function rescueSave(slots: SaveSlots, slot: SlotId, icarus: BakedMap, kit: StartKit, freshSeed: () => number, freshRunId: () => string, savedAt: number): { world: World; report: CarryReport; runId: string } | null {
  const parsed = storedSave(slots, slot);
  if (objectOf(parsed) === null) return null;
  const rescued = carriedWorld(readCarried(parsed), kit, (setup, seed, window) => mapAt(setup, seed, window, icarus), freshSeed);
  const runId = savedRunId(parsed) ?? freshRunId();
  writeSave(slots, slot, rescued.world, runId, savedAt);
  return { ...rescued, runId };
}
