import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  captureDrive,
  initPhysics,
  restoreDrive,
  type DriveSnapshot,
} from "../phys/drive";
import type { PreparedTurn, TurnRequest, TurnResponse } from "../phys/turn";
import { computeTurn, driveSnapshotOf } from "../phys/turn";
import { emptyWorld } from "../sim/testkit";
import { setMoveOrder } from "../sim/world";
import { currentQuestLanguage, setQuestLanguage } from "../sim/quests";
import type { World } from "../sim/types";
import { reportError } from "./crash";
import { TurnPreparation } from "./travel";
import { workerFailure } from "./worker-load";

vi.mock("./crash", () => ({ reportError: vi.fn() }));

const TAIL = 11;

class TestWorker {
  static latest: TestWorker;
  static created = 0;
  requests: TurnRequest[] = [];
  onmessage: ((event: MessageEvent<TurnResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor() {
    TestWorker.latest = this;
    TestWorker.created++;
  }
  postMessage(request: TurnRequest): void {
    this.requests.push(request);
  }
  terminate(): void {}
  respond(response: TurnResponse): void {
    if (!this.onmessage) throw new Error("Missing worker response handler");
    this.onmessage({ data: response } as MessageEvent<TurnResponse>);
  }
}

let world: World;
let drive: DriveSnapshot;
let reply: PreparedTurn;
beforeAll(initPhysics);
beforeEach(() => {
  TestWorker.created = 0;
  vi.mocked(reportError).mockClear();
  vi.stubGlobal("Worker", TestWorker);
  world = emptyWorld();
  drive = driveSnapshotOf(world);
  const { terrain: _terrain, ...state } = world;
  reply = {
    world: state,
    result: { next: drive, frames: {}, crashes: [], breaks: [], landings: [], tears: [], results: {} },
    sight: { steps: [], tiles: [] },
    tail: null,
  };
});
afterEach(() => {
  setQuestLanguage("en");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("prepares once and exposes a result only when ready for the same world", () => {
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  turns.prepare(world, drive);
  expect(turns.take(world)).toBeNull();
  const worker = TestWorker.latest;
  expect(worker?.requests).toHaveLength(1);
  expect(worker.requests[0].tailSteps).toBe(TAIL);
  worker.respond({ id: worker.requests[0].id, turn: reply, obstacles: null, perf: {} });
  expect(turns.take(world)).toEqual(reply);
  expect(turns.take(world)).toBeNull();
});

it("posts every turn request in the current quest language", () => {
  setQuestLanguage("ru");
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  expect(TestWorker.latest.requests[0].questLanguage).toBe(currentQuestLanguage());
  expect(TestWorker.latest.requests[0].questLanguage).toBe("ru");
});

it("computes a prepared turn again after a language switch", () => {
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  const worker = TestWorker.latest;
  setQuestLanguage("ru");
  worker.respond({ id: worker.requests[0].id, turn: reply, obstacles: null, perf: {} });
  expect(turns.take(world)).toBeNull();
  turns.prepare(world, drive);
  expect(worker.requests).toHaveLength(2);
  expect(worker.requests[1].questLanguage).toBe("ru");
  worker.respond({ id: worker.requests[1].id, turn: reply, obstacles: null, perf: {} });
  expect(turns.take(world)).toEqual(reply);
});

it("discards a stale result after replanning and sends stable terrain only once", () => {
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  const changed = setMoveOrder(world, {
    kind: "stopAt",
    dest: { x: 38, y: 31 },
  });
  turns.prepare(changed, drive);
  const worker = TestWorker.latest;
  expect(worker?.requests).toHaveLength(2);
  expect(worker.requests[0].terrain).toBe(world.terrain);
  expect(worker.requests[1].terrain).toBeNull();
  worker.respond({ id: worker.requests[0].id, turn: reply, obstacles: null, perf: {} });
  expect(turns.take(changed)).toBeNull();
  worker.respond({ id: worker.requests[1].id, turn: reply, obstacles: null, perf: {} });
  expect(turns.take(world)).toBeNull();
  expect(turns.take(changed)).toEqual(reply);
});

it("throws a calculation failure once, then prepares again", () => {
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  const worker = TestWorker.latest;
  worker.respond({ id: worker.requests[0].id, error: "physics failed" });
  expect(() => turns.take(world)).toThrow("physics failed");
  expect(turns.take(world)).toBeNull();
  turns.prepare(world, drive);
  expect(worker.requests).toHaveLength(2);
});

it("fails the pending turn on a worker error event", () => {
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  TestWorker.latest.onerror?.({ message: "boom", preventDefault() {} } as ErrorEvent);
  expect(() => turns.take(world)).toThrow("Turn worker failed: boom");
});

const changedWorld = (): World => setMoveOrder(world, { kind: "stopAt", dest: { x: 38, y: 31 } });
const noScript = { preventDefault() {} } as ErrorEvent;

it("restarts a worker whose script did not load and sends the pending turn again", () => {
  vi.useFakeTimers();
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  const first = TestWorker.latest;
  first.onerror?.(noScript);
  expect(reportError).not.toHaveBeenCalled();
  expect(turns.take(world)).toBeNull();
  vi.advanceTimersByTime(500);
  const second = TestWorker.latest;
  expect(second).not.toBe(first);
  expect(second.requests).toHaveLength(1);
  expect(second.requests[0].terrain).toBe(world.terrain);
  expect(second.requests[0].drive.snapshot.byteLength).toBeGreaterThan(0);
  second.respond({ id: second.requests[0].id, turn: reply, obstacles: null, perf: {} });
  expect(turns.take(world)).toEqual(reply);
});

it("does not report a warm-up that did not load and reaches a new worker on the next turn", () => {
  vi.useFakeTimers();
  const turns = new TurnPreparation(TAIL);
  turns.warm(world, drive);
  TestWorker.latest.onerror?.(noScript);
  turns.prepare(world, drive);
  expect(TestWorker.created).toBe(1);
  vi.advanceTimersByTime(500);
  expect(TestWorker.created).toBe(2);
  expect(TestWorker.latest.requests).toHaveLength(1);
  expect(reportError).not.toHaveBeenCalled();
});

it("gives up after the download tries with one download failure and posts nothing more", () => {
  vi.useFakeTimers();
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  for (let i = 0; i < 6; i++) {
    TestWorker.latest.onerror?.(noScript);
    vi.advanceTimersByTime(4000);
  }
  expect(reportError).toHaveBeenCalledOnce();
  const error = vi.mocked(reportError).mock.calls[0][0] as Error;
  expect(error.name).toBe("DownloadFailed");
  expect(error.message).toContain("turn worker");
  expect(TestWorker.created).toBe(6);
  turns.prepare(changedWorld(), drive);
  expect(TestWorker.created).toBe(6);
  expect(TestWorker.latest.requests).toHaveLength(1);
});

it("waits the download back-off between restarts and resets the count on an answer", () => {
  vi.useFakeTimers();
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  TestWorker.latest.onerror?.(noScript);
  vi.advanceTimersByTime(499);
  expect(TestWorker.created).toBe(1);
  vi.advanceTimersByTime(1);
  expect(TestWorker.created).toBe(2);
  TestWorker.latest.onerror?.(noScript);
  vi.advanceTimersByTime(999);
  expect(TestWorker.created).toBe(2);
  vi.advanceTimersByTime(1);
  expect(TestWorker.created).toBe(3);
  const worker = TestWorker.latest;
  worker.respond({ id: worker.requests[0].id, turn: reply, obstacles: null, perf: {} });
  turns.take(world);
  turns.prepare(changedWorld(), drive);
  worker.onerror?.(noScript);
  vi.advanceTimersByTime(500);
  expect(TestWorker.created).toBe(4);
});

it("adds the script location to a worker load failure", () => {
  const event = { message: "", filename: "turn.js", lineno: 3 } as ErrorEvent;
  expect(workerFailure("Turn worker", event)).toBe("Turn worker failed: script did not load or start (turn.js:3)");
});

it("does not fail the pending turn when the warm-up fails", () => {
  const turns = new TurnPreparation(TAIL);
  turns.warm(world, drive);
  const worker = TestWorker.latest;
  turns.prepare(world, drive);
  worker.respond({ id: worker.requests[0].id, error: "warm failed" });
  expect(turns.take(world)).toBeNull();
  expect(reportError).toHaveBeenCalledOnce();
});

it("posts a copy of the snapshot in hand, so moving the posted bytes leaves it whole", () => {
  const turns = new TurnPreparation(TAIL);
  const bytes = drive.snapshot.slice();
  turns.prepare(world, drive);
  const posted = TestWorker.latest.requests[0].drive;
  expect(posted.snapshot.buffer).not.toBe(drive.snapshot.buffer);
  expect(Buffer.from(posted.snapshot).equals(Buffer.from(bytes))).toBe(true);
}, 90_000);

it("prepares from a snapshot once per world", () => {
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  turns.prepare(world, drive);
  expect(TestWorker.latest.requests).toHaveLength(1);
});

it("steps a turn the same from the worker's bytes as from a restored and re-captured world", () => {
  const moving = setMoveOrder(world, { kind: "stopAt", dest: { x: 38, y: 31 } });
  const { terrain, ...state } = moving;
  const first = drive;
  const restored = restoreDrive(first);
  const again = captureDrive(restored);
  const a = computeTurn({ world: state, drive: first, questLanguage: 'en', tailSteps: TAIL }, terrain);
  const b = computeTurn({ world: state, drive: again, questLanguage: 'en', tailSteps: TAIL }, terrain);
  restored.world.free();
  const last = (t: typeof a) => t.world.vehicles.find((v) => v.id === world.player.vehicleId)!;
  expect(last(b).pos).toEqual(last(a).pos);
  expect(last(b).speed).toEqual(last(a).speed);
});

it("tells the worker the language quests play in", () => {
  setQuestLanguage("ru");
  try {
    new TurnPreparation(TAIL).prepare(world, drive);
    expect(TestWorker.latest.requests[0].questLanguage).toBe("ru");
  } finally {
    setQuestLanguage("en");
  }
});

it("keeps the posted world's obstacle list when the worker reports no change, and takes a changed list", () => {
  const turns = new TurnPreparation(TAIL);
  turns.prepare(world, drive);
  const worker = TestWorker.latest;
  worker.respond({ id: worker.requests[0].id, turn: reply, obstacles: null, perf: {} });
  expect(turns.take(world)?.world.obstacles).toBe(world.obstacles);
  const moved = setMoveOrder(world, { kind: "stopAt", dest: { x: 38, y: 31 } });
  turns.prepare(moved, drive);
  const fresh = [...world.obstacles];
  worker.respond({ id: worker.requests[1].id, turn: reply, obstacles: fresh, perf: {} });
  expect(turns.take(moved)?.world.obstacles).toBe(fresh);
});
