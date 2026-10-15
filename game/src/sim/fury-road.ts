import { FURY_ROAD } from '../data/modes';
import { GARAGE_STOCK } from '../data/market';
import { MIN_NPC_SPEED, NPCS } from '../data/npcs';
import { RULES } from '../data/rules';
import { chassisDef } from '../data/chassis';
import { HAULER_KIT } from '../data/start';
import { PHYSICS } from '../data/physics';
import { bodyOf } from './body';
import { makeVehicle } from './factory';
import { groupPrey } from './combat';
import { isDefeated, knockOutNpc } from './defeat';
import { haulerOf, playerTrucks, playerVehicle } from './damage';
import { acrossOf, alongOf, highwayMap, milestoneAt, outpostFort, outpostId, outpostSite, roadHeading, roadPoint, stretchStream, toRoad, windowShift } from './highway';
import { canUseSite, sitePads } from './sites';
import { isDriveObstacle, mapObstacles } from './mapgen';
import { rollPartStockPerKind } from './market';
import { fightCornered, topGoal } from './npc-activities';
import { generateNpcLoadout, type GearRules } from './npc-loadout';
import { randInt, type Rng } from './rng';
import { modeRules } from './settings';
import { directStretch, payOf, type PlannedWave } from './fury-road-director';
import { mountedParts } from './grid';
import { maxHp } from './wear';
import { isFree, spawnAt } from './spawn';
import { declareFeud, markHostile, settleStates } from './states';
import { getResources } from './resources';
import { fuelCap, isStranded, vehicleStats } from './stats';
import { refreshTrack } from './tracks';
import type { FuryRoadRun, GroupSide, OutpostFacts, PartInstance, RunLossCause, Vehicle, WaveGroup, World } from './types';
import { refreshVision } from './vision';
import { dist, type Vec } from './vec';
import { playerCommand } from './world';


export type Outpost = OutpostFacts & { id: string; pad: Vec };
export type FuryRoadReadout = { stretch: number; toOutpost: number; outpostId: string };

export { outpostId, haulerOf, playerTrucks };

export function waveOf(j: number): (typeof FURY_ROAD.waves)[number] {
  if (!Number.isInteger(j) || j < 1) throw new Error(`Stretch ${j} has no wave`);
  return FURY_ROAD.waves[Math.min(j, FURY_ROAD.waves.length) - 1];
}

const SIDES: readonly GroupSide[] = ['ahead', 'left', 'right'];

export function stretchPlan(world: World, j: number): WaveGroup[] {
  return planStretch(world.seed, j, directStretch(world, j));
}

export function planStretch(seed: number, j: number, waves: readonly PlannedWave[]): WaveGroup[] {
  const sides = stretchStream(seed, j, 'sides');
  const level = waveOf(j).level;
  let last: GroupSide | null = null;
  return waves.map((wave, i) => {
    const drawn = drawSide(sides, last);
    const from = FURY_ROAD.cards[wave.template].chase ? drawn : 'ahead';
    last = from;
    return {
      id: `g${j}-${i}`,
      stretch: j,
      from,
      at: wave.at,
      templates: Array.from({ length: wave.size }, () => wave.template),
      money: wave.money,
      elite: wave.elite,
      level,
      spawned: false,
      vehicles: [],
      wrecked: 0,
      counted: [],
      retryUntil: null,
    };
  });
}

function drawSide(rng: Rng, last: GroupSide | null): GroupSide {
  const open = SIDES.filter((side) => side !== last);
  return open[randInt(rng, 0, open.length - 1)];
}

function outpostFacts(world: World, j: number): OutpostFacts {
  const stock: PartInstance[] = rollPartStockPerKind(world, stretchStream(world.seed, j, 'stock'), GARAGE_STOCK, FURY_ROAD.stockPerKind, outpostId(j));
  return { milestone: j, stock, paid: false, trucksSold: [] };
}

export function truckOffers(seed: number, j: number): string[] {
  const { offers, pool } = FURY_ROAD.trucks;
  if (pool.length < offers) throw new Error(`The Fury Road truck pool holds ${pool.length} chassis, fewer than ${offers} offers`);
  const rng = stretchStream(seed, j, 'trucks');
  const left = [...pool];
  return Array.from({ length: offers }, () => left.splice(randInt(rng, 0, left.length - 1), 1)[0]);
}

