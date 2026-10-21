import { beforeAll, expect, it } from "vitest";
import type { Obstacle } from "../sim/types";
import { startKit } from "../data/start";
import { playerVehicle } from "../sim/damage";
import { corePart } from "../sim/grid";
import { currentQuestLanguage, inQuestLanguage, setQuestLanguage } from "../sim/quests";
import { defaultSetup } from "../sim/settings";
import { addVehicle, emptyWorld } from "../sim/testkit";
import { TEST_MAP } from "../test/map";
import { endTurn, newWorld, setMoveOrder } from "../sim/world";
import {
  buildDrive,
  captureDrive,
  freeDrive,
  initPhysics,
  restoreDrive,
  syncDrive,
  type Drive,
} from "./drive";
import { computeTurn, liveSightOf, physicsMove, SentObstacles } from "./turn";
import { toMap, type VehicleFrame } from "./frames";
import { PHYSICS } from "../data/physics";
import { visibleTiles } from "../sim/vision";

beforeAll(initPhysics);

it("restores frozen terrain after worker transfer so turn clones retain the route cache", () => {
  const world = emptyWorld();
  const drive = buildDrive(world);
  const { terrain, ...state } = structuredClone(world);
  expect(Object.isFrozen(terrain)).toBe(false);
  try {
    computeTurn({ world: state, drive: captureDrive(drive), questLanguage: 'en' }, terrain);
    expect(Object.isFrozen(terrain)).toBe(true);
    expect(Object.isFrozen(terrain.heights)).toBe(true);
    expect(Object.isFrozen(terrain.types)).toBe(true);
  } finally {
    freeDrive(drive);
  }
});

it("computes the same world and physics as a foreground turn without advancing the input", () => {
  const world = setMoveOrder(emptyWorld(), {
    kind: "stopAt",
    dest: { x: 38, y: 31 },
  });
  const original = structuredClone(world);
  const drive = buildDrive(world);
  let expectedDrive: Drive | null = null;
  let restored: Drive | null = null;
  try {
    const { terrain, ...state } = world;
    const prepared = computeTurn(
      { world: state, drive: captureDrive(drive), questLanguage: 'en' },
      terrain,
    );
    const expected = endTurn(
      world,
      physicsMove(drive, (result) => {
        expectedDrive = result.next;
      }),
    );
    expect({ ...prepared.world, terrain }).toEqual(expected);
    expect(world).toEqual(original);
    restored = restoreDrive(prepared.result.next);
    const nextPrepared = computeTurn(
      { world: prepared.world, drive: captureDrive(restored), questLanguage: 'en' },
      terrain,
    );
    const nextExpected = endTurn(
      expected,
      physicsMove(restored, (result) => freeDrive(result.next)),
    );
    expect({ ...nextPrepared.world, terrain }).toEqual(nextExpected);
  } finally {
    freeDrive(drive);
    if (expectedDrive) freeDrive(expectedDrive);
    if (restored) freeDrive(restored);
  }
}, 90_000);

function handoff(rockStays: boolean) {
  const world = setMoveOrder(emptyWorld(), { kind: "stopAt", dest: { x: 38, y: 31 } });
  const drive = buildDrive(world);
  const { terrain, ...state } = world;
  const first = computeTurn({ world: state, drive: captureDrive(drive), questLanguage: 'en' }, terrain);
  freeDrive(drive);
  const next = first.result.next;
  const pristine = structuredClone(next);
  const at = world.vehicles[0].pos;
  const rock: Obstacle = { id: "rock1", kind: "landmark", look: "shack", pos: { x: at.x + 3, y: at.y }, r: 0.9, yaw: 0 };
  const main = restoreDrive(next);
  try {
    syncDrive(main, { ...first.world, terrain, obstacles: [rock] });
  } finally {
    freeDrive(main);
  }
  const later = { ...first.world, obstacles: rockStays ? [rock] : [] };
  return { next, pristine, later, terrain };
}

it("a main-thread sync of the restored drive leaves the playback snapshot unchanged", () => {
  const { next, pristine } = handoff(false);
  expect(next.obstacles).toEqual(pristine.obstacles);
  expect(next.bodies).toEqual(pristine.bodies);
  expect(next.memory).toEqual(pristine.memory);
});

