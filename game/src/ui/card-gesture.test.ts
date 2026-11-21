import { describe, expect, it } from "vitest";
import { TOUCH } from "../config";
import { CardGesture } from "./card-gesture";

function rig() {
  const pans: [number, number][] = [];
  const zooms: number[] = [];
  const gesture = new CardGesture({ pan: (dx, dy) => pans.push([dx, dy]), zoom: (factor) => zooms.push(factor) });
  return { gesture, pans, zooms };
}

describe("card gesture", () => {
  it("leaves a press under the slop as a click", () => {
    const { gesture, pans } = rig();
    gesture.down(1, 100, 100);
    expect(gesture.move(1, 100 + TOUCH.slopPx, 100)).toBe(false);
    expect(gesture.up(1)).toBe(false);
    expect(pans).toEqual([]);
  });

  it("pans past the slop from the press point and swallows the click", () => {
    const { gesture, pans } = rig();
    gesture.down(1, 100, 100);
    expect(gesture.move(1, 100 + TOUCH.slopPx + 5, 100)).toBe(true);
    gesture.move(1, 130, 100);
    expect(pans).toEqual([[TOUCH.slopPx + 5, 0], [130 - (110 + 5), 0]]);
    expect(gesture.up(1)).toBe(true);
    gesture.down(1, 5, 5);
    expect(gesture.up(1)).toBe(false);
  });

  it("zooms by the ratio of finger distances and never aims after", () => {
    const { gesture, zooms } = rig();
    gesture.down(1, 100, 100);
    gesture.down(2, 200, 100);
    gesture.move(2, 300, 100);
    expect(zooms).toEqual([2]);
    expect(gesture.up(2)).toBe(true);
    expect(gesture.up(1)).toBe(true);
  });

  it("drops a pinch with fingers on the same point", () => {
    const { gesture, zooms } = rig();
    gesture.down(1, 100, 100);
    gesture.down(2, 100, 100);
    gesture.move(2, 100, 100);
    expect(zooms).toEqual([]);
  });

  it("ignores non-finite moves", () => {
    const { gesture, pans } = rig();
    gesture.down(1, 0, 0);
    gesture.move(1, NaN, 50);
    expect(pans).toEqual([]);
  });
});
