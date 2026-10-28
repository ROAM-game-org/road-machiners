
import { chassisDef } from '../data/chassis';
import { RULES } from '../data/rules';
import { inLiveRange, isHeadless } from './fidelity';
import { boxSegmentDistance, propBoxes, propReach, touchesObstacle } from './mapgen';
import { spotNear } from './free-spot';
import { groundClear } from './spawn';
import { keepsOffRoads } from './off-road';
import { coarseTrip, routeAhead } from './path';
import { REGION } from '../data/region';
import { propsAround, propSlotsAlong } from './prop-index';
import { breakProp } from './salvage';
import { burnFuel, getResources } from './resources';
import { driveStats, fuelCap, plainFuelPerTile, plainMaxSpeed, unpavedTopShare, type DriveStats } from './stats';
import { TERRAIN_TYPES } from '../data/terrain';
import { tileAt } from './terrain';
import { driveMode, parkedVehicles, orderSpeed } from './steering';
import { fieldBlockers } from './hazards';
import { getHitchedTowIds, isOnRope, ropeClientOf } from './tow';
import type { Blocker } from './nav/buckets';
import type { MoveOrder, Obstacle, Pose, Vehicle, World } from './types';
import { avoidsCrater } from './sunward';
import { bearing, dist, segmentDist, type Vec } from './vec';
import { bendField, followPose, poseOf, rigDiscs } from './rig';

export function isNear(w: World, v: Vehicle): boolean {
  return !isOnRope(w, v.id) && inLiveRange(w, v.pos);
}

export function fuelLimit(w: World, v: Vehicle, burnsFuel: boolean): 'low' | 'empty' | null {
  if (!burnsFuel) return null;
  const fuel = getResources(w, v).fuel;
  if (fuel <= 0) return 'empty';
  return fuel < fuelCap(v) * RULES.lowFuelThreshold ? 'low' : null;
}

export function lowFuelSpeed(maxSpeed: number): number {
  return maxSpeed * RULES.lowFuelSpeedFactor;
}
export function plainFuelSpeed(w: World, v: Vehicle): number {
  const top = plainMaxSpeed(w, v);
  return fuelLimit(w, v, plainFuelPerTile(w, v) > 0) === 'low' ? lowFuelSpeed(top) : top;
}

export function fuelLimited<S extends DriveStats>(w: World, v: Vehicle, s: S, speed: number, order: MoveOrder | null): S {
  const fuel = getResources(w, v).fuel;
  const low = fuelLimit(w, v, s.fuelPerTile > 0) === 'low';
  const limit = low ? Math.max(lowFuelSpeed(s.maxSpeed), speed - s.brake) : s.maxSpeed;
  const capped = low ? { ...s, maxSpeed: limit } : s;
  const wanted = order && order.kind !== 'brake' ? orderSpeed(capped, speed, v.pos, order, driveMode(v)) : Math.min(capped.maxSpeed, speed + capped.accel);
  if (wanted * s.fuelPerTile <= fuel) return capped;
  const cap = Math.max(s.limpSpeed, speed - s.brake);
  return { ...s, maxSpeed: cap, accel: Math.min(s.accel, s.limpAccel) };
}

export function advanceFar(w: World, v: Vehicle): void {
  const full = driveStats(w, v);
  const start = poseOf(v);
  const order = v.order;
  if (!order || order.kind === 'brake') {
    brakeFar(v, full, start);
    return;
  }

  const s = fuelLimited(w, v, onGround(w, v, full), v.speed, order);
  const next = orderSpeed(s, v.speed, v.pos, order, driveMode(v));
  const style = { offRoad: keepsOffRoads(w, v), night: avoidsCrater(w, v) };
  const { points, partial } = farPoints(w, v, order.dest, style, full, s);

  const planned = follow(v.pos, points, (v.speed + next) / 2);
  const { block, walk } = walkFar(w, v, order, points, planned, full.radius);
  const end = walk.path[walk.path.length - 1];
  const { done, windowEnds } = farOutcome(order, end, walk, block, partial);
  v.trail = sample(v.chassisId, start, walk.path, walk.moved);
  const last = v.trail[v.trail.length - 1];
  Object.assign(v, { pos: { x: end.x, y: end.y }, heading: last.heading }, bendField(last.bend));
  v.speed = farSpeed(order, done, block, next);
  burnFuel(w, v, walk.moved);
  if (!drivesCoarse(v)) breakCrossed(w, v, walk.path, full.radius);
  keepFarRoute(v, replans(done, windowEnds, block, walk) ? undefined : farRouteOf(order.dest, walk.ahead, style, partial));
  if (done) arrive(w, v);
}

