
import { RULES } from "../data/rules";
import { restBend, rigDiscs, straighten } from "./rig";
import { vehicleStats, type VehicleStats } from "./stats";
import type { Blocker } from "./path";
import { hasPads, nearestPad, nearestSitePad, siteUnder } from "./sites";
import { reachesFrom, straightClear } from "./path";
import type { MoveOrder, PaceStep, Vehicle, World } from "./types";
import { clamp, DEG, dist, type Vec } from "./vec";
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

export const PACE_STEPS: readonly PaceStep[] = ["full", "half", "crawl"];

export function orderSpeed(s: VehicleStats, speed: number, pos: Vec, order: MoveOrder, mode: DriveMode): number {
  if (order.kind === "brake") throw new Error("A brake order has no target speed");
  if (order.pace !== undefined) return clamp(order.pace, Math.max(0, speed - s.brake), Math.min(s.maxSpeed, speed + s.accel));
  if (order.kind === "stopAt") return Math.min(s.maxSpeed, speed + s.accel);
  return throughSpeed(s, speed, dist(pos, order.dest), undefined, mode);
}

export function paceOf(world: World, v: Vehicle, step: PaceStep): number | undefined {
  if (step === "full") return undefined;
  const top = vehicleStats(world, v).maxSpeed;
  const pace = step === "crawl" ? RULES.routePace.crawl : Math.max(RULES.routePace.crawl, RULES.routePace.halfShare * top);
  if (pace >= top) return undefined;
  if (pace <= RULES.parkedSpeed) throw new Error(`Route pace ${pace} is not above the parked speed ${RULES.parkedSpeed}`);
  return pace;
}

export function pacedOrder(world: World, v: Vehicle, order: MoveOrder, step: PaceStep): MoveOrder {
  if (order.kind === "brake") return order;
  const { pace: _held, ...plain } = order;
  const pace = v.direct ? undefined : paceOf(world, v, step);
  return pace === undefined ? plain : { ...plain, pace };
}

export function paceStepOf(world: World, v: Vehicle): PaceStep {
  const held = v.order && v.order.kind !== "brake" ? v.order.pace : undefined;
  if (held === undefined) return "full";
  const steps: PaceStep[] = ["half", "crawl"];
  const gap = (step: PaceStep) => Math.abs((paceOf(world, v, step) ?? Infinity) - held);
  return steps.reduce((best, step) => (gap(step) < gap(best) ? step : best), "half" as PaceStep);
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
