import { describe, expect, it } from "vitest";
import { TurnWait } from "./turn-wait";

describe("TurnWait", () => {
  it("runs each deferred action once, in the order given", () => {
    const wait = new TurnWait(() => false);
    const ran: number[] = [];
    wait.defer(() => ran.push(1));
    wait.defer(() => ran.push(2));
    wait.release();
    wait.release();
    expect(ran).toEqual([1, 2]);
  });

  it("holds an action deferred during a release for the next release", () => {
    const wait = new TurnWait(() => false);
    const ran: string[] = [];
    wait.defer(() => {
      ran.push("first");
      wait.defer(() => ran.push("again"));
    });
    wait.release();
    expect(ran).toEqual(["first"]);
    expect(wait.size).toBe(1);
    wait.release();
    expect(ran).toEqual(["first", "again"]);
  });

  it("drops a second action with a key that is already queued, and frees the key after release", () => {
    const wait = new TurnWait(() => false);
    let count = 0;
    wait.defer(() => count++, "turn");
    wait.defer(() => count++, "turn");
    wait.release();
    expect(count).toBe(1);
    wait.defer(() => count++, "turn");
    wait.release();
    expect(count).toBe(2);
  });

  it("holds the rest, in order, when an action starts a turn", () => {
    let playing = false;
    const wait = new TurnWait(() => playing);
    const ran: string[] = [];
    wait.defer(() => {
      ran.push("end turn");
      playing = true;
    });
    wait.defer(() => ran.push("use"));
    wait.defer(() => ran.push("save"));
    wait.release();
    expect(ran).toEqual(["end turn"]);
    expect(wait.size).toBe(2);
    playing = false;
    wait.release();
    expect(ran).toEqual(["end turn", "use", "save"]);
  });

  it("throws on a release inside a release", () => {
    const wait = new TurnWait(() => false);
    wait.defer(() => wait.release());
    expect(() => wait.release()).toThrow("inside a release");
  });

  it("does nothing on an empty release", () => {
    expect(() => new TurnWait(() => false).release()).not.toThrow();
  });
});
