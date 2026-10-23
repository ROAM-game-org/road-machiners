import { beforeAll, expect, it } from "vitest";
import { addVehicle, emptyWorld } from "../sim/testkit";
import type { MoveOrder, World } from "../sim/types";
import { setMoveOrder } from "../sim/world";
import { buildDrive, captureDrive, freeDrive, initPhysics, syncDrive, type Drive } from "./drive";
import { planTurns } from "./plan";
import { computePreview } from "./turn";

beforeAll(initPhysics);

function withDrive(order: MoveOrder, check: (world: World, drive: Drive) => void): void {
  const world = setMoveOrder(emptyWorld(), order);
  const drive = buildDrive(world);
  try {
    check(world, drive);
  } finally {
    freeDrive(drive);
  }
}

function previewInWorker(world: World, drive: Drive) {
  const { terrain, ...state } = structuredClone(world);
  return computePreview({ world: state, drive: captureDrive(drive), questLanguage: 'en', meId: world.player.vehicleId }, terrain);
}

it.each<MoveOrder>([
  { kind: "stopAt", dest: { x: 38, y: 31 } },
  { kind: "through", dest: { x: 50, y: 20 } },
])("previews the same frames, course and waypoint flag in the worker as on the live drive for a $kind order", (order) => {
  withDrive(order, (world, drive) => {
    const preview = previewInWorker(world, drive);
    expect(preview.turns.length).toBeGreaterThan(0);
    expect(preview.course).not.toBeNull();
    expect(preview).toEqual(planTurns(drive, world, world.player.vehicleId));
  });
});

it("syncs a snapshot taken before a truck left the road, so the worker previews the same as a synced live drive", () => {
  const world = setMoveOrder(emptyWorld(), { kind: "stopAt", dest: { x: 38, y: 31 } });
  const me = world.vehicles.find((v) => v.id === world.player.vehicleId)!;
  const gone = addVehicle(world, "scrapjaw", "buggy", [], { x: (me.pos.x + 38) / 2, y: (me.pos.y + 31) / 2 });
  const drive = buildDrive(world);
  try {
    const stale = captureDrive(drive);
    world.vehicles = world.vehicles.filter((v) => v !== gone);
    syncDrive(drive, world);
    const { terrain, ...state } = structuredClone(world);
    const preview = computePreview({ world: state, drive: stale, questLanguage: 'en', meId: me.id }, terrain);
    expect(preview).toEqual(planTurns(drive, world, me.id));
  } finally {
    freeDrive(drive);
  }
});

it("leaves the world and the drive it previews unchanged", () => {
  withDrive({ kind: "stopAt", dest: { x: 38, y: 31 } }, (world, drive) => {
    const before = structuredClone(world);
    const snapshot = drive.world.takeSnapshot();
    previewInWorker(world, drive);
    planTurns(drive, world, world.player.vehicleId);
    expect(world).toEqual(before);
    expect(drive.world.takeSnapshot()).toEqual(snapshot);
  });
});

it("throws when the player vehicle is missing from the preview world", () => {
  withDrive({ kind: "stopAt", dest: { x: 38, y: 31 } }, (world, drive) => {
    expect(() => planTurns(drive, world, "nobody")).toThrow("Player vehicle nobody missing from the preview world");
  });
});
