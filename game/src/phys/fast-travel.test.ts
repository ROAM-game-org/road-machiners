import { beforeAll, describe, expect, it } from "vitest";
import { playerVehicle } from "../sim/damage";
import { ridesFar } from "../sim/far";
import { getResources } from "../sim/resources";
import { addState } from "../sim/states";
import { addVehicle, emptyWorld } from "../sim/testkit";
import type { World } from "../sim/types";
import { dist } from "../sim/vec";
import { farSightRadius } from "../sim/vision";
import { setMoveOrder } from "../sim/world";
import { buildDrive, captureDrive, freeDrive, initPhysics, type DriveSnapshot } from "./drive";
import { computeTurn, type PreparedTurn } from "./turn";

beforeAll(initPhysics);

const TAIL = 11;
const START = { x: 120, y: 120 };
const DEST = { x: 320, y: 120 };

function travelling(): World {
  return setMoveOrder(emptyWorld(START), { kind: "through", dest: DEST });
}

function playTurn(world: World, drive: DriveSnapshot, fastTravel: boolean): { world: World; prepared: PreparedTurn } {
  const { terrain, ...state } = world;
  const prepared = computeTurn({ world: state, drive, questLanguage: "en", tailSteps: TAIL, fastTravel }, terrain);
  return { world: { ...prepared.world, terrain }, prepared };
}

function freshDrive(world: World): DriveSnapshot {
  const drive = buildDrive(world);
  try {
    return captureDrive(drive);
  } finally {
    freeDrive(drive);
  }
}

function strangerAt(world: World, reach: number): void {
  addVehicle(world, "independent", "scout", ["stockEngine"], { x: START.x, y: START.y + reach });
}

describe("riding far", () => {
  it("rides far with a move order and no other truck within far sight", () => {
    const world = travelling();
    strangerAt(world, farSightRadius(world, playerVehicle(world)) + 1);
    expect(ridesFar(world)).toBe(true);
  });

  it("drives by physics once a truck is within far sight", () => {
    const world = travelling();
    strangerAt(world, farSightRadius(world, playerVehicle(world)) - 1);
    expect(ridesFar(world)).toBe(false);
  });

  it("drives by physics with no order, a brake order or in combat", () => {
    expect(ridesFar(emptyWorld(START))).toBe(false);
    expect(ridesFar(setMoveOrder(emptyWorld(START), { kind: "brake" }))).toBe(false);
    const fighting = travelling();
    const foe = addVehicle(fighting, "scrapjaw", "scout", ["stockEngine"], { x: START.x + 200, y: START.y });
    addState(fighting, "combat", foe.id, playerVehicle(fighting).id, { kind: "none" });
    expect(ridesFar(fighting)).toBe(false);
  });
});

describe("a fast-travel turn", () => {
  it("moves the player by far rules with no body and no tail, and the next physics turn drives on from there", () => {
    let world = travelling();
    let drive = freshDrive(world);
    const far = playTurn(world, drive, true);
    expect(far.prepared.tail).toBeNull();
    expect(far.prepared.result.next.bodies).toEqual({});
    expect(dist(playerVehicle(far.world).pos, START)).toBeGreaterThan(0);
    world = far.world;
    drive = far.prepared.result.next;
    const slow = playTurn(world, drive, false);
    expect(Object.keys(slow.prepared.result.next.bodies)).toContain(playerVehicle(world).id);
    expect(dist(playerVehicle(slow.world).pos, DEST)).toBeLessThan(dist(playerVehicle(world).pos, DEST));
  });

  it("skips the physics world on a far turn that starts with no body, hands back the same snapshot, and physics drives on after it", () => {
    const first = playTurn(travelling(), freshDrive(travelling()), true);
    const drive = first.prepared.result.next;
    expect(drive.bodies).toEqual({});
    const second = playTurn(first.world, drive, true);
    expect(second.prepared.result.next).toBe(drive);
    expect(second.prepared.tail).toBeNull();
    expect(dist(playerVehicle(second.world).pos, playerVehicle(first.world).pos)).toBeGreaterThan(1);
    const third = playTurn(second.world, second.prepared.result.next, false);
    expect(Object.keys(third.prepared.result.next.bodies)).toContain(playerVehicle(second.world).id);
    expect(dist(playerVehicle(third.world).pos, DEST)).toBeLessThan(dist(playerVehicle(second.world).pos, DEST));
  });

  it("plays by physics when the turn is not asked to travel fast", () => {
    const world = travelling();
    const turn = playTurn(world, freshDrive(world), false);
    expect(turn.prepared.tail).not.toBeNull();
    expect(Object.keys(turn.prepared.result.next.bodies)).toContain(playerVehicle(world).id);
  });

  it("burns the same fuel per tile and covers a similar distance per turn as physics travel on the same road", () => {
    const run = (fast: boolean) => {
      let world = travelling();
      let drive = freshDrive(world);
      const fuel = getResources(world, playerVehicle(world)).fuel;
      for (let turn = 0; turn < 12; turn++) {
        const next = playTurn(world, drive, fast);
        world = next.world;
        drive = next.prepared.result.next;
      }
      const me = playerVehicle(world);
      return { moved: dist(me.pos, START), burned: fuel - getResources(world, me).fuel };
    };
    const physics = run(false);
    const far = run(true);
    expect(far.burned / far.moved).toBeCloseTo(physics.burned / physics.moved, 2);
    expect(far.moved / physics.moved).toBeGreaterThan(0.9);
    expect(far.moved / physics.moved).toBeLessThan(1.1);
  });
});
