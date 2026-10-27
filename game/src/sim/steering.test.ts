import { RULES } from "../data/rules";
import { describe, expect, it } from "vitest";
import { vehicleStats } from "./stats";
import { chassisDef } from "../data/chassis";
import { backsToDestination, clickOrder, parkedVehicles, setDown, setDownSpot, orderSpeed, throttleFor, throughSpeed, zoneEdges, zoneSpeed } from "./steering";
import { DEG, dist } from "./vec";
import { addVehicle, emptyWorld, npcBrain } from "./testkit";
import { addState } from "./states";
import { getHitchedTowIds } from "./tow";
import { TEST_MAP } from '../test/map';
import { reachesFrom } from "./path";
import { nearestSitePad } from "./sites";
import { atlasOf } from "./atlas";
import { PERK_NUMBERS } from "../data/skills";
import { PLAYER_CHASSIS } from "../data/chassis";
import type { MoveOrder, Obstacle, World } from "./types";
import type { Vec } from "./vec";

function setup(speed: number) {
  const w = emptyWorld();
  const v = w.vehicles[0];
  v.speed = speed;
  return { w, v, s: vehicleStats(w, v) };
}

describe("throttle by click distance", () => {
  it("zones span their reach: brake 25%, hold 50%, accelerate 25%", () => {
    const z = zoneEdges();
    expect(z.reach).toBeCloseTo(RULES.throttleZones.reach);
    expect(z.brakeEnd).toBeCloseTo(z.reach * 0.25);
    expect(z.holdEnd - z.brakeEnd).toBeCloseTo(z.reach * 0.5);
  });

  it("a close click brakes, a mid click holds, a far click accelerates", () => {
    const { s } = setup(4);
    const z = zoneEdges();
    const at = (d: number) => throughSpeed(s, 4, d, undefined, 'direct');
    expect(at(0.01)).toBeCloseTo(4 - s.brake, 1);
    expect(at(z.brakeEnd / 2)).toBeCloseTo(4 - s.brake / 2, 5);
    expect(at((z.brakeEnd + z.holdEnd) / 2)).toBe(4);
    expect(at(z.reach + 5)).toBe(Math.min(s.maxSpeed, 4 + s.accel));
    expect(throttleFor(1, 4, 'direct')).toBe("brake");
    expect(zoneSpeed(s, 0.5, 1)).toBeCloseTo(zoneSpeed(s, 0, 1), 5);
    expect(throttleFor(5, 4, 'direct')).toBe("hold");
    expect(throttleFor(20, 4, 'direct')).toBe("accelerate");
  });
});

describe("route mode speed by distance", () => {
  it("a far point speeds up and a point within this turn's travel holds speed", () => {
    const { s } = setup(4);
    expect(throughSpeed(s, 4, 20, undefined, "route")).toBe(Math.min(s.maxSpeed, 4 + s.accel));
    expect(throughSpeed(s, 4, 2, undefined, "route")).toBe(4);
    expect(throughSpeed(s, 4, 0.01, undefined, "route")).toBe(4);
    const out = throughSpeed(s, 4, 4.5, undefined, "route");
    expect(out).toBeGreaterThan(4);
    expect(out).toBeLessThanOrEqual(Math.min(s.maxSpeed, 4 + s.accel));
  });

  it("from rest a close point starts gently and a far point starts at full acceleration", () => {
    const { s } = setup(0);
    expect(throughSpeed(s, 0, 0.5, undefined, "route")).toBe(1);
    expect(throughSpeed(s, 0, 20, undefined, "route")).toBe(Math.min(s.maxSpeed, s.accel));
  });

  it("holds top speed above it and lets a pace win in both modes", () => {
    const { s } = setup(0);
    expect(throughSpeed(s, s.maxSpeed + 2, 30, undefined, "route")).toBe(s.maxSpeed);
    expect(throughSpeed(s, 4, 20, 4.5, "route")).toBe(throughSpeed(s, 4, 20, 4.5, "direct"));
  });

  it("never brakes for a through point and shows accelerate only when out of reach", () => {
    const { s } = setup(0);
    for (const speed of [0, 1, 4, s.maxSpeed])
      for (const d of [0.01, 1, 4, 10, 40]) {
        expect(throughSpeed(s, speed, d, undefined, "route")).toBeGreaterThanOrEqual(Math.min(speed, s.maxSpeed));
        expect(throttleFor(d, speed, "route")).toBe(d > speed ? "accelerate" : "hold");
      }
  });

  it("rejects a non-finite distance or speed", () => {
    const { s } = setup(0);
    expect(() => throughSpeed(s, 4, Number.NaN, undefined, "route")).toThrow();
    expect(() => throughSpeed(s, Number.NaN, 4, undefined, "route")).toThrow();
  });
});

