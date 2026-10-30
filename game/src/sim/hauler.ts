import { chassisDef } from '../data/chassis';
import { CHAOS_HIGHWAY, HIGHWAY } from '../data/modes';
import { RULES } from '../data/rules';
import { haulerOf, playerVehicle } from './damage';
import { backOutSpot } from './free-spot';
import { footprint, noseReach, rigMiddle, sideReach } from './rig';
import { isDefeated } from './defeat';
import { betweenLevels, inYard, yardSpots } from './outpost-gates';
import { acrossOf, alongOf, roadAt, roadPoint, toRoad, windowSpan } from './highway';
import { craterDip, windowCraters } from './road-hazards';
import { CLEARANCE, dynamicBlockers, staticSet } from './nav/layer';
import { engineHot, heldHeatSpeed } from './engine-heat';
import { plainFuelSpeed } from './far';
import { isStalled, isStranded, plainMaxSpeed, vehicleStats } from './stats';
import { stopDistance } from './steering';
import { isShutDown } from './utility';
import { inCombat } from './combat';
import { workOf } from './states';
import { mountedParts } from './grid';
import { maxHp } from './wear';
import type { MoveOrder, Vehicle, World } from './types';
import { dist, segmentDist, type Vec } from './vec';

const HAULER = CHAOS_HIGHWAY.hauler;
const LANES: readonly number[] = HIGHWAY.road.lanes;
const BEHIND = 2;
const WINDOW_EDGE = 2;
const CRATER_STEP = 1;

export type SideThreat = 'left' | 'right' | 'both' | null;

function runOf(world: World) {
  if (!world.chaosHighway) throw new Error('No Chaos Highway run, so no hauler to drive');
  return world.chaosHighway;
}

function roadPos(world: World, pos: Vec) {
  return toRoad(world.seed, runOf(world).window, pos);
}

function alongNow(world: World, v: Vehicle): number {
  return alongOf(world.seed, roadPos(world, rigMiddle(v)));
}

function acrossNow(world: World, pos: Vec): number {
  return acrossOf(world.seed, roadPos(world, pos));
}

function lanePoint(world: World, along: number, lane: number): Vec {
  const run = runOf(world);
  const edge = windowSpan(world.seed, run.window).to - WINDOW_EDGE;
  return roadPoint(world.seed, run.window, Math.min(along, edge), LANES[lane]);
}

export function haulerLane(world: World, hauler: Vehicle): number {
  const across = acrossNow(world, rigMiddle(hauler));
  let best = 0;
  LANES.forEach((center, i) => {
    if (Math.abs(center - across) < Math.abs(LANES[best] - across)) best = i;
  });
  return best;
}

export function haulerPace(world: World): number {
  const alarm = runOf(world).hauler.alarmUntil;
  const own = alarm !== null && world.turn <= alarm ? HAULER.hurry : HAULER.cruise;
  const gunTruck = playerVehicle(world);
  const pace = setsPace(world, gunTruck) ? Math.min(own, plainMaxSpeed(world, gunTruck), Math.max(HAULER.crawl, slowdown(world, gunTruck))) : own;
  if (pace <= RULES.parkedSpeed) throw new Error(`Hauler pace ${pace} is at or below parked speed`);
  return pace;
}

function slowdown(world: World, gunTruck: Vehicle): number {
  const fuelSpeed = plainFuelSpeed(world, gunTruck);
  if (!engineHot(world)) return fuelSpeed;
  const heatSpeed = gunTruck.speed <= RULES.parkedSpeed ? HAULER.crawl : heldHeatSpeed(world, gunTruck);
  return Math.min(fuelSpeed, heatSpeed);
}

function setsPace(world: World, truck: Vehicle): boolean {
  return !isStranded(world, truck) && !isStalled(world, truck) && !isShutDown(world, truck);
}

function gunTruckFree(world: World, gunTruck: Vehicle): boolean {
  return setsPace(world, gunTruck) && !inCombat(world, gunTruck) && workOf(world, gunTruck) === null;
}

