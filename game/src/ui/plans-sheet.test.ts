import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHASSIS } from "../data/chassis";

const sheet = readFileSync(new URL("./plans.svg", import.meta.url), "utf8");

function symbol(id: string): string {
  const match = sheet.match(new RegExp(`<symbol id="${id}"[^>]*>(.*?)</symbol>`, "s"));
  if (!match) throw new Error(`Missing symbol ${id}`);
  return match[1];
}

describe("chassis plan sheet", () => {
  it("holds one top view and one outline per chassis and nothing else", () => {
    const ids = Object.keys(CHASSIS);
    const expected = ids.flatMap((id) => [`top-${id}`, `plan-${id}`]).sort();
    const found = [...sheet.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(found).toEqual(expected);
  });

  it("draws every top view with shadow and light faces and colors from variables only", () => {
    for (const id of Object.keys(CHASSIS)) {
      const body = symbol(`top-${id}`);
      expect(body).toContain("<clipPath");
      expect(body).toContain("var(--plan-shadow)");
      expect(body).toContain("var(--plan-light)");
      const paths = [...body.matchAll(/<path d="([^"]*)" style="fill:var\(--plan-(?:shadow|light)\)"/g)];
      expect(paths.some((p) => p[1].length > 0)).toBe(true);
      const colors = [...body.matchAll(/(?:fill|stroke):([^;"]+)/g)].map((m) => m[1]);
      for (const color of colors) expect(color).toMatch(/^(none|var\(--plan-[a-z]+\))$/);
    }
  });
});
