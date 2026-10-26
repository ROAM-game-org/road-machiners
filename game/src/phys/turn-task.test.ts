import { beforeAll, expect, it } from "vitest";
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
  type Drive,
  type TurnResult,
} from "./drive";
import { computeTurn, isCleanTail, liveSightOf, physicsMove, SentObstacles, withTail } from "./turn";
import { toMap, type VehicleFrame } from "./frames";
import { PHYSICS } from "../data/physics";
import { visibleTiles } from "../sim/vision";

beforeAll(initPhysics);

const TAIL = 11;

it("restores frozen terrain after worker transfer so turn clones retain the route cache", () => {
  const world = emptyWorld();
  const drive = buildDrive(world);
  const { terrain, ...state } = structuredClone(world);
  expect(Object.isFrozen(terrain)).toBe(false);
  try {
    computeTurn({ world: state, drive: captureDrive(drive), questLanguage: 'en', tailSteps: TAIL, fastTravel: false }, terrain);
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
      { world: state, drive: captureDrive(drive), questLanguage: 'en', tailSteps: TAIL, fastTravel: false },
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
      { world: prepared.world, drive: captureDrive(restored), questLanguage: 'en', tailSteps: TAIL, fastTravel: false },
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

it("continues a driving truck past the turn end in a clean tail, and the next turn starts where the tail ends", () => {
  const world = setMoveOrder(emptyWorld(), { kind: "stopAt", dest: { x: 60, y: 31 } });
  const drive = buildDrive(world);
  const { terrain, ...state } = world;
  try {
    const turn = computeTurn({ world: state, drive: captureDrive(drive), questLanguage: 'en', tailSteps: TAIL, fastTravel: false }, terrain);
    const id = turn.world.player.vehicleId;
    const tail = turn.tail!;
    expect(tail.frames[id]).toHaveLength(TAIL);
    const end = turn.result.frames[id].at(-1)!;
    const last = tail.frames[id].at(-1)!;
    expect(last.pos.x).toBeGreaterThan(end.pos.x);
    expect(tail.poses[id].pos.x * PHYSICS.metersPerTile).toBeCloseTo(last.pos.x, 3);
    const after = withTail(turn.world, tail.poses);
    expect(after.vehicles.find((v) => v.id === id)!.pos).toEqual(tail.poses[id].pos);
    expect(after.events).toBe(turn.world.events);
    const next = computeTurn({ world: after, drive: tail.next, questLanguage: 'en', tailSteps: TAIL, fastTravel: false }, terrain);
    const first = next.result.frames[id][0];
    const step = last.pos.x - tail.frames[id].at(-2)!.pos.x;
    expect(first.pos.x - last.pos.x).toBeGreaterThan(0);
    expect(first.pos.x - last.pos.x).toBeLessThan(step * 1.5);
  } finally {
    freeDrive(drive);
  }
}, 90_000);

it("rejects a tail with a crash, a passed order point or a rope", () => {
  const world = emptyWorld();
  const id = playerVehicle(world).id;
  const clean = { next: null, frames: {}, crashes: [], breaks: [], landings: [], tears: [], results: { [id]: { passed: false, arrived: true, pushedSteps: 0 } } } as unknown as TurnResult;
  expect(isCleanTail(world, clean)).toBe(true);
  expect(isCleanTail(world, { ...clean, crashes: [{ a: id, b: "ground", impact: 1, step: 2 }] } as unknown as TurnResult)).toBe(false);
  expect(isCleanTail(world, { ...clean, results: { [id]: { passed: true, arrived: false, pushedSteps: 0 } } })).toBe(false);
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
    const prepared = computeTurn({ world: state, drive: captureDrive(drive), questLanguage, tailSteps: TAIL, fastTravel: false }, terrain);
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
    expect(() => computeTurn({ world: state, drive: captureDrive(drive), questLanguage: "de" as "en", tailSteps: TAIL, fastTravel: false }, terrain)).toThrow("Turn task has no quest language de");
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
