import { chassisDef } from '../data/chassis';
import { FURY_ROAD, HIGHWAY } from '../data/modes';
import { RULES } from '../data/rules';
import { haulerOf } from './damage';
import { backOutSpot } from './back-out';
import { isDefeated } from './defeat';
import { betweenLevels, onOutpostPad, outpostPad } from './fury-road';
import { acrossOf, alongOf, roadPoint, toRoad, windowSpan } from './highway';
import { craterDip, windowCraters } from './road-hazards';
import { CLEARANCE, dynamicBlockers, staticSet } from './nav/layer';
import { isStranded } from './stats';
import type { MoveOrder, Vehicle, World } from './types';
import { dist, segmentDist, type Vec } from './vec';

const HAULER = FURY_ROAD.hauler;
const LANES: readonly number[] = HIGHWAY.road.lanes;
const BEHIND = 2;
const WINDOW_EDGE = 2;
const CRATER_STEP = 1;

export type SideThreat = 'left' | 'right' | 'both' | null;

function runOf(world: World) {
  if (!world.furyRoad) throw new Error('No Fury Road run, so no hauler to drive');
  return world.furyRoad;
}

function roadPos(world: World, pos: Vec) {
  return toRoad(runOf(world).window, pos);
}

function alongNow(world: World, v: Vehicle): number {
  return alongOf(world.seed, roadPos(world, v.pos));
}

function acrossNow(world: World, pos: Vec): number {
  return acrossOf(world.seed, roadPos(world, pos));
}

function lanePoint(world: World, along: number, lane: number): Vec {
  const run = runOf(world);
  const edge = windowSpan(run.window).to - WINDOW_EDGE;
  return roadPoint(world.seed, run.window, Math.min(along, edge), LANES[lane]);
}

export function haulerLane(world: World, hauler: Vehicle): number {
  const across = acrossNow(world, hauler.pos);
  let best = 0;
  LANES.forEach((center, i) => {
    if (Math.abs(center - across) < Math.abs(LANES[best] - across)) best = i;
  });
  return best;
}

export function haulerPace(world: World): number {
  const alarm = runOf(world).hauler.alarmUntil;
  return alarm !== null && world.turn <= alarm ? HAULER.hurry : HAULER.cruise;
}

function groupTrucks(world: World): Vehicle[] {
  const ids = new Set(runOf(world).groups.flatMap((g) => g.vehicles));
  return world.vehicles.filter((v) => ids.has(v.id) && !isDefeated(v));
}

function otherRunTrucks(world: World, hauler: Vehicle): Vehicle[] {
  const me = world.vehicles.find((v) => v.id === world.player.vehicleId);
  return [...groupTrucks(world), ...(me && me !== hauler ? [me] : [])];
}

function inReachOfLane(world: World, hauler: Vehicle, a: Vec, b: Vec): boolean {
  const radius = chassisDef(hauler.chassisId).radius;
  const reach = radius + CLEARANCE;
  const solid = staticSet(world.obstacles, world.terrain).buckets.alongSegment(a, b, reach);
  const wrecks = dynamicBlockers(world.obstacles, world.terrain, []);
  return [...solid, ...wrecks].some((o) => segmentDist(o.pos, a, b) < o.r + reach);
}

function solidEnd(world: World, hauler: Vehicle, lane: number): number | null {
  const along = alongNow(world, hauler);
  let end: number | null = null;
  for (let n = Math.floor(along); n <= along + HAULER.laneLook; n += CRATER_STEP) {
    if (inReachOfLane(world, hauler, lanePoint(world, n, lane), lanePoint(world, n + CRATER_STEP, lane))) end = n + CRATER_STEP;
  }
  return end === null ? null : Math.max(end, along + HAULER.lookahead);
}

function truckInLane(world: World, hauler: Vehicle, a: Vec, b: Vec): boolean {
  const radius = chassisDef(hauler.chassisId).radius;
  const pace = haulerPace(world);
  return otherRunTrucks(world, hauler).some((t) => t.speed < pace && segmentDist(t.pos, a, b) < chassisDef(t.chassisId).radius + radius);
}

