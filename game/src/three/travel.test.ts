import { beforeAll, describe, expect, it, vi } from "vitest";
import { RULES } from "../data/rules";
import { buildDrive, captureDrive, freeDrive, initPhysics, restFrame, TURN_STEPS, type Drive, type DriveSnapshot } from "../phys/drive";
import { PHYSICS } from "../data/physics";
import { physicsMove } from "../phys/turn";
import { addVehicle, emptyWorld, npcBrain } from "../sim/testkit";
import { dist } from "../sim/vec";
import { startKit } from "../data/start";
import { playerVehicle } from "../sim/damage";
import type { GameEvent, Vehicle } from "../sim/types";
import { endTurn, newWorld, setMoveOrder } from "../sim/world";
import { addRopeFrames, canTravel, Creep, nextSightSample, overshoots, threatsIn, Travel, type Playback } from "./travel";
import { headingQuat, type VehicleFrame } from "../phys/frames";
import type { Tail } from "../phys/turn";
import { addState, declareFeud } from "../sim/states";
import { TEST_MAP } from "../test/map";
import { reusedWorld } from "../test/world-cache";
import { defaultSetup } from "../sim/settings";

const TAIL = 11;

function makeSafeWorld() {
  const world = reusedWorld("travel", () => newWorld(1337, startKit("standard"), TEST_MAP, defaultSetup('roaming')));
  world.vehicles = [playerVehicle(world)];
  world.events = [];
  return world;
}

describe("turn advancement", () => {
  it("keeps planning paused until Space starts waypoint travel", () => {
    const travel = new Travel(250, TAIL);
    travel.update(true, true);
    expect(travel.shouldAdvance(0)).toBe(false);
    expect(travel.press(0, false, true)).toBe(true);
    travel.release();
    expect(travel.shouldAdvance(1000)).toBe(true);
  });

  it("the turn button stops waypoint travel and reports it", () => {
    const world = makeSafeWorld();
    const travel = new Travel(250, TAIL);
    expect(travel.stopAuto(world)).toBe(false);
    travel.press(0, false, true);
    travel.release();
    expect(travel.isAuto(world)).toBe(true);
    expect(travel.stopAuto(world)).toBe(true);
    expect(travel.shouldAdvance(1000)).toBe(false);
  });

  it("Space pauses travel without scheduling an extra turn", () => {
    const travel = new Travel(250, TAIL);
    travel.press(0, false, true);
    travel.release();
    expect(travel.press(100, true, true)).toBe(false);
    travel.release();
    expect(travel.shouldAdvance(1000)).toBe(false);
  });

  it("a tap without safe waypoint travel advances exactly one turn", () => {
    const travel = new Travel(250, TAIL);
    expect(travel.press(0, false, false)).toBe(true);
    expect(travel.press(10, false, false)).toBe(false);
    travel.release();
    expect(travel.shouldAdvance(1000)).toBe(false);
  });

  it("holding Space advances faster, even in combat, until release", () => {
    const travel = new Travel(250, TAIL);
    travel.press(0, false, false);
    expect(travel.isFast(249)).toBe(false);
    expect(travel.isFast(250)).toBe(true);
    travel.update(false, false);
    expect(travel.shouldAdvance(250)).toBe(true);
    travel.release();
    expect(travel.isFast(251)).toBe(false);
    expect(travel.shouldAdvance(251)).toBe(false);
  });

  it.each(["danger", "arrival"])(
    "%s cancels automatic travel until Space is pressed again",
    (reason) => {
      const travel = new Travel(250, TAIL);
      travel.press(0, false, true);
      travel.release();
      travel.update(reason !== "danger", reason !== "arrival");
      expect(travel.shouldAdvance(0)).toBe(false);
      expect(travel.shouldAdvance(1)).toBe(false);
      travel.press(2, false, true);
      travel.release();
      expect(travel.shouldAdvance(2)).toBe(true);
    },
  );

  it("focus loss or a panel clears held input and automatic travel", () => {
    const travel = new Travel(250, TAIL);
    travel.press(0, false, true);
    travel.pause();
    expect(travel.isFast(1000)).toBe(false);
    expect(travel.shouldAdvance(1000)).toBe(false);
  });
});

