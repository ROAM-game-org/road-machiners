import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  buildDrive,
  captureDrive,
  freeDrive,
  initPhysics,
  type Drive,
} from "../phys/drive";
import type { PreparedTurn, TurnRequest, TurnResponse } from "../phys/turn";
import { computeTurn } from "../phys/turn";
import { restoreDrive } from "../phys/drive";
import { emptyWorld } from "../sim/testkit";
import { setMoveOrder } from "../sim/world";
import type { World } from "../sim/types";
import { reportError } from "./crash";
import { TurnPreparation } from "./travel";
import { workerFailure } from "./worker-load";

vi.mock("./crash", () => ({ reportError: vi.fn() }));

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
let drive: Drive;
let reply: PreparedTurn;
beforeAll(initPhysics);
beforeEach(() => {
  TestWorker.created = 0;
  vi.mocked(reportError).mockClear();
  vi.stubGlobal("Worker", TestWorker);
  world = emptyWorld();
  drive = buildDrive(world);
  const { terrain: _terrain, ...state } = world;
  reply = {
    world: state,
    result: { next: captureDrive(drive), frames: {}, crashes: [], breaks: [], landings: [], tears: [], results: {} },
  };
});
afterEach(() => {
  vi.useRealTimers();
  freeDrive(drive);
  vi.unstubAllGlobals();
});

it("prepares once and exposes a result only when ready for the same world", () => {
  const turns = new TurnPreparation();
  turns.prepare(world, drive);
  turns.prepare(world, drive);
  expect(turns.take(world)).toBeNull();
  const worker = TestWorker.latest;
  expect(worker?.requests).toHaveLength(1);
  worker.respond({ id: worker.requests[0].id, turn: reply, perf: {} });
  expect(turns.take(world)).toBe(reply);
  expect(turns.take(world)).toBeNull();
});

it("discards a stale result after replanning and sends stable terrain only once", () => {
  const turns = new TurnPreparation();
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
  worker.respond({ id: worker.requests[0].id, turn: reply, perf: {} });
  expect(turns.take(changed)).toBeNull();
  worker.respond({ id: worker.requests[1].id, turn: reply, perf: {} });
  expect(turns.take(world)).toBeNull();
  expect(turns.take(changed)).toBe(reply);
});

it("throws a calculation failure once, then prepares again", () => {
  const turns = new TurnPreparation();
  turns.prepare(world, drive);
  const worker = TestWorker.latest;
  worker.respond({ id: worker.requests[0].id, error: "physics failed" });
  expect(() => turns.take(world)).toThrow("physics failed");
  expect(turns.take(world)).toBeNull();
  turns.prepare(world, drive);
  expect(worker.requests).toHaveLength(2);
});

it("fails the pending turn on a worker error event", () => {
  const turns = new TurnPreparation();
  turns.prepare(world, drive);
  TestWorker.latest.onerror?.({ message: "boom", preventDefault() {} } as ErrorEvent);
  expect(() => turns.take(world)).toThrow("Turn worker failed: boom");
});

const changedWorld = (): World => setMoveOrder(world, { kind: "stopAt", dest: { x: 38, y: 31 } });
const noScript = { preventDefault() {} } as ErrorEvent;

it("restarts a worker whose script did not load and sends the pending turn again", () => {
  vi.useFakeTimers();
  const turns = new TurnPreparation();
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
  second.respond({ id: second.requests[0].id, turn: reply, perf: {} });
  expect(turns.take(world)).toBe(reply);
});

it("does not report a warm-up that did not load and reaches a new worker on the next turn", () => {
  vi.useFakeTimers();
  const turns = new TurnPreparation();
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
  const turns = new TurnPreparation();
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
  const turns = new TurnPreparation();
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
  worker.respond({ id: worker.requests[0].id, turn: reply, perf: {} });
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
  const turns = new TurnPreparation();
  turns.warm(world, drive);
  const worker = TestWorker.latest;
  turns.prepare(world, drive);
  worker.respond({ id: worker.requests[0].id, error: "warm failed" });
  expect(turns.take(world)).toBeNull();
  expect(reportError).toHaveBeenCalledOnce();
});

it("posts a copy of a snapshot in hand and leaves that snapshot attached", () => {
  const turns = new TurnPreparation();
  const saved = captureDrive(drive);
  const bytes = saved.snapshot.slice();
  const spy = vi.spyOn(drive.world, "takeSnapshot");
  turns.prepareFrom(world, saved);
  const posted = TestWorker.latest.requests[0].drive;
  expect(Buffer.from(posted.snapshot).equals(Buffer.from(bytes))).toBe(true);
  expect(saved.snapshot.byteLength).toBe(bytes.byteLength);
  expect(spy).not.toHaveBeenCalled();
}, 90_000);

it("prepares from a snapshot once per world", () => {
  const turns = new TurnPreparation();
  const saved = captureDrive(drive);
  turns.prepareFrom(world, saved);
  turns.prepareFrom(world, saved);
  turns.prepare(world, drive);
  expect(TestWorker.latest.requests).toHaveLength(1);
});

it("steps a turn the same from the worker's bytes as from a restored and re-captured world", () => {
  const moving = setMoveOrder(world, { kind: "stopAt", dest: { x: 38, y: 31 } });
  const { terrain, ...state } = moving;
  const first = captureDrive(drive);
  const restored = restoreDrive(first);
  const again = captureDrive(restored);
  const a = computeTurn({ world: state, drive: first }, terrain);
  const b = computeTurn({ world: state, drive: again }, terrain);
  restored.world.free();
  const last = (t: typeof a) => t.world.vehicles.find((v) => v.id === world.player.vehicleId)!;
  expect(last(b).pos).toEqual(last(a).pos);
  expect(last(b).speed).toEqual(last(a).speed);
});
