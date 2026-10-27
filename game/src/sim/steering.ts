
import { RULES } from "../data/rules";
import { restBend, rigDiscs, straighten } from "./rig";
import { maxTurn, vehicleStats, type VehicleStats } from "./stats";
import type { Blocker } from "./path";
import { hasPads, nearestPad, nearestSitePad, siteUnder } from "./sites";
import { reachesFrom, straightClear } from "./path";
import type { MoveOrder, Vehicle, World } from "./types";
import { angleDiff, clamp, DEG, dist, type Vec } from "./vec";
import { atlasOf } from "./atlas";
import type { Terrain } from "./terrain";

export function backsToDestination(
  vehicle: Pick<Vehicle, "faction" | "brain">,
  distance: number,
  rearAngle: number,
): boolean {
  const hasReason = vehicle.faction === "player" || (vehicle.brain?.recovery ?? 0) > 0;
  return hasReason && distance < RULES.throttleZones.reach && Math.abs(rearAngle) < RULES.reverse.cone * DEG;
}

export type Throttle = "brake" | "hold" | "accelerate";
export type ZoneEdges = {
  brakeEnd: number;
  holdEnd: number;
  restBrakeEnd: number;
  reach: number;
};

export function zoneEdges(): ZoneEdges {
  const Z = RULES.throttleZones;
  if (Math.abs(Z.brake + Z.hold + Z.accelerate - 1) > 1e-9)
    throw new Error("Throttle zone shares must add up to 1");
  const reach = Z.reach;
  return {
    brakeEnd: reach * Z.brake,
    holdEnd: reach * (Z.brake + Z.hold),
    restBrakeEnd: reach / 3,
    reach,
  };
}

export type DriveMode = "route" | "direct";

export function driveMode(v: Pick<Vehicle, "direct">): DriveMode {
  return v.direct ? "direct" : "route";
}

export function throttleFor(d: number, speed: number, mode: DriveMode): Throttle {
  if (mode === "route") return d > speed ? "accelerate" : "hold";
  const z = zoneEdges();
  if (speed === 0) return d < z.restBrakeEnd ? "brake" : "accelerate";
  if (d < z.brakeEnd) return "brake";
  if (d < z.holdEnd) return "hold";
  return "accelerate";
}

export function orderSpeed(s: VehicleStats, speed: number, pos: Vec, order: MoveOrder, mode: DriveMode): number {
  if (order.kind === "brake") throw new Error("A brake order has no target speed");
  if (order.pace !== undefined) return clamp(order.pace, Math.max(0, speed - s.brake), Math.min(s.maxSpeed, speed + s.accel));
  if (order.kind === "stopAt") return Math.min(s.maxSpeed, speed + s.accel);
  return throughSpeed(s, speed, dist(pos, order.dest), undefined, mode);
}

export function throughSpeed(s: VehicleStats, speed: number, d: number, pace: number | undefined, mode: DriveMode): number {
  if (pace !== undefined) return clamp(pace, Math.max(0, speed - s.brake), Math.min(s.maxSpeed, speed + s.accel));
  return mode === "direct" ? zoneSpeed(s, speed, d) : routeSpeed(s, speed, d);
}

function routeSpeed(s: VehicleStats, speed: number, d: number): number {
  if (!Number.isFinite(d) || !Number.isFinite(speed)) throw new Error(`Route speed needs finite distance and speed, got ${d} and ${speed}`);
  return clamp(2 * d - speed, Math.min(speed, s.maxSpeed), Math.min(s.maxSpeed, speed + s.accel));
}

export function zoneSpeed(s: VehicleStats, speed: number, d: number): number {
  const z = zoneEdges();
  const creep = Math.min(s.maxSpeed, s.accel * Math.min(1, d / z.reach));
  if (speed === 0) return creep;
  let next = speed;
  if (d < z.brakeEnd) next = Math.max(creep, speed - s.brake * (1 - d / z.brakeEnd));
  else if (d >= z.holdEnd)
    next =
      speed + s.accel * Math.min(1, (d - z.holdEnd) / (z.reach - z.holdEnd));
  return clamp(
    next,
    0,
    Math.max(0, Math.min(s.maxSpeed, Math.max(speed, next))),
  );
}

export function clickOrder(t: Terrain, dest: Vec, shift: boolean, me: Pick<Vehicle, "pos" | "order">): MoveOrder {
  const site = siteUnder(atlasOf(t), dest);
  return site && hasPads(site) ? { kind: "stopAt", dest: nearestPad(site, me.pos) } : groundOrder(dest, shift, me.order);
}

export function zoneHalfAngle(s: VehicleStats, speed: number): number {
  return Math.max(RULES.throttleZones.minHalfAngle, maxTurn(s, speed) / 2);
}