export function outpostTrucks(world: World, post: OutpostFacts): string[] {
  return truckOffers(world.seed, post.milestone).filter((id) => !post.trucksSold.includes(id));
}

export type Pose = { pos: Vec; heading: number };

export function startRun(world: World): void {
  const atlas = world.terrain.atlas;
  if (atlas.kind !== 'highway') throw new Error(`A Fury Road run starts on a highway, not map ${world.mapHash}`);
  const from = atlas.window;
  const hauler = spawnHauler(world, from);
  const start = { ...outpostFacts(world, from), paid: true };
  world.player.discovered.push(outpostId(from));
  world.furyRoad = { window: from, outposts: [start, outpostFacts(world, from + 1)], groups: stretchPlan(world, from + 1), earned: 0, wrecks: 0, waitingAt: from, hauler: { id: hauler.id, alarmUntil: null } };
}

export function runStart(seed: number, playerChassis: string, from: number): { player: Pose; hauler: Pose } {
  const pad = sitePads(outpostFort(seed, from, from))[0];
  const heading = roadHeading(seed, milestoneAt(seed, from));
  const half = (halfLength(HAULER_KIT.chassis) + halfLength(playerChassis) + RULES.yieldDistance) / 2;
  const at = (ahead: number): Pose => ({ pos: { x: pad.x + Math.cos(heading) * ahead, y: pad.y + Math.sin(heading) * ahead }, heading });
  return { player: at(-half), hauler: at(half) };
}

function halfLength(chassisId: string): number {
  return bodyOf(chassisId).half.x / PHYSICS.metersPerTile;
}

export function spawnHauler(world: World, from: number): Vehicle {
  const start = runStart(world.seed, playerVehicle(world).chassisId, from).hauler;
  const v = makeVehicle(world, {
    faction: 'player',
    chassisId: HAULER_KIT.chassis,
    parts: HAULER_KIT.parts.map((defId) => ({ defId, wear: HAULER_KIT.wear })),
    spares: [],
    cargo: {},
    pos: start.pos,
    heading: start.heading,
    brain: null,
    driver: 'own',
  });
  v.resources = { money: 0, fuel: HAULER_KIT.fuel, supplies: HAULER_KIT.supplies, health: RULES.maxHealth };
  world.vehicles.push(v);
  return v;
}

function runOf(world: World): FuryRoadRun {
  if (!world.furyRoad) throw new Error('No Fury Road run in this world');
  return world.furyRoad;
}

export function outpostPad(world: World, milestone: number): Vec {
  return sitePads(outpostFort(world.seed, runOf(world).window, milestone))[0];
}

function outpostOf(world: World, facts: OutpostFacts): Outpost {
  return { ...facts, id: outpostId(facts.milestone), pad: outpostPad(world, facts.milestone) };
}

export function outpostFactsAt(world: World, milestone: number): OutpostFacts {
  return factsOf(runOf(world), milestone);
}

function factsOf(run: FuryRoadRun, milestone: number): OutpostFacts {
  const facts = run.outposts.find((o) => o.milestone === milestone);
  if (!facts) throw new Error(`The run holds no outpost ${milestone} in window ${run.window}`);
  return facts;
}

export function advanceFuryRoad(world: World): void {
  const run = world.furyRoad;
  if (!run || world.player.state !== 'active' || betweenLevels(world)) return;
  breakHurt(world, run);
  countBeaten(world, run);
  retireWoken(world, run);
  huntConvoy(world, run);
  if (arrivedAtNext(world, run)) return completeStretch(world, run);
  spawnNext(world, run, haulerProgress(world, run));
}

function playerProgress(world: World, run: FuryRoadRun): number {
  return alongOf(world.seed, toRoad(world.seed, run.window, playerVehicle(world).pos));
}

function haulerProgress(world: World, run: FuryRoadRun): number {
  return alongOf(world.seed, toRoad(world.seed, run.window, haulerOf(world).pos));
}

function countBeaten(world: World, run: FuryRoadRun): void {
  for (const e of world.events) {
    if (e.t !== 'destroyed' && e.t !== 'npcKnockout') continue;
    const group = run.groups.find((g) => g.vehicles.includes(e.vehicle));
    if (!group || group.counted.includes(e.vehicle)) continue;
    group.counted.push(e.vehicle);
    group.wrecked++;
  }
}

