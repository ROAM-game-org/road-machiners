import { describe, expect, it } from "vitest";
import { canScroll, dragTarget, pageTarget, SCROLL_SCREENS, wheelPlacement, WheelGate, type ScrollTarget } from "./scroll-wheel";

const screen = (scrollTop: number, scrollHeight: number, clientHeight: number): ScrollTarget => ({ scrollTop, scrollHeight, clientHeight });

describe("canScroll", () => {
  it("is false when the content fits", () => {
    expect(canScroll(screen(0, 300, 300))).toBe(false);
  });

  it("ignores a one pixel rounding gap", () => {
    expect(canScroll(screen(0, 301, 300))).toBe(false);
  });

  it("is true when the content is taller than the screen", () => {
    expect(canScroll(screen(0, 303, 300))).toBe(true);
  });
});

describe("WheelGate", () => {
  it("opens when the content grows and closes when it shrinks", () => {
    const target = screen(0, 200, 300);
    const changes: boolean[] = [];
    const gate = new WheelGate(target, (open) => changes.push(open));
    expect(gate.refresh()).toBe(false);
    target.scrollHeight = 900;
    expect(gate.refresh()).toBe(true);
    target.scrollHeight = 250;
    expect(gate.refresh()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("reports a change once", () => {
    const target = screen(0, 900, 300);
    const changes: boolean[] = [];
    const gate = new WheelGate(target, (open) => changes.push(open));
    gate.refresh();
    gate.refresh();
    expect(changes).toEqual([true]);
  });
});

describe("dragTarget", () => {
  it("moves the screen at twice the pointer travel", () => {
    expect(dragTarget(100, 10)).toBe(120);
    expect(dragTarget(100, -10)).toBe(80);
  });
});

describe("pageTarget", () => {
  const target = screen(500, 3000, 300);

  it("pages up from a click above the middle", () => {
    expect(pageTarget(target, 10, 0, 200)).toBe(230);
  });

  it("pages down from a click below the middle", () => {
    expect(pageTarget(target, 190, 0, 200)).toBe(770);
  });
});

describe("wheelPlacement", () => {
  it("crops the baked frame down to the wheel slot", () => {
    const place = wheelPlacement();
    expect(place.aspect).toBeGreaterThan(0);
    expect(place.aspect).toBeLessThan(1);
    expect(place.left).toBeLessThan(0);
    expect(place.top).toBeLessThan(0);
    expect(place.width).toBeGreaterThan(100);
    expect(place.height).toBeGreaterThan(100);
  });
});

describe("SCROLL_SCREENS", () => {
  it("lists each screen once", () => {
    const parts = SCROLL_SCREENS.split(", ");
    expect(new Set(parts).size).toBe(parts.length);
  });
});
