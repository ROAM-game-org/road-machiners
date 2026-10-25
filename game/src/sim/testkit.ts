import { startKit } from '../data/start';

import { RULES } from '../data/rules';
import { makeVehicle } from './factory';
import { nextRandom } from './rng';
import { gridOf, MOUNT_CELLS, mountedParts, mountSpots, type Spot } from './grid';
import { burnFuel } from './resources';
import { vehicleStats } from './stats';
import type { Terrain } from './terrain';
import { inject, onTestFinished } from 'vitest';
import { emptyWorldFrom, flatTerrain, PLAIN_KIT } from '../test/empty-world';
import { DECISIONS, NPC_UPKEEP, STATE_WEIGHTS, TRAITS, type DecisionId, type DecisionOptions, type TraitId } from '../data/npcs';
import type { PersonalityId } from '../data/personalities';
import { addState } from './states';
import { advanceJobs } from './jobs';
import { resolveNpcActivities } from './npc-activities';
import type { Faction, GameEvent, NpcBrain, Obstacle, PartInstance, SalvageStock, Vehicle, World, XpSource } from './types';
import { alongOf, highwayMap, milestoneAt, roadHeading, roadPoint, toRoad } from './highway';
import { CHAOS_HIGHWAY, HIGHWAY } from '../data/modes';
import { dist, type Vec } from './vec';
import { REGION } from '../data/region';
import { propReach } from './mapgen';
import { rollStock } from './salvage';
import { spotTable } from './territory';
import { refreshVision } from './vision';
import { openingStockOf } from './opening';
import { haulerOf, playerVehicle } from './damage';
import { stormDepth } from './weather';
import { cloneWorld, endTurn, newWorld } from './world';
import { driveOn } from './chaos-highway';
import { yardSpots } from './outpost-gates';
import { addGoods } from './inventory';
import { stockTarget } from './market';
import { PRODUCTION } from '../data/market';
import { partDef, type PartKind } from '../data/parts';
import { defaultSetup } from './settings';
import { chooseQuestOption, leaveQuest, QUESTS, questView } from './quests';

export function chaosHighwayStart(seed = 3): World {
  return newWorld(seed, startKit('chaosHighway'), highwayMap(seed, 0), defaultSetup('chaosHighway'));
}

const OPEN_ROAD = 24;

export function chaosHighwayWorld(seed = 3): World {
  const w = driveOn(chaosHighwayStart(seed));
  const n = milestoneAt(seed, 0) + OPEN_ROAD;
  const gap = vehicleStats(w, haulerOf(w)).radius + vehicleStats(w, playerVehicle(w)).radius + RULES.yieldDistance;
  for (const [truck, lane, ahead] of [[playerVehicle(w), 2, 0], [haulerOf(w), 1, gap]] as const) {
    truck.pos = roadPoint(seed, 0, n + ahead, HIGHWAY.road.lanes[lane]);
    truck.heading = roadHeading(seed, n + ahead);
    truck.speed = 0;
    truck.order = null;
  }
  refreshVision(w);
  w.events = [];
  return w;
}

export function sendGunTruckAway(w: World): void {
  const hauler = haulerOf(w);
  const window = w.chaosHighway!.window;
  const along = alongOf(w.seed, toRoad(w.seed, window, hauler.pos)) - CHAOS_HIGHWAY.hauler.apartGap - 5;
  const me = playerVehicle(w);
  me.pos = roadPoint(w.seed, window, along, HIGHWAY.road.lanes[1]);
  me.heading = roadHeading(w.seed, along);
  me.speed = 0;
  me.order = null;
}

export function parkInYard(w: World, milestone: number): void {
  const spots = yardSpots(w, milestone);
  const me = playerVehicle(w);
  const hauler = haulerOf(w);
  me.pos = { ...spots.truck };
  me.speed = 0;
  me.order = null;
  hauler.pos = { ...spots.hauler };
  hauler.speed = 0;
  hauler.order = null;
}

export function parkedAtOutpost(seed = 3): World {
  const w = chaosHighwayWorld(seed);
  parkInYard(w, 1);
  const parked = endTurn(w, () => {});
  parked.player.money = 10_000_000;
  return parked;
}

export function fillCargo(w: World): void {
  addGoods(w, playerVehicle(w), 'parts', 1000);
}

