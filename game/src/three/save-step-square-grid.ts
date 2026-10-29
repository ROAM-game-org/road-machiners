import type { SavedJson } from './save-migrations';
import { CHASSIS_121_122, PARTS_121_122, SQUARE_CELL_121_122, STORAGE_ROWS_121_122, type FrozenChassis, type FrozenCore, type FrozenPart } from './save-square-grid-data';

type Side = 'old' | 'next';
type Dim = { w: number; h: number };
type At = { x: number; y: number };
type Spot = At & { rot: number };
type Point = { x: number; z: number };
type Rect = { x0: number; x1: number; z0: number; z1: number };
type Occupied = { base: Set<number>; accessory: Set<number> };
type Scored = { at: At; d: number };

type Geo = {
  rows: readonly string[];
  w: number;
  h: number;
  halfX: number;
  halfZ: number;
  row: number;
  col: number;
  front: number;
  left: number;
  rects: Map<number, Rect>;
};

type Entry = {
  json: SavedJson;
  id: string;
  defId: string | null;
  part: FrozenPart | null;
  at: Spot;
  oldDim: Dim;
  mounted: boolean;
};

type Req = { dim: Dim; mounts: string | null; accessory: boolean; skinOk: boolean };

type Ctx = {
  vehicle: string;
  chassisId: string;
  old: Geo;
  next: Geo;
  rowsBelow: number;
  occupied: Occupied;
  player: boolean;
};

type Moved = Map<string, { from: Spot; to: Spot }>;
type JobCtx = { ctx: Ctx; moved: Moved; removed: ReadonlySet<string>; defs: ReadonlyMap<string, string>; itemDefs: ReadonlyMap<string, string | null> };

const KEY = 1024;
const EPS = 1e-9;
const SKIN = 'FBLR';

function chassisOf_121_122(id: string): FrozenChassis {
  if (!Object.hasOwn(CHASSIS_121_122, id)) throw new Error(`The square grid step does not know chassis ${id}`);
  return CHASSIS_121_122[id];
}

function partOf_121_122(defId: string): FrozenPart {
  if (!Object.hasOwn(PARTS_121_122, defId)) throw new Error(`The square grid step does not know part ${defId}`);
  return PARTS_121_122[defId];
}

function oldSteps(c: FrozenChassis, w: number, h: number) {
  return { row: (2 * c.halfX) / (h - 2), col: (2 * c.halfZ) / (w - 2), front: c.halfX, left: -c.halfZ };
}

function nextSteps(w: number, h: number) {
  const cell = SQUARE_CELL_121_122;
  return { row: cell, col: cell, front: ((h - 2) * cell) / 2, left: -((w - 2) * cell) / 2 };
}

const GEOS = new Map<string, Geo>();

function geoOf(chassisId: string, side: Side): Geo {
  const key = `${chassisId}|${side}`;
  const cached = GEOS.get(key);
  if (cached) return cached;
  const c = chassisOf_121_122(chassisId);
  const rows = side === 'old' ? c.old : c.next;
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const steps = side === 'old' ? oldSteps(c, w, h) : nextSteps(w, h);
  const made = { rows, w, h, halfX: c.halfX, halfZ: c.halfZ, ...steps, rects: new Map<number, Rect>() };
  GEOS.set(key, made);
  return made;
}

function ringZ(g: Geo, x: number): number | null {
  if (x === 0) return -g.halfZ;
  return x === g.w - 1 ? g.halfZ : null;
}

function ringX(g: Geo, y: number): number | null {
  if (y === 0) return g.halfX;
  return y === g.h - 1 ? -g.halfX : null;
}

function belowRect(g: Geo, x: number, y: number): Rect {
  const k = y - g.h;
  return { x0: -g.halfX - (k + 1) * g.row, x1: -g.halfX - k * g.row, z0: g.left + (x - 1) * g.col, z1: g.left + x * g.col };
}

function freshRect(g: Geo, x: number, y: number): Rect {
  if (y >= g.h) return belowRect(g, x, y);
  const along = { x0: g.front - y * g.row, x1: g.front - (y - 1) * g.row };
  const across = { z0: g.left + (x - 1) * g.col, z1: g.left + x * g.col };
  const z = ringZ(g, x);
  if (z !== null) return { ...along, z0: z, z1: z };
  const ex = ringX(g, y);
  return ex === null ? { ...along, ...across } : { x0: ex, x1: ex, ...across };
}