function breakHurt(world: World, run: FuryRoadRun): void {
  for (const group of run.groups) {
    for (const v of fighting(world, group)) if (hurtShare(v) >= FURY_ROAD.nerve) knockOutNpc(world, v);
  }
}

export function hurtShare(v: Vehicle): number {
  const parts = mountedParts(v);
  const full = parts.reduce((sum, part) => sum + maxHp(part), 0);
  const now = parts.reduce((sum, part) => sum + part.hp, 0);
  return full > 0 ? 1 - now / full : 0;
}

function retireWoken(world: World, run: FuryRoadRun): void {
  const ids = new Set(run.groups.flatMap((g) => g.vehicles));
  const woken = world.vehicles.filter((v) => ids.has(v.id) && v.defeat?.phase === 'retreat');
  if (woken.length > 0) removeVehicles(world, woken.map((v) => v.id));
}

function fighting(world: World, group: WaveGroup): Vehicle[] {
  return world.vehicles.filter((v) => group.vehicles.includes(v.id) && !isDefeated(v));
}

function aliveCount(world: World, run: FuryRoadRun): number {
  return run.groups.reduce((n, g) => n + fighting(world, g).length, 0);
}

export function turnedOnPlayer(world: World, v: Vehicle): boolean {
  return v.brain !== null && world.player.vehicleId in v.brain.attackers;
}

function huntConvoy(world: World, run: FuryRoadRun): void {
  const me = playerVehicle(world);
  const hauler = haulerOf(world);
  for (const group of run.groups) {
    for (const v of fighting(world, group)) {
      declareFeud(world, v, hauler.id);
      markHostile(world, v, me.id);
      const target = groupPrey(world, v);
      if (huntsTarget(v, target)) refreshTrack(world, v, target.id, interceptPoint(world, run, v, target));
      else fightCornered(world, v, target);
    }
  }
}

export function interceptPoint(world: World, run: FuryRoadRun, hunter: Vehicle, me: Vehicle): Vec {
  const hunterSpeed = vehicleStats(world, hunter).maxSpeed;
  if (me.speed === 0 || hunterSpeed === 0) return me.pos;
  const lead = Math.min((me.speed * dist(hunter.pos, me.pos)) / hunterSpeed, FURY_ROAD.pacing.near);
  const ahead = toRoad(world.seed, run.window, { x: me.pos.x + Math.cos(me.heading) * lead, y: me.pos.y + Math.sin(me.heading) * lead });
  return roadPoint(world.seed, run.window, alongOf(world.seed, ahead), withinFlanks(acrossOf(world.seed, ahead)));
}

function huntsTarget(v: Vehicle, target: Vehicle): boolean {
  const top = topGoal(v);
  return top?.kind === 'fight' && top.targetId === target.id;
}

function spawnNext(world: World, run: FuryRoadRun, progress: number): void {
  const group = run.groups.find((g) => !g.spawned);
  if (!group || progress < group.at || aliveCount(world, run) + group.templates.length > FURY_ROAD.maxAlive) return;
  spawnGroup(world, run, group, progress);
}

export function waveGear(template: string, stretch: number, money: number, elite: boolean): GearRules {
  const minSpeed = FURY_ROAD.cards[template].chase ? FURY_ROAD.chaseSpeed : MIN_NPC_SPEED;
  return { ...waveOf(stretch).gear, armored: elite, armorFirst: elite, money, minSpeed };
}

export function spawnGroup(world: World, run: FuryRoadRun, group: WaveGroup, progress: number): void {
  const loadouts = group.templates.map((id) => ({ tpl: NPCS[id], loadout: { ...generateNpcLoadout(world, NPCS[id], null, group.level, waveGear(id, group.stretch, group.money, group.elite)), cargo: {} } }));
  const spots = groupSpots(world, run, group.from, progress, loadouts.map((l) => chassisDef(l.loadout.chassisId).radius));
  if (!spots) return retryLater(world, group);
  const me = playerVehicle(world);
  const hauler = haulerOf(world);
  loadouts.forEach(({ tpl, loadout }, i) => {
    const v = spawnAt(world, tpl, loadout, spots[i]);
    getResources(world, v).fuel = fuelCap(v);
    v.heading = roadHeading(world.seed, alongOf(world.seed, toRoad(world.seed, run.window, v.pos)));
    group.vehicles.push(v.id);
    declareFeud(world, v, hauler.id);
    markHostile(world, v, me.id);
    fightCornered(world, v, groupPrey(world, v));
  });
  group.spawned = true;
  group.retryUntil = null;
}

