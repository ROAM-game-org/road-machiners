import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./truck-condition.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing rule ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

function token(name: string): string {
  const match = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing token ${name}`);
  return match[1];
}

function brightness(name: string): number {
  return Number(token(name).match(/brightness\(([\d.]+)\)/)![1]);
}

describe("truck condition css", () => {
  it("draws the panel as black at 30 percent with a 6px blur, no border and no shadow", () => {
    const root = rule("#ui .truck-condition");
    expect(root).toContain("background: var(--cond-panel)");
    expect(root).toMatch(/backdrop-filter: blur\(var\(--cond-blur\)\)/);
    expect(root).toMatch(/border: none/);
    expect(root).toMatch(/box-shadow: none/);
    expect(token("--cond-panel")).toBe("rgba(0, 0, 0, 0.3)");
    expect(token("--cond-blur")).toBe("6px");
  });

  it("keeps aimable parts clickable", () => {
    expect(rule(".truck-condition.aimable .condition-hit[data-over=\"part\"]")).toContain("cursor: crosshair");
  });

  it("takes the pointer even inside a HUD zone that passes clicks through", () => {
    expect(rule(".condition-hit")).toContain("pointer-events: auto");
  });

  it("draws the body darker than the parts", () => {
    expect(rule(".cond-body")).toContain("var(--cond-body-filter)");
    expect(rule(".cond-parts")).toContain("var(--cond-parts-filter)");
    expect(brightness("--cond-body-filter")).toBeLessThan(brightness("--cond-parts-filter"));
  });

  it("gives halos to critical and broken parts only", () => {
    expect(rule(".cond-halo[data-tier=\"crit\"]")).toContain("--cond-halo-crit");
    expect(rule(".cond-halo[data-tier=\"broken\"]")).toContain("--cond-halo-broken");
    expect(css).not.toContain(".cond-halo[data-tier=\"hurt\"]");
  });

  it("lets the pointer reach only the hit layer", () => {
    expect(rule(".condition-layers,\n.condition-hover,\n.condition-marks,\n.condition-flashes")).toContain("pointer-events: none");
    expect(rule(".condition-hit")).not.toContain("pointer-events: none");
  });
});