function assertCell(g: Geo, x: number, y: number): void {
  const whole = Number.isInteger(x) && Number.isInteger(y);
  if (!whole || x < 0 || y < 0 || x >= g.w) throw new Error(`Cell ${x},${y} is outside the grid`);
}

function rectOf(g: Geo, x: number, y: number): Rect {
  const key = y * KEY + x;
  const cached = g.rects.get(key);
  if (cached) return cached;
  assertCell(g, x, y);
  const made = freshRect(g, x, y);
  g.rects.set(key, made);
  return made;
}

function centerOf(g: Geo, at: At, dim: Dim): Point {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let dy = 0; dy < dim.h; dy++) {
    for (let dx = 0; dx < dim.w; dx++) {
      const r = rectOf(g, at.x + dx, at.y + dy);
      x0 = Math.min(x0, r.x0);
      x1 = Math.max(x1, r.x1);
      z0 = Math.min(z0, r.z0);
      z1 = Math.max(z1, r.z1);
    }
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

function turned(size: readonly [number, number], rot: number): Dim {
  return rot % 2 === 1 ? { w: size[1], h: size[0] } : { w: size[0], h: size[1] };
}

function letterAt(g: Geo, x: number, y: number): string {
  return g.rows[y]?.[x] ?? ' ';
}

function lettersUnder(g: Geo, at: At, dim: Dim): string[] {
  const out: string[] = [];
  for (let dy = 0; dy < dim.h; dy++) for (let dx = 0; dx < dim.w; dx++) out.push(letterAt(g, at.x + dx, at.y + dy));
  return out;
}

function onMounts(letters: readonly string[], mounts: string): boolean {
  return letters.every((l) => l === letters[0]) && mounts.includes(letters[0]);
}

function isMountedOld(g: Geo, part: FrozenPart | null, at: Spot, dim: Dim): boolean {
  if (part === null || at.y >= g.h) return false;
  return onMounts(lettersUnder(g, at, dim), part.mounts);
}

function belowLegal(ctx: Ctx, req: Req, at: At): boolean {
  return req.mounts === null && at.y + req.dim.h - ctx.next.h <= ctx.rowsBelow;
}

function chassisLegal(g: Geo, req: Req, at: At): boolean {
  if (at.y + req.dim.h > g.h) return false;
  const letters = lettersUnder(g, at, req.dim);
  if (letters.includes(' ')) return false;
  if (req.mounts !== null) return onMounts(letters, req.mounts);
  return req.skinOk || !letters.some((l) => SKIN.includes(l));
}

function shapeLegal(ctx: Ctx, req: Req, at: At): boolean {
  const g = ctx.next;
  if (at.x < 0 || at.y < 0 || at.x + req.dim.w > g.w) return false;
  return at.y >= g.h ? belowLegal(ctx, req, at) : chassisLegal(g, req, at);
}

function cellsOf(at: At, dim: Dim): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < dim.h; dy++) for (let dx = 0; dx < dim.w; dx++) out.push((at.y + dy) * KEY + at.x + dx);
  return out;
}

function takenIn(occupied: Occupied, req: Req): Set<number> {
  return req.accessory ? occupied.accessory : occupied.base;
}

function isFree(occupied: Occupied, req: Req, at: At): boolean {
  const taken = takenIn(occupied, req);
  return cellsOf(at, req.dim).every((k) => !taken.has(k));
}

function occupy(occupied: Occupied, req: Req, at: At): void {
  const taken = takenIn(occupied, req);
  for (const k of cellsOf(at, req.dim)) taken.add(k);
}

function emptyOccupied(): Occupied {
  return { base: new Set(), accessory: new Set() };
}

function requestOf(e: Entry, rot: number, mounted: boolean): Req {
  const part = e.part;
  if (part === null) return { dim: { w: 1, h: 1 }, mounts: null, accessory: false, skinOk: false };
  return {
    dim: turned(part.next, rot),
    mounts: mounted ? part.mounts : null,
    accessory: mounted && part.kind === 'accessory',
    skinOk: part.kind === 'armor',
  };
}

