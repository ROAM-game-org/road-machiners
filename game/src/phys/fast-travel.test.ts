import { beforeAll, describe, expect, it } from "vitest";
import { playerVehicle } from "../sim/damage";
import { ridesFar } from "../sim/far";
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
  it("drives the player and a truck just past far sight with physics and a tail", () => {
    const world = travelling();
    strangerAt(world, farSightRadius(world, playerVehicle(world)) + 5);
    const stranger = world.vehicles.at(-1)!;
    stranger.order = { kind: "through", dest: { x: stranger.pos.x + 30, y: stranger.pos.y } };
    expect(ridesFar(world)).toBe(true);
    const turn = playTurn(world, freshDrive(world), true);
    expect(Object.keys(turn.prepared.result.next.bodies).sort()).toEqual([playerVehicle(world).id, stranger.id].sort());
    expect(turn.prepared.tail).not.toBeNull();
    expect(dist(playerVehicle(turn.world).pos, DEST)).toBeLessThan(dist(START, DEST));
  });

  it("shows sight once, at the end of a fast-travel turn with no other truck in far sight, as the tiles the player sees there and has explored", () => {
    const first = playTurn(travelling(), freshDrive(travelling()), true);
    const second = playTurn(first.world, first.prepared.result.next, true);
    const frames = second.prepared.result.frames[playerVehicle(second.world).id];
    expect(second.prepared.sight.steps).toEqual([frames.length - 1]);
    expect(second.prepared.sight.tiles).toEqual([second.world.player.visible]);
    expect(second.world.player.visible.every((idx) => second.world.player.explored[idx] === 1)).toBe(true);
  });

  it("plays by physics when the turn is not asked to travel fast", () => {
    const world = travelling();
    const turn = playTurn(world, freshDrive(world), false);
    expect(turn.prepared.tail).not.toBeNull();
    expect(Object.keys(turn.prepared.result.next.bodies)).toContain(playerVehicle(world).id);
  });
});