export function waitsForGunTruck(world: World, hauler: Vehicle): boolean {
  if (betweenLevels(world) || dist(hauler.pos, parkSpot(world)) <= HAULER.approach) return false;
  const gunTruck = playerVehicle(world);
  const lag = alongNow(world, hauler) - alongNow(world, gunTruck);
  if (lag + stopDistance(vehicleStats(world, hauler), hauler.speed) <= (isParked(hauler) ? HAULER.resumeGap : HAULER.waitGap)) return false;
  return dist(gunTruck.pos, hauler.pos) <= HAULER.apartGap || !gunTruckFree(world, gunTruck);
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
    for (const offset of [LANES[lane] - radius, LANES[lane], LANES[lane] + radius]) {
      if (craterDip(craters, roadAt(world.seed, n, offset)) >= HAULER.craterDip) return true;
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
  const gap = across - acrossNow(world, rigMiddle(hauler));
  return (acrossNow(world, next) - across) * gap < 0;
}

export function sideThreat(world: World, hauler: Vehicle): SideThreat {
  const along = alongNow(world, hauler);
  const mine = acrossNow(world, rigMiddle(hauler));
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

function parkSpot(world: World): Vec {
  const run = runOf(world);
  return yardSpots(world, run.waitingAt ?? run.window + 1).hauler;
}

function requireOnLaneOrSpot(world: World, order: MoveOrder): void {
  if (order.kind === 'brake') return;
  if (order.kind === 'stopAt') {
    if (dist(order.dest, parkSpot(world)) > 0) throw new Error('The hauler stops only at its park spot in the outpost yard');
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
  const spot = parkSpot(world);
  if (betweenLevels(world)) return isParked(hauler) && dist(hauler.pos, spot) <= RULES.arriveRadius ? null : { kind: 'stopAt', dest: spot };
  if (dist(hauler.pos, spot) <= HAULER.approach) return { kind: 'stopAt', dest: spot };
  if (waitsForGunTruck(world, hauler)) return { kind: 'brake' };
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
  return order?.kind === 'stopAt' && dist(order.dest, parkSpot(world)) > 0 && !heldInPlace(hauler);
}

function parkedOrOnPad(world: World, hauler: Vehicle): boolean {
  return betweenLevels(world) || inYard(world, hauler.pos, runOf(world).window + 1);
}

function wedged(hauler: Vehicle): boolean {
  return (hauler.order?.kind === 'through' || hauler.order?.kind === 'stopAt') && heldInPlace(hauler);
}

function recoveryOrder(world: World, hauler: Vehicle): MoveOrder | null {
  if (parkedOrOnPad(world, hauler)) return null;
  if (backingOut(world, hauler)) return hauler.order;
  return wedged(hauler) ? { kind: 'stopAt', dest: backOutSpot(world, hauler) } : null;
}

function laneOrder(world: World, hauler: Vehicle): MoveOrder | null {
  const order = haulerOrder(world, hauler);
  if (order) requireOnLaneOrSpot(world, order);
  return order;
}

export function planHaulerOrder(world: World): void {
  if (!world.chaosHighway || world.player.state !== 'active') return;
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
  if (!world.chaosHighway) return;
  const hauler = haulerOf(world);
  if (hurtsHauler(world, hauler)) world.chaosHighway.hauler.alarmUntil = world.turn + HAULER.alarmTurns;
}

type Anchor = { turn: number; along: number };
const anchors = new Map<string, Anchor>();

export function resetHaulerWatch(): void {
  anchors.clear();
}

function parkedAtOutpost(world: World, hauler: Vehicle): boolean {
  const inNextYard = inYard(world, hauler.pos, runOf(world).window + 1);
  return betweenLevels(world) ? isParked(hauler) || inNextYard : isParked(hauler) && inNextYard;
}

function stallExcused(world: World, hauler: Vehicle): boolean {
  return isStranded(world, hauler) || parkedAtOutpost(world, hauler) || waitsForGunTruck(world, hauler) || pinnedByFoe(world, hauler);
}

function pinnedByFoe(world: World, hauler: Vehicle): boolean {
  const foes = runOf(world).groups.flatMap((g) => g.vehicles);
  return world.vehicles.some((v) => foes.includes(v.id) && !isDefeated(v) && blocksNose(hauler, v));
}

function blocksNose(hauler: Vehicle, foe: Vehicle): boolean {
  const dx = foe.pos.x - hauler.pos.x;
  const dy = foe.pos.y - hauler.pos.y;
  const ahead = dx * Math.cos(hauler.heading) + dy * Math.sin(hauler.heading);
  const side = Math.abs(-dx * Math.sin(hauler.heading) + dy * Math.cos(hauler.heading));
  const reach = footprint(foe.chassisId) + RULES.yieldDistance;
  return ahead > 0 && ahead <= noseReach(hauler.chassisId) + reach && side <= sideReach(hauler.chassisId) + reach;
}

export function watchHaulerStall(world: World): void {
  if (!world.chaosHighway || world.player.state !== 'active') return;
  const hauler = haulerOf(world);
  const along = alongNow(world, hauler);
  const anchor = anchors.get(hauler.id);
  if (!anchor || stallExcused(world, hauler) || world.turn < anchor.turn || Math.abs(along - anchor.along) >= 1) {
    anchors.set(hauler.id, { turn: world.turn, along });
    return;
  }
  if (world.turn - anchor.turn < HAULER.stallTurns) return;
  world.events.push({ t: 'stall', vehicle: hauler.id, goal: null, reason: 'idle' });
  anchors.set(hauler.id, { turn: world.turn, along });
}

export function haulerShare(hauler: Vehicle): number {
  const parts = mountedParts(hauler);
  const max = parts.reduce((sum, p) => sum + maxHp(p), 0);
  return max === 0 ? 0 : parts.reduce((sum, p) => sum + p.hp, 0) / max;
}