function candidates(ctx: Ctx, dim: Dim): At[] {
  const out: At[] = [];
  for (let y = 0; y + dim.h <= ctx.next.h + ctx.rowsBelow; y++) for (let x = 0; x + dim.w <= ctx.next.w; x++) out.push({ x, y });
  return out;
}

function minBy(list: readonly Scored[]): Scored | null {
  return list.reduce<Scored | null>((best, s) => (best === null || s.d < best.d - EPS ? s : best), null);
}

function scoredAround(ctx: Ctx, dim: Dim, anchor: Point): Scored[] {
  return candidates(ctx, dim).map((at) => {
    const c = centerOf(ctx.next, at, dim);
    return { at, d: Math.hypot(c.x - anchor.x, c.z - anchor.z) };
  });
}

type Found = { nearest: At | null; chosen: At | null };

function nearestFree(ctx: Ctx, req: Req, anchor: Point, occupied: Occupied, within: (at: At) => boolean): Found {
  const all = scoredAround(ctx, req.dim, anchor).filter((s) => within(s.at));
  const fits = all.filter((s) => shapeLegal(ctx, req, s.at) && isFree(occupied, req, s.at));
  return { nearest: minBy(all)?.at ?? null, chosen: minBy(fits)?.at ?? null };
}

function anywhere(): boolean {
  return true;
}

function preferredBelow(ctx: Ctx, e: Entry, req: Req): At {
  return { x: Math.min(e.at.x, ctx.next.w - req.dim.w), y: ctx.next.h + (e.at.y - ctx.old.h) };
}

function findFor(ctx: Ctx, e: Entry, req: Req, occupied: Occupied): Found {
  const anchor = centerOf(ctx.old, e.at, e.oldDim);
  if (e.at.y < ctx.old.h) return nearestFree(ctx, req, anchor, occupied, anywhere);
  const preferred = preferredBelow(ctx, e, req);
  if (shapeLegal(ctx, req, preferred) && isFree(occupied, req, preferred)) return { nearest: preferred, chosen: preferred };
  const inBed = nearestFree(ctx, req, anchor, occupied, (at) => at.y >= ctx.next.h).chosen;
  return { nearest: preferred, chosen: inBed ?? nearestFree(ctx, req, anchor, occupied, anywhere).chosen };
}

function labelOf(e: Entry): string {
  return e.defId ?? String(e.json.kind === 'good' ? e.json.good : e.json.kind);
}

function warnItem(ctx: Ctx, e: Entry, text: string): void {
  console.warn(`Square grid save step: ${ctx.vehicle} (${ctx.chassisId}) item ${e.id} (${labelOf(e)}) ${text}`);
}

function whyMoved(ctx: Ctx, req: Req, nearest: At): string {
  return shapeLegal(ctx, req, nearest) ? 'its nearest spot is taken' : 'its nearest spot is not legal for it';
}

function turnsFor(e: Entry): number[] {
  const rot = e.at.rot;
  if (e.part === null) return [rot];
  return e.part.kind === 'weapon' ? [rot, (rot + 2) % 4, (rot + 1) % 4, (rot + 3) % 4] : [rot, rot ^ 1];
}

function placeEntry(ctx: Ctx, e: Entry): Spot | null {
  for (const rot of turnsFor(e)) {
    const req = requestOf(e, rot, e.mounted);
    const found = findFor(ctx, e, req, ctx.occupied);
    if (found.chosen === null || found.nearest === null) continue;
    occupy(ctx.occupied, req, found.chosen);
    reportMove(ctx, e, req, found, rot);
    return { ...found.chosen, rot };
  }
  return null;
}

function reportMove(ctx: Ctx, e: Entry, req: Req, found: Found, rot: number): void {
  const { nearest, chosen } = found as { nearest: At; chosen: At };
  if (rot !== e.at.rot) warnItem(ctx, e, `turned from rotation ${e.at.rot} to ${rot} and moved to ${chosen.x},${chosen.y}, since it fits nowhere in its own rotation`);
  else if (chosen.x !== nearest.x || chosen.y !== nearest.y) warnItem(ctx, e, `moved from nearest spot ${nearest.x},${nearest.y} to ${chosen.x},${chosen.y}: ${whyMoved(ctx, req, nearest)}`);
}

