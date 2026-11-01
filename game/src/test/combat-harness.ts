
import { CHASSIS, CHASSIS_FEATURES } from '../data/chassis';
import { DECISIONS, GEAR_LEVEL_IDS, NPC_BEHAVIOR, NPCS, TRAITS, type GearLevel } from '../data/npcs';
import { PARTS, type PartDef } from '../data/parts';
import { coversSide, sideToward, type PartHit } from '../sim/armor';
import { PHYSICS } from '../data/physics';
import { RULES } from '../data/rules';
import { SKILL_EFFECTS } from '../data/skills';
import { START_KITS } from '../data/start';
import { TERRAIN } from '../data/terrain';
import { PERF } from '../data/perf';
import { buildDrive, freeDrive, type Drive } from '../phys/drive';
import { physicsMove } from '../phys/turn';
import { inCombat, isHostile } from '../sim/combat';
import { joinCompany } from '../sim/companies';
import { homeCamp } from '../sim/npc-decisions';
import { isDefeated } from '../sim/defeat';
import { makePart, makeVehicle } from '../sim/factory';
import { mountPart } from '../sim/inventory';
import { hangUp } from '../sim/dialogue';
import { isMounted, mountedParts } from '../sim/grid';
import { maxHp } from '../sim/wear';
import { CONDITION } from '../data/wear';
import { generateNpcLoadout, type NpcLoadout } from '../sim/npc-loadout';
import { placeBase, topGoal } from '../sim/npc-activities';
import { allegianceFor, spawnAt } from '../sim/spawn';
import { addState, endState, stateOf } from '../sim/states';
import { vehicleStats } from '../sim/stats';
import type { Obstacle, Vehicle, World } from '../sim/types';
import { bearing, dist, type Vec } from '../sim/vec';
import { refreshVision } from '../sim/vision';
import { cloneWorld, endTurn, newWorld, seedStreams, setAutoFire, setMoveOrder } from '../sim/world';
import { TEST_MAP } from './map';
import { defaultSetup } from '../sim/settings';
import { ICARUS_KEY } from '../sim/atlas';
import { acrossOf, highwayMap, roadHeading, roadPoint, toRoad } from '../sim/highway';
import { stretchLayout } from '../sim/road-hazards';

export type Policy = 'stand' | 'orbit' | 'charge' | 'kite';
export const POLICIES: Policy[] = ['stand', 'orbit', 'charge', 'kite'];

export type Outfit = { gun: string; guns: number; armor: string | null; ram?: string; chassis: string };

export type PinnedRoll = { chassis: string; roll: number };
export type Gear = { kind: 'kit'; id: string } | { kind: 'npc'; template: string; level: GearLevel | null; pinned?: PinnedRoll } | { kind: 'outfit'; outfit: Outfit };

export type Truck = { driver: string; gear: Gear; wear: number | null; label: string };

export type Fight = {
  a: Truck[];
  b: Truck[];
  seed: number;
  gap: number;
  orbit: number;
  maxTurns: number;
  arena: number | null;
  road?: number | null;
  crew?: 'a' | 'b' | null;
  guard?: boolean;
  late?: number | null;
  bystander?: string | null;
};

export type Side = { rounds: number; hits: number; odds: number; damage: number; speed: number; ramCrashes: number; ramsLanded: number };
export type Outcome = 'won' | 'lost' | 'a fled' | 'b fled' | 'truce' | 'timeout';
const OUTCOMES: Outcome[] = ['won', 'lost', 'a fled', 'b fled', 'truce', 'timeout'];
export type Tally = { left: number; out: number; fled: number };
export type Bystander = 'calm' | 'fought' | 'out';
export type FightReport = { fight: Fight; outcome: Outcome; turns: number; crashes: number; a: Side; b: Side; bHpLeft: number | null; spread: number | null; tally: { a: Tally; b: Tally }; bystander: Bystander | null };

const CENTER: Vec = { x: TEST_MAP.terrain.size / 2, y: TEST_MAP.terrain.size / 2 };
const FLED_RANGE = 40;
const PARKED: Vec = { x: CENTER.x, y: CENTER.y + TERRAIN.vision.radius + PERF.liveMargin / 2 };
const LINE_SPACING = 3;
const ARENA_ROCK = 1;
const ARENA_STEP = 1.6;
const FIGHT_BEFORE_SCENE = 10;

export function parseTruck(spec: string): Truck {
  const [body, wearText, extraWear] = spec.split('~');
  const [driver, gearText, extra] = body.split(':');
  if (extra !== undefined || extraWear !== undefined) throw new Error(`A truck is driver:gear~wear, got "${spec}"`);
  const scripted = (POLICIES as string[]).includes(driver);
  if (!scripted && !NPCS[driver]) throw new Error(`Unknown driver "${driver}". Drivers are NPC templates or ${POLICIES.join(', ')}`);
  const gear = gearText === undefined ? defaultGear(driver, scripted) : parseGear(gearText);
  return { driver, gear, wear: wearText === undefined ? null : wearStep(wearText), label: spec };
}