describe("playback clock", () => {
  const playback = (elapsed = 0) => ({ elapsed, lastTick: null as number | null }) as Parameters<Travel["advanceClock"]>[0];

  it("adds a normal frame in full, times the speed", () => {
    const travel = new Travel(250, TAIL);
    const a = playback();
    travel.advanceClock(a, 1000, 1, 50);
    expect(travel.advanceClock(a, 1016, 1, 50)).toBe(16);
    expect(travel.advanceClock(a, 1032, 4, 50)).toBe(16 + 64);
  });

  it("stretches the turn on a slow frame instead of skipping ahead", () => {
    const travel = new Travel(250, TAIL);
    const a = playback();
    travel.advanceClock(a, 1000, 1, 50);
    expect(travel.advanceClock(a, 1400, 1, 50)).toBe(50);
    expect(travel.advanceClock(a, 1800, 4, 50)).toBe(250);
  });

  it("keeps the carried elapsed time on the first call", () => {
    const travel = new Travel(250, TAIL);
    const a = playback(120);
    expect(travel.advanceClock(a, 5000, 1, 50)).toBe(120);
  });
});

describe("turns that run on their own", () => {
  it("a turn press stops them, and the next press restarts them", () => {
    const world = makeSafeWorld();
    world.player.state = "knockedOut";
    const travel = new Travel(250, TAIL);
    expect(travel.autoAllowed(world)).toBe(true);
    travel.pressTurn(false, world);
    travel.release();
    expect(travel.autoAllowed(world)).toBe(false);
    travel.pressTurn(false, world);
    expect(travel.autoAllowed(world)).toBe(true);
    travel.release();
    expect(travel.autoAllowed(world)).toBe(true);
  });

  it("a press with a drive-through order starts travel, and a press while playing stops it", () => {
    const world = setMoveOrder(makeSafeWorld(), { kind: "through", dest: { x: 40, y: 30 } });
    const travel = new Travel(250, TAIL);
    expect(travel.pressTurn(false, world)).toBe(true);
    expect(travel.isAuto(world)).toBe(true);
    travel.release();
    expect(travel.pressTurn(true, world)).toBe(false);
    expect(travel.isAuto(world)).toBe(false);
  });

  it("holding a press fast-forwards until release", () => {
    const world = setMoveOrder(makeSafeWorld(), { kind: "through", dest: { x: 40, y: 30 } });
    const travel = new Travel(250, TAIL);
    travel.pressTurn(false, world);
    expect(travel.isFast(performance.now() + 250)).toBe(true);
    travel.release();
    expect(travel.isFast(performance.now() + 250)).toBe(false);
  });

  it("stopAuto ends them for abandon", () => {
    const world = makeSafeWorld();
    world.player.state = "knockedOut";
    const travel = new Travel(250, TAIL);
    expect(travel.isAuto(world)).toBe(true);
    expect(travel.stopAuto(world)).toBe(true);
    expect(travel.isAuto(world)).toBe(false);
    expect(travel.stopAuto(world)).toBe(false);
  });

  it("keeps running a knocked-out player's turns while a drag pulls the truck into the drain", () => {
    const world = makeSafeWorld();
    world.player.state = "knockedOut";
    world.events = [{ t: "info", note: { id: "hazard" } }];
    const travel = new Travel(250, TAIL);

    travel.updateWorld(world, false);

    expect(travel.autoAllowed(world)).toBe(true);
  });

  it("a stop ends with the stranded spell", () => {
    const world = makeSafeWorld();
    world.player.state = "knockedOut";
    const travel = new Travel(250, TAIL);
    travel.pressTurn(false, world);
    travel.release();
    world.player.state = "active";
    expect(travel.autoAllowed(world)).toBe(false);
    world.player.state = "knockedOut";
    expect(travel.autoAllowed(world)).toBe(true);
  });
});

