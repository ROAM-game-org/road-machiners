import { describe, expect, it } from "vitest";
import { ART, ICON_NAMES } from "./cards";
import { FILTER_ICON } from "./town";
import { EN } from "../text/en";
import { RU } from "../text/ru";

const numbersOf = (art: string): number[] => [...art.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]));

describe("the UI icon set", () => {
  it("draws every icon as plain filled shapes, so one CSS rule colors the set", () => {
    for (const name of ICON_NAMES) expect(ART[name], name).not.toMatch(/stroke|fill|color|style|class/);
  });

  it("keeps every coordinate on a half unit inside the 16-unit grid", () => {
    for (const name of ICON_NAMES)
      for (const n of numbersOf(ART[name])) {
        expect(n * 2, `${name} ${n}`).toBe(Math.round(n * 2));
        expect(Math.abs(n), `${name} ${n}`).toBeLessThanOrEqual(16);
      }
  });

  it("titles every icon in English and Russian", () => {
    for (const name of ICON_NAMES) {
      expect(EN[`icon.${name}`], name).toBeTruthy();
      expect(RU[`icon.${name}`], name).toBeTruthy();
    }
  });

  it("gives every garage filter its own picture and never the supplies sack", () => {
    const icons = Object.values(FILTER_ICON);
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons).not.toContain("supplies");
  });
});
