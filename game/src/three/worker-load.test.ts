import { beforeEach, expect, it, vi } from "vitest";
import { AssetUnreachable } from "../fetch-asset";
import { reportError } from "./crash";
import { WORKER_LOAD_ATTEMPTS, WORKER_RETRY_DELAYS_MS, WorkerLoad, workerFailure } from "./worker-load";

vi.mock("./crash", () => ({ reportError: vi.fn() }));

const silent = { message: "" } as ErrorEvent;
const thrown = { message: "boom" } as ErrorEvent;

beforeEach(() => vi.mocked(reportError).mockClear());

it("leaves an error with a message to the caller", () => {
  const wait = vi.fn();
  expect(new WorkerLoad("turn worker", wait).failed(thrown, vi.fn())).toBe(false);
  expect(wait).not.toHaveBeenCalled();
});

it("waits the download back-off in order, then gives up once", () => {
  const waits: number[] = [];
  const load = new WorkerLoad("turn worker", (ms) => waits.push(ms));
  for (let i = 0; i < WORKER_LOAD_ATTEMPTS; i++) expect(load.failed(silent, vi.fn())).toBe(true);
  expect(waits).toEqual([...WORKER_RETRY_DELAYS_MS]);
  expect(load.gaveUp).toBe(true);
  expect(reportError).toHaveBeenCalledOnce();
  const err = vi.mocked(reportError).mock.calls[0][0] as AssetUnreachable;
  expect(err.name).toBe("DownloadFailed");
  expect(err).toBeInstanceOf(AssetUnreachable);
  expect(err.attempts).toBe(6);
  expect(err.message).toContain("turn worker");
});

it("keeps the shipped back-off", () => {
  expect(WORKER_RETRY_DELAYS_MS).toEqual([500, 1000, 2000, 4000, 4000]);
  expect(WORKER_LOAD_ATTEMPTS).toBe(6);
});

it("names the script url of a silent failure", () => {
  const load = new WorkerLoad("turn worker", vi.fn());
  const event = { message: "", filename: "turn.js", lineno: 3 } as ErrorEvent;
  for (let i = 0; i < WORKER_LOAD_ATTEMPTS; i++) load.failed(event, vi.fn());
  expect((vi.mocked(reportError).mock.calls[0][0] as AssetUnreachable).url).toBe("turn.js");
});

it("counts again from zero after an answer", () => {
  const waits: number[] = [];
  const load = new WorkerLoad("turn worker", (ms) => waits.push(ms));
  load.failed(silent, vi.fn());
  load.failed(silent, vi.fn());
  load.loaded();
  load.failed(silent, vi.fn());
  expect(waits).toEqual([...DOWNLOAD.waitMs, DOWNLOAD.waitMs[0]]);
});

it("names the script location of a failed load", () => {
  const event = { message: "", filename: "turn.js", lineno: 3 } as ErrorEvent;
  expect(workerFailure("Turn worker", event)).toBe("Turn worker failed: script did not load or start (turn.js:3)");
});