function wearStep(text: string): number {
  const wear = Number(text);
  if (!Number.isInteger(wear) || wear < 0 || wear > CONDITION.maxWear) throw new Error(`Wear must be a whole step from 0 to ${CONDITION.maxWear}, got "${text}"`);
  return wear;
}

export function parseLineup(text: string): Truck[] {
  return truckSpecs(text).map(parseTruck);
}

function truckSpecs(text: string): string[] {
  const specs: string[] = [];
  for (const piece of text.split('+')) {
    const last = specs.length - 1;
    if (last >= 0 && takesRam(specs[last]) && PARTS[piece.split('@')[0]]) specs[last] += `+${piece}`;
    else specs.push(piece);
  }
  return specs;
}

const takesRam = (spec: string): boolean => spec.includes('/') && !spec.includes('+');

function defaultGear(driver: string, scripted: boolean): Gear {
  return scripted ? { kind: 'kit', id: 'standard' } : { kind: 'npc', template: driver, level: null };
}

function parseGear(text: string): Gear {
  if (text.includes('/')) return { kind: 'outfit', outfit: parseOutfit(text) };
  const [template, level, pinText] = text.split('@');
  if (START_KITS[template] && NPCS[template]) throw new Error(`Gear "${template}" names both a start kit and an NPC template`);
  if (START_KITS[template] && level === undefined) return { kind: 'kit', id: template };
  if (!NPCS[template]) throw new Error(`Unknown gear "${text}". Gear is a start kit, an NPC template or gun/armor`);
  if (level !== undefined && !(GEAR_LEVEL_IDS as string[]).includes(level)) throw new Error(`Unknown gear level "${level}". Known: ${GEAR_LEVEL_IDS.join(', ')}`);
  const gear: Gear = { kind: 'npc', template, level: (level as GearLevel | undefined) ?? null };
  return pinText === undefined ? gear : { ...gear, pinned: parsePinned(pinText, text) };
}

function parsePinned(text: string, gear: string): PinnedRoll {
  const [chassis, rollText] = text.split('#');
  const roll = Number(rollText);
  if (!CHASSIS[chassis] || !Number.isInteger(roll) || roll < 1) throw new Error(`A pinned roll is template@level@chassis#roll with a roll from 1, got "${gear}"`);
  return { chassis, roll };
}

const OUTFIT_CHASSIS = 'hauler';

function parseOutfit(text: string): Outfit {
  const [gunText, rest] = text.split('/');
  const [loadText, chassis = OUTFIT_CHASSIS] = rest.split('@');
  if (!CHASSIS[chassis]) throw new Error(`Unknown chassis "${chassis}" in outfit "${text}"`);
  const [gun, count = '1'] = gunText.split('*');
  const guns = Number(count);
  if (!Number.isInteger(guns) || guns < 1) throw new Error(`An outfit mounts a whole number of guns from 1, got "${count}" in "${text}"`);
  const [armor, ram] = loadText.split('+');
  return { gun, guns, armor: armor === 'bare' ? null : armor, chassis, ...(ram ? { ram } : {}) };
}

const TABLES: Record<string, object> = { RULES, PHYSICS, NPCS, PARTS, CHASSIS, CHASSIS_FEATURES, TRAITS, DECISIONS, NPC_BEHAVIOR, SKILL_EFFECTS, CONDITION };

export function setNumber(assignment: string): void {
  const [path, raw] = assignment.split('=');
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value)) throw new Error(`--set needs path=number, got "${assignment}"`);
  const keys = path.split('.');
  const last = keys.pop()!;
  const owner = keys.slice(1).reduce((obj, key) => subTable(obj, key, path), rootTable(keys[0]));
  if (typeof owner[last] !== 'number') throw new Error(`${path} is not a number`);
  owner[last] = value;
  BASES.clear();
}

type Table = Record<string, unknown>;

function rootTable(name: string): Table {
  const table = TABLES[name];
  if (!table) throw new Error(`Unknown table "${name}". Known: ${Object.keys(TABLES).join(', ')}`);
  return table as Table;
}

function subTable(obj: Table, key: string, path: string): Table {
  const sub = obj[key];
  if (typeof sub !== 'object' || sub === null) throw new Error(`${path}: "${key}" is not a table`);
  return sub as Table;
}

const BASES = new Map<string, World>();

type Ground = { center: Vec; axis: Vec; parked: Vec };

const FLAT_GROUND: Ground = { center: CENTER, axis: { x: 1, y: 0 }, parked: PARKED };

export type GroupFlags = Pick<Fight, 'crew' | 'guard' | 'late' | 'bystander'>;