function crateredLane(world: World, hauler: Vehicle, lane: number): boolean {
  const craters = windowCraters(world.seed, runOf(world).window);
  const radius = chassisDef(hauler.chassisId).radius;
  const along = alongNow(world, hauler);
  for (let n = along - BEHIND; n <= along + HAULER.laneLook; n += CRATER_STEP) {
    for (const u of [LANES[lane] - radius, LANES[lane], LANES[lane] + radius]) {
      if (craterDip(craters, { n, u }) >= HAULER.craterDip) return true;
    }
  }
  return false;
}

export function laneClear(world: World, hauler: Vehicle, lane: number): boolean {
  const along = alongNow(world, hauler);
  const a = lanePoint(world, along - BEHIND, lane);
  const b = lanePoint(world, along + HAULER.lookahead, lane);
  return !inReachOfLane(world, hauler, a, b) && !truckInLane(world, hauler, a, b) && !crateredLane(world, hauler, lane);
}

function nearestClearLane(world: World, hauler: Vehicle, from: number): number | null {
  const order = LANES.map((_, i) => i)
    .filter((i) => i !== from)
    .sort((x, y) => Math.abs(x - from) - Math.abs(y - from) || Math.abs(LANES[x]) - Math.abs(LANES[y]) || x - y);
  return order.find((lane) => laneClear(world, hauler, lane)) ?? null;
}

function closesAcross(world: World, hauler: Vehicle, t: Vehicle, across: number): boolean {
  const next = { x: t.pos.x + Math.cos(t.heading) * t.speed, y: t.pos.y + Math.sin(t.heading) * t.speed };
  const gap = across - acrossNow(world, hauler.pos);
  return (acrossNow(world, next) - across) * gap < 0;
}

export function sideThreat(world: World, hauler: Vehicle): SideThreat {
  const along = alongNow(world, hauler);
  const mine = acrossNow(world, hauler.pos);
  let left = false;
  let right = false;
  for (const t of groupTrucks(world)) {
    const across = acrossNow(world, t.pos);
    const gap = across - mine;
    if (Math.abs(gap) > HAULER.sideReach || Math.abs(alongNow(world, t) - along) > HAULER.sideReach) continue;
    if (!closesAcross(world, hauler, t, across)) continue;
    if (gap < 0) left = true;
    else right = true;
  }
  if (left && right) return 'both';
  return left ? 'left' : right ? 'right' : null;
}

export function chosenLane(world: World, hauler: Vehicle): number {
  const current = haulerLane(world, hauler);
  const lane = laneClear(world, hauler, current) ? current : nearestClearLane(world, hauler, current) ?? current;
  const threat = sideThreat(world, hauler);
  if (threat === 'both') return current;
  if (threat === null) return lane;
  const away = threat === 'left' ? lane + 1 : lane - 1;
  return away >= 0 && away < LANES.length && laneClear(world, hauler, away) ? away : lane;
}

function isParked(hauler: Vehicle): boolean {
  return hauler.speed <= RULES.parkedSpeed;
}

function requireOnLaneOrPad(world: World, order: MoveOrder): void {
  if (order.kind === 'brake') return;
  const pad = outpostPad(world, runOf(world).window + 1);
  if (order.kind === 'stopAt') {
    if (dist(order.dest, pad) > 0) throw new Error('The hauler stops only at the outpost pad');
    return;
  }
  const across = acrossNow(world, order.dest);
  if (!LANES.some((center) => Math.abs(center - across) < 0.05)) throw new Error(`The hauler aims off the lane centers, at across ${across.toFixed(2)}`);
}

function aimAlong(world: World, hauler: Vehicle, lane: number): number {
  const along = alongNow(world, hauler);
  if (laneClear(world, hauler, lane)) return along + HAULER.lookahead;
  return solidEnd(world, hauler, lane) ?? along + HAULER.lookahead;
}

