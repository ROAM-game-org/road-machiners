import type { PartHit } from './armor';
import { atlasOf } from './atlas';
import { goodsCount } from './grid';
import { getResources } from './resources';
import { clockOf } from './sun';
import type { GameEvent, GridItem, NpcState, PartInstance, UtilityOrder, Vehicle, WeaponOrder, World } from './types';
import type { Vec } from './vec';
import { tileOf } from './vision';
import { maxHp } from './wear';

export type Fields = Record<string, unknown>;

export const MOVE_KEYS = ['pos', 'heading', 'speed'] as const;
const RECORD_KEYS = new Set(['parts', 'goods', 'guns', 'utils', 'storage', 'ranks']);

const tenth = (n: number) => Math.round(n * 10) / 10;
const DEGREES = 180 / Math.PI;

export function worldPos(world: World, p: Vec): [number, number] {
  const origin = atlasOf(world.terrain).origin;
  return [tenth(p.x + origin.x), tenth(p.y + origin.y)];
}

export function worldPoint(world: World, p: Vec): Vec {
  const [x, y] = worldPos(world, p);
  return { x, y };
}

export function degrees(radians: number): number {
  return ((Math.round(radians * DEGREES) % 360) + 360) % 360;
}

function partLabel(part: PartInstance): string {
  return `${part.defId}:${Math.round((100 * part.hp) / maxHp(part))}`;
}

function partsOf(items: readonly GridItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) if (it.kind === 'part') out[it.part.id] = partLabel(it.part);
  return out;
}

function orderText(world: World, v: Vehicle): string | null {
  if (!v.order) return null;
  if (!('dest' in v.order)) return v.order.kind;
  const [x, y] = worldPos(world, v.order.dest);
  return `${v.order.kind}@${x},${y}`;
}

function gunText(order: WeaponOrder): string {
  return `${order.targetId}/${order.aim}`;
}

function utilityText(world: World, order: UtilityOrder): string {
  if (order.kind !== 'point') return order.kind;
  const [x, y] = worldPos(world, order.pos);
  return `point@${x},${y}`;
}

function mapValues<T>(source: Record<string, T>, text: (value: T) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, text(value)]));
}

export function statesByHolder(states: readonly NpcState[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of states) out.set(s.holder, [...(out.get(s.holder) ?? []), `${s.kind}>${s.other}`]);
  return out;
}

function identityFields(v: Vehicle): Fields {
  return { template: v.brain?.templateId ?? null, faction: v.faction, chassis: v.chassisId, driver: v.brain?.driver ?? null };
}

function placeFields(world: World, v: Vehicle): Fields {
  return { pos: worldPos(world, v.pos), heading: degrees(v.heading), speed: tenth(v.speed) };
}

function loadFields(v: Vehicle): Fields {
  return { parts: partsOf(v.items), goods: goodsCount(v) };
}

function orderFields(world: World, v: Vehicle): Fields {
  return { order: orderText(world, v), guns: mapValues(v.weaponOrders, gunText), utils: mapValues(v.utilityOrders, (o) => utilityText(world, o)) };
}

function resourceFields(world: World, v: Vehicle): Fields {
  const resources = getResources(world, v);
  return { fuel: Math.round(resources.fuel), sup: tenth(resources.supplies), money: Math.round(resources.money) };
}

function mindFields(v: Vehicle, states: readonly string[]): Fields {
  const goals = v.brain?.goals.map((g) => (g.targetId ? `${g.kind}:${g.targetId}` : g.kind)) ?? [];
  return { goals, states, defeat: v.defeat?.phase ?? null };
}

export function truckFields(world: World, v: Vehicle, states: readonly string[]): Fields {
  return { ...identityFields(v), ...placeFields(world, v), ...loadFields(v), ...orderFields(world, v), ...resourceFields(world, v), ...mindFields(v, states) };
}