describe("click orders", () => {
  it("at rest the red zone is one third of reach and green is two thirds", () => {
    const z = zoneEdges();
    expect(throttleFor(z.reach / 3 - 0.01, 0, 'direct')).toBe("brake");
    expect(throttleFor(z.reach / 3 + 0.01, 0, 'direct')).toBe("accelerate");
  });

  it("a nearby ground click remains a destination", () => {
    expect(clickOrder(TEST_MAP.terrain, { x: 31, y: 30 }, false, { pos: { x: 1, y: 1 }, order: null })).toEqual({ kind: "through", dest: { x: 31, y: 30 } });
    expect(clickOrder(TEST_MAP.terrain, { x: 36, y: 30 }, false, { pos: { x: 1, y: 1 }, order: null }).kind).toBe("through");
    expect(clickOrder(TEST_MAP.terrain, { x: 31, y: 30 }, true, { pos: { x: 1, y: 1 }, order: null }).kind).toBe("stopAt");
  });

  it("a click on the order's point switches it between driving through and stopping", () => {
    const dest = { x: 31, y: 30 };
    const near = { x: 31 + RULES.reclickRadius / 2, y: 30 };
    const stop = clickOrder(TEST_MAP.terrain, near, false, { pos: { x: 1, y: 1 }, order: { kind: "through", dest } });
    expect(stop).toEqual({ kind: "stopAt", dest });
    expect(clickOrder(TEST_MAP.terrain, near, false, { pos: { x: 1, y: 1 }, order: stop })).toEqual({ kind: "through", dest });
  });

  it("a click away from the order's point sets a new drive-through point", () => {
    const far = { x: 31 + RULES.reclickRadius * 2, y: 30 };
    expect(clickOrder(TEST_MAP.terrain, far, false, { pos: { x: 1, y: 1 }, order: { kind: "stopAt", dest: { x: 31, y: 30 } } })).toEqual({ kind: "through", dest: far });
    expect(clickOrder(TEST_MAP.terrain, far, false, { pos: { x: 1, y: 1 }, order: { kind: "brake" } })).toEqual({ kind: "through", dest: far });
  });
});

describe("backing up", () => {
  const player = { faction: "player" as const, brain: null };
  const cone = RULES.reverse.cone * DEG;

  it("the player backs only to a click inside the cone behind and within reach", () => {
    expect(backsToDestination(player, 5, cone * 0.5)).toBe(true);
    expect(backsToDestination(player, 5, -cone * 0.5)).toBe(true);
    expect(backsToDestination(player, 5, cone * 1.5)).toBe(false);
    expect(backsToDestination(player, RULES.throttleZones.reach + 1, 0)).toBe(false);
  });

  it("an NPC backs up only while recovering, inside the cone and within reach", () => {
    const npc = { faction: "scrapjaw" as const, brain: npcBrain("buggy", { x: 0, y: 0 }, ["raider"]) };
    expect(backsToDestination(npc, 5, 0)).toBe(false);
    npc.brain.recovery = 1;
    expect(backsToDestination(npc, 5, 0)).toBe(true);
    expect(backsToDestination(npc, 5, cone * 0.5)).toBe(true);
    expect(backsToDestination(npc, 5, -cone * 0.5)).toBe(true);
    expect(backsToDestination(npc, 5, Math.PI / 2)).toBe(false);
    expect(backsToDestination(npc, RULES.throttleZones.reach + 1, 0)).toBe(false);
  });
});

