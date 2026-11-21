import { describe, expect, it } from "vitest";
import { CONTROL_CUES, SOUNDS } from "../data/sounds";
import { pressCue, pressSoundOf, type PressSound } from "./control-sound";

describe("pressCue", () => {
  it("gives each press kind its own cue", () => {
    const kinds: PressSound[] = ["key", "screen", "switch", "latch", "latch-lit", "knob"];
    const cues = kinds.map((k) => pressCue(k, false));
    expect(cues).toEqual(["key-press", "screen-press", "switch-on", "latch-in", "latch-out", "knob-step"]);
    expect(new Set(cues).size).toBe(kinds.length);
  });

  it("sounds a lit switch going down and an unlit one going up", () => {
    expect(pressCue("switch", true)).toBe("switch-off");
    expect(pressCue("switch", false)).toBe("switch-on");
  });

  it("stays silent for a control that does not move", () => {
    expect(pressCue("none", false)).toBeNull();
    expect(pressCue("none", true)).toBeNull();
  });

  it("only names cues the catalog has", () => {
    for (const kind of ["key", "screen", "switch", "latch", "latch-lit", "knob"] as const) {
      expect(CONTROL_CUES).toContain(pressCue(kind, false));
      expect(SOUNDS[pressCue(kind, false)!]).toBeDefined();
    }
  });
});

describe("pressSoundOf", () => {
  it("reads a value with the spaces a stylesheet leaves", () => {
    expect(pressSoundOf(" latch-lit", "tab")).toBe("latch-lit");
  });

  it("throws on an empty or unknown value and names the button", () => {
    expect(() => pressSoundOf("", "mystery-key")).toThrow(/mystery-key/);
    expect(() => pressSoundOf("clunk", "mystery-key")).toThrow(/clunk/);
  });
});