describe("waypoint travel with physics", () => {
  beforeAll(initPhysics);

  it("one Space press advances to the waypoint and stops scheduling on arrival", () => {
    const dest = { x: 38, y: 31 };
    let world = setMoveOrder(emptyWorld(), { kind: "stopAt", dest });
    let drive = buildDrive(world);
    const travel = new Travel(250, TAIL);
    travel.press(0, false, true);
    travel.release();
    let turns = 0;
    try {
      for (; turns < 8; turns++) {
        travel.update(canTravel(world), playerVehicle(world).order !== null);
        if (!travel.shouldAdvance(0)) break;
        let next: Drive | null = null;
        world = endTurn(
          world,
          physicsMove(drive, (result) => {
            next = result.next;
          }),
        );
        if (!next) throw new Error("Missing physics result");
        freeDrive(drive);
        drive = next;
      }
      expect(turns).toBeGreaterThan(1);
      expect(playerVehicle(world).order).toBeNull();
      expect(dist(playerVehicle(world).pos, dest)).toBeLessThan(
        RULES.arriveRadius + 0.3,
      );
      expect(playerVehicle(world).speed).toBeLessThan(0.05);
      expect(travel.shouldAdvance(0)).toBe(false);
    } finally {
      freeDrive(drive);
    }
  });
});

describe("drive-through overshoot", () => {
  function passing(to: { x: number; y: number }) {
    const world = setMoveOrder(makeSafeWorld(), { kind: "through", dest: { x: 40, y: 30 } });
    const next = structuredClone({ events: world.events, vehicles: world.vehicles });
    playerVehicle(world).pos = { x: 36, y: 30 };
    next.vehicles[0].pos = to;
    next.events.push({ t: "arrived", vehicle: next.vehicles[0].id });
    return { world, next };
  }

  it("stops travel before a turn that ends farther past the point than the truck is now", () => {
    const { world, next } = passing({ x: 45, y: 30 });
    expect(overshoots(world, next)).toBe(true);
  });

  it("plays a passing turn that ends nearer the point", () => {
    const { world, next } = passing({ x: 41, y: 30 });
    expect(overshoots(world, next)).toBe(false);
  });

  it("plays a turn that does not pass the point", () => {
    const { world, next } = passing({ x: 45, y: 30 });
    next.events = [];
    expect(overshoots(world, next)).toBe(false);
  });
});