const CORE_PAIRS = new Map<string, { old: FrozenCore; next: FrozenCore }[]>();

function corePairs(chassisId: string): { old: FrozenCore; next: FrozenCore }[] {
  const cached = CORE_PAIRS.get(chassisId);
  if (cached) return cached;
  const c = chassisOf_121_122(chassisId);
  const seen = new Map<string, number>();
  const pairs = c.oldCore.map((old) => {
    const n = seen.get(old.defId) ?? 0;
    seen.set(old.defId, n + 1);
    const next = c.nextCore.filter((k) => k.defId === old.defId)[n];
    if (next === undefined) throw new Error(`Chassis ${chassisId} has no new ${old.defId} core spot number ${n}`);
    return { old, next };
  });
  CORE_PAIRS.set(chassisId, pairs);
  return pairs;
}

function isCoreEntry(e: Entry): boolean {
  return e.mounted && e.part?.mounts === 'X';
}

function coreIndex(pairs: readonly { old: FrozenCore }[], claimed: ReadonlySet<number>, e: Entry): number {
  return pairs.findIndex((p, i) => !claimed.has(i) && p.old.x === e.at.x && p.old.y === e.at.y && p.old.defId === e.defId);
}

function pinCores(ctx: Ctx, entries: readonly Entry[]): Map<string, Spot> {
  const pairs = corePairs(ctx.chassisId);
  const claimed = new Set<number>();
  const pinned = new Map<string, Spot>();
  for (const e of entries.filter(isCoreEntry)) {
    const index = coreIndex(pairs, claimed, e);
    if (index < 0) continue;
    claimed.add(index);
    const next = pairs[index].next;
    const spot = { x: next.x, y: next.y, rot: next.rot ?? 0 };
    occupy(ctx.occupied, requestOf(e, spot.rot, true), spot);
    pinned.set(e.id, spot);
  }
  return pinned;
}

function areaOf(e: Entry): number {
  return e.part === null ? 1 : e.part.next[0] * e.part.next[1];
}

function byPlacement(a: Entry, b: Entry): number {
  return Number(b.mounted) - Number(a.mounted) || areaOf(b) - areaOf(a) || a.at.y - b.at.y || a.at.x - b.at.x;
}

function entryOf(ctx: Ctx, json: SavedJson, defId: string | null, at: Spot): Entry {
  const part = defId === null ? null : partOf_121_122(defId);
  const oldDim = part === null ? { w: 1, h: 1 } : turned(part.old, at.rot);
  return { json, id: json.id as string, defId, part, at, oldDim, mounted: isMountedOld(ctx.old, part, at, oldDim) };
}

function entriesOf(ctx: Ctx, items: readonly SavedJson[]): Entry[] {
  return items.map((it) => entryOf(ctx, it, it.kind === 'part' ? ((it.part as SavedJson).defId as string) : null, { x: it.x as number, y: it.y as number, rot: it.rot as number }));
}

function rowsBelowOf(old: Geo, entries: readonly Entry[], spots: readonly { at: Spot; dim: Dim }[]): number {
  const reach = [...entries.map((e) => ({ at: e.at, dim: e.oldDim })), ...spots].map((s) => s.at.y + s.dim.h - old.h);
  return Math.max(0, ...reach);
}

function removedIds(entries: readonly Entry[], result: ReadonlyMap<string, Spot | null>): Set<string> {
  const gone = entries.filter((e) => result.get(e.id) === null);
  return new Set(gone.flatMap((e) => (e.part === null ? [e.id] : [e.id, (e.json.part as SavedJson).id as string])));
}

function settleLost(ctx: Ctx, e: Entry, stored: SavedJson[]): void {
  if (e.json.kind === 'parcel') throw new Error(`${ctx.vehicle} holds parcel ${e.id}, which fits nowhere on the square grid`);
  if (e.part !== null && ctx.player) {
    stored.push(e.json.part as SavedJson);
    warnItem(ctx, e, 'fits nowhere on the square grid and went to player storage');
    return;
  }
  warnItem(ctx, e, 'fits nowhere on the square grid and was dropped');
}