export function parseGroupFlags(flags: { crew: string | null; guard: boolean; late: string | null; bystander: string | null }): GroupFlags {
  if (flags.crew !== null && flags.crew !== 'a' && flags.crew !== 'b') throw new Error(`--crew takes a or b, got "${flags.crew}"`);
  if (flags.late !== null && !/^b:\d+$/.test(flags.late)) throw new Error(`--late takes b:<turn>, got "${flags.late}"`);
  if (flags.bystander !== null && !NPCS[flags.bystander]) throw new Error(`Unknown bystander "${flags.bystander}"`);
  return { crew: flags.crew, guard: flags.guard, late: flags.late === null ? null : Number(flags.late.slice(2)), bystander: flags.bystander };
}

export function parseRoad(text: string | null): number | null {
  if (text === null) return null;
  const [name, seed] = text.split(':');
  if (name !== 'chaos-highway') throw new Error(`--map takes chaos-highway or chaos-highway:<seed>, got "${text}"`);
  const n = seed === undefined ? 1 : Number(seed);
  if (!Number.isInteger(n)) throw new Error(`--map chaos-highway:<seed> needs a whole seed, got "${seed}"`);
  return n;
}

function roadGround(seed: number): Ground {
  const arena = stretchLayout(seed, 1).arenas[1];
  const n = arena.to - FIGHT_BEFORE_SCENE;
  const heading = roadHeading(seed, n);
  return { center: roadPoint(seed, 0, n, 0), axis: { x: Math.cos(heading), y: Math.sin(heading) }, parked: roadPoint(seed, 0, n - TERRAIN.vision.radius - PERF.liveMargin, 0) };
}

function groundOf(fight: Fight): Ground {
  return fight.road === undefined || fight.road === null ? FLAT_GROUND : roadGround(fight.road);
}

function roadBase(kit: string, seed: number): World {
  const w = newWorld(seed, START_KITS[kit] ?? missing('kit', kit), highwayMap(seed, 0), defaultSetup('chaosHighway'), false);
  w.chaosHighway!.groups = [];
  w.vehicles = w.vehicles.filter((v) => v.id === w.player.vehicleId || v.id === w.chaosHighway!.hauler.id);
  w.states = [];
  const ground = roadGround(seed);
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  me.pos = { ...ground.center };
  me.heading = Math.atan2(ground.axis.y, ground.axis.x);
  me.speed = 0;
  return w;
}

function baseWorld(kit: string, arena: number | null, road: number | null): World {
  const key = `${kit}|${arena}|${road}`;
  const cached = BASES.get(key);
  if (cached) return cached;
  if (road !== null) {
    const w = roadBase(kit, road);
    BASES.set(key, w);
    return w;
  }
  const w = newWorld(0, START_KITS[kit] ?? missing('kit', kit), TEST_MAP, defaultSetup('roaming'), false);
  const terrain = { size: w.size, heights: new Array((w.size + 1) * (w.size + 1)).fill(0), types: new Array(w.size * w.size).fill('road'), atlas: ICARUS_KEY };
  Object.freeze(terrain.heights);
  Object.freeze(terrain.types);
  w.terrain = Object.freeze(terrain);
  w.obstacles = arena === null ? [] : arenaRing(arena);
  w.states = [];
  w.spawnQueue = [];
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const me = w.vehicles[0];
  me.pos = { ...CENTER };
  me.heading = 0;
  me.speed = 0;
  BASES.set(key, w);
  return w;
}

function arenaRing(radius: number): Obstacle[] {
  const count = Math.ceil((2 * Math.PI * radius) / ARENA_STEP);
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count;
    return { id: `arena${i}`, pos: { x: CENTER.x + Math.cos(a) * radius, y: CENTER.y + Math.sin(a) * radius }, r: ARENA_ROCK, kind: 'rock' };
  });
}

function missing(what: string, id: string): never {
  throw new Error(`Unknown ${what} "${id}"`);
}

function isScripted(t: Truck): boolean {
  return (POLICIES as string[]).includes(t.driver);
}

function scriptedTruck(fight: Fight): Truck | null {
  const guards = fight.guard === true && isScripted(fight.a[0]) && fight.a.slice(1).every((t) => t.driver === 'merc');
  if (fight.b.some(isScripted) || (fight.a.length > 1 && fight.a.some(isScripted) && !guards)) throw new Error('A scripted driver drives the player truck, alone on side a but for its hired mercs');
  if (fight.guard && !guards) throw new Error('--guard needs a scripted player on side a, followed by one merc');
  return isScripted(fight.a[0]) ? fight.a[0] : null;
}

function baseKit(t: Truck | null): string {
  if (!t) return 'standard';
  if (t.gear.kind === 'npc') throw new Error(`A scripted driver takes a kit or an outfit, not NPC gear: "${t.label}"`);
  return t.gear.kind === 'kit' ? t.gear.id : 'combat';
}

type Ids = { a: string[]; b: string[]; pairs: [string, string][]; late: Vehicle | null; bystander: string | null };