export function armorSpot(w: World, part: PartInstance): Spot {
  const me = playerVehicle(w);
  const spot = mountSpots(gridOf(me), me.items, { id: 'i-probe', x: 0, y: 0, rot: 0, kind: 'part', part }, MOUNT_CELLS.armor)[0];
  if (!spot) throw new Error(`The player truck has no armor spot for ${part.defId}`);
  return spot;
}

export function stockOfKind(w: World, kind: PartKind): PartInstance {
  const part = w.chaosHighway!.outposts[1].stock.find((p) => partDef(p.defId).kind === kind);
  if (!part) throw new Error(`Outpost 1 stocks no ${kind}`);
  return part;
}

export function editableTerrain(w: World): Terrain {
  w.terrain = Object.freeze({ ...w.terrain, heights: [...w.terrain.heights], types: [...w.terrain.types] });
  return w.terrain;
}

export { PLAIN_KIT, flatTerrain };

let emptyTemplate: World | undefined;

function templateFromSetup(): World {
  const provided = inject('emptyTemplate');
  if (provided === undefined) throw new Error('The empty world template was not provided. List src/test/empty-template-setup.ts under globalSetup in the vitest config');
  return emptyWorldFrom(provided);
}

export function emptyWorld(pos: Vec = { x: 30, y: 30 }): World {
  emptyTemplate ??= templateFromSetup();
  const w = cloneWorld(emptyTemplate);
  const p = w.vehicles[0];
  p.pos = { ...pos };
  p.heading = 0;
  refreshVision(w);
  return w;
}

export function addLootSpot(w: World): { spot: Obstacle; stock: SalvageStock } {
  const orchard = REGION.locations.find((site) => site.id === 'orchard')!;
  const spot: Obstacle = { id: 'farmhouse-1', kind: 'landmark', look: 'farmhouse', pos: { ...orchard.pos }, r: 1.5, yaw: 0 };
  const stock = rollStock(w, spotTable(spot), spot.id, spot.pos, propReach(spot));
  w.obstacles = [...w.obstacles, spot];
  w.salvage.push(stock);
  return { spot, stock };
}

export function spotWorld(): { w: World; spot: Obstacle; stock: SalvageStock } {
  const w = emptyWorld();
  w.salvage = [];
  const { spot, stock } = addLootSpot(w);
  w.vehicles[0].pos = { x: spot.pos.x + propReach(spot) + 1, y: spot.pos.y };
  refreshVision(w);
  return { w, spot, stock };
}

export function addVehicle(w: World, faction: Faction, chassisId: string, parts: string[], pos: Vec, heading = 0): Vehicle {
  const v = makeVehicle(w, { faction, chassisId, parts: parts.map((defId) => ({ defId, wear: 0 })), spares: [], cargo: {}, pos, heading, brain: null });
  w.vehicles.push(v);
  return v;
}

export function practiceOf(w: World, source: XpSource): Extract<GameEvent, { t: 'practice' }>[] {
  return w.events.filter((e): e is Extract<GameEvent, { t: 'practice' }> => e.t === 'practice' && e.source === source);
}

export function npcBrain(templateId: string, home: Vec, traits: TraitId[], personality: PersonalityId = 'talkative'): NpcBrain {
  return { templateId, driver: 'Jed Cobb', traits, personality, goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { ...home }, stepIndex: 0, memories: [] };
}

export function forceOption<D extends DecisionId>(decision: D, option: DecisionOptions[D]): void {
  const base = DECISIONS[decision] as Record<string, number>;
  const savedBase = { ...base };
  const tables = [...Object.values(TRAITS).map((t) => t.weights), ...Object.values(STATE_WEIGHTS)] as Record<string, Record<string, unknown> | undefined>[];
  const saved = tables.map((t) => t[decision]);
  for (const key of Object.keys(base)) if (key !== option) base[key] = 0;
  for (const table of tables) {
    const entry = table[decision];
    if (!entry) continue;
    table[decision] = option in entry ? { [option]: entry[option] } : {};
  }
  onTestFinished(() => {
    Object.assign(base, savedBase);
    tables.forEach((table, i) => {
      if (saved[i] === undefined) delete table[decision];
      else table[decision] = saved[i];
    });
  });
}

export function rngStateWhere(test: (roll: number) => boolean): number {
  for (let state = 1; state <= 100_000; state++) if (test(nextRandom({ rngState: state }))) return state;
  throw new Error('No RNG state passes the test');
}

