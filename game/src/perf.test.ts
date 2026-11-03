import { expect, it } from "vitest";
import { mergePerf, perfSnapshot, ranInWorker, resetPerf, timed } from "./perf";

it("combines worker timings without losing counts or prior peaks", () => {
  resetPerf();
  mergePerf({ turn: { last: 40, max: 60, total: 100, calls: 2 } });
  mergePerf({ turn: { last: 30, max: 30, total: 30, calls: 1 } });
  expect(perfSnapshot().turn).toEqual({ last: 30, max: 60, total: 130, calls: 3 });
});

it("marks merged timers as worker timers and keeps main-thread timers local", () => {
  resetPerf();
  mergePerf({ preview: { last: 600, max: 600, total: 600, calls: 1 } });
  timed("fog", () => 0);
  expect(ranInWorker("preview")).toBe(true);
  expect(ranInWorker("fog")).toBe(false);
  resetPerf();
  expect(ranInWorker("preview")).toBe(false);
});