type Candidate = { along: number; across: number };

function groupSpots(world: World, run: FuryRoadRun, from: GroupSide, progress: number, radii: number[]): Vec[] | null {
  const candidates = spotCandidates(from, progress, haulerAcross(world, run));
  const spots: Vec[] = [];
  for (const radius of radii) {
    const spot = freeSpot(world, run, candidates, radius, spots);
    if (!spot) return null;
    spots.push(spot);
  }
  return spots;
}

function haulerAcross(world: World, run: FuryRoadRun): number {
  return acrossOf(world.seed, toRoad(world.seed, run.window, haulerOf(world).pos));
}

function withinFlanks(across: number): number {
  const edge = FURY_ROAD.sides.flank.across;
  return Math.min(Math.max(across, -edge), edge);
}

function spotCandidates(from: GroupSide, progress: number, across: number): Candidate[] {
  const make = from === 'left' || from === 'right' ? flankCandidate(from, progress) : lineCandidate(progress, across);
  return Array.from({ length: FURY_ROAD.maxTries / 10 }, (_, step) => make(step));
}

function flankCandidate(from: 'left' | 'right', progress: number): (step: number) => Candidate {
  const flank = FURY_ROAD.sides.flank;
  const across = (from === 'left' ? -1 : 1) * flank.across;
  return (step) => ({ along: progress + flank.along + Math.ceil(step / 2) * (step % 2 === 0 ? 1 : -1) * flank.step, across });
}

function lineCandidate(progress: number, line: number): (step: number) => Candidate {
  const offsets = FURY_ROAD.spawnOffsets;
  const along = progress + FURY_ROAD.sides.ahead;
  return (step) => {
    const offset = Math.floor(step / offsets.length) * FURY_ROAD.spawnStagger;
    return { along: along + (step % 2 === 0 ? offset : -offset), across: withinFlanks(line + offsets[step % offsets.length]) };
  };
}

function freeSpot(world: World, run: FuryRoadRun, candidates: Candidate[], radius: number, taken: Vec[]): Vec | null {
  const from = milestoneAt(world.seed, run.window);
  const to = milestoneAt(world.seed, run.window + 1);
  for (const c of candidates) {
    const pos = roadPoint(world.seed, run.window, Math.min(Math.max(c.along, from), to), c.across);
    if (!insideWindow(world, pos, radius)) continue;
    if (isFree(world, pos, radius, null) && taken.every((t) => dist(t, pos) > radius * 2 + 0.5)) return pos;
  }
  return null;
}

function insideWindow(world: World, pos: Vec, radius: number): boolean {
  return pos.x >= radius && pos.y >= radius && pos.x <= world.size - radius && pos.y <= world.size - radius;
}

function retryLater(world: World, group: WaveGroup): void {
  if (group.retryUntil === null) group.retryUntil = world.turn + FURY_ROAD.spawnRetryTurns;
  else if (world.turn > group.retryUntil) throw new Error(`Fury Road group ${group.id} found no free lane spot for ${FURY_ROAD.spawnRetryTurns} turns`);
}

function parkedOnPad(world: World, milestone: number): boolean {
  return playerTrucks(world).every((truck) => truck.speed <= RULES.parkedSpeed && onOutpostPad(world, truck.pos, milestone));
}

export function onOutpostPad(world: World, pos: Vec, milestone: number): boolean {
  return canUseSite(pos, outpostFort(world.seed, runOf(world).window, milestone));
}

function arrivedAtNext(world: World, run: FuryRoadRun): boolean {
  return playerTrucks(world).every((truck) => onOutpostPad(world, truck.pos, run.window + 1));
}

export function betweenLevels(world: World): boolean {
  return world.furyRoad !== null && world.furyRoad.waitingAt !== null;
}

export function canWaitForRoad(world: World): boolean {
  const run = world.furyRoad;
  return run !== null && world.player.state === 'active' && run.waitingAt !== null && parkedOnPad(world, run.waitingAt);
}