function setup(fight: Fight): { w: World; ids: Ids } {
  if (fight.arena !== null && fight.arena <= fight.gap / 2 + LINE_SPACING) throw new Error(`An arena of ${fight.arena} tiles leaves no room for a gap of ${fight.gap}`);
  if (fight.arena !== null && 2 * fight.arena > TERRAIN.vision.radius) throw new Error(`An arena of ${fight.arena} tiles is wider than sight, ${TERRAIN.vision.radius} tiles across`);
  const scripted = scriptedTruck(fight);
  const w = Object.assign(cloneWorld(baseWorld(baseKit(scripted), fight.arena, fight.road ?? null)), seedStreams(fight.seed));
  const ground = groundOf(fight);
  const player = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  if (scripted?.gear.kind === 'outfit') outfit(w, player, scripted.gear.outfit);
  if (scripted && scripted.wear !== null) rebuildAt(w, player, scripted.wear);
  if (scripted) player.pos = along(ground, -fight.gap / 2, 0);
  else park(player, ground.parked);
  const npcA = scripted ? fight.a.slice(1) : fight.a;
  const ids: Ids = { a: scripted ? [player.id] : [], b: [], pairs: [], late: null, bystander: null };
  ids.a.push(...placeSide(w, npcA, ground, -fight.gap / 2, 0));
  ids.b.push(...placeSide(w, fight.b, ground, fight.gap / 2, Math.PI));
  const followers = [...(fight.crew ? formCrew(w, ids[fight.crew]) : []), ...(fight.guard ? hireGuards(w, ids.a.slice(1)) : [])];
  if (fight.late) ids.late = holdBack(w, ids.b.at(-1)!);
  ids.pairs = ids.a.flatMap((a) => ids.b.map((b): [string, string] => [a, b])).filter(([a, b]) => !followers.includes(a) && !followers.includes(b) && b !== ids.late?.id);
  for (const [a, b] of ids.pairs) setAgainst(w, a, b);
  if (fight.bystander) ids.bystander = placeBystander(w, fight, ground);
  refreshVision(w);
  return { w: setAutoFire(w, true), ids };
}

function formCrew(w: World, side: string[]): string[] {
  const [leader, ...members] = side.map((id) => w.vehicles.find((v) => v.id === id)!);
  if (!leader?.brain || members.length === 0) throw new Error('--crew needs a side of two or more NPC raiders');
  for (const m of members) {
    joinCompany(w, m, leader, 'crew', { kind: 'crew', camp: homeCamp(leader).id });
    placeBase(w, m, { kind: 'follow', targetId: leader.id, destination: { ...leader.pos }, phase: 'travel', reason: 'crewLeader' });
  }
  return members.map((m) => m.id);
}

function hireGuards(w: World, mercs: string[]): string[] {
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  for (const id of mercs) {
    const merc = w.vehicles.find((v) => v.id === id)!;
    joinCompany(w, merc, me, 'hire', { kind: 'hire', fee: 0 });
    placeBase(w, merc, { kind: 'follow', targetId: me.id, destination: { ...me.pos }, phase: 'travel', reason: 'hiredGuard' });
  }
  return mercs;
}

function holdBack(w: World, id: string): Vehicle {
  const late = w.vehicles.find((v) => v.id === id)!;
  w.vehicles = w.vehicles.filter((v) => v !== late);
  return late;
}

function placeBystander(w: World, fight: Fight, ground: Ground): string {
  const reach = (fight.arena ?? fight.gap) - LINE_SPACING;
  const tpl = NPCS[fight.bystander!] ?? missing('bystander template', fight.bystander!);
  const v = spawnAt(w, tpl, sideLoadout(w, { kind: 'npc', template: tpl.id, level: null }), along(ground, 0, reach), allegianceFor(w, tpl, null, null));
  v.heading = Math.atan2(ground.axis.y, ground.axis.x) + Math.PI / 2;
  return v.id;
}

function along(ground: Ground, forward: number, side: number): Vec {
  const { center, axis } = ground;
  return { x: center.x + axis.x * forward - axis.y * side, y: center.y + axis.y * forward + axis.x * side };
}

function park(player: Vehicle, at: Vec): void {
  player.pos = { ...at };
  player.items = player.items.filter((it) => it.kind === 'part' && isMounted(player.chassisId, it));
}

function placeSide(w: World, trucks: Truck[], ground: Ground, forward: number, turn: number): string[] {
  return trucks.map((t, i) => {
    const pos = along(ground, forward, (i - (trucks.length - 1) / 2) * LINE_SPACING);
    const v = spawnAt(w, NPCS[t.driver], sideLoadout(w, t.gear), pos, allegianceFor(w, NPCS[t.driver], null, null));
    if (t.gear.kind === 'outfit') outfit(w, v, t.gear.outfit);
    if (t.wear !== null) rebuildAt(w, v, t.wear);
    v.heading = Math.atan2(ground.axis.y, ground.axis.x) + turn;
    v.brain!.traits = v.brain!.traits.filter((trait) => trait !== 'coward');
    return v.id;
  });
}

function rebuildAt(w: World, v: Vehicle, wear: number): void {
  for (const item of v.items) if (item.kind === 'part') item.part = makePart(w, item.part.defId, wear);
}

