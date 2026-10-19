import { beforeEach, expect, it, vi } from "vitest";
import { reportError } from "./crash";
import { DOWNLOAD, WorkerLoad, workerFailure } from "./worker-load";

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
  for (let i = 0; i < DOWNLOAD.tries; i++) expect(load.failed(silent, vi.fn())).toBe(true);
  expect(waits).toEqual(DOWNLOAD.waitMs);
  expect(load.gaveUp).toBe(true);
  expect(reportError).toHaveBeenCalledOnce();
});

it("counts again from zero after an answer", () => {
  const waits: number[] = [];
  const load = new WorkerLoad("turn worker", (ms) => waits.push(ms));
  load.failed(silent, vi.fn());
  load.failed(silent, vi.fn());
  load.loaded();
  load.failed(silent, vi.fn());
  expect(waits).toEqual([500, 1000, 500]);
});

it("names the script location of a failed load", () => {
  const event = { message: "", filename: "turn.js", lineno: 3 } as ErrorEvent;
  expect(workerFailure("Turn worker", event)).toBe("Turn worker failed: script did not load or start (turn.js:3)");
});