export function playerFields(world: World): Fields {
  const p = world.player;
  return {
    vehicleId: p.vehicleId,
    money: Math.round(p.money),
    xp: Math.round(p.xp),
    ranks: { ...p.ranks },
    perks: [...p.perks],
    health: Math.round(p.health),
    state: p.state,
    knockouts: p.knockouts,
    autoFire: p.autoFire,
    autoRepair: p.autoRepair,
    overdrive: p.overdrive,
    headlights: p.headlights,
    beacon: p.beacon,
    storage: Object.fromEntries(p.storage.map((part) => [part.id, partLabel(part)])),
  };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function recordDiff(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) if (!same(prev[key], value)) out[key] = value;
  for (const key of Object.keys(prev)) if (!(key in next)) out[key] = null;
  return out;
}

function fieldDiff(key: string, prev: unknown, next: unknown): unknown {
  if (!RECORD_KEYS.has(key)) return same(prev, next) ? undefined : next;
  const patch = recordDiff(prev as Record<string, unknown>, next as Record<string, unknown>);
  return Object.keys(patch).length > 0 ? patch : undefined;
}

export function diffFields(prev: Fields, next: Fields, skip: readonly string[] = []): Fields {
  const out: Fields = {};
  for (const key of Object.keys(next)) {
    const diff = skip.includes(key) ? undefined : fieldDiff(key, prev[key], next[key]);
    if (diff !== undefined) out[key] = diff;
  }
  return out;
}

function mergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}

export function applyFields(base: Fields, patch: Fields): Fields {
  const out: Fields = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = RECORD_KEYS.has(key) ? mergeRecord((base[key] ?? {}) as Record<string, unknown>, value as Record<string, unknown>) : value;
  return out;
}


export type StreamLine = { kind: string; turn: number } & Record<string, unknown>;

type Shot = Extract<GameEvent, { t: 'shot' }>;
type Collision = Extract<GameEvent, { t: 'collision' }>;
type Damage = Record<string, number>;

const CLUTTER = new Set<GameEvent['t']>(['practice', 'activity', 'arrived', 'spawn', 'despawn', 'info', 'weather', 'say', 'call', 'note', 'honk']);
const PLAYER_LEVEL = new Set<GameEvent['t']>(['death', 'knockout', 'wake', 'money', 'contract', 'discover', 'skillUp', 'supply', 'scrapPatch', 'engineCredit', 'townPatch', 'searched', 'outpostReached', 'roadOpened', 'runLost']);

function collectIds(value: unknown, known: ReadonlySet<string>, out: Set<string>): void {
  if (typeof value === 'string' && known.has(value)) out.add(value);
  if (typeof value === 'object' && value !== null) for (const inner of Object.values(value)) collectIds(inner, known, out);
}

export function namedIds(value: unknown, known: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  collectIds(value, known, out);
  return out;
}

export function isClutter(e: GameEvent): boolean {
  return CLUTTER.has(e.t);
}

function touchesScope(e: GameEvent, scope: ReadonlySet<string>): boolean {
  return PLAYER_LEVEL.has(e.t) || namedIds(e, scope).size > 0;
}

function addDamage(into: Damage, hits: readonly PartHit[]): void {
  for (const h of hits) into[h.part] = (into[h.part] ?? 0) + Math.round(h.damage);
}

type ShotSum = { shooter: string; target: string; weapons: string[]; rounds: number; hits: number; crits: number; dmg: Damage; splash: Damage };

function emptyShot(e: Shot): ShotSum {
  return { shooter: e.shooter, target: e.target, weapons: [], rounds: 0, hits: 0, crits: 0, dmg: {}, splash: {} };
}

function addShot(sum: ShotSum, e: Shot): void {
  if (!sum.weapons.includes(e.weapon)) sum.weapons.push(e.weapon);
  for (const r of e.rounds) {
    sum.rounds += 1;
    if (r.hit) sum.hits += 1;
    if (r.crit) sum.crits += 1;
    addDamage(sum.dmg, r.hits);
    for (const b of r.blast) addDamage(sum.splash, b.hits);
  }
}

function mergeShots(shots: readonly Shot[]): ShotSum[] {
  const sums = new Map<string, ShotSum>();
  for (const e of shots) {
    const key = `${e.shooter}|${e.target}`;
    const sum = sums.get(key) ?? emptyShot(e);
    addShot(sum, e);
    sums.set(key, sum);
  }
  return [...sums.values()];
}

