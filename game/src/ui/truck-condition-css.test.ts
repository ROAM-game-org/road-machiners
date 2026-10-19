import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./truck-condition.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing rule ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("truck condition css", () => {
  it("draws no card behind the diagram", () => {
    const root = rule("#ui .truck-condition");
    expect(root).not.toMatch(/background|border|padding/);
  });

  it("keeps aimable parts clickable", () => {
    expect(rule(".condition-part.aimable")).toContain("cursor: crosshair");
  });

  it("fills the body silhouette with a mid tone, not the darkest cell color", () => {
    expect(rule(".condition-chassis .outline-fill")).toContain("var(--cell-side)");
  });

  it("shades the body with dark and light faces, not one flat fill", () => {
    const fill = rule(".condition-chassis .outline-fill");
    expect(fill).toMatch(/--plan-shadow: var\(--/);
    expect(fill).toMatch(/--plan-light: var\(--/);
  });
});