it.each([false, true])("a turn from the playback snapshot after a main-thread sync matches one from a copy taken before it (rock stays: %s)", (stays) => {
  const { next, pristine, later, terrain } = handoff(stays);
  const actual = computeTurn({ world: later, drive: next, questLanguage: 'en' }, terrain);
  const expected = computeTurn({ world: structuredClone(later), drive: pristine, questLanguage: 'en' }, terrain);
  expect(actual.world).toEqual(expected.world);
  expect(actual.result.next.obstacles).toEqual(expected.result.next.obstacles);
});

function fallingWorld() {
  const world = newWorld(1337, startKit("standard"), TEST_MAP, defaultSetup("roaming"));
  const me = playerVehicle(world);
  const raider = addVehicle(world, "scrapjaw", "buggy", [], { x: me.pos.x + 6, y: me.pos.y });
  me.lastHitBy = raider.id;
  corePart(me, "cab").hp = 0;
  return world;
}

function openedIn(questLanguage: "en" | "ru") {
  const { terrain, ...state } = fallingWorld();
  const drive = buildDrive({ ...state, terrain });
  try {
    setQuestLanguage(questLanguage === "ru" ? "en" : "ru");
    const prepared = computeTurn({ world: state, drive: captureDrive(drive), questLanguage }, terrain);
    return prepared.world.player.quests.live;
  } finally {
    freeDrive(drive);
    setQuestLanguage("en");
  }
}

it("opens the first fall in the language the task names, whatever the worker last held", () => {
  const russian = openedIn("ru");
  const english = openedIn("en");
  expect(russian?.lang).toBe("ru");
  expect(english?.lang).toBe("en");
  expect(JSON.stringify(russian?.lines)).toMatch(/[а-яё]/i);
  expect(JSON.stringify(english?.lines)).not.toMatch(/[а-яё]/i);
});

it("refuses a task with an unknown quest language", () => {
  const { terrain, ...state } = fallingWorld();
  const drive = buildDrive({ ...state, terrain });
  try {
    expect(() => computeTurn({ world: state, drive: captureDrive(drive), questLanguage: "de" as "en" }, terrain)).toThrow("Turn task has no quest language de");
  } finally {
    freeDrive(drive);
  }
});

it("restores the quest language when the run throws", () => {
  setQuestLanguage("en");
  expect(() => inQuestLanguage("ru", () => { throw new Error("boom"); })).toThrow("boom");
  expect(currentQuestLanguage()).toBe("en");
});

it("samples live sight along the player's frames every sight step, with the tiles vision gives there", () => {
  const world = newWorld(7, startKit("standard"), TEST_MAP, defaultSetup("roaming"));
  const me = playerVehicle(world);
  const S = PHYSICS.metersPerTile;
  const frames = Array.from({ length: 12 }, (_, i) => ({ pos: { x: (me.pos.x + i * 0.1) * S, y: 0, z: me.pos.y * S } }) as VehicleFrame);
  const sight = liveSightOf(world, frames);
  expect(sight.steps).toEqual([0, 4, 8]);
  sight.steps.forEach((step, k) => expect(sight.tiles[k]).toEqual([...visibleTiles(world, toMap(frames[step].pos))].sort((a, b) => a - b)));
  expect(liveSightOf(world, undefined)).toEqual({ steps: [], tiles: [] });
});

it("sends the obstacles to a worker only when their content changed since the last send", () => {
  const sent = new SentObstacles();
  const { terrain: _terrain, ...state } = newWorld(7, startKit("standard"), TEST_MAP, defaultSetup("roaming"));
  expect(sent.split(state).obstacles).toBe(state.obstacles);
  const copy = structuredClone(state);
  const again = sent.split(copy);
  expect(again.obstacles).toBeNull();
  expect("obstacles" in again.world).toBe(false);
  copy.obstacles[0] = { ...copy.obstacles[0], r: copy.obstacles[0].r + 1 };
  expect(sent.split(copy).obstacles).toBe(copy.obstacles);
  sent.forget();
  expect(sent.split(copy).obstacles).toBe(copy.obstacles);
});