type CollisionSum = { a: string; b: string; dmgA: Damage; dmgB: Damage };

function addCollision(sum: CollisionSum, e: Collision): void {
  const flipped = e.a !== sum.a;
  addDamage(sum.dmgA, flipped ? e.hitsB : e.hitsA);
  addDamage(sum.dmgB, flipped ? e.hitsA : e.hitsB);
}

function mergeCollisions(collisions: readonly Collision[]): CollisionSum[] {
  const sums = new Map<string, CollisionSum>();
  for (const e of collisions) {
    const key = [e.a, e.b].sort().join('|');
    const sum = sums.get(key) ?? { a: e.a, b: e.b, dmgA: {}, dmgB: {} };
    addCollision(sum, e);
    sums.set(key, sum);
  }
  return [...sums.values()];
}

type Disabled = Extract<GameEvent, { t: 'partDisabled' }>;

function disabledBy(sum: ShotSum, disabled: readonly Disabled[], used: Set<Disabled>): string[] {
  const mine = disabled.filter((d) => d.vehicle === sum.target && d.part in sum.dmg && !used.has(d));
  for (const d of mine) used.add(d);
  return mine.map((d) => d.part);
}

function inWorldFrame(world: World, e: GameEvent): GameEvent {
  switch (e.t) {
    case 'pulse':
    case 'claymore':
    case 'claymoreCookOff':
      return { ...e, pos: worldPoint(world, e.pos) };
    case 'utility':
      return e.point ? { ...e, point: worldPoint(world, e.point) } : e;
    default:
      return e;
  }
}

function isShot(e: GameEvent): e is Shot {
  return e.t === 'shot';
}

function isCollision(e: GameEvent): e is Collision {
  return e.t === 'collision';
}

function isDisabled(e: GameEvent): e is Disabled {
  return e.t === 'partDisabled';
}

function plainLines(world: World, kept: readonly GameEvent[], used: ReadonlySet<Disabled>): StreamLine[] {
  const others = kept.filter((e) => !isShot(e) && !isCollision(e) && !(isDisabled(e) && used.has(e)));
  return others.map((e) => ({ ...inWorldFrame(world, e), kind: 'event', turn: world.turn, ...(e.t === 'shopMoney' ? { shop: e.kind } : {}) }));
}

export function eventLines(world: World, events: readonly GameEvent[], scope: ReadonlySet<string>): StreamLine[] {
  const kept = events.filter((e) => !isClutter(e) && touchesScope(e, scope));
  const used = new Set<Disabled>();
  const disabled = kept.filter(isDisabled);
  const shots = mergeShots(kept.filter(isShot)).map((sum) => ({ kind: 'event', turn: world.turn, t: 'shot', ...sum, disabled: disabledBy(sum, disabled, used) }));
  const rams = mergeCollisions(kept.filter(isCollision)).map((sum) => ({ kind: 'event', turn: world.turn, t: 'collision', ...sum }));
  return [...shots, ...rams, ...plainLines(world, kept, used)];
}


export type StreamContext = { runId: string; version: string; sessionId: string };
export type StreamState = { turn: number; day: number; mapHash: string; trucks: Map<string, Fields>; player: Fields };
export type StreamStep = { lines: StreamLine[]; state: StreamState };

const OWNED_FACTION = 'player';

function ownedIds(world: World): Set<string> {
  return new Set(world.vehicles.filter((v) => v.faction === OWNED_FACTION).map((v) => v.id));
}

function seenIds(world: World): Set<string> {
  const visible = new Set(world.player.visible);
  return new Set(world.vehicles.filter((v) => visible.has(tileOf(world, v.pos))).map((v) => v.id));
}

function tiedIds(world: World, events: readonly GameEvent[], owned: ReadonlySet<string>): Set<string> {
  const known = new Set(world.vehicles.map((v) => v.id));
  const tied = new Set<string>();
  for (const e of events.filter((x) => !isClutter(x))) {
    const named = namedIds(e, known);
    if ([...named].some((id) => owned.has(id))) for (const id of named) tied.add(id);
  }
  return tied;
}