function sideLoadout(w: World, gear: Gear): NpcLoadout {
  const loadout = loadoutOf(w, gear);
  return w.chaosHighway === null ? loadout : { ...loadout, cargo: {}, spares: [] };
}

function loadoutOf(w: World, gear: Gear): NpcLoadout {
  if (gear.kind === 'outfit') return bareLoadout(gear.outfit.chassis);
  if (gear.kind === 'npc') return gear.pinned ? pinnedLoadout(w, gear.template, gear.level, gear.pinned) : generateNpcLoadout(w, NPCS[gear.template], null, gear.level);
  const kit = START_KITS[gear.id];
  const placed = (kit.placed ?? []).map(({ defId, ...at }) => ({ defId, wear: 0, at }));
  return { chassisId: kit.chassis, level: 'standard', parts: [...placed, ...kit.parts.map((defId) => ({ defId, wear: 0 }))], spares: [], cargo: {} };
}

function setAgainst(w: World, aId: string, bId: string): void {
  for (const [holder, other] of [[aId, bId], [bId, aId]]) {
    const v = w.vehicles.find((x) => x.id === holder)!;
    if (!v.brain) continue;
    addState(w, 'feud', holder, other, { kind: 'feud', robbery: false });
    v.brain.attackers[other] = true;
    v.lastHitBy = other;
  }
}

function outfit(w: World, v: Vehicle, o: Outfit): void {
  if (PARTS[o.gun]?.kind !== 'weapon') throw new Error(`Unknown weapon "${o.gun}"`);
  if (o.armor !== null && PARTS[o.armor]?.kind !== 'armor') throw new Error(`Unknown armor "${o.armor}"`);
  if (v.chassisId !== o.chassis) rechassis(w, v, o.chassis);
  v.items = v.items.filter((it) => it.kind === 'part' && PARTS[it.part.defId].kind === 'core');
  for (const id of ['stockEngine', ...Array.from({ length: o.guns }, () => o.gun)]) if (!mountPart(w, v, makePart(w, id, 0))) throw new Error(`${id} does not fit the ${o.chassis}`);
  if (o.ram && !mountPart(w, v, makePart(w, o.ram, 0))) throw new Error(`${o.ram} does not fit the ${o.chassis}`);
  if (o.armor) while (mountPart(w, v, makePart(w, o.armor, 0)));
}

function rechassis(w: World, v: Vehicle, chassisId: string): void {
  const fresh = makeVehicle(w, { faction: v.faction, chassisId, parts: [], spares: [], cargo: {}, pos: v.pos, heading: v.heading, brain: null });
  v.chassisId = chassisId;
  v.items = fresh.items;
  v.bend = fresh.bend;
}

const bareLoadout = (chassisId: string): NpcLoadout => ({ chassisId, level: 'standard', parts: [], spares: [], cargo: {} });

export function pinnedLoadout(w: World, template: string, level: GearLevel | null, pinned: PinnedRoll): NpcLoadout {
  if (level === null) throw new Error(`A pinned roll of ${template} needs a gear level`);
  const rolled = generateNpcLoadout({ ...w, ...seedStreams(pinned.roll) }, NPCS[template], pinned.chassis, level);
  return { ...rolled, spares: [], cargo: {} };
}

const KITE_HOLD = 0.8;

function orders(w: World, policy: Policy, orbit: number, foe: Vehicle): World {
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  if (policy === 'stand') return setMoveOrder(w, { kind: 'brake' });
  if (policy === 'charge') {
    if (dist(me.pos, foe.pos) <= orbit) return setMoveOrder(w, { kind: 'brake' });
    return setMoveOrder(w, { kind: 'through', dest: foe.pos });
  }
  if (policy === 'kite') return kite(w, me, foe);
  return circle(w, me, foe, orbit);
}

function circle(w: World, me: Vehicle, foe: Vehicle, radius: number): World {
  const a = bearing(foe.pos, me.pos) + Math.PI / 2;
  return setMoveOrder(w, { kind: 'through', dest: { x: foe.pos.x + Math.cos(a) * radius, y: foe.pos.y + Math.sin(a) * radius } });
}

function kite(w: World, me: Vehicle, foe: Vehicle): World {
  const reach = Math.max(...vehicleStats(w, me).weapons.map((mw) => mw.def.range));
  const d = dist(me.pos, foe.pos);
  if (d > KITE_HOLD * reach) return setMoveOrder(w, { kind: 'through', dest: foe.pos });
  const away = bearing(foe.pos, me.pos);
  const back = RULES.throttleZones.reach * KITE_HOLD;
  return setMoveOrder(w, { kind: 'through', dest: { x: me.pos.x + Math.cos(away) * back, y: me.pos.y + Math.sin(away) * back } });
}