export function waitForRoad(world: World): World {
  return playerCommand(world, (w) => {
    if (!canWaitForRoad(w)) throw new Error('Only a player parked on the pad of a paid outpost can wait for the road');
    const run = runOf(w);
    if (run.waitingAt === run.window + 1) moveWindow(w);
    run.waitingAt = null;
    w.events.push({ t: 'roadOpened', stretch: run.window + 1 });
  });
}

function completeStretch(world: World, run: FuryRoadRun): void {
  const j = run.window + 1;
  const post = factsOf(run, j);
  const wrecks = run.groups.reduce((n, g) => n + g.wrecked, 0);
  const pay = payOf(j);
  world.player.money += pay;
  world.events.push({ t: 'money', amount: pay, reason: { kind: 'outpost' } });
  post.paid = true;
  run.waitingAt = j;
  run.earned += pay;
  run.wrecks += wrecks;
  removeVehicles(world, run.groups.flatMap((g) => g.vehicles));
  run.groups = [];
  world.events.push({ t: 'outpostReached', milestone: j, pay, wrecks });
}

function removeVehicles(world: World, ids: string[]): void {
  const gone = new Set(ids);
  world.removed.push(...world.vehicles.filter((v) => gone.has(v.id)));
  world.vehicles = world.vehicles.filter((v) => !gone.has(v.id));
  settleStates(world);
}

type Move = 'shift' | 'rebuild' | 'drop' | 'keep';

export const WINDOW_MOVE = {
  seed: 'keep',
  rngState: 'keep',
  marketRng: 'keep',
  nameRng: 'keep',
  searchRng: 'keep',
  turn: 'keep',
  size: 'keep',
  nextId: 'keep',
  setup: 'keep',
  events: 'keep',
  removed: 'keep',
  spawnTimer: 'keep',
  shops: 'keep',
  salvage: 'keep',
  player: 'shift',
  vehicles: 'shift',
  weather: 'shift',
  terrain: 'rebuild',
  mapHash: 'rebuild',
  obstacles: 'rebuild',
  furyRoad: 'rebuild',
  broken: 'drop',
  craters: 'drop',
  dustClouds: 'drop',
  states: 'drop',
  smoke: 'drop',
  fields: 'drop',
  flares: 'drop',
  lines: 'drop',
} as const satisfies { [K in keyof World]-?: Move };

const DROPPED: { [K in keyof World as (typeof WINDOW_MOVE)[K] extends 'drop' ? K : never]: () => World[K] } = {
  broken: () => [],
  craters: () => [],
  dustClouds: () => [],
  states: () => [],
  smoke: () => [],
  fields: () => [],
  flares: () => [],
  lines: () => [],
};

function requireMovable(world: World, run: FuryRoadRun): void {
  if (run.waitingAt !== run.window + 1) throw new Error(`The window moves only while the run waits at outpost ${run.window + 1}`);
  if (aliveCount(world, run) > 0) throw new Error('The window cannot move while a group truck is alive');
  if (!parkedOnPad(world, run.window + 1)) throw new Error(`The window moves only with both trucks parked at outpost ${run.window + 1}`);
  if (world.salvage.length > 0 || Object.keys(world.shops).length > 0) throw new Error('A Fury Road window holds no salvage and no shops');
}

export function moveWindow(world: World): void {
  const run = runOf(world);
  requireMovable(world, run);
  const next = run.window + 1;
  const map = highwayMap(world.seed, next);
  const shift = windowShift(world.seed, run.window);
  for (const key of Object.keys(DROPPED) as (keyof typeof DROPPED)[]) (world as Record<string, unknown>)[key] = DROPPED[key]();
  shiftVehicles(world, shift);
  shiftPlayer(world, shift);
  shiftStorms(world, shift);
  world.terrain = map.terrain;
  world.mapHash = map.hash;
  world.obstacles = mapObstacles(map);
  run.window = next;
  run.outposts = [...run.outposts.filter((o) => o.milestone === next), outpostFacts(world, next + 1)];
  run.groups = stretchPlan(world, next + 1);
  refreshVision(world);
}

function shifted(p: Vec, shift: Vec): Vec {
  return { x: p.x + shift.x, y: p.y + shift.y };
}