function withoutOrders(v: SavedJson, key: 'weaponOrders' | 'utilityOrders', ids: ReadonlySet<string>): SavedJson {
  if (v[key] === undefined) return v;
  const kept = Object.entries(v[key] as SavedJson).filter(([id]) => !ids.has(id));
  return { ...v, [key]: Object.fromEntries(kept) };
}

function partDefsOf_121_122(node: unknown, out: Map<string, string>): Map<string, string> {
  if (Array.isArray(node)) node.forEach((n) => partDefsOf_121_122(n, out));
  else if (node !== null && typeof node === 'object') {
    const record = node as SavedJson;
    if (typeof record.id === 'string' && typeof record.defId === 'string') out.set(record.id, record.defId);
    Object.values(record).forEach((n) => partDefsOf_121_122(n, out));
  }
  return out;
}

function sameSpot(a: Spot, b: Spot): boolean {
  return a.x === b.x && a.y === b.y && a.rot === b.rot;
}

function mapSpot(jc: JobCtx, itemId: string, defId: string | null, spot: Spot): Spot | null {
  const m = jc.moved.get(itemId);
  if (m && sameSpot(m.from, spot)) return m.to;
  const e = entryOf(jc.ctx, { id: itemId }, defId, spot);
  const found = findFor(jc.ctx, e, requestOf(e, spot.rot, e.mounted), emptyOccupied());
  return found.chosen === null ? null : { ...found.chosen, rot: spot.rot };
}

function mapMove(jc: JobCtx, m: SavedJson): SavedJson | null {
  const itemId = m.itemId as string;
  const defId = jc.itemDefs.get(itemId) ?? null;
  const from = mapSpot(jc, itemId, defId, m.from as Spot);
  const to = mapSpot(jc, itemId, defId, m.to as Spot);
  return from && to ? { ...m, from, to } : null;
}

function mapPickup(jc: JobCtx, pickup: SavedJson): SavedJson | null {
  const partId = pickup.partId as string;
  if (jc.removed.has(partId) || jc.removed.has(pickup.itemId as string)) return null;
  const to = mapSpot(jc, pickup.itemId as string, jc.defs.get(partId) ?? null, pickup.to as Spot);
  return to && { ...pickup, to };
}

function mapStep(jc: JobCtx, step: SavedJson): SavedJson | null {
  const rawMoves = step.moves as SavedJson[];
  if (rawMoves.some((m) => jc.removed.has(m.itemId as string))) return null;
  const moves = rawMoves.map((m) => mapMove(jc, m));
  const pickup = step.pickup === null ? null : mapPickup(jc, step.pickup as SavedJson);
  if (moves.includes(null) || (step.pickup !== null && pickup === null)) return null;
  return { ...step, moves, pickup };
}

function mapRefit(jc: JobCtx, job: SavedJson): SavedJson | null {
  const head = mapStep(jc, job);
  if (head === null) return null;
  const queue = (job.queue as SavedJson[]).flatMap((s, i) => {
    const step = mapStep(jc, s);
    if (step === null) console.warn(`Square grid save step: ${jc.ctx.vehicle} (${jc.ctx.chassisId}) dropped queued refit step ${i + 1}, whose target no longer fits`);
    return step === null ? [] : [step];
  });
  return { ...job, ...head, queue };
}

function mapPartJob(jc: JobCtx, job: SavedJson): SavedJson | null {
  const partJob = job.kind === 'repair' || job.kind === 'strip';
  return partJob && jc.removed.has(job.partId as string) ? null : job;
}

function mapJob(jc: JobCtx, job: SavedJson): SavedJson | null {
  const next = job.kind === 'refit' ? mapRefit(jc, job) : mapPartJob(jc, job);
  if (next === null) console.warn(`Square grid save step: ${jc.ctx.vehicle} (${jc.ctx.chassisId}) dropped its ${job.kind} job, which no longer fits the square grid`);
  return next;
}