export function turnLine(w: World, turn: number): string {
  const trucks = w.vehicles.filter((v) => v.id !== w.player.vehicleId || dist(v.pos, PARKED) > 1).map((v) =>
    `${v.id} ${v.pos.x.toFixed(1)},${v.pos.y.toFixed(1)} v${v.speed.toFixed(1)} ${v.brain?.goals.at(-1)?.kind ?? v.order?.kind ?? '-'}${isDefeated(v) ? ' OUT' : ''}`);
  const shots = w.events.flatMap((e) => (e.t === 'shot' ? [`${e.shooter}:${e.rounds.filter((r) => r.hit).length}/${e.rounds.length}@${Math.round(e.chance * 100)}%`] : []));
  return `t${turn} ${trucks.join(' | ')} | ${shots.join(' ')}`;
}

const partHp = (v: Vehicle) => mountedParts(v).reduce((sum, p) => sum + p.hp, 0);
const side = (): Side => ({ rounds: 0, hits: 0, odds: 0, damage: 0, speed: 0, ramCrashes: 0, ramsLanded: 0 });

type Count = { ids: Ids; a: Side; b: Side; crashes: number; leaver: 'a' | 'b' | null; center: Vec; spread: number };

function inFight(w: World, ids: string[]): Vehicle[] {
  return w.vehicles.filter((v) => ids.includes(v.id) && !isDefeated(v) && (v.id !== w.player.vehicleId || w.player.state === 'active'));
}

function nearest(from: Vehicle, foes: Vehicle[]): Vehicle {
  return foes.reduce((a, b) => (dist(b.pos, from.pos) < dist(a.pos, from.pos) ? b : a));
}

function sideOf(c: Count, id: string): Side | null {
  if (c.ids.a.includes(id)) return c.a;
  return c.ids.b.includes(id) ? c.b : null;
}

function countShots(w: World, c: Count): void {
  for (const ev of w.events) {
    const s = ev.t === 'shot' ? sideOf(c, ev.shooter) : null;
    if (ev.t !== 'shot' || !s) continue;
    s.rounds += ev.rounds.length;
    s.hits += ev.rounds.filter((r) => r.hit).length;
    s.odds += ev.chance * ev.rounds.length;
  }
}

function meanSpeed(trucks: Vehicle[]): number {
  return trucks.length > 0 ? trucks.reduce((sum, v) => sum + Math.abs(v.speed), 0) / trucks.length : 0;
}

function countMoves(w: World, c: Count): void {
  c.a.speed += meanSpeed(inFight(w, c.ids.a));
  c.b.speed += meanSpeed(inFight(w, c.ids.b));
  const across = (x: string, y: string) => (c.ids.a.includes(x) && c.ids.b.includes(y)) || (c.ids.b.includes(x) && c.ids.a.includes(y));
  c.crashes += w.events.filter((e) => e.t === 'collision' && across(e.a, e.b)).length;
}

function countRams(w: World, c: Count): void {
  for (const ev of w.events) {
    if (ev.t !== 'collision' || !sideOf(c, ev.a) || !sideOf(c, ev.b) || sideOf(c, ev.a) === sideOf(c, ev.b)) continue;
    noteRam(w, sideOf(c, ev.a)!, ev.a, ev.b, ev.hitsA);
    noteRam(w, sideOf(c, ev.b)!, ev.b, ev.a, ev.hitsB);
  }
}

function noteRam(w: World, s: Side, id: string, otherId: string, hits: PartHit[]): void {
  const v = w.vehicles.find((x) => x.id === id);
  const other = w.vehicles.find((x) => x.id === otherId);
  if (!v || !other || hits.length === 0) return;
  const struck = sideToward(v, other.pos);
  const rams = new Set(mountedParts(v).filter((p) => ramPart(PARTS[p.defId]) && coversSide(v, p, struck)).map((p) => p.id));
  if (rams.size === 0) return;
  s.ramCrashes++;
  if (hits.some((h) => rams.has(h.part))) s.ramsLanded++;
}

const ramPart = (def: PartDef): boolean => (def.kind === 'armor' || def.kind === 'accessory') && def.ramMult > 1;

function countDamage(w: World, c: Count, before: Map<string, number>): void {
  for (const v of w.vehicles) {
    const lost = Math.max(0, (before.get(v.id) ?? 0) - partHp(v));
    if (c.ids.a.includes(v.id)) c.b.damage += lost;
    else if (c.ids.b.includes(v.id)) c.a.damage += lost;
  }
}

function outcomeOf(w: World, c: Count): Outcome | null {
  const a = inFight(w, c.ids.a);
  const b = inFight(w, c.ids.b);
  if (a.length === 0) return 'lost';
  if (b.length === 0) return 'won';
  if (!a.some((x) => b.some((y) => isHostile(w, x, y) || isHostile(w, y, x)))) return 'truce';
  if (b.every((v) => dist(v.pos, nearest(v, a).pos) > FLED_RANGE)) return fledSide(a, b, c);
  return null;
}

function staysInFight(v: Vehicle): boolean {
  return !v.brain || topGoal(v)?.kind === 'fight';
}