describe("automatic travel safety", () => {
  it("permits safe travel", () => {
    expect(canTravel(makeSafeWorld())).toBe(true);
  });

  it("does not stop for a hostile in sight while no fight is on", () => {
    const world = makeSafeWorld();
    const enemy = structuredClone(playerVehicle(world));
    enemy.id = "enemy";
    enemy.faction = "scrapjaw";
    world.vehicles.push(enemy);
    expect(canTravel(world)).toBe(true);
  });

  it("finds the threats of a world once and finds them again for the next world", () => {
    const world = makeSafeWorld();
    const me = playerVehicle(world);
    const raider = addVehicle(world, "scrapjaw", "buggy", [], { x: me.pos.x + 5, y: me.pos.y });
    const calm = addVehicle(world, "scrapjaw", "buggy", [], { x: me.pos.x - 5, y: me.pos.y });
    for (const v of [raider, calm]) v.brain = npcBrain("raider", v.pos, []);
    declareFeud(world, raider, me.id);
    expect(threatsIn(world)).toEqual([raider]);
    expect(threatsIn(world)).toBe(threatsIn(world));
    expect(threatsIn({ ...world, vehicles: [me] })).toEqual([]);
  });

  it("stops while the player is in combat, seen hostile or not", () => {
    const world = makeSafeWorld();
    addState(world, "combat", "enemy", world.player.vehicleId, { kind: "none" });
    expect(canTravel(world)).toBe(false);
  });

  it("cancels automatic travel once when a hostile comes into sight, and Space starts it again", () => {
    const start = makeSafeWorld();
    const world = setMoveOrder(start, { kind: "stopAt", dest: { x: playerVehicle(start).pos.x + 20, y: playerVehicle(start).pos.y } });
    const travel = new Travel(250, TAIL);
    travel.press(0, false, true);
    travel.release();
    expect(travel.isAuto(world)).toBe(true);
    travel.updateWorld(world, true);
    expect(travel.isAuto(world)).toBe(false);
    travel.pressTurn(false, world);
    travel.release();
    travel.updateWorld(world, false);
    expect(travel.isAuto(world)).toBe(true);
  });

  it("ignores a bump into a prop or the ground but stops for a crash into a truck", () => {
    const world = makeSafeWorld();
    const id = world.player.vehicleId;
    const other = { ...playerVehicle(world), id: "other" };
    world.vehicles.push(other);
    world.events = [{ t: "collision", a: id, b: "rock", hitsA: [], hitsB: [] }];
    expect(canTravel(world)).toBe(true);
    world.events = [{ t: "collision", a: id, b: "other", hitsA: [], hitsB: [] }];
    expect(canTravel(world)).toBe(false);
    world.events = [{ t: "collision", a: "other", b: id, hitsA: [], hitsB: [] }];
    expect(canTravel(world)).toBe(false);
  });

  it("stops automatic travel in the turn the truck enters the reactor's drain, and again at its core", () => {
    for (const id of ["hazard", "core"] as const) {
      const world = makeSafeWorld();
      world.events = [{ t: "info", note: { id } }];
      expect(canTravel(world)).toBe(false);
    }
    const quiet = makeSafeWorld();
    quiet.events = [{ t: "info", note: { id: "engineHot" } }];
    expect(canTravel(quiet)).toBe(true);
  });

  it("lets go of a held Space at the drain's edge, so the next turn needs a fresh press", () => {
    const world = makeSafeWorld();
    const travel = new Travel(250, TAIL);
    travel.press(0, false, true);
    expect(travel.isFast(1000)).toBe(true);
    world.events = [{ t: "info", note: { id: "hazard" } }];

    travel.updateWorld(world, false);

    expect(travel.isFast(2000)).toBe(false);
    expect(travel.shouldAdvance(2000)).toBe(false);
  });

  it("keeps direct driving manual", () => {
    const world = makeSafeWorld();
    playerVehicle(world).direct = true;
    expect(canTravel(world)).toBe(false);
  });

  it("travels on an empty tank at a crawl", () => {
    const world = makeSafeWorld();
    world.player.fuel = 0;
    expect(canTravel(world)).toBe(true);
  });

  it.each([
    "shot",
    "breakdown",
    "partDisabled",
    "knockout",
    "death",
  ])("stops after player %s", (kind) => {
    const world = makeSafeWorld();
    const id = world.player.vehicleId;
    const events: Record<string, GameEvent> = {
      shot: {
        t: "shot",
        shooter: "enemy",
        target: id,
        weapon: "gun",
        aim: "body",
        chance: 1,
        damageChance: 1,
        side: "front",
        rounds: [],
      },
      breakdown: { t: "breakdown", vehicle: id, part: "engine" },
      partDisabled: { t: "partDisabled", vehicle: id, part: "engine" },
      knockout: { t: "knockout" },
      death: { t: "death", cause: "injury" },
    };
    world.events = [events[kind]];
    expect(canTravel(world)).toBe(false);
  });
});