export function rngStateForForcedRolls(count: number): number {
  for (let state = 1; state <= 1_000_000; state++) {
    const rng = { rngState: state };
    let ok = true;
    for (let k = 0; k < count && ok; k++) {
      const roll = nextRandom(rng);
      ok = roll > 0.3 && roll < 0.7;
    }
    if (ok) return state;
  }
  throw new Error(`No RNG state gives ${count} mid-range rolls`);
}

export function settleStorms(w: World): void {
  for (const v of w.vehicles) {
    v.stormExposure = {};
    for (const e of w.weather) {
      if (e.kind !== 'storm') continue;
      const depth = stormDepth(w, e, v.pos);
      if (depth > 0) v.stormExposure[e.id] = depth;
    }
  }
}

const PICKS_TO_END = 100;

export function finishQuest(world: World): World {
  let w = world;
  for (let picks = 0; w.player.quests.session && picks < PICKS_TO_END; picks++) {
    const view = questView(w, QUESTS);
    const index = view.locked.lastIndexOf(false);
    if (index < 0) throw new Error(`Every choice of quest ${view.quest} is locked`);
    w = chooseQuestOption(w, QUESTS, index);
  }
  if (w.player.quests.session) throw new Error(`Quest ${w.player.quests.session.quest} did not end in ${PICKS_TO_END} picks of its last open choice`);
  return w.player.quests.live ? leaveQuest(w) : w;
}

export function partHp(v: Vehicle): number {
  return mountedParts(v).reduce((a, p) => a + p.hp, 0);
}

export function testDrive(world: World): void {
  for (const v of world.vehicles) {
    if (v.trail.length === 0) standStill(v);
    if (v.order) driveOne(world, v);
  }
}

function standStill(v: Vehicle): void {
  const pose = { ...v.pos, heading: v.heading };
  v.trail = [pose, { ...pose }];
}

function driveOne(world: World, v: Vehicle): void {
  const s = vehicleStats(world, v);
  if (v.order!.kind === 'brake') {
    v.speed = Math.max(0, v.speed - s.brake);
    if (v.speed === 0) v.order = null;
    return;
  }
  const dest = v.order!.dest;
  const remaining = dist(v.pos, dest);
  if (remaining < RULES.arriveRadius) {
    v.speed = 0;
    v.order = null;
    world.events.push({ t: 'arrived', vehicle: v.id });
    return;
  }
  const target = Math.min(s.maxSpeed, remaining - RULES.arriveRadius / 2);
  const speed = target > v.speed ? Math.min(target, v.speed + s.accel) : Math.max(target, v.speed - s.brake);
  v.heading = Math.atan2(dest.y - v.pos.y, dest.x - v.pos.x);
  const from = { ...v.pos, heading: v.heading };
  v.pos = { x: v.pos.x + Math.cos(v.heading) * speed, y: v.pos.y + Math.sin(v.heading) * speed };
  v.trail = [from, { ...v.pos, heading: v.heading }];
  v.speed = speed;
  burnFuel(world, v, speed);
}

export function sizedUp(w: World, looker: Vehicle, target: Vehicle): void {
  addState(w, 'sizedUp', looker.id, target.id, { kind: 'none' });
}

export function startCombat(w: World, aggressor: Vehicle, target: Vehicle): void {
  addState(w, 'combat', aggressor.id, target.id, { kind: 'none' });
}

export function finishBusiness(w: World, npc: Vehicle): void {
  w.events = [];
  if (npc.job?.kind !== 'business') resolveNpcActivities(w);
  for (let turn = 0; npc.job?.kind === 'business'; turn++) {
    if (turn > NPC_UPKEEP.businessTurns) throw new Error(`${npc.id} business never finished`);
    w.events = [];
    advanceJobs(w);
    resolveNpcActivities(w);
  }
}

export function openingStopPoint(w: World): Vec {
  const stock = openingStockOf(w);
  if (!stock) throw new Error('No opening wreck');
  const from = playerVehicle(w).pos;
  const d = dist(from, stock.pos);
  return { x: stock.pos.x + ((from.x - stock.pos.x) / d) * 2.2, y: stock.pos.y + ((from.y - stock.pos.y) / d) * 2.2 };
}

export function setShopPressure(w: World, shopId: string, good: string, pressure: number): void {
  w.shops[shopId].goods[good] = Math.max(0, Math.round(stockTarget(shopId, good) * (1 - pressure / PRODUCTION.elasticity)));
}
