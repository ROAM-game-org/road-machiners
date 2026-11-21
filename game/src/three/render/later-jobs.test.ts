import { describe, expect, it } from "vitest";
import { LaterJobs } from "./later-jobs";

describe("LaterJobs", () => {
  it("does not count the frame that queued a job", () => {
    const jobs = new LaterJobs();
    let ran = 0;
    jobs.add(100, () => ran++);
    jobs.tick(0.12);
    expect(ran).toBe(0);
    jobs.tick(0.1);
    expect(ran).toBe(1);
  });

  it("runs a job queued with no delay on the frame that queued it", () => {
    const jobs = new LaterJobs();
    let ran = 0;
    jobs.add(0, () => ran++);
    jobs.tick(0.016);
    expect(ran).toBe(1);
  });

  it("runs a job queued during a tick at its own time", () => {
    const jobs = new LaterJobs();
    let ran = 0;
    jobs.add(0, () => jobs.add(50, () => ran++));
    jobs.tick(0.2);
    expect(ran).toBe(0);
    jobs.tick(0.05);
    expect(ran).toBe(1);
  });

  it("throws on a negative delay", () => {
    expect(() => new LaterJobs().add(-1, () => {})).toThrow(/non-negative/);
  });
});