describe("rope frames", () => {
  it("frames a truck let off the rope at the end of the turn along its trail", () => {
    const before = makeSafeWorld();
    const me = playerVehicle(before);
    const tower = { ...me, id: "tower", pos: { x: me.pos.x + 3, y: me.pos.y } };
    before.vehicles.push(tower);
    addState(before, "tow", tower.id, me.id, { kind: "tow", site: "bowl", fee: 0, waived: 0, hitched: true });
    const after = structuredClone(before);
    after.states = [];
    playerVehicle(after).trail = [{ ...me.pos, heading: 0 }, { x: me.pos.x + 1, y: me.pos.y, heading: 0 }];
    const frames: Parameters<typeof addRopeFrames>[2] = {};

    addRopeFrames(before, after, frames, {});

    expect(frames[me.id]?.length).toBeGreaterThan(0);
    expect(frames[tower.id]).toBeUndefined();
  });
});

describe("rope frames carry wheel spin", () => {
  it("continues a towed truck's wheels from the last shown frame", () => {
    const before = makeSafeWorld();
    const me = playerVehicle(before);
    const tower = { ...me, id: "tower", pos: { x: me.pos.x + 3, y: me.pos.y } };
    before.vehicles.push(tower);
    addState(before, "tow", tower.id, me.id, { kind: "tow", site: "bowl", fee: 0, waived: 0, hitched: true });
    const after = structuredClone(before);
    playerVehicle(after).trail = [{ ...me.pos, heading: 0 }, { x: me.pos.x + 1, y: me.pos.y, heading: 0 }];
    const shown = restFrame(before, me);
    shown.wheels = shown.wheels.map((wheel) => ({ ...wheel, spin: 5 }));
    const frames: Parameters<typeof addRopeFrames>[2] = {};

    addRopeFrames(before, after, frames, { [me.id]: shown });

    for (const wheel of frames[me.id][0].wheels) expect(wheel.spin).toBeGreaterThan(5);
    expect(Math.abs(frames[me.id][0].wheels[2].spin - 5)).toBeLessThan(0.2);
  });
});

describe("rope frames for a truck that jumped", () => {
  it("stands a truck let off the rope with no trail at its new pose", () => {
    const before = makeSafeWorld();
    const me = playerVehicle(before);
    const tower = { ...me, id: "tower", pos: { x: me.pos.x + 3, y: me.pos.y } };
    before.vehicles.push(tower);
    addState(before, "tow", tower.id, me.id, { kind: "tow", site: "bowl", fee: 0, waived: 0, hitched: true });
    const after = structuredClone(before);
    after.states = [];
    playerVehicle(after).trail = [];
    const frames: Parameters<typeof addRopeFrames>[2] = {};

    addRopeFrames(before, after, frames, {});

    expect(frames[me.id]).toHaveLength(TURN_STEPS);
    expect(frames[me.id]?.[0].pos.x).toBeCloseTo(me.pos.x * PHYSICS.metersPerTile, 5);
  });
});