function haulerOrder(world: World, hauler: Vehicle): MoveOrder | null {
  const run = runOf(world);
  if (betweenLevels(world)) return isParked(hauler) ? null : { kind: 'brake' };
  const pad = outpostPad(world, run.window + 1);
  if (dist(hauler.pos, pad) <= HAULER.approach) return { kind: 'stopAt', dest: pad };
  const lane = chosenLane(world, hauler);
  const dest = lanePoint(world, aimAlong(world, hauler, lane), lane);
  return { kind: 'through', dest, pace: haulerPace(world) };
}

function movedLastTurn(hauler: Vehicle): number {
  let total = 0;
  for (let i = 1; i < hauler.trail.length; i++) total += dist(hauler.trail[i - 1], hauler.trail[i]);
  return total;
}

function heldInPlace(hauler: Vehicle): boolean {
  return hauler.trail.length > 1 && movedLastTurn(hauler) < RULES.arriveRadius / 2;
}

function backingOut(world: World, hauler: Vehicle): boolean {
  const order = hauler.order;
  return order?.kind === 'stopAt' && dist(order.dest, outpostPad(world, runOf(world).window + 1)) > 0 && !heldInPlace(hauler);
}

function nearPadOrParked(world: World, hauler: Vehicle): boolean {
  return betweenLevels(world) || dist(hauler.pos, outpostPad(world, runOf(world).window + 1)) <= HAULER.approach;
}

function wedged(hauler: Vehicle): boolean {
  return hauler.order?.kind === 'through' && heldInPlace(hauler);
}

function recoveryOrder(world: World, hauler: Vehicle): MoveOrder | null {
  if (nearPadOrParked(world, hauler)) return null;
  if (backingOut(world, hauler)) return hauler.order;
  return wedged(hauler) ? { kind: 'stopAt', dest: backOutSpot(world, hauler) } : null;
}

function laneOrder(world: World, hauler: Vehicle): MoveOrder | null {
  const order = haulerOrder(world, hauler);
  if (order) requireOnLaneOrPad(world, order);
  return order;
}

export function planHaulerOrder(world: World): void {
  if (!world.furyRoad || world.player.state !== 'active') return;
  const hauler = haulerOf(world);
  hauler.order = recoveryOrder(world, hauler) ?? laneOrder(world, hauler);
  hauler.direct = false;
}

function hurtsHauler(world: World, hauler: Vehicle): boolean {
  return world.events.some((e) => {
    if (e.t === 'shot') return e.target === hauler.id && e.rounds.some((r) => r.hits.some((h) => h.damage > 0) || r.blast.some((b) => b.vehicle === hauler.id && b.hits.some((h) => h.damage > 0)));
    if (e.t === 'collision') return (e.a === hauler.id && e.hitsA.some((h) => h.damage > 0)) || (e.b === hauler.id && e.hitsB.some((h) => h.damage > 0));
    return false;
  });
}

export function noteHaulerHits(world: World): void {
  if (!world.furyRoad) return;
  const hauler = haulerOf(world);
  if (hurtsHauler(world, hauler)) world.furyRoad.hauler.alarmUntil = world.turn + HAULER.alarmTurns;
}

type Anchor = { turn: number; along: number };
const anchors = new Map<string, Anchor>();

export function resetHaulerWatch(): void {
  anchors.clear();
}

function parkedAtOutpost(world: World, hauler: Vehicle): boolean {
  const run = runOf(world);
  return isParked(hauler) && (betweenLevels(world) || onOutpostPad(world, hauler.pos, run.window + 1));
}

export function watchHaulerStall(world: World): void {
  if (!world.furyRoad || world.player.state !== 'active') return;
  const hauler = haulerOf(world);
  const along = alongNow(world, hauler);
  const anchor = anchors.get(hauler.id);
  const excused = isStranded(world, hauler) || parkedAtOutpost(world, hauler);
  if (!anchor || excused || world.turn < anchor.turn || Math.abs(along - anchor.along) >= 1) {
    anchors.set(hauler.id, { turn: world.turn, along });
    return;
  }
  if (world.turn - anchor.turn < HAULER.stallTurns) return;
  world.events.push({ t: 'stall', vehicle: hauler.id, goal: null, reason: 'idle' });
  anchors.set(hauler.id, { turn: world.turn, along });
}