function walkFar(w: World, v: Vehicle, order: DrivenOrder, points: Vec[], planned: FarStep, radius: number): { block: Contact | null; walk: FarStep } {
  const counts = contactsOf(v, order, radius);
  const block = firstContact(w, v, planned.path, radius, counts);
  const budget = block ? block.clear : clearEnd(w, v, planned, radius, (o) => !counts(o));
  return { block, walk: budget === planned.moved ? planned : follow(v.pos, points, budget) };
}

function brakeFar(v: Vehicle, full: DriveStats, start: Pose): void {
  v.speed = Math.max(0, v.speed - full.brake);
  v.trail = Array.from({ length: RULES.substeps + 1 }, () => ({ ...start }));
  if (v.order && v.speed === 0) v.order = null;
}

function contactsOf(v: Vehicle, order: DrivenOrder, radius: number): (o: Vehicle) => boolean {
  return drivesCoarse(v) ? (o) => onGoal(o, order, radius) : () => true;
}

function farSpeed(order: DrivenOrder, done: boolean, block: FarBlock, next: number): number {
  if (done && order.kind === 'stopAt') return 0;
  return block ? Math.min(next, block.other.speed) : next;
}

function arrive(w: World, v: Vehicle): void {
  w.events.push({ t: 'arrived', vehicle: v.id });
  v.order = null;
}

type FarWalk = { ahead: Vec[]; moved: number };
type FarStep = FarWalk & { path: Vec[] };
type FarBlock = { other: Vehicle; contact: number } | null;

type DrivenOrder = Exclude<MoveOrder, { kind: 'brake' }>;

function goalReach(order: DrivenOrder): number {
  return order.kind === 'stopAt' ? RULES.arriveRadius : RULES.passRadius;
}

function onGoal(o: Vehicle, order: DrivenOrder, radius: number): boolean {
  return dist(o.pos, order.dest) < goalReach(order) + radius + radiusOf(o);
}

function farOutcome(order: DrivenOrder, end: Vec, walk: FarWalk, block: FarBlock, partial: boolean): { done: boolean; windowEnds: boolean } {
  const reach = goalReach(order);
  const windowEnds = endsWindow(walk, partial);
  const routeEnds = walk.ahead.length === 0 && !windowEnds;
  return { done: dist(end, order.dest) < reach || routeEnds || blockedAtDest(order, block, reach), windowEnds };
}

function replans(done: boolean, windowEnds: boolean, block: FarBlock, walk: FarWalk): boolean {
  return done || windowEnds || (block !== null && walk.moved < RULES.arriveRadius);
}

function endsWindow(walk: FarWalk, partial: boolean): boolean {
  return walk.ahead.length === 0 && partial && walk.moved > 0;
}

function blockedAtDest(order: DrivenOrder, block: FarBlock, reach: number): boolean {
  return block !== null && dist(block.other.pos, order.dest) < block.contact + reach;
}

function onGround(w: World, v: Vehicle, s: DriveStats): DriveStats {
  if (TERRAIN_TYPES[w.terrain.types[tileAt(w.terrain, v.pos)]].paved) return s;
  return { ...s, maxSpeed: s.maxSpeed * unpavedTopShare(s.roughCut) };
}

function farPoints(w: World, v: Vehicle, dest: Vec, style: RouteStyle, full: DriveStats, s: DriveStats): { points: Vec[]; partial: boolean } {
  const stored = keptFarRoute(v);
  if (stored && dist(stored.dest, dest) < RULES.arriveRadius && sameStyle(stored, style)) return { points: stored.points, partial: stored.partial === true };
  if (drivesCoarse(v)) return { points: coarsePoints(w, v, dest, full.radius, s.maxSpeed), partial: false };
  const onRope = getHitchedTowIds(w);
  const window = REGION.navigation.farWindow;
  const blockers = [...farBlockers(w, v, s, onRope), ...fieldBlockers(w, v)].filter((b) => dist(b.pos, v.pos) <= window + REGION.navigation.nearSlack + b.r);
  return routeAhead(w, v.pos, dest, full.radius, blockers, v, window);
}