export function scopeOf(world: World, events: readonly GameEvent[]): Vehicle[] {
  const owned = ownedIds(world);
  const inScope = new Set([...owned, ...seenIds(world), ...tiedIds(world, events, owned)]);
  return world.vehicles.filter((v) => inScope.has(v.id));
}

function trucksOf(world: World, scope: readonly Vehicle[]): Map<string, Fields> {
  const states = statesByHolder(world.states);
  return new Map(scope.map((v) => [v.id, truckFields(world, v, states.get(v.id) ?? [])]));
}

function stateOf(world: World, trucks: Map<string, Fields>): StreamState {
  return { turn: world.turn, day: clockOf(world.turn).day, mapHash: world.mapHash, trucks, player: playerFields(world) };
}

function enterLine(turn: number, id: string, fields: Fields): StreamLine {
  return { kind: 'enter', turn, id, ...fields };
}

function sessionLine(world: World, ctx: StreamContext, from: string): StreamLine {
  const { runId, version } = ctx;
  return { kind: 'session', turn: world.turn, day: clockOf(world.turn).day, from, runId, version, seed: world.seed, mode: world.setup.mode, settings: world.setup.settings, mapHash: world.mapHash };
}

function keyframeLines(world: World, ctx: StreamContext, from: string, state: StreamState): StreamLine[] {
  const enters = [...state.trucks].map(([id, fields]) => enterLine(world.turn, id, fields));
  return [sessionLine(world, ctx, from), { kind: 'player', turn: world.turn, ...state.player }, ...enters];
}

export function streamKeyframe(world: World, ctx: StreamContext, from: string): StreamStep {
  const state = stateOf(world, trucksOf(world, scopeOf(world, [])));
  return { lines: keyframeLines(world, ctx, from, state), state };
}

function moveRow(id: string, fields: Fields): unknown[] {
  const [x, y] = fields.pos as [number, number];
  return [id, x, y, fields.heading, fields.speed];
}

function moved(prev: Fields, next: Fields): boolean {
  return MOVE_KEYS.some((key) => JSON.stringify(prev[key]) !== JSON.stringify(next[key]));
}

function changeLines(turn: number, prev: StreamState, now: Map<string, Fields>): StreamLine[] {
  const out: StreamLine[] = [];
  for (const [id, fields] of now) {
    const before = prev.trucks.get(id);
    const patch = before ? diffFields(before, fields, MOVE_KEYS) : {};
    if (Object.keys(patch).length > 0) out.push({ kind: 'change', turn, id, ...patch });
  }
  return out;
}

function moveLines(turn: number, prev: StreamState, now: Map<string, Fields>): StreamLine[] {
  const rows = [...now].filter(([id, fields]) => prev.trucks.has(id) && moved(prev.trucks.get(id) as Fields, fields)).map(([id, fields]) => moveRow(id, fields));
  return rows.length > 0 ? [{ kind: 'moves', turn, m: rows }] : [];
}

function enterLines(turn: number, prev: StreamState, now: Map<string, Fields>): StreamLine[] {
  return [...now].filter(([id]) => !prev.trucks.has(id)).map(([id, fields]) => enterLine(turn, id, fields));
}

const LEAVE_REASONS: Partial<Record<GameEvent['t'], string>> = { destroyed: 'wrecked', npcKnockout: 'knockedOut', despawn: 'despawned' };

function leaveReason(world: World, prev: StreamState, events: readonly GameEvent[], id: string): string {
  const cause = events.find((e) => LEAVE_REASONS[e.t] !== undefined && (e as { vehicle?: string }).vehicle === id);
  if (cause) return LEAVE_REASONS[cause.t] as string;
  if (prev.mapHash !== world.mapHash) return 'window';
  return world.vehicles.some((v) => v.id === id) ? 'unseen' : 'gone';
}

function leaveLines(world: World, prev: StreamState, events: readonly GameEvent[], now: Map<string, Fields>): StreamLine[] {
  return [...prev.trucks.keys()].filter((id) => !now.has(id)).map((id) => ({ kind: 'leave', turn: world.turn, id, why: leaveReason(world, prev, events, id) }));
}