describe("turns on a tow rope", () => {
  function towedWorld() {
    const world = makeSafeWorld();
    const me = playerVehicle(world);
    world.vehicles.push({ ...me, id: "tower", pos: { x: me.pos.x + 3, y: me.pos.y } });
    addState(world, "tow", "tower", me.id, { kind: "tow", site: "bowl", fee: 0, waived: 0, hitched: true });
    return world;
  }

  function travelWithPrepared() {
    const prepare = vi.fn();
    const travel = new Travel(250, TAIL);
    Object.assign(travel, { turns: { prepare, take: () => null } });
    return { travel, prepare };
  }

  const playback = { result: { next: {} } } as unknown as Parameters<Travel["prepareNext"]>[1];

  it("prepare the next turn during playback with no key held", () => {
    const { travel, prepare } = travelWithPrepared();
    travel.prepareNext(towedWorld(), playback, 0);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("wait for the player once Space stops them", () => {
    const { travel, prepare } = travelWithPrepared();
    const world = towedWorld();
    travel.stopAuto(world);
    travel.prepareNext(world, playback, 0);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("do not prepare ahead for a truck that is not towed", () => {
    const { travel, prepare } = travelWithPrepared();
    travel.prepareNext(makeSafeWorld(), playback, 0);
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("every turn that runs on its own", () => {
  const ready = { world: {}, result: { frames: {}, next: {} } } as never;

  function stranded(kind: "knockedOut" | "towed" | "beacon") {
    const world = makeSafeWorld();
    const me = playerVehicle(world);
    if (kind === "knockedOut") world.player.state = "knockedOut";
    if (kind === "beacon") world.player.beacon = true;
    if (kind === "towed") {
      world.vehicles.push({ ...me, id: "tower", pos: { x: me.pos.x + 3, y: me.pos.y } });
      addState(world, "tow", "tower", me.id, { kind: "tow", site: "bowl", fee: 0, waived: 0, hitched: true });
    }
    return world;
  }

  function travelWithTurns(take: () => unknown = () => null) {
    const prepare = vi.fn();
    const travel = new Travel(250, TAIL);
    Object.assign(travel, { turns: { prepare, take } });
    return { travel, prepare };
  }

  const playback = { result: { next: {} } } as unknown as Parameters<Travel["prepareNext"]>[1];
  const drive = {} as DriveSnapshot;
  const kinds = ["knockedOut", "towed", "beacon"] as const;

  it.each(kinds)("prepares the next turn during playback while %s", (kind) => {
    const { travel, prepare } = travelWithTurns();
    travel.prepareNext(stranded(kind), playback, 0);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it.each(kinds)("begins the prepared turn with no key held while %s", (kind) => {
    const { travel } = travelWithTurns(() => ready);
    expect(travel.takeReady(stranded(kind), drive, 0)).toBe(ready);
  });

  it.each(kinds)("waits once stopped while %s", (kind) => {
    const { travel, prepare } = travelWithTurns(() => ready);
    const world = stranded(kind);
    travel.stopAuto(world);
    travel.prepareNext(world, playback, 0);
    expect(prepare).not.toHaveBeenCalled();
    expect(travel.takeReady(world, drive, 0)).toBeNull();
  });

  it("begins nothing while held back by a panel", () => {
    const { travel } = travelWithTurns(() => ready);
    expect(travel.takeReady(stranded("knockedOut"), drive, 0, true)).toBeNull();
    expect(travel.takeReady(stranded("knockedOut"), drive, 0, false)).toBe(ready);
  });

  it("carries the overshoot of a finished turn into the next one", () => {
    const { travel } = travelWithTurns(() => ready);
    const world = stranded("knockedOut");
    const a = { elapsed: 0, lastTick: null as number | null } as Parameters<Travel["advanceClock"]>[0];
    travel.advanceClock(a, 1000, 1, 50);
    const elapsed = travel.advanceClock(a, 1040, 1, 50);
    travel.finishClock(elapsed, 30);
    expect(travel.takeReady(world, drive, 1040)).toBe(ready);
    expect(travel.getRemainder(true)).toBe(10);
  });

  describe("with Space", () => {
    beforeAll(initPhysics);
    const at = (t: number) => vi.spyOn(performance, "now").mockReturnValue(t);

    it("makes a tap on a running run halt it, with no turn begun while undecided", () => {
      const { travel } = travelWithTurns(() => ready);
      const world = stranded("knockedOut");
      at(1000);
      travel.pressTurn(true, world);
      expect(travel.takeReady(world, drive, 1100)).toBeNull();
      travel.release(1100);
      expect(travel.autoAllowed(world)).toBe(false);
      expect(travel.takeReady(world, drive, 1200)).toBeNull();
    });

    it("makes a tap on a halted run resume it", () => {
      const { travel } = travelWithTurns(() => ready);
      const world = stranded("towed");
      travel.stopAuto(world);
      at(1000);
      travel.pressTurn(true, world);
      expect(travel.autoAllowed(world)).toBe(true);
      travel.release(1100);
      expect(travel.autoAllowed(world)).toBe(true);
      expect(travel.takeReady(world, drive, 1200)).toBe(ready);
    });

    it("makes a hold on a running run fast-forward it without halting", () => {
      const { travel } = travelWithTurns(() => ready);
      const world = stranded("beacon");
      at(1000);
      travel.pressTurn(true, world);
      expect(travel.isFast(1250)).toBe(true);
      expect(travel.getSpeed(1250, 4)).toBe(4);
      expect(travel.takeReady(world, drive, 1250)).toBe(ready);
      travel.release(1500);
      expect(travel.autoAllowed(world)).toBe(true);
      expect(travel.getSpeed(1500, 4)).toBe(1);
    });

    it("makes a hold on a halted run resume and fast-forward it", () => {
      const { travel } = travelWithTurns(() => ready);
      const world = stranded("knockedOut");
      travel.stopAuto(world);
      at(1000);
      travel.pressTurn(true, world);
      expect(travel.autoAllowed(world)).toBe(true);
      expect(travel.isFast(1300)).toBe(true);
      travel.release(1600);
      expect(travel.autoAllowed(world)).toBe(true);
      expect(travel.isFast(1600)).toBe(false);
    });

    it.each(["wake", "call", "dead"])("lets a held press end with the run on %s", (end) => {
      const { travel, prepare } = travelWithTurns(() => ready);
      const world = stranded("knockedOut");
      at(1000);
      travel.pressTurn(true, world);
      if (end === "wake") world.player.state = "active";
      if (end === "call") world.player.call = { kind: "radio" } as never;
      if (end === "dead") world.player.state = "dead";
      travel.updateWorld(world, false);
      expect(travel.isFast(2000)).toBe(false);
      expect(travel.shouldAdvance(2000)).toBe(false);
      expect(travel.takeReady(world, drive, 2000)).toBeNull();
      travel.prepareNext(world, playback, 2000);
      expect(prepare).not.toHaveBeenCalled();
    });

    it("keeps a held press through turns while still knocked out, but drops it at the knockout", () => {
      const out = stranded("knockedOut");
      const prepared = (world: unknown) => {
        const live = buildDrive(out);
        const next = captureDrive(live);
        freeDrive(live);
        return { world, result: { frames: {}, next } } as never;
      };
      const awake = makeSafeWorld();
      const keep = travelWithTurns().travel;
      at(1000);
      keep.pressTurn(true, out);
      keep.beginPlayback(out, prepared(out), 1000, 0, {});
      expect(keep.isFast(1300)).toBe(true);
      const drop = travelWithTurns().travel;
      drop.pressTurn(true, out);
      drop.beginPlayback(awake, prepared(out), 1000, 0, {});
      expect(drop.isFast(1300)).toBe(false);
    });
  });
});

describe("nextSightSample", () => {
  it("shows the latest sight sample the playback reached and explores every sample it passed", () => {
    const live = { visible: new Set<number>(), explored: new Uint8Array(10), sight: { steps: [0, 3, 6], tiles: [[1], [2, 3], [4]] }, shown: -1 };
    expect(nextSightSample(live, 0.5)).toBe(0);
    expect(nextSightSample(live, 2)).toBeNull();
    expect(nextSightSample(live, 7)).toBe(2);
    expect([...live.visible]).toEqual([4]);
    expect([...live.explored]).toEqual([0, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
  });
});

describe("the slowdown after a stopped turn", () => {
  const EASE = 350;
  const at = (x: number): VehicleFrame => ({ pos: { x, y: 0, z: 0 }, rot: headingQuat(0), acc: { x: 0, y: 0, z: 0 }, wheels: [{ steer: 0, spin: x, suspension: 0, ground: true }] });
  const pose = { pos: { x: TAIL / PHYSICS.metersPerTile, y: 0 }, heading: 0, speed: 1 };
  const tail: Tail = { frames: { a: Array.from({ length: TAIL }, (_, i) => at(i + 1)) }, next: { snapshot: new Uint8Array() } as DriveSnapshot, poses: { a: pose } };
  const truck = { id: "a", pos: { ...pose.pos }, heading: 0 } as Vehicle;
  const shownX = (creep: Creep, v = truck) => creep.frameOf(v)!.pos.x;
  const creepOf = (overshootMs = 0) => new Creep(tail, { a: at(0) }, EASE, overshootMs);

  it("starts at the pose the turn ended on, or one overshoot later", () => {
    expect(shownX(creepOf())).toBe(0);
    expect(shownX(creepOf(1000 / PHYSICS.stepsPerSecond))).toBeCloseTo(1);
  });

  it("eases forward along the tail from the next frame on, and comes to rest within one step of its end", () => {
    const creep = creepOf();
    const xs = Array.from({ length: 40 }, () => (creep.tick(16, false), shownX(creep)));
    xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(xs[i]));
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeGreaterThan(0.9);
    expect(xs.at(-1)).toBeGreaterThan(TAIL - 1);
    expect(xs.at(-1)).toBeLessThanOrEqual(TAIL);
    expect(creep.isMoving()).toBe(false);
    expect(creep.holdsTurn()).toBe(false);
  });

  it("adds no time while held", () => {
    const creep = creepOf();
    creep.tick(16, false);
    const x = shownX(creep);
    for (let i = 0; i < 10; i++) creep.tick(0, false);
    expect(shownX(creep)).toBe(x);
  });

  it("holds the next turn back until the tail plays out, and speeds up to its end once a turn is wanted", () => {
    const creep = creepOf();
    creep.tick(16, false);
    expect(creep.holdsTurn()).toBe(true);
    for (let i = 0; i < 40; i++) creep.tick(16, true);
    expect(shownX(creep)).toBe(TAIL);
    expect(creep.holdsTurn()).toBe(false);
    expect(creep.isMoving()).toBe(false);
  });

  it("stops showing a truck that a rule moved off its tail end", () => {
    expect(creepOf().frameOf({ ...truck, pos: { x: 0, y: 0 } })).toBeUndefined();
    expect(creepOf().frameOf({ ...truck, id: "b" })).toBeUndefined();
  });

  it("commits the tail end into the world and the drive", () => {
    const world = makeSafeWorld();
    const id = playerVehicle(world).id;
    const playerTail = { ...tail, poses: { [id]: pose } };
    const committed = new Creep(playerTail, {}, EASE, 0).commit(world);
    expect(playerVehicle(committed.world).pos).toEqual(pose.pos);
    expect(committed.drive).toBe(tail.next);
  });

  it("starts only when the turn stopped with a tail", () => {
    const playback = { tail } as Playback;
    const travel = new Travel(250, TAIL);
    expect(travel.creepAfter(playback, makeSafeWorld(), {}, 0, EASE, 0)).toBeInstanceOf(Creep);
    expect(travel.creepAfter({ tail: null } as Playback, makeSafeWorld(), {}, 0, EASE, 0)).toBeNull();
    travel.press(0, false, true);
    expect(travel.creepAfter(playback, makeSafeWorld(), {}, 0, EASE, 0)).toBeNull();
  });

  it("prepares the next turn while the slowdown holds it back", () => {
    const prepare = vi.fn();
    const travel = new Travel(250, TAIL);
    Object.assign(travel, { turns: { prepare, take: () => ({}) } });
    const world = makeSafeWorld();
    travel.request(world, {} as DriveSnapshot);
    expect(travel.takeReady(world, {} as DriveSnapshot, 0, false, true)).toBeNull();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(travel.takeReady(world, {} as DriveSnapshot, 0, false, false)).not.toBeNull();
  });
});
