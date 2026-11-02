import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { initPhysics, type DriveSnapshot } from "../phys/drive";
import { driveSnapshotOf } from "../phys/turn";
import type { PlanFrames } from "../phys/plan";
import type { PreviewRequest, PreviewResponse } from "../phys/turn";
import { perfSnapshot, resetPerf } from "../perf";
import { emptyWorld } from "../sim/testkit";
import type { World } from "../sim/types";
import { setMoveOrder } from "../sim/world";
import { reportError } from "./crash";
import { PAL } from "../render/palette";
import { firstTurnColor, PlanPreparation, throttleColor } from "./plan-preview";

vi.mock("./crash", () => ({ reportError: vi.fn() }));

class TestWorker {
  static latest: TestWorker;
  static created = 0;
  requests: PreviewRequest[] = [];
  transfers: Transferable[][] = [];
  onmessage: ((event: MessageEvent<PreviewResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor() {
    TestWorker.latest = this;
    TestWorker.created++;
  }
  postMessage(request: PreviewRequest, transfer: Transferable[]): void {
    this.requests.push(request);
    this.transfers.push(transfer);
  }
  terminate(): void {}
  respond(response: PreviewResponse): void {
    if (!this.onmessage) throw new Error("Missing worker response handler");
    this.onmessage({ data: response } as MessageEvent<PreviewResponse>);
  }
  answer(index: number, preview: PlanFrames): void {
    this.respond({ id: this.requests[index].id, preview, perf: {} });
  }
}

const plan = (waypoint: boolean): PlanFrames => ({ turns: [[]], course: null, waypoint });

let world: World;
let drive: DriveSnapshot;
beforeAll(initPhysics);
beforeEach(() => {
  vi.stubGlobal("Worker", TestWorker);
  vi.mocked(reportError).mockClear();
  resetPerf();
  TestWorker.created = 0;
  world = emptyWorld();
  drive = driveSnapshotOf(world);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function moved(): World {
  return setMoveOrder(world, { kind: "stopAt", dest: { x: 38, y: 31 } });
}

it("asks for a preview of the player's truck and hands the answer over once for the same world", () => {
  const plans = new PlanPreparation();
  plans.request(world, drive, world.player.vehicleId);
  const worker = TestWorker.latest;
  expect(worker.requests).toHaveLength(1);
  expect(worker.requests[0]).toMatchObject({ kind: "preview", meId: world.player.vehicleId });
  expect(plans.take(world)).toBeNull();
  const answer = plan(true);
  worker.answer(0, answer);
  expect(plans.take(world)).toBe(answer);
  expect(plans.take(world)).toBeNull();
});

it("sends the terrain only with the first request", () => {
  const plans = new PlanPreparation();
  plans.request(world, drive, world.player.vehicleId);
  const worker = TestWorker.latest;
  worker.answer(0, plan(true));
  plans.request(moved(), drive, world.player.vehicleId);
  expect(worker.requests[0].terrain).toBe(world.terrain);
  expect(worker.requests[1].terrain).toBeNull();
  expect("terrain" in worker.requests[0].world).toBe(false);
});

it("drops an answer for a world the game has moved on from", () => {
  const plans = new PlanPreparation();
  plans.request(world, drive, world.player.vehicleId);
  TestWorker.latest.answer(0, plan(true));
  expect(plans.take(moved())).toBeNull();
  expect(plans.take(world)).not.toBeNull();
});

it("posts only the newest of the requests made while a preview is running, and drops the superseded answer", () => {
  const plans = new PlanPreparation();
  const changed = moved();
  const last = setMoveOrder(world, { kind: "stopAt", dest: { x: 20, y: 20 } });
  plans.request(world, drive, world.player.vehicleId);
  plans.request(changed, drive, world.player.vehicleId);
  plans.request(last, drive, world.player.vehicleId);
  const worker = TestWorker.latest;
  expect(worker.requests).toHaveLength(1);
  worker.answer(0, plan(true));
  expect(plans.take(world)).toBeNull();
  expect(worker.requests).toHaveLength(2);
  expect(worker.requests[1].world.vehicles).toEqual(last.vehicles);
  const answer = plan(false);
  worker.answer(1, answer);
  expect(plans.take(changed)).toBeNull();
  expect(plans.take(last)).toBe(answer);
});

it("merges the worker's perf counters", () => {
  const plans = new PlanPreparation();
  plans.request(world, drive, world.player.vehicleId);
  const worker = TestWorker.latest;
  worker.respond({ id: worker.requests[0].id, preview: plan(true), perf: { preview: { last: 7, max: 7, total: 7, calls: 1 } } });
  expect(perfSnapshot().preview).toMatchObject({ last: 7, calls: 1 });
});

it("reports a failed preview with the worker's stack and hands nothing over", () => {
  const plans = new PlanPreparation();
  plans.request(world, drive, world.player.vehicleId);
  const worker = TestWorker.latest;
  worker.respond({ id: worker.requests[0].id, error: "Error: Player vehicle p missing from the preview world\n    at planTurns" });
  expect(plans.take(world)).toBeNull();
  const reported = vi.mocked(reportError).mock.calls[0][0] as Error;
  expect(reported.message).toBe("Player vehicle p missing from the preview world");
  expect(reported.stack).toContain("at planTurns");
});

it("reports a worker error event and still posts the next request", () => {
  const plans = new PlanPreparation();
  plans.request(world, drive, world.player.vehicleId);
  const worker = TestWorker.latest;
  worker.onerror?.({ message: "boom", preventDefault() {} } as ErrorEvent);
  expect(reportError).toHaveBeenCalledWith(new Error("Preview worker failed: boom"));
  plans.request(moved(), drive, world.player.vehicleId);
  expect(worker.requests).toHaveLength(2);
});

it("transfers a copy of the drive snapshot and leaves the main snapshot in place", () => {
  const plans = new PlanPreparation();
  const before = drive.snapshot.slice();
  plans.request(world, drive, world.player.vehicleId);
  const worker = TestWorker.latest;
  expect(worker.transfers[0]).toEqual([worker.requests[0].drive.snapshot.buffer]);
  expect(worker.requests[0].drive.snapshot.buffer).not.toBe(drive.snapshot.buffer);
  expect(drive.snapshot).toEqual(before);
});

it("restarts a preview worker whose script did not load and posts the lost request again", () => {
  vi.useFakeTimers();
  const plans = new PlanPreparation();
  plans.request(world, drive, "me");
  const first = TestWorker.latest;
  first.onerror?.({ preventDefault() {} } as ErrorEvent);
  expect(reportError).not.toHaveBeenCalled();
  expect(TestWorker.created).toBe(1);
  vi.advanceTimersByTime(500);
  const second = TestWorker.latest;
  expect(second).not.toBe(first);
  expect(second.requests).toHaveLength(1);
  expect(second.requests[0].terrain).toBe(world.terrain);
  expect(second.requests[0].drive.snapshot.byteLength).toBeGreaterThan(0);
  second.answer(0, plan(true));
  expect(plans.take(world)?.waypoint).toBe(true);
  vi.useRealTimers();
});

it("gives up on a preview worker that never loads with one download failure", () => {
  vi.useFakeTimers();
  const plans = new PlanPreparation();
  plans.request(world, drive, "me");
  for (let i = 0; i < 6; i++) {
    TestWorker.latest.onerror?.({ preventDefault() {} } as ErrorEvent);
    vi.advanceTimersByTime(4000);
  }
  expect(reportError).toHaveBeenCalledOnce();
  expect((vi.mocked(reportError).mock.calls[0][0] as Error).name).toBe("DownloadFailed");
  expect((vi.mocked(reportError).mock.calls[0][0] as Error).message).toContain("preview worker");
  expect(TestWorker.created).toBe(6);
  plans.request(world, drive, "me");
  expect(TestWorker.created).toBe(6);
  vi.useRealTimers();
});

it("colors the hover ring and the first turn by the pace the click would hold", () => {
  const w = emptyWorld({ x: 200, y: 200 });
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  me.speed = 4;
  const far = { x: me.pos.x + 80, y: me.pos.y };
  const held = setMoveOrder(w, { kind: "through", dest: far });
  const me2 = held.vehicles.find((v) => v.id === w.player.vehicleId)!;
  expect(throttleColor(held, me2, { x: me2.pos.x + 1, y: me2.pos.y })).toBe(PAL.throttle.brake);
  expect(firstTurnColor(held, me2)).toBe(PAL.throttle.accelerate);
  const slow = setMoveOrder(held, { kind: "through", dest: far, pace: 1 });
  const me3 = slow.vehicles.find((v) => v.id === w.player.vehicleId)!;
  expect(firstTurnColor(slow, me3)).toBe(PAL.throttle.brake);
});
