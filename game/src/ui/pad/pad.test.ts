import { describe, expect, it } from "vitest";
import {
  IDLE_FRAME,
  cycledTarget,
  deadzoned,
  movedCursor,
  nearestTarget,
  padGlyphFor,
  padKeyOf,
  PadTracker,
  RADIAL_ENTRIES,
  radialPick,
  radialSpot,
  readPad,
  readPads,
  sameControl,
  snapTarget,
  targetToward,
  type GamepadLike,
  type PadButton,
  type PadFrame,
  type PadTarget,
} from "./pad-model";

const LIMITS = { deadzone: 0.2, triggerAt: 0.5 };

function gamepad(pressed: number[], axes: number[] = [0, 0, 0, 0], values: Record<number, number> = {}): GamepadLike {
  return { buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) })), axes };
}

function frame(...down: PadButton[]): PadFrame {
  return { down: new Set(down), left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
}

function target(key: string, x: number, y: number, kind: PadTarget["kind"] = "control"): PadTarget {
  return { key, kind, x, y, r: 10 };
}

describe("reading a gamepad", () => {
  it("names the standard buttons", () => {
    expect([...readPad(gamepad([0, 1, 9, 12]), LIMITS).down]).toEqual(["a", "b", "menu", "up"]);
  });

  it("counts a trigger as down only past its threshold", () => {
    expect(readPad(gamepad([], undefined, { 7: 0.3 }), LIMITS).down.has("rt")).toBe(false);
    expect(readPad(gamepad([], undefined, { 7: 0.7 }), LIMITS).down.has("rt")).toBe(true);
  });

  it("ignores stick drift inside the deadzone and reaches full tilt at the rim", () => {
    expect(deadzoned(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
    expect(deadzoned(1, 0, 0.2)).toEqual({ x: 1, y: 0 });
    expect(deadzoned(0.6, 0, 0.2).x).toBeCloseTo(0.5);
  });

  it("reads the left and right sticks from the first four axes", () => {
    const read = readPad(gamepad([], [1, 0, 0, -1]), LIMITS);
    expect(read.left).toEqual({ x: 1, y: 0 });
    expect(read.right).toEqual({ x: 0, y: -1 });
  });

  it("reads every connected standard pad and skips empty slots", () => {
    const pad = (pressed: number[], axes?: number[]) => ({ ...gamepad(pressed, axes), connected: true, mapping: "standard" });
    expect([...readPads([null, pad([0]), null, pad([1])], LIMITS).down]).toEqual(["a", "b"]);
    expect(readPads([null], LIMITS)).toEqual(IDLE_FRAME);
  });

  it("merges a pad seen twice, so an idle twin hides nothing", () => {
    const steam = { ...gamepad([7], [0.9, 0, 0, 0]), connected: true, mapping: "standard" };
    const idle = { ...gamepad([]), connected: true, mapping: "standard" };
    const read = readPads([idle, steam], LIMITS);
    expect(read.down.has("rt")).toBe(true);
    expect(read.left.x).toBeGreaterThan(0.8);
  });

  it("ignores a pad without the standard layout, whose button order is unknown", () => {
    expect(readPads([{ ...gamepad([0, 3]), connected: true, mapping: "" }], LIMITS)).toEqual(IDLE_FRAME);
  });

  it("ignores a disconnected pad", () => {
    expect(readPads([{ ...gamepad([0]), connected: false, mapping: "standard" }], LIMITS)).toEqual(IDLE_FRAME);
  });
});

describe("button edges", () => {
  it("reports a press once and a short release as a tap", () => {
    const tracker = new PadTracker(500);
    expect(tracker.step(frame("a"), 0).pressed).toEqual(["a"]);
    expect(tracker.step(frame("a"), 100).pressed).toEqual([]);
    expect(tracker.step(frame(), 200).released).toEqual([{ button: "a", heldMs: 200, held: false }]);
  });

  it("reports a hold once when it crosses the hold time, and marks its release as held", () => {
    const tracker = new PadTracker(500);
    tracker.step(frame("y"), 0);
    expect(tracker.step(frame("y"), 499).heldNow).toEqual([]);
    expect(tracker.step(frame("y"), 500).heldNow).toEqual(["y"]);
    expect(tracker.step(frame("y"), 900).heldNow).toEqual([]);
    expect(tracker.step(frame(), 1000).released).toEqual([{ button: "y", heldMs: 1000, held: true }]);
  });
});

describe("the reticle", () => {
  const move = { dtMs: 100, pxPerS: 1000, slowNear: 0.5, bounds: { width: 800, height: 600 } };

  it("moves with the stick and slows over a target", () => {
    expect(movedCursor({ x: 100, y: 100 }, { ...move, stick: { x: 1, y: 0 } }, null)).toEqual({ x: 200, y: 100 });
    expect(movedCursor({ x: 100, y: 100 }, { ...move, stick: { x: 1, y: 0 } }, target("t", 100, 100))).toEqual({ x: 150, y: 100 });
  });

  it("stays on the screen", () => {
    expect(movedCursor({ x: 790, y: 5 }, { ...move, stick: { x: 1, y: -1 } }, null)).toMatchObject({ x: 800, y: 0 });
  });

  it("snaps to the nearest target in reach", () => {
    const targets = [target("far", 100, 0), target("near", 20, 0)];
    expect(nearestTarget({ x: 0, y: 0 }, targets, 30)?.key).toBe("near");
    expect(nearestTarget({ x: 0, y: 0 }, targets, 5)).toBeNull();
  });
});

describe("jumping between targets", () => {
  const grid = [target("right", 100, 0), target("down", 0, 100), target("diagonal", 100, 100), target("left", -60, 0)];

  it("goes to the target the direction points at", () => {
    expect(targetToward({ x: 0, y: 0 }, grid, { x: 1, y: 0 })?.key).toBe("right");
    expect(targetToward({ x: 0, y: 0 }, grid, { x: 0, y: 1 })?.key).toBe("down");
    expect(targetToward({ x: 0, y: 0 }, grid, { x: -1, y: 0 })?.key).toBe("left");
  });

  it("finds nothing behind the last target", () => {
    expect(targetToward({ x: 0, y: 0 }, grid, { x: 0, y: -1 })).toBeNull();
  });

  it("cycles trucks around a centre and wraps", () => {
    const trucks = [target("east", 10, 0, "truck"), target("south", 0, 10, "truck"), target("west", -10, 0, "truck")];
    expect(cycledTarget(trucks, { x: 0, y: 0 }, null, 1)?.key).toBe("east");
    expect(cycledTarget(trucks, { x: 0, y: 0 }, null, -1)?.key).toBe("west");
    expect(cycledTarget(trucks, { x: 0, y: 0 }, "east", 1)?.key).toBe("south");
    expect(cycledTarget(trucks, { x: 0, y: 0 }, "south", 1)?.key).toBe("west");
    expect(cycledTarget(trucks, { x: 0, y: 0 }, "west", 1)?.key).toBe("east");
    expect(cycledTarget(trucks, { x: 0, y: 0 }, "west", -1)?.key).toBe("south");
  });
});

describe("the radial dash", () => {
  it("picks the entry the stick points at, clockwise from the top", () => {
    expect(radialPick({ x: 0, y: -1 }, 12, 0.5)).toBe(0);
    expect(radialPick({ x: 1, y: 0 }, 12, 0.5)).toBe(3);
    expect(radialPick({ x: 0, y: 1 }, 12, 0.5)).toBe(6);
    expect(radialPick({ x: -1, y: 0 }, 12, 0.5)).toBe(9);
  });

  it("picks nothing with the stick near the middle", () => {
    expect(radialPick({ x: 0.2, y: 0 }, 12, 0.5)).toBeNull();
  });

  it("lays its entries where the stick picks them", () => {
    RADIAL_ENTRIES.forEach((_, i) => {
      const spot = radialSpot(i, RADIAL_ENTRIES.length, 1);
      expect(radialPick(spot, RADIAL_ENTRIES.length, 0.5)).toBe(i);
    });
  });
});

describe("pad bindings", () => {
  it("sends the game's own keys", () => {
    expect(padKeyOf("x", "world")?.code).toBe("KeyE");
    expect(padKeyOf("b", "screen")?.code).toBe("Escape");
    expect(padKeyOf("x", "screen")?.code).toBe("KeyR");
  });

  it("names a glyph only for keys a pad button sends", () => {
    expect(padGlyphFor("Esc")).toBe("B");
    expect(padGlyphFor("E")).toBe("X");
    expect(padGlyphFor("C")).toBeNull();
  });
});

describe("snapping when the stick lets go", () => {
  const close = { ...target("close", 100, 100), r: 12 };
  const truck = { ...target("truck", 160, 100, "truck"), r: 30 };

  it("in the world, a control near the reticle does not pull it off the ground", () => {
    expect(snapTarget({ x: 125, y: 100 }, [close], "world", 36)).toBeNull();
  });

  it("in the world, a control the reticle is over still holds it", () => {
    expect(snapTarget({ x: 105, y: 100 }, [close], "world", 36)?.key).toBe("close");
  });

  it("in the world, a truck in reach pulls the reticle", () => {
    expect(snapTarget({ x: 125, y: 100 }, [close, truck], "world", 36)?.key).toBe("truck");
  });

  it("on a screen, the nearest control in reach pulls the reticle", () => {
    expect(snapTarget({ x: 125, y: 100 }, [close], "screen", 36)?.key).toBe("close");
  });
});

describe("finding a control again after a screen redraws", () => {
  const buy = { ...target("old", 100, 100), label: "Buy 5 L" };

  it("finds the redrawn control with the same text at the same spot", () => {
    expect(sameControl(buy, [{ ...target("new", 102, 100), label: "Buy 5 L" }], 36)?.key).toBe("new");
  });

  it("does not take another control that now sits at that spot", () => {
    expect(sameControl(buy, [{ ...target("leave", 100, 100), label: "Leave" }], 36)).toBeNull();
  });

  it("does not take the same text far away", () => {
    expect(sameControl(buy, [{ ...target("far", 400, 100), label: "Buy 5 L" }], 36)).toBeNull();
  });
});
