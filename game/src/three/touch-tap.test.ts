import { describe, expect, it } from "vitest";
import { touchTapAction, type TouchTapInput } from "./touch-tap";

const base: TouchTapInput = {
  pinnedId: null,
  previewScreen: null,
  previewAt: null,
  tapScreen: { x: 100, y: 100 },
  hit: { kind: "ground" },
  ground: { x: 5, y: 5 },
  utilityPoint: false,
  pickRadius: 30,
};

describe("touch tap action", () => {
  it("pins an unpinned truck and never aims", () => {
    expect(touchTapAction({ ...base, hit: { kind: "vehicle", id: "npc1" } })).toEqual({ kind: "pin", id: "npc1" });
  });

  it("pins a truck when another one is pinned", () => {
    expect(touchTapAction({ ...base, pinnedId: "npc2", hit: { kind: "vehicle", id: "npc1" } })).toEqual({ kind: "pin", id: "npc1" });
  });

  it("aims at the pinned truck", () => {
    expect(touchTapAction({ ...base, pinnedId: "npc1", hit: { kind: "vehicle", id: "npc1" } })).toEqual({ kind: "aim", id: "npc1" });
  });

  it("clicks the ground", () => {
    expect(touchTapAction(base)).toEqual({ kind: "click" });
  });

  it("previews a point utility on the first tap", () => {
    expect(touchTapAction({ ...base, utilityPoint: true })).toEqual({ kind: "preview", at: { x: 5, y: 5 } });
  });

  it("places a point utility on a second tap near the preview", () => {
    const input = { ...base, utilityPoint: true, previewScreen: { x: 110, y: 100 }, previewAt: { x: 4, y: 4 } };
    expect(touchTapAction(input)).toEqual({ kind: "place", at: { x: 4, y: 4 } });
  });

  it("moves the preview on a tap far from it", () => {
    const input = { ...base, utilityPoint: true, previewScreen: { x: 300, y: 300 }, previewAt: { x: 4, y: 4 } };
    expect(touchTapAction(input)).toEqual({ kind: "preview", at: { x: 5, y: 5 } });
  });
});