function playerLines(turn: number, prev: StreamState, player: Fields): StreamLine[] {
  const patch = diffFields(prev.player, player);
  return Object.keys(patch).length > 0 ? [{ kind: 'player', turn, ...patch }] : [];
}

function eventScope(prev: StreamState, now: Map<string, Fields>): Set<string> {
  return new Set([...prev.trucks.keys(), ...now.keys()]);
}

export function streamStep(prev: StreamState, world: World, events: readonly GameEvent[], ctx: StreamContext): StreamStep {
  const now = trucksOf(world, scopeOf(world, events));
  const state = stateOf(world, now);
  const happened = eventLines(world, events, eventScope(prev, now));
  if (state.day !== prev.day) return { lines: [...keyframeLines(world, ctx, 'day', state), ...happened], state };
  const lines = [...leaveLines(world, prev, events, now), ...enterLines(world.turn, prev, now), ...moveLines(world.turn, prev, now), ...changeLines(world.turn, prev, now), ...playerLines(world.turn, prev, state.player), ...happened];
  return { lines, state };
}

export class RunStream {
  private state: StreamState | null = null;

  constructor(private readonly ctx: StreamContext) {}

  begin(world: World, from: string): StreamLine[] {
    const step = streamKeyframe(world, this.ctx, from);
    this.state = step.state;
    return this.stamped(step.lines);
  }

  step(world: World, events: readonly GameEvent[]): StreamLine[] {
    if (this.state === null) throw new Error('The run stream has no session, so begin() comes first');
    const step = streamStep(this.state, world, events, this.ctx);
    this.state = step.state;
    return this.stamped(step.lines);
  }

  private stamped(lines: StreamLine[]): StreamLine[] {
    return lines.map((line) => ({ ...line, sid: this.ctx.sessionId }));
  }
}


const NON_FIELDS = new Set(['kind', 'turn', 'id', 'sid']);

function fieldsOf(line: StreamLine): Fields {
  return Object.fromEntries(Object.entries(line).filter(([key]) => !NON_FIELDS.has(key)));
}

type Handler = (reader: StreamReader, line: StreamLine) => void;

const HANDLERS: Record<string, Handler> = {
  session: (r, line) => r.restart(line),
  enter: (r, line) => r.trucks.set(line.id as string, fieldsOf(line)),
  moves: (r, line) => (line.m as unknown[][]).forEach((row) => r.move(row)),
  change: (r, line) => r.trucks.set(line.id as string, applyFields(r.truck(line.id as string), fieldsOf(line))),
  leave: (r, line) => r.leave(line.id as string),
  player: (r, line) => {
    r.player = applyFields(r.player, fieldsOf(line));
  },
  event: () => {},
};

export class StreamReader {
  session: StreamLine | null = null;
  turn = 0;
  trucks = new Map<string, Fields>();
  player: Fields = {};

  apply(line: StreamLine): void {
    const handler = HANDLERS[line.kind];
    if (!handler) throw new Error(`Unknown stream line kind ${line.kind}`);
    this.turn = line.turn;
    handler(this, line);
  }

  restart(line: StreamLine): void {
    this.session = line;
    this.trucks = new Map();
    this.player = {};
  }

  truck(id: string): Fields {
    const fields = this.trucks.get(id);
    if (!fields) throw new Error(`The stream names truck ${id} before it enters`);
    return fields;
  }

  leave(id: string): void {
    this.truck(id);
    this.trucks.delete(id);
  }

  move(row: unknown[]): void {
    const [id, x, y, heading, speed] = row as [string, number, number, number, number];
    this.trucks.set(id, { ...this.truck(id), pos: [x, y], heading, speed });
  }
}

export function replay(lines: readonly StreamLine[]): StreamReader {
  const reader = new StreamReader();
  for (const line of lines) reader.apply(line);
  return reader;
}

export function replayBySession(lines: readonly StreamLine[]): Map<string, StreamReader> {
  const readers = new Map<string, StreamReader>();
  for (const line of lines) {
    const sid = String(line.sid);
    const reader = readers.get(sid) ?? new StreamReader();
    readers.set(sid, reader);
    reader.apply(line);
  }
  return readers;
}

