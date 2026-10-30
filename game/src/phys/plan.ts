import { routeBlockers } from "../sim/ai";
import { route } from "../sim/path";
import { vehicleStats } from "../sim/stats";
import type { Vehicle, World } from "../sim/types";
import type { Vec } from "../sim/vec";
import { cloneWorld } from "../sim/world";
import { freeDrive, simulateTurn, type Drive } from "./drive";
import type { VehicleFrame } from "./frames";
import { applyTurn } from "./turn";

const PLAN_TURNS = 3;

export type PlanFrames = { turns: VehicleFrame[][]; course: Vec[] | null; waypoint: boolean };

export function planTurns(drive: Drive, world: World, meId: string): PlanFrames {
  const w = cloneWorld(world);
  const me = w.vehicles.find((x) => x.id === meId);
  if (!me) throw new Error(`Player vehicle ${meId} missing from the preview world`);
  const { turns, v } = simulate(drive, w, me);
  return { turns, course: courseAfter(w, v), waypoint: !v.direct };
}

function simulate(drive: Drive, w: World, me: Vehicle): { turns: VehicleFrame[][]; v: Vehicle } {
  const turns: VehicleFrame[][] = [];
  let d = drive;
  let v = me;
  try {
    for (let i = 0; i < PLAN_TURNS; i++) {
      const r = simulateTurn(d, w);
      if (d !== drive) freeDrive(d);
      d = r.next;
      turns.push(r.frames[me.id]);
      w.events = [];
      applyTurn(w, r);
      v = w.vehicles.find((x) => x.id === me.id)!;
      if (!v.order && v.speed < 0.05) break;
    }
  } finally {
    if (d !== drive) freeDrive(d);
  }
  return { turns, v };
}

function courseAfter(w: World, v: Vehicle): Vec[] | null {
  const order = v.order?.kind === "brake" ? null : v.order;
  if (!order) return null;
  if (v.direct) return [v.pos, order.dest];
  return [v.pos, ...route(w, v.pos, order.dest, vehicleStats(w, v).radius, routeBlockers(w, v), v)];
}