function itemDefsOf(entries: readonly Entry[], job: SavedJson | null, defs: ReadonlyMap<string, string>): Map<string, string | null> {
  const out = new Map(entries.map((e) => [e.id, e.defId] as const));
  const steps = job?.kind === 'refit' ? [job, ...(job.queue as SavedJson[])] : [];
  for (const step of steps) {
    const pickup = step.pickup as SavedJson | null;
    if (pickup) out.set(pickup.itemId as string, defs.get(pickup.partId as string) ?? null);
  }
  return out;
}

function targetSpots(job: SavedJson | null, defs: ReadonlyMap<string, string>, itemDefs: ReadonlyMap<string, string | null>): { at: Spot; dim: Dim }[] {
  const steps = job?.kind === 'refit' ? [job, ...(job.queue as SavedJson[])] : [];
  const spots = steps.flatMap((s) => [...(s.moves as SavedJson[]).flatMap((m) => [m.from, m.to].map((at) => ({ at: at as Spot, id: m.itemId as string }))), ...(s.pickup ? [{ at: (s.pickup as SavedJson).to as Spot, id: (s.pickup as SavedJson).itemId as string }] : [])]);
  return spots.map(({ at, id }) => {
    const defId = itemDefs.get(id) ?? null;
    return { at, dim: defId === null ? { w: 1, h: 1 } : turned(partOf_121_122(defId).old, at.rot) };
  });
}

function contextOf(world: SavedJson, v: SavedJson): Ctx {
  const chassisId = v.chassisId as string;
  const player = (world.player as SavedJson).vehicleId === v.id || v.faction === 'player';
  return { vehicle: v.id as string, chassisId, old: geoOf(chassisId, 'old'), next: geoOf(chassisId, 'next'), rowsBelow: 0, occupied: emptyOccupied(), player };
}

function placeAll(ctx: Ctx, entries: readonly Entry[]): Map<string, Spot | null> {
  const result = new Map<string, Spot | null>(pinCores(ctx, entries));
  for (const e of entries.filter((x) => !result.has(x.id)).sort(byPlacement)) result.set(e.id, placeEntry(ctx, e));
  return result;
}

function movedOf(entries: readonly Entry[], result: ReadonlyMap<string, Spot | null>): Moved {
  const kept = entries.filter((e) => result.get(e.id) !== null);
  return new Map(kept.map((e) => [e.id, { from: e.at, to: result.get(e.id) as Spot }]));
}

function withJob(v: SavedJson, jc: JobCtx): SavedJson {
  return v.job === null || v.job === undefined ? v : { ...v, job: mapJob(jc, v.job as SavedJson) };
}

function moveVehicle(world: SavedJson, defs: ReadonlyMap<string, string>, v: SavedJson, stored: SavedJson[]): SavedJson {
  const first = contextOf(world, v);
  const job = (v.job ?? null) as SavedJson | null;
  const entries = entriesOf(first, v.items as SavedJson[]);
  const itemDefs = itemDefsOf(entries, job, defs);
  const storage = STORAGE_ROWS_121_122[first.chassisId];
  if (storage === undefined) throw new Error(`The square grid step does not know the storage rows of ${first.chassisId}`);
  const ctx = { ...first, rowsBelow: Math.max(storage, rowsBelowOf(first.old, entries, targetSpots(job, defs, itemDefs))) };
  const result = placeAll(ctx, entries);
  entries.filter((e) => result.get(e.id) === null).forEach((e) => settleLost(ctx, e, stored));
  const removed = removedIds(entries, result);
  const items = entries.flatMap((e) => (result.get(e.id) === null ? [] : [{ ...e.json, ...result.get(e.id) }]));
  const ordered = withoutOrders(withoutOrders({ ...v, items }, 'weaponOrders', removed), 'utilityOrders', removed);
  return withJob(ordered, { ctx, moved: movedOf(entries, result), removed, defs, itemDefs });
}

export function withSquareGrid_121_122(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const defs = partDefsOf_121_122(world, new Map());
  const stored: SavedJson[] = [];
  const vehicles = (world.vehicles as SavedJson[]).map((v) => (Object.hasOwn(CHASSIS_121_122, v.chassisId as string) ? moveVehicle(world, defs, v, stored) : v));
  return { ...world, player: { ...player, storage: [...(player.storage as SavedJson[]), ...stored] }, vehicles };
}
