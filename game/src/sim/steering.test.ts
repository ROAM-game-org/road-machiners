import { RULES } from "../data/rules";
import { describe, expect, it } from "vitest";
import { vehicleStats } from "./stats";
import { chassisDef } from "../data/chassis";
import { backsToDestination, clickOrder, clickSetSpeed, parkedVehicles, setDown, setDownSpot, setSpeedTarget, settleSetSpeed, orderSpeed, throttleFor, throughSpeed, zoneAt, zoneEdges, zoneHalfAngle, zonePace, zoneSpeed, orderThrottle, playerOrder } from "./steering";
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
import type { MoveOrder, Obstacle, Vehicle, World } from "./types";
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

describe("set speed of manual driving", () => {
  const z = zoneEdges();
  const step = RULES.setSpeedStep;
  const through = { kind: "through", dest: { x: 50, y: 30 } } as const;
  const driver = (setSpeed?: number) => ({ direct: true, setSpeed });
  const ahead = (v: Vehicle, d: number): Vec => ({ x: v.pos.x + Math.cos(v.heading) * d, y: v.pos.y + Math.sin(v.heading) * d });

  it("a click changes the set speed once by its zone: red lowers, yellow keeps, green raises", () => {
    const { v, s } = setup(3);
    v.setSpeed = 4;
    expect(clickSetSpeed(s, v, ahead(v, z.brakeEnd / 2))).toBeCloseTo(4 - step);
    expect(clickSetSpeed(s, v, ahead(v, (z.brakeEnd + z.holdEnd) / 2))).toBe(4);
    expect(clickSetSpeed(s, v, ahead(v, z.holdEnd + 0.5))).toBeCloseTo(4 + step);
  });

  it("the step does not depend on how deep in the zone the click lands", () => {
    const { v, s } = setup(3);
    v.setSpeed = 4;
    expect(clickSetSpeed(s, v, ahead(v, z.holdEnd + 0.1))).toBe(clickSetSpeed(s, v, ahead(v, z.reach - 0.1)));
    expect(clickSetSpeed(s, v, ahead(v, 0.2))).toBe(clickSetSpeed(s, v, ahead(v, z.brakeEnd - 0.1)));
  });

  it("only the distance counts: the same in every direction, and past the reach is green", () => {
    const { v, s } = setup(3);
    v.setSpeed = 4;
    const at = (d: number, angle: number): Vec => ({ x: v.pos.x + Math.cos(v.heading + angle) * d, y: v.pos.y + Math.sin(v.heading + angle) * d });
    for (const angle of [Math.PI / 2, Math.PI, -2]) {
      expect(clickSetSpeed(s, v, at(z.brakeEnd / 2, angle))).toBeCloseTo(4 - step);
      expect(clickSetSpeed(s, v, at((z.brakeEnd + z.holdEnd) / 2, angle))).toBe(4);
      expect(clickSetSpeed(s, v, at(z.holdEnd + 0.5, angle))).toBeCloseTo(4 + step);
    }
    expect(clickSetSpeed(s, v, ahead(v, z.reach + 40))).toBeCloseTo(4 + step);
  });

  it("with no set speed a click starts from the measured speed, and stays between zero and top speed", () => {
    const { v, s } = setup(3);
    expect(clickSetSpeed(s, v, ahead(v, z.holdEnd + 0.5))).toBeCloseTo(3 + step);
    v.setSpeed = s.maxSpeed;
    expect(clickSetSpeed(s, v, ahead(v, z.holdEnd + 0.5))).toBe(s.maxSpeed);
    v.speed = 0;
    v.setSpeed = 0;
    expect(clickSetSpeed(s, v, ahead(v, 0.5))).toBe(0);
    expect(clickSetSpeed(s, v, ahead(v, z.reach - 0.5))).toBeCloseTo(step);
  });

  it("the target is the set speed under the top speed, whatever the order point's distance", () => {
    const { s } = setup(4);
    expect(setSpeedTarget(driver(3), s, through)).toBe(3);
    expect(setSpeedTarget(driver(3), s, { kind: "through", dest: { x: 0.1, y: 0 } })).toBe(3);
    expect(setSpeedTarget(driver(3), s, null)).toBe(3);
    expect(setSpeedTarget(driver(s.maxSpeed + 3), s, null)).toBe(s.maxSpeed);
  });

  it("route mode, no set speed, brake, stop-at and pace orders give none", () => {
    const { s } = setup(4);
    expect(setSpeedTarget({ direct: false, setSpeed: 5 }, s, through)).toBeUndefined();
    expect(setSpeedTarget(driver(), s, through)).toBeUndefined();
    expect(setSpeedTarget(driver(5), s, { kind: "brake" })).toBeUndefined();
    expect(setSpeedTarget(driver(5), s, { kind: "stopAt", dest: through.dest })).toBeUndefined();
    expect(setSpeedTarget(driver(5), s, { ...through, pace: 2 })).toBeUndefined();
  });

  it("a truck that comes to rest gets a set speed of zero, one that starts from rest keeps it", () => {
    const { v } = setup(0);
    v.setSpeed = 4;
    settleSetSpeed(v, 3);
    expect(v.setSpeed).toBe(0);
    v.setSpeed = 4;
    settleSetSpeed(v, 0);
    expect(v.setSpeed).toBe(4);
  });

  it("throws on a non-finite speed", () => {
    const { v, s } = setup(4);
    v.setSpeed = NaN;
    expect(() => clickSetSpeed(s, v, ahead(v, 5))).toThrow();
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

describe("route speed by the colored zones", () => {
  function player(speed: number, chassisId: string = PLAYER_CHASSIS[0]) {
    const w = emptyWorld();
    const v = addVehicle(w, "player", chassisId, ["stockEngine"], { x: 20, y: 20 }, 0);
    v.speed = speed;
    return { w, v, s: vehicleStats(w, v), z: zoneEdges() };
  }
  const ahead = (v: { pos: Vec }, d: number, side = 0): Vec => ({ x: v.pos.x + d, y: v.pos.y + side });

  it("the fan half angle never falls under the minimum", () => {
    const { s } = player(0);
    expect(zoneHalfAngle(s, 0)).toBe(RULES.throttleZones.minHalfAngle);
  });

  it("zoneAt names the band under a point, at rest and moving", () => {
    const { v, s, z } = player(4);
    expect(zoneAt(s, v, ahead(v, z.brakeEnd / 2))).toBe("brake");
    expect(zoneAt(s, v, ahead(v, (z.brakeEnd + z.holdEnd) / 2))).toBe("hold");
    expect(zoneAt(s, v, ahead(v, z.holdEnd + 0.5))).toBe("accelerate");
    v.speed = 0;
    expect(zoneAt(s, v, ahead(v, z.restBrakeEnd - 0.5))).toBe("brake");
    expect(zoneAt(s, v, ahead(v, z.restBrakeEnd + 0.5))).toBe("accelerate");
  });

  it("zoneAt is null past the reach and outside the fan", () => {
    const { v, s, z } = player(4);
    expect(zoneAt(s, v, ahead(v, z.reach + 1))).toBeNull();
    expect(zoneAt(s, v, ahead(v, -5))).toBeNull();
    const half = zoneHalfAngle(s, 4);
    const inside = { x: v.pos.x + 5 * Math.cos(half * 0.9), y: v.pos.y + 5 * Math.sin(half * 0.9) };
    const outside = { x: v.pos.x + 5 * Math.cos(half * 1.1), y: v.pos.y + 5 * Math.sin(half * 1.1) };
    expect(zoneAt(s, v, inside)).not.toBeNull();
    expect(zoneAt(s, v, outside)).toBeNull();
  });

  it.each(PLAYER_CHASSIS)("red holds a crawl on the %s, under limp speed and above parked", (chassisId) => {
    const { s } = player(6, chassisId);
    const pace = zonePace(s, 6, "brake");
    expect(pace).toBe(RULES.crawlSpeed);
    expect(pace!).toBeLessThanOrEqual(RULES.limpSpeed);
    expect(pace!).toBeGreaterThan(RULES.parkedSpeed);
  });

  it("yellow holds the speed now, never under crawl, and nothing at top speed; green holds nothing", () => {
    const { s } = player(0);
    expect(zonePace(s, 3, "hold")).toBe(3);
    expect(zonePace(s, 0.2, "hold")).toBe(RULES.crawlSpeed);
    expect(zonePace(s, s.maxSpeed, "hold")).toBeUndefined();
    expect(zonePace(s, 3, "accelerate")).toBeUndefined();
  });

  describe("playerOrder", () => {
    const farDest = (v: { pos: Vec }): Vec => ahead(v, 40);

    it("a fan click with no far point sets the point and the band's pace", () => {
      const { w, v, z } = player(4);
      const red = ahead(v, z.brakeEnd / 2);
      expect(playerOrder(w, v, red, false)).toEqual({ kind: "through", dest: red, pace: RULES.crawlSpeed });
      const yellow = ahead(v, (z.brakeEnd + z.holdEnd) / 2);
      expect(playerOrder(w, v, yellow, false)).toEqual({ kind: "through", dest: yellow, pace: 4 });
      const green = ahead(v, z.holdEnd + 0.5);
      expect(playerOrder(w, v, green, false)).toEqual({ kind: "through", dest: green });
    });

    it("a fan click keeps a point beyond the reach and changes only the speed", () => {
      const { w, v, z } = player(4);
      v.order = { kind: "stopAt", dest: farDest(v) };
      expect(playerOrder(w, v, ahead(v, z.brakeEnd / 2), false)).toEqual({ kind: "stopAt", dest: farDest(v), pace: RULES.crawlSpeed });
      v.order = { kind: "through", dest: farDest(v), pace: RULES.crawlSpeed };
      expect(playerOrder(w, v, ahead(v, z.holdEnd + 0.5), false)).toEqual({ kind: "through", dest: farDest(v) });
    });

    it("a click outside the fan keeps the held pace, shift and re-click included", () => {
      const { w, v } = player(4);
      const dest = farDest(v);
      v.order = { kind: "through", dest, pace: RULES.crawlSpeed };
      const far = ahead(v, 60, 5);
      expect(playerOrder(w, v, far, false)).toEqual({ kind: "through", dest: far, pace: RULES.crawlSpeed });
      expect(playerOrder(w, v, ahead(v, 3), true)).toEqual({ kind: "stopAt", dest: ahead(v, 3), pace: RULES.crawlSpeed });
      expect(playerOrder(w, v, dest, false)).toEqual({ kind: "stopAt", dest, pace: RULES.crawlSpeed });
    });

    it("with no order a click outside the fan holds nothing", () => {
      const { w, v } = player(4);
      expect(playerOrder(w, v, ahead(v, 60), false)).toEqual({ kind: "through", dest: ahead(v, 60) });
    });

    it("a brake order has no pace to keep", () => {
      const { w, v } = player(4);
      v.order = { kind: "brake" };
      expect(playerOrder(w, v, ahead(v, 60), false)).toEqual({ kind: "through", dest: ahead(v, 60) });
    });

    it("manual driving gives the plain click order", () => {
      const { w, v, z } = player(4);
      v.direct = true;
      v.order = { kind: "through", dest: farDest(v), pace: 2 };
      const p = ahead(v, z.brakeEnd / 2);
      expect(playerOrder(w, v, p, false)).toEqual(clickOrder(w.terrain, p, false, v));
    });
  });

  it("orderThrottle shows the band a pace stands for", () => {
    const { w, v } = player(4);
    const dest = ahead(v, 30);
    expect(orderThrottle(v, { kind: "through", dest, pace: RULES.crawlSpeed })).toBe("brake");
    expect(orderThrottle(v, { kind: "through", dest, pace: 4 })).toBe("hold");
    expect(orderThrottle(v, { kind: "through", dest })).toBe(throttleFor(30, 4, "route"));
    expect(orderThrottle(v, { kind: "brake" })).toBe("brake");
  });
});