export function zoneAt(s: VehicleStats, me: Pick<Vehicle, "pos" | "heading" | "speed">, p: Vec): Throttle | null {
  const d = dist(me.pos, p);
  if (d >= RULES.throttleZones.reach) return null;
  const bearing = Math.atan2(p.y - me.pos.y, p.x - me.pos.x);
  if (Math.abs(angleDiff(bearing, me.heading)) > zoneHalfAngle(s, me.speed)) return null;
  return throttleFor(d, me.speed, "direct");
}

export function zonePace(s: VehicleStats, speed: number, zone: Throttle): number | undefined {
  if (zone === "accelerate") return undefined;
  const pace = zone === "brake" ? RULES.crawlSpeed : Math.max(RULES.crawlSpeed, speed);
  if (pace >= s.maxSpeed) return undefined;
  if (!Number.isFinite(pace) || pace <= RULES.parkedSpeed) throw new Error(`Zone pace ${pace} is not above the parked speed ${RULES.parkedSpeed}`);
  return pace;
}

export function playerOrder(world: World, me: Vehicle, dest: Vec, shift: boolean): MoveOrder {
  const order = clickOrder(world.terrain, dest, shift, me);
  const held = me.order && me.order.kind !== "brake" ? me.order : null;
  if (me.direct || order.kind === "brake") return order;
  const fan = shift || onSite(world, dest) || reclicks(held, dest) ? null : zoneAt(vehicleStats(world, me), me, dest);
  if (fan === null) return withPace(order, held?.pace);
  const pace = zonePace(vehicleStats(world, me), me.speed, fan);
  if (held && dist(me.pos, held.dest) > RULES.throttleZones.reach) return withPace({ kind: held.kind, dest: held.dest }, pace);
  return withPace(order, pace);
}

export function orderThrottle(world: World, me: Vehicle, order: MoveOrder): Throttle {
  if (order.kind === "brake") return "brake";
  if (order.pace !== undefined) return order.pace <= RULES.crawlSpeed ? "brake" : "hold";
  return throttleFor(dist(me.pos, order.dest), me.speed, driveMode(me));
}

function onSite(world: World, p: Vec): boolean {
  const site = siteUnder(atlasOf(world.terrain), p);
  return site !== null && hasPads(site);
}

function reclicks(held: MoveOrder | null, p: Vec): boolean {
  return held !== null && held.kind !== "brake" && dist(p, held.dest) < RULES.reclickRadius;
}

function withPace(order: MoveOrder, pace: number | undefined): MoveOrder {
  if (order.kind === "brake" || pace === undefined) return order;
  return { ...order, pace };
}

function groundOrder(dest: Vec, shift: boolean, current: MoveOrder | null): MoveOrder {
  if (shift) return { kind: "stopAt", dest };
  if (current && current.kind !== "brake" && dist(dest, current.dest) < RULES.reclickRadius)
    return { kind: current.kind === "through" ? "stopAt" : "through", dest: current.dest };
  return { kind: "through", dest };
}

export function parkedVehicles(world: World, selfId: string, onRope: ReadonlySet<string>): Blocker[] {
  const target = world.vehicles.find((v) => v.id === selfId)?.brain?.ramTarget;
  return world.vehicles
    .filter((x) => x.id !== selfId && x.id !== target && !onRope.has(x.id) && x.speed < RULES.parkedSpeed)
    .flatMap(rigDiscs);
}

export function setDownSpot(world: World, v: Vehicle): Vec {
  const { step } = RULES.stranded;
  const reach = world.terrain.size;
  const others = world.vehicles.filter((o) => o.id !== v.id).flatMap(rigDiscs);
  const straight = restBend(v.chassisId);
  const anchor = nearestSitePad(atlasOf(world.terrain), v.pos).pad;
  const reaches = reachesFrom(world, anchor, vehicleStats(world, v).radius);
  for (let ring = 0; ring * step <= reach; ring++) {
    const spots = Math.max(1, Math.ceil(2 * Math.PI * ring));
    for (let i = 0; i < spots; i++) {
      const a = (2 * Math.PI * i) / spots;
      const p = { x: v.pos.x + Math.cos(a) * ring * step, y: v.pos.y + Math.sin(a) * ring * step };
      const discs = rigDiscs({ chassisId: v.chassisId, pos: p, heading: v.heading, bend: straight });
      if (!reaches(discs[0].pos)) continue;
      if (discs.every((d) => straightClear(world, d.pos, d.pos, d.r, others))) return p;
    }
  }
  throw new Error(`No free spot on the map to set down vehicle ${v.id}`);
}

export function setDown(world: World, v: Vehicle): void {
  v.pos = setDownSpot(world, v);
  straighten(v);
  v.speed = 0;
  v.strandedTurns = RULES.stranded.turns;
}