function noteLeaver(w: World, c: Count): void {
  const aStays = inFight(w, c.ids.a).some(staysInFight);
  const bStays = inFight(w, c.ids.b).some(staysInFight);
  if (aStays !== bStays) c.leaver = aStays ? 'b' : 'a';
}

function fledSide(a: Vehicle[], b: Vehicle[], c: Count): Outcome {
  if (c.leaver) return `${c.leaver} fled`;
  const away = (side: Vehicle[]) => Math.max(...side.map((v) => dist(v.pos, c.center)));
  return away(a) > away(b) ? 'a fled' : 'b fled';
}

function playTurn(w: World, d: Drive, c: Count, arena: boolean): { w: World; d: Drive } {
  const before = new Map(w.vehicles.map((v) => [v.id, partHp(v)]));
  let next: Drive | null = null;
  w = endTurn(w, physicsMove(d, (r) => (next = r.next)));
  freeDrive(d);
  if (arena) keepArenaFight(w, c.ids);
  countShots(w, c);
  countDamage(w, c, before);
  countMoves(w, c);
  countRams(w, c);
  noteLeaver(w, c);
  countSpread(w, c);
  return { w, d: next! };
}

function countSpread(w: World, c: Count): void {
  if (w.terrain.atlas.kind !== 'highway') return;
  const trucks = [...inFight(w, c.ids.a), ...inFight(w, c.ids.b)];
  for (const v of trucks) c.spread = Math.max(c.spread, Math.abs(acrossOf(w.seed, toRoad(w.seed, w.terrain.atlas.window, v.pos))));
}

function keepArenaFight(w: World, ids: Ids): void {
  const live = new Set([...inFight(w, ids.a), ...inFight(w, ids.b)].map((v) => v.id));
  for (const [xId, yId] of ids.pairs) {
    if (!live.has(xId) || !live.has(yId)) continue;
    const [x, y] = [vehicleOf(w, xId), vehicleOf(w, yId)];
    if (isHostile(w, x, y) || isHostile(w, y, x)) continue;
    for (const [holder, other] of [[x, y], [y, x]]) {
      const truce = stateOf(w, 'truce', holder.id, other.id);
      if (truce) endState(w, truce, 'broken');
    }
    setAgainst(w, x.id, y.id);
  }
}

function vehicleOf(w: World, id: string): Vehicle {
  return w.vehicles.find((v) => v.id === id) ?? missing('truck', id);
}

function arrive(w: World, ids: Ids): void {
  const late = ids.late!;
  w.vehicles = [...w.vehicles, late];
  ids.late = null;
  for (const a of ids.a) {
    ids.pairs.push([a, late.id]);
    setAgainst(w, a, late.id);
  }
  refreshVision(w);
}

function steer(w: World, fight: Fight, c: Count): World {
  const policy = scriptedTruck(fight)?.driver as Policy | undefined;
  if (!policy) return w;
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  return orders(w, policy, fight.orbit, nearest(me, inFight(w, c.ids.b)));
}

export function runFight(fight: Fight, watch?: (w: World, turn: number) => void): FightReport {
  const start = setup(fight);
  let w = start.w;
  const c: Count = { ids: start.ids, a: side(), b: side(), crashes: 0, leaver: null, center: groundOf(fight).center, spread: 0 };
  let d = buildDrive(w);
  let outcome: Outcome | null = null;
  let turns = 0;
  while (outcome === null && turns < fight.maxTurns) {
    if (w.player.call) w = hangUp(w);
    if (c.ids.late && turns >= fight.late!) {
      arrive(w, c.ids);
      freeDrive(d);
      d = buildDrive(w);
    }
    w = steer(w, fight, c);
    ({ w, d } = playTurn(w, d, c, fight.arena !== null));
    turns++;
    watch?.(w, turns);
    outcome = c.ids.late ? null : outcomeOf(w, c);
  }
  freeDrive(d);
  const spread = fight.road === undefined || fight.road === null ? null : c.spread;
  return { fight, outcome: outcome ?? 'timeout', turns, crashes: c.crashes, a: c.a, b: c.b, bHpLeft: outcome === 'won' ? hpLeft(w, c.ids.b) : null, spread, tally: tallies(w, c.ids), bystander: bystanderFate(w, c.ids.bystander) };
}

function tallies(w: World, ids: Ids): { a: Tally; b: Tally } {
  const a = inFight(w, ids.a);
  const b = inFight(w, ids.b);
  return { a: tally(w, ids.a, b), b: tally(w, ids.b, a) };
}

function tally(w: World, side: string[], foes: Vehicle[]): Tally {
  const out: Tally = { left: 0, out: 0, fled: 0 };
  for (const id of side) {
    const v = w.vehicles.find((x) => x.id === id);
    if (!v || inFight(w, [id]).length === 0) out.out++;
    else if (foes.length > 0 && dist(v.pos, nearest(v, foes).pos) > FLED_RANGE) out.fled++;
    else out.left++;
  }
  return out;
}