function shiftStorms(world: World, shift: Vec): void {
  for (const storm of world.weather) if (storm.kind === 'storm') storm.pos = shifted(storm.pos, shift);
}

function shiftVehicles(world: World, shift: Vec): void {
  const kept = playerTrucks(world);
  world.removed.push(...world.vehicles.filter((v) => !kept.includes(v)));
  world.vehicles = kept;
  for (const truck of kept) {
    truck.pos = shifted(truck.pos, shift);
    truck.order = null;
    truck.trail = [];
    truck.weaponOrders = {};
    truck.utilityOrders = {};
  }
}

function shiftPlayer(world: World, shift: Vec): void {
  const p = world.player;
  const size = world.size;
  const explored = new Uint8Array(size * size);
  const { x: sx, y: sy } = shift;
  const fromX = Math.max(0, -sx);
  const toX = Math.min(size, size - sx);
  for (let y = Math.max(0, -sy); y < Math.min(size, size - sy); y++) explored.set(p.explored.subarray(y * size + fromX, y * size + toX), (y + sy) * size + fromX + sx);
  p.explored = explored;
  p.marked = [];
  p.hostilesSeen = [];
}

export function endRun(world: World, cause: RunLossCause): void {
  const run = runOf(world);
  if (world.player.state === 'dead') throw new Error('The run has already ended');
  world.player.state = 'dead';
  world.events.push({ t: 'runLost', stretch: run.window + 1, cause });
}

export function canAbandonRun(world: World): boolean {
  if (world.furyRoad === null || modeRules(world).rescue || world.player.state !== 'active') return false;
  return playerTrucks(world).some((truck) => isStranded(world, truck)) || haulerWedged(world);
}

export function haulerWedged(world: World): boolean {
  const hauler = haulerOf(world);
  if (hauler.speed > RULES.parkedSpeed || parkedForTheRoad(world, hauler)) return false;
  const radius = chassisDef(hauler.chassisId).radius;
  return world.obstacles.some((o) => isDriveObstacle(o) && dist(o.pos, hauler.pos) < radius);
}

function parkedForTheRoad(world: World, hauler: Vehicle): boolean {
  return betweenLevels(world) || onOutpostPad(world, hauler.pos, runOf(world).window + 1);
}

export function abandonRun(world: World): World {
  return playerCommand(world, (w) => {
    if (!canAbandonRun(w)) throw new Error('Only a stranded truck on a run with no rescue can end the run');
    endRun(w, 'abandoned');
  });
}

export function runEarnings(world: World): { pay: number; wrecks: number; reached: number; north: number } {
  const run = runOf(world);
  return {
    pay: run.earned,
    wrecks: run.wrecks + run.groups.reduce((n, g) => n + g.wrecked, 0),
    reached: run.window + (run.waitingAt === run.window + 1 ? 1 : 0),
    north: Math.max(0, playerProgress(world, run) - milestoneAt(world.seed, 0)),
  };
}

export function nextOutpost(world: World): Outpost | null {
  const run = world.furyRoad;
  return run ? outpostOf(world, factsOf(run, run.window + 1)) : null;
}

export function reachedOutpostAt(world: World, truck: Vehicle = playerVehicle(world)): Outpost | null {
  const near = outpostNear(world, truck);
  return near && truck.speed <= RULES.parkedSpeed ? near : null;
}

export function outpostNear(world: World, truck: Vehicle = playerVehicle(world)): Outpost | null {
  const run = world.furyRoad;
  if (!run) return null;
  const facts = run.outposts.find((post) => post.paid && onOutpostPad(world, truck.pos, post.milestone));
  return facts ? outpostOf(world, facts) : null;
}

export function furyRoadReadout(world: World): FuryRoadReadout | null {
  const run = world.furyRoad;
  if (!run) return null;
  if (run.waitingAt !== null) return fullStretch(world, run.waitingAt + 1);
  const j = run.window + 1;
  return { stretch: j, toOutpost: Math.max(0, outpostSite(world.seed, j).n - haulerProgress(world, run)), outpostId: outpostId(j) };
}

function fullStretch(world: World, j: number): FuryRoadReadout {
  return { stretch: j, toOutpost: outpostSite(world.seed, j).n - outpostSite(world.seed, j - 1).n, outpostId: outpostId(j) };
}