function drivesCoarse(v: Vehicle): boolean {
  return Boolean(v.brain);
}

export function settleWoken(w: World, hasBody: (id: string) => boolean): void {
  for (const v of w.vehicles.filter((x) => wakes(w, x, hasBody))) {
    if (standsClear(w, v, v.pos)) continue;
    const spot = spotNear(v.pos, (p) => standsClear(w, v, p));
    if (!spot) throw new Error(`Far truck ${v.id} woke inside a prop, truck or cliff at (${v.pos.x}, ${v.pos.y}) with no clear spot near`);
    v.pos = spot;
    v.trail = v.trail.map(() => poseOf(v));
  }
}

function wakes(w: World, v: Vehicle, hasBody: (id: string) => boolean): boolean {
  return drivesCoarse(v) && !hasBody(v.id) && isNear(w, v);
}

function standsClear(w: World, v: Vehicle, at: Vec): boolean {
  const discs = rigDiscs({ ...v, pos: at });
  const others = w.vehicles.filter((o) => o.id !== v.id).flatMap(rigDiscs);
  return discs.every((d) => groundClear(w, d.pos, d.r) && !propsAround(w, 'drive', d.pos, d.r).some((o) => isProp(o) && touchesObstacle(o, w.terrain, d.pos, d.r)) && others.every((o) => dist(o.pos, d.pos) >= o.r + d.r));
}

function isProp(o: Obstacle): boolean {
  return o.kind !== 'site' && o.kind !== 'water';
}

function coarsePoints(w: World, v: Vehicle, dest: Vec, radius: number, reach: number): Vec[] {
  if (dist(v.pos, dest) <= reach) return [{ ...dest }];
  return coarseTrip(w, v.pos, dest, radius, v);
}

function farBlockers(w: World, v: Vehicle, s: DriveStats, onRope: ReadonlySet<string>): Blocker[] {
  const target = v.brain?.ramTarget;
  const reach = s.maxSpeed + radiusOf(v);
  const slower = w.vehicles.filter((o) => o.id !== v.id && o.id !== target && !onRope.has(o.id) && o.speed >= RULES.parkedSpeed && o.speed < s.maxSpeed && dist(o.pos, v.pos) <= reach + radiusOf(o));
  return [...parkedVehicles(w, v.id, onRope), ...slower.flatMap(rigDiscs)];
}

function radiusOf(v: Vehicle): number {
  return chassisDef(v.chassisId).radius;
}

type FarRoute = { dest: Vec; points: Vec[]; offRoad: boolean; night?: true; partial?: true };
type RouteStyle = { offRoad: boolean; night: boolean };

function farRouteOf(dest: Vec, points: Vec[], style: RouteStyle, partial: boolean): FarRoute {
  const route: FarRoute = { dest: { ...dest }, points, offRoad: style.offRoad };
  if (style.night) route.night = true;
  if (partial) route.partial = true;
  return route;
}

function sameStyle(stored: FarRoute, style: RouteStyle): boolean {
  return keptOffRoad(stored) === style.offRoad && (stored.night === true) === style.night;
}
const playerRoutes = new Map<string, { route: FarRoute; at: Vec }>();

export function clearFarRoutes(): void {
  playerRoutes.clear();
}

function keptOffRoad(stored: FarRoute): boolean {
  if (typeof stored.offRoad !== 'boolean') throw new Error('A far route has no offRoad flag');
  return stored.offRoad;
}

function keptFarRoute(v: Vehicle): FarRoute | undefined {
  if (v.brain) return v.brain.farRoute;
  const kept = isHeadless() ? playerRoutes.get(v.id) : undefined;
  return kept && kept.at.x === v.pos.x && kept.at.y === v.pos.y ? kept.route : undefined;
}

function keepFarRoute(v: Vehicle, route: FarRoute | undefined): void {
  if (v.brain) v.brain.farRoute = route;
  else if (!isHeadless()) return;
  else if (route) playerRoutes.set(v.id, { route, at: { x: v.pos.x, y: v.pos.y } });
  else playerRoutes.delete(v.id);
}

const CONTACT_STEP = 0.25;

type Contact = { other: Vehicle; clear: number; contact: number };
type TruckDisc = { o: Vehicle; at: Vec; contact: number };