function bystanderFate(w: World, id: string | null): Bystander | null {
  if (id === null) return null;
  const v = w.vehicles.find((x) => x.id === id);
  if (!v || isDefeated(v)) return 'out';
  return inCombat(w, v) || Object.keys(v.brain!.attackers).length > 0 ? 'fought' : 'calm';
}

function hpLeft(w: World, ids: string[]): number {
  const parts = [...w.vehicles, ...w.removed].filter((v) => ids.includes(v.id)).flatMap((v) => mountedParts(v));
  return parts.reduce((a, p) => a + p.hp, 0) / parts.reduce((a, p) => a + maxHp(p), 0);
}

export type Group = { a: string; b: string; reports: FightReport[] };

const lineupLabel = (trucks: Truck[]) => trucks.map((t) => t.label).join('+');

export function groups(reports: FightReport[]): Group[] {
  const out = new Map<string, Group>();
  for (const r of reports) {
    const g = { a: lineupLabel(r.fight.a), b: lineupLabel(r.fight.b) };
    const key = `${g.a}|${g.b}`;
    if (!out.has(key)) out.set(key, { ...g, reports: [] });
    out.get(key)!.reports.push(r);
  }
  return [...out.values()];
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '-');

export function formatReport(reports: FightReport[], sets: string[]): string {
  const lines = [
    `# Combat harness`,
    '',
    `${reports.length} fights. Changed numbers: ${sets.length ? sets.join(', ') : 'none'}.`,
    'A truck is driver:gear. On a road map, across is the largest distance any fighting truck reached from the centerline, in tiles. Won means every side b truck is out, lost every side a truck. A fled and b fled name the side that left the fight. Truce means no truck is hostile to the other side any more. Speed is tiles per turn. Hit is rounds that hit. Odds is the mean hit chance shown for those rounds. Damage is part HP the side takes off the other per turn. Crashes are per fight. Rams landed counts the damaging crashes on a side that carries a ram or spikes in which they took the hit, out of all damaging crashes on that side. The side is the one facing the other truck at the end of the turn. B hp left is the mean share of max part HP the side b trucks keep in won fights.',
    '',
    '| a | b | won | lost | a fled | b fled | truce | timeout | turns | crashes | a speed | a hit | a odds | a dmg/turn | a rams landed | b speed | b hit | b odds | b dmg/turn | b rams landed | b hp left | across | a left/out/fled | b left/out/fled | bystander |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const g of groups(reports)) lines.push(groupRow(g));
  return lines.join('\n') + '\n';
}

function groupRow(g: Group): string {
  const rs = g.reports;
  const sum = (f: (r: FightReport) => number) => rs.reduce((a, r) => a + f(r), 0);
  const count = (o: Outcome) => rs.filter((r) => r.outcome === o).length;
  const turns = sum((r) => r.turns);
  const sideCells = (pick: (r: FightReport) => Side) => {
    const rounds = sum((r) => pick(r).rounds);
    const ramCrashes = sum((r) => pick(r).ramCrashes);
    const landed = ramCrashes > 0 ? `${sum((r) => pick(r).ramsLanded)}/${ramCrashes}` : '-';
    return [(sum((r) => pick(r).speed) / turns).toFixed(1), pct(sum((r) => pick(r).hits), rounds), pct(sum((r) => pick(r).odds), rounds), (sum((r) => pick(r).damage) / turns).toFixed(1), landed];
  };
  const tallied = (pick: (r: FightReport) => Tally) => `${sum((r) => pick(r).left)}/${sum((r) => pick(r).out)}/${sum((r) => pick(r).fled)}`;
  const cells = [g.a, g.b, ...OUTCOMES.map(count), (turns / rs.length).toFixed(1), (sum((r) => r.crashes) / rs.length).toFixed(1), ...sideCells((r) => r.a), ...sideCells((r) => r.b), hpLeftCell(rs), spreadCell(rs), tallied((r) => r.tally.a), tallied((r) => r.tally.b), bystanderCell(rs)];
  return `| ${cells.join(' | ')} |`;
}

function bystanderCell(rs: FightReport[]): string {
  const fates = rs.flatMap((r) => (r.bystander === null ? [] : [r.bystander]));
  if (fates.length === 0) return '-';
  return (['calm', 'fought', 'out'] as const).map((f) => `${fates.filter((x) => x === f).length} ${f}`).join(', ');
}

function spreadCell(rs: FightReport[]): string {
  const spreads = rs.flatMap((r) => (r.spread === null ? [] : [r.spread]));
  return spreads.length > 0 ? `${Math.max(...spreads).toFixed(1)} max, ${(spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(1)} mean` : '-';
}

function hpLeftCell(rs: FightReport[]): string {
  const shares = rs.flatMap((r) => (r.bHpLeft === null ? [] : [r.bHpLeft]));
  return shares.length > 0 ? pct(shares.reduce((a, b) => a + b, 0), shares.length) : '-';
}