describe("parked blockers", () => {
  it("leaves a truck on a tow rope out of the tower's route", () => {
    const w = emptyWorld();
    const tower = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 30, y: 30 });
    const towed = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 32, y: 30 });
    addState(w, "tow", tower.id, towed.id, { kind: "tow", site: "bowl", fee: 0, waived: 0, hitched: true });

    expect(parkedVehicles(w, tower.id, getHitchedTowIds(w))).not.toContainEqual({ pos: towed.pos, r: chassisDef(towed.chassisId).radius });
  });
});

describe("setting a stranded truck down", () => {
  it("keeps the truck's own spot when it is free", () => {
    const w = emptyWorld();
    expect(setDownSpot(w, w.vehicles[0])).toEqual(w.vehicles[0].pos);
  });

  it("moves the truck just clear of a truck under it", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const under = addVehicle(w, "independent", "hauler", ["stockEngine"], { ...me.pos });
    const gap = dist(setDownSpot(w, me), under.pos) - chassisDef(me.chassisId).radius - chassisDef("hauler").radius;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(1);
  });

  it("searches past the usual reach when nothing near is free, so a wedged truck still lands", () => {
    const w = emptyWorld({ x: 60, y: 60 });
    const me = w.vehicles[0];
    w.obstacles = [{ id: "big", pos: { ...me.pos }, r: 7, kind: "rock" }];
    const spot = setDownSpot(w, me);
    expect(dist(spot, me.pos)).toBeGreaterThan(4);
  });

  function ringed(center: Vec): World {
    const w = emptyWorld(center);
    w.obstacles = Array.from({ length: 16 }, (_, i): Obstacle => {
      const a = (2 * Math.PI * i) / 16;
      return { id: `ring${i}`, pos: { x: center.x + Math.cos(a) * 3.5, y: center.y + Math.sin(a) * 3.5 }, r: 1.2, kind: "rock" };
    });
    return w;
  }

  it("sets a truck inside a closed ring of rocks down outside it, where a pad can be reached", () => {
    const w = ringed({ x: 60, y: 60 });
    const me = w.vehicles[0];
    const spot = setDownSpot(w, me);
    expect(dist(spot, me.pos)).toBeGreaterThan(4.7);
    const anchor = nearestSitePad(atlasOf(w.terrain), me.pos).pad;
    expect(reachesFrom(w, anchor, vehicleStats(w, me).radius)(spot)).toBe(true);
  });

  it("leaves a truck stranded for the whole stranded count, straight and at rest", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    me.speed = 3;
    me.strandedTurns = 0;
    setDown(w, me);
    expect(me.strandedTurns).toBe(RULES.stranded.turns);
    expect(me.speed).toBe(0);
  });
});

describe("route pace", () => {
  const stop = (dest: Vec, pace?: number): MoveOrder => ({ kind: "stopAt", dest, ...(pace === undefined ? {} : { pace }) });

  it("a paced stop order holds its pace instead of speeding up to top speed", () => {
    const { s } = setup(0);
    const at = { x: 0, y: 0 };
    const far = { x: 100, y: 0 };
    expect(orderSpeed(s, s.maxSpeed / 2, at, stop(far), "route")).toBe(Math.min(s.maxSpeed, s.maxSpeed / 2 + s.accel));
    expect(orderSpeed(s, 1, at, stop(far, 2), "route")).toBeCloseTo(Math.min(2, 1 + s.accel));
    expect(orderSpeed(s, 5, at, stop(far, 2), "route")).toBeCloseTo(Math.max(2, 5 - s.brake));
  });

  it("an unpaced through order keeps the route speed rule", () => {
    const { s } = setup(4);
    const order: MoveOrder = { kind: "through", dest: { x: 20, y: 0 } };
    expect(orderSpeed(s, 4, { x: 0, y: 0 }, order, "route")).toBe(throughSpeed(s, 4, 20, undefined, "route"));
  });

  it("a brake order has no target speed", () => {
    const { s } = setup(4);
    expect(() => orderSpeed(s, 4, { x: 0, y: 0 }, { kind: "brake" }, "route")).toThrow();
  });
});
