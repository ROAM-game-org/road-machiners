import { describe, expect, it } from "vitest";
import { resolve } from "../text/resolve";
import { controlsFor, entryEnabled, entryReason, type MenuEntry } from "./game-menu";
import { modeRulesOf } from "../sim/settings";

describe("entryEnabled", () => {
  const states = [
    { busy: false, hasSave: false, expected: { new: true, save: true, unstuck: true, load: false, options: true, tips: true, help: true, camera: true, report: true } },
    { busy: false, hasSave: true, expected: { new: true, save: true, unstuck: true, load: true, options: true, tips: true, help: true, camera: true, report: true } },
    { busy: true, hasSave: false, expected: { new: false, save: false, unstuck: false, load: false, options: true, tips: true, help: true, camera: true, report: true } },
    { busy: true, hasSave: true, expected: { new: false, save: false, unstuck: false, load: false, options: true, tips: true, help: true, camera: true, report: true } },
  ];
  for (const { busy, hasSave, expected } of states) {
    it(`busy ${busy}, saved ${hasSave}`, () => {
      for (const entry of Object.keys(expected) as MenuEntry[]) {
        expect(entryEnabled(entry, busy, hasSave)).toBe(expected[entry]);
      }
    });
  }
});

describe("map key", () => {
  const rows = controlsFor(modeRulesOf("roaming")).flatMap((g) => g.controls);

  it("is M, and no help row names K or a mute key", () => {
    const map = rows.find((c) => resolve(c.does, "en") === "Map");
    expect(map?.keys).toEqual(["M"]);
    expect(rows.some((c) => c.keys.includes("K"))).toBe(false);
    expect(rows.some((c) => resolve(c.does, "en") === "Mute")).toBe(false);
  });
});

describe("entryReason", () => {
  it("names why Load is off", () => {
    expect(resolve(entryReason("load", false, false)!, "en")).toBe("No saves yet");
    expect(entryReason("load", false, true)).toBeNull();
  });
  it("names the turn when it blocks an entry", () => {
    expect(resolve(entryReason("save", true, true)!, "en")).toBe("Wait for the turn");
    expect(entryReason("help", true, false)).toBeNull();
  });
});

describe("the help rows of a mode", () => {
  const radioRows = (mode: "roaming" | "furyRoad") =>
    controlsFor(modeRulesOf(mode)).flatMap((g) => g.controls).filter((c) => c.keys.some((k) => k === "T" || k === "H" || k === "9"));

  it("leave out the radio, reply and honk keys where there is no radio", () => {
    expect(radioRows("furyRoad")).toEqual([]);
  });

  it("keep them in Roaming", () => {
    expect(radioRows("roaming")).toHaveLength(3);
  });
});

describe("the help of a touch screen", () => {
  it("holds the Touch group alone, with no key caps", () => {
    const groups = controlsFor(modeRulesOf("roaming"), true);
    expect(groups.map((g) => resolve(g.title, "en"))).toEqual(["Touch"]);
    const keys = groups.flatMap((g) => g.controls).flatMap((c) => c.keys).map((k) => (typeof k === "string" ? k : resolve(k, "en")));
    expect(keys).not.toContain("Space");
    expect(keys).toContain("Pinch");
  });

  it("keeps the key groups on a screen with a keyboard", () => {
    expect(controlsFor(modeRulesOf("roaming"), false).length).toBeGreaterThan(1);
  });
});
