import { describe, expect, it } from "vitest";
import { TOUCH } from "../config";
import { TouchGestures } from "./touch-map";

describe("touch gestures", () => {
  it("gives a tap at the press point when the finger stayed inside the slop", () => {
    const g = new TouchGestures();
    g.down(1, 100, 100, 0);
    expect(g.move(1, 100 + TOUCH.slopPx - 1, 100)).toBeNull();
    expect(g.up(1)).toEqual({ kind: "tap", x: 100, y: 100 });
  });

  it("gives pans and no tap once the finger leaves the slop", () => {
    const g = new TouchGestures();
    g.down(1, 100, 100, 0);
    expect(g.move(1, 130, 100)).toEqual({ kind: "pan", dx: 30, dy: 0 });
    expect(g.move(1, 140, 110)).toEqual({ kind: "pan", dx: 10, dy: 10 });
    expect(g.up(1)).toBeNull();
  });

  it("fires one hold after the long press time and no tap on lift", () => {
    const g = new TouchGestures();
    g.down(1, 50, 60, 0);
    expect(g.tick(TOUCH.longPressMs - 1)).toBeNull();
    expect(g.tick(TOUCH.longPressMs)).toEqual({ kind: "hold", x: 50, y: 60 });
    expect(g.tick(TOUCH.longPressMs + 100)).toBeNull();
    expect(g.up(1)).toBeNull();
  });

  it("does not hold once the finger has dragged", () => {
    const g = new TouchGestures();
    g.down(1, 0, 0, 0);
    g.move(1, 50, 0);
    expect(g.tick(TOUCH.longPressMs * 2)).toBeNull();
  });

  it("zooms by the ratio of finger distances and cancels the tap", () => {
    const g = new TouchGestures();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    expect(g.move(2, 300, 100)).toEqual({ kind: "zoom", factor: 2 });
    expect(g.move(2, 200, 100)).toEqual({ kind: "zoom", factor: 0.5 });
    expect(g.up(2)).toBeNull();
    expect(g.up(1)).toBeNull();
  });

  it("gives no pan from the finger left after a pinch", () => {
    const g = new TouchGestures();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    g.up(2);
    expect(g.move(1, 300, 300)).toBeNull();
    expect(g.up(1)).toBeNull();
  });

  it("ignores a third finger", () => {
    const g = new TouchGestures();
    g.down(1, 0, 0, 0);
    g.down(2, 100, 0, 0);
    g.down(3, 500, 500, 0);
    expect(g.move(3, 600, 600)).toBeNull();
    expect(g.up(3)).toBeNull();
  });

  it("gives nothing on pointercancel", () => {
    const g = new TouchGestures();
    g.down(1, 0, 0, 0);
    g.cancel(1);
    expect(g.up(1)).toBeNull();
    expect(g.tick(TOUCH.longPressMs * 2)).toBeNull();
  });
});
