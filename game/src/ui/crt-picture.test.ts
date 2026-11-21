import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const components = read("./styles/components.css");
const tokens = read("./tokens.css");
const conditionCss = read("./truck-condition.css");
const conditionView = read("./truck-condition-view.ts");

function crtRule(): string {
  const start = components.indexOf(".crt-picture {");
  if (start < 0) throw new Error("Missing .crt-picture");
  return components.slice(start, components.indexOf("}", start));
}

describe("crt-picture", () => {
  it("masks the picture's own pixels with both mask properties and sets no background", () => {
    const rule = crtRule();
    expect(rule).toMatch(/-webkit-mask-image:[^;]*--hud-crt-over-lit[^;]*--hud-crt-over-scan/);
    expect(rule).toMatch(/\n\s*mask-image:[^;]*--hud-crt-over-lit[^;]*--hud-crt-over-scan/);
    expect(rule).not.toMatch(/background|::before|::after|blend/);
  });

  it("keeps the scan row visible in the mask, so hit testing is unchanged", () => {
    const alpha = tokens.match(/--hud-crt-over-scan:\s*#([0-9a-f]{8});/)![1].slice(6);
    expect(parseInt(alpha, 16)).toBeGreaterThan(0);
    expect(parseInt(alpha, 16)).toBeLessThan(255);
  });

  it("keeps the glass at 2px rows through the row token", () => {
    expect(tokens).toMatch(/--hud-crt-row:\s*2px;/);
    expect(tokens).toContain("transparent 0 var(--hud-crt-row), var(--hud-crt-scan) var(--hud-crt-row) calc(2 * var(--hud-crt-row))");
  });

  it("keeps rows 2px under the condition view's zoom", () => {
    expect(conditionCss).toMatch(/#ui \.truck-condition \{[^}]*--crt-unzoom:\s*var\(--cond-unzoom, 1\)/);
    expect(crtRule()).toContain("var(--crt-unzoom, 1)");
  });

  it("is on the three condition layers and not on marks, hit or tip", () => {
    for (const name of ["condition-layers", "condition-hover", "condition-flashes"])
      expect(conditionView).toContain(`class: "${name} crt-picture"`);
    for (const name of ["condition-marks", "condition-hit", "condition-tip"]) expect(conditionView).not.toMatch(new RegExp(`"${name}[^"]*crt-picture`));
  });

  it("is on the chassis portrait and the inventory grid, drawn or not", () => {
    expect(read("./cards.ts")).toContain('"chassis-portrait crt-picture"');
    expect(read("./inventory-draw.ts")).toContain('look ? "inv-grid crt-picture drawn" : "inv-grid crt-picture"');
  });
});
