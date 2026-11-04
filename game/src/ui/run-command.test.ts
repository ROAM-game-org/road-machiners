import { describe, expect, it, vi } from "vitest";
import { emptyWorld } from "../sim/testkit";
import { Refused } from "../sim/world";
import { runCommand } from "./run-command";

describe("runCommand", () => {
  it("returns the command's refusal and never commits", () => {
    const refusal = new Refused({ id: "badLayout", cause: "x" } as never);
    const commit = vi.fn();
    const failed = runCommand(emptyWorld(), () => { throw refusal; }, commit);
    expect(failed).toBe(refusal);
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits the next world with the previous one and returns null", () => {
    const before = emptyWorld();
    const next = emptyWorld();
    const commit = vi.fn();
    expect(runCommand(before, () => next, commit)).toBeNull();
    expect(commit).toHaveBeenCalledWith(next, before);
  });

  it("lets a commit failure propagate", () => {
    const boom = new Error("refresh broke");
    expect(() => runCommand(emptyWorld(), (w) => w, () => { throw boom; })).toThrow(boom);
  });
});