function truckDiscs(w: World, v: Vehicle, radius: number, counts: (o: Vehicle) => boolean): TruckDisc[] {
  const client = ropeClientOf(w, v.id);
  return w.vehicles.filter((o) => o.id !== v.id && o.id !== client && counts(o)).flatMap((o) => rigDiscs(o).map((d) => ({ o, at: d.pos, contact: radius + d.r })));
}

function clearEnd(w: World, v: Vehicle, planned: FarStep, radius: number, ghosted: (o: Vehicle) => boolean): number {
  const { path } = planned;
  const discs = truckDiscs(w, v, radius, ghosted).filter((d) => dist(path[0], d.at) >= d.contact);
  const inside = (p: Vec) => discs.some((d) => dist(p, d.at) < d.contact);
  let clear = planned.moved;
  while (clear > 0 && inside(pointAlong(path, clear))) clear = Math.max(0, clear - CONTACT_STEP);
  return clear;
}

function pointAlong(path: Vec[], moved: number): Vec {
  const walked = follow(path[0], path.slice(1), moved).path;
  return walked[walked.length - 1];
}

function firstContact(w: World, v: Vehicle, path: Vec[], radius: number, counts: (o: Vehicle) => boolean): Contact | null {
  const others = truckDiscs(w, v, radius, counts);
  let walked = 0;
  for (let seg = 1; seg < path.length; seg++) {
    const a = path[seg - 1];
    const b = path[seg];
    const len = dist(a, b);
    for (let d = Math.min(CONTACT_STEP, len); d <= len; d += CONTACT_STEP) {
      const t = len > 0 ? d / len : 0;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const { o, at, contact } of others) {
        const gap = dist(p, at);
        if (gap < contact && gap < dist(path[0], at)) return { other: o, clear: Math.max(0, walked + d - CONTACT_STEP), contact };
      }
      if (d < len && d + CONTACT_STEP > len) d = len - CONTACT_STEP;
    }
    walked += len;
  }
  return null;
}

function breakCrossed(w: World, v: Vehicle, path: Vec[], radius: number): void {
  const crossed = new Set<number>();
  for (let seg = 1; seg < path.length; seg++) {
    for (const at of propSlotsAlong(w, 'breakable', path[seg - 1], path[seg], radius)) {
      if (touches(w.obstacles[at], path[seg - 1], path[seg], radius)) crossed.add(at);
    }
  }
  const ids = [...crossed].sort((a, b) => a - b).map((at) => w.obstacles[at].id);
  for (const id of ids) breakProp(w, id, v.id, v.speed);
}

function touches(o: Obstacle, a: Vec, b: Vec, radius: number): boolean {
  return segmentDist(o.pos, a, b) < propReach(o) + radius && propBoxes(o).some((box) => boxSegmentDistance(box, a, b) < radius);
}

function follow(from: Vec, points: Vec[], budget: number): FarStep {
  const path: Vec[] = [from];
  let cur = from;
  let left = budget;
  let i = 0;
  for (; i < points.length && left > 0; i++) {
    const seg = dist(cur, points[i]);
    if (seg > left) {
      const t = left / seg;
      cur = { x: cur.x + (points[i].x - cur.x) * t, y: cur.y + (points[i].y - cur.y) * t };
      path.push(cur);
      left = 0;
      break;
    }
    cur = points[i];
    path.push(cur);
    left -= seg;
  }
  return { path, moved: budget - left, ahead: points.slice(i) };
}

function sample(chassisId: string, start: Pose, path: Vec[], moved: number): Pose[] {
  const trail: Pose[] = [start];
  let seg = 1;
  let walked = 0;
  let heading = start.heading;
  for (let i = 1; i <= RULES.substeps; i++) {
    const at = (i * moved) / RULES.substeps;
    while (seg < path.length - 1 && walked + dist(path[seg - 1], path[seg]) < at) {
      walked += dist(path[seg - 1], path[seg]);
      seg++;
    }
    const a = path[seg - 1];
    const b = path[Math.min(seg, path.length - 1)];
    const len = dist(a, b);
    if (len > 0) heading = bearing(a, b);
    const t = len > 0 ? Math.min(1, (at - walked) / len) : 0;
    trail.push(followPose(chassisId, trail[trail.length - 1], { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading }));
  }
  return trail;
}
