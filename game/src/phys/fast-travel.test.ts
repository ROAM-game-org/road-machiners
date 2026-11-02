import { beforeAll, describe, expect, it } from "vitest";
import { playerVehicle } from "../sim/damage";
import { addVehicle, emptyWorld } from "../sim/testkit";
import type { World } from "../sim/types";
import { dist } from "../sim/vec";
import { farSightRadius, visibleTiles } from "../sim/vision";
import { setMoveOrder } from "../sim/world";
import { buildDrive, captureDrive, freeDrive, initPhysics, type DriveSnapshot } from "./drive";
import { toMap } from "./frames";
import { computeTurn, LIVE_SIGHT_STEP, type PreparedTurn } from "./turn";

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

describe("a fast-travel turn", () => {
  it("drives the player and a truck just past far sight with physics and a tail", () => {
    const world = travelling();
    strangerAt(world, farSightRadius(world, playerVehicle(world)) + 5);
    const stranger = world.vehicles.at(-1)!;
    stranger.order = { kind: "through", dest: { x: stranger.pos.x + 30, y: stranger.pos.y } };
    const turn = playTurn(world, freshDrive(world), true);
    expect(Object.keys(turn.prepared.result.next.bodies).sort()).toEqual([playerVehicle(world).id, stranger.id].sort());
    expect(turn.prepared.tail).not.toBeNull();
    expect(dist(playerVehicle(turn.world).pos, DEST)).toBeLessThan(dist(START, DEST));
  });

  it.each([true, false])("samples sight along the drive every sight step and at its end, and explores every sampled tile, with fast travel %s", (fast) => {
    const first = playTurn(travelling(), freshDrive(travelling()), fast);
    const second = playTurn(first.world, first.prepared.result.next, fast);
    const frames = second.prepared.result.frames[playerVehicle(second.world).id];
    const { steps, tiles } = second.prepared.sight;
    const at = (k: number) => toMap(frames[k].pos);
    expect(steps[0]).toBe(0);
    expect(steps.at(-1)).toBe(frames.length - 1);
    for (let i = 1; i < steps.length - 1; i++) expect(dist(at(steps[i - 1]), at(steps[i]))).toBeGreaterThanOrEqual(LIVE_SIGHT_STEP);
    expect(steps.length).toBeGreaterThan(5);
    tiles.forEach((seen, i) => expect(seen).toEqual([...visibleTiles(second.world, at(steps[i]))].sort((a, b) => a - b)));
    expect(tiles.flat().every((idx) => second.world.player.explored[idx] === 1)).toBe(true);
  });

  it("plays by physics when the turn is not asked to travel fast", () => {
    const world = travelling();
    const turn = playTurn(world, freshDrive(world), false);
    expect(turn.prepared.tail).not.toBeNull();
    expect(Object.keys(turn.prepared.result.next.bodies)).toContain(playerVehicle(world).id);
  });
});
