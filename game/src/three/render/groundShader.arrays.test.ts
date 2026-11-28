import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./groundShader.ts", import.meta.url), "utf8");

describe("ground shader source", () => {
  it("hashes ground noise by whole lattice corners, so neighbouring cells share each corner", () => {
    const body = source.match(/float noiseHash\(vec2 p\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(body).toContain("ivec2");
    expect(body).not.toMatch(/\b(sin|cos)\(/);
  });

  it("builds no array constructor, which some Android drivers compile without a precision", () => {
    expect(source).not.toMatch(/\b(vec[234]|ivec[234]|float|int)\s*\[\s*\w+\s*\]\s*\(/);
  });

  it("declares no local array of values", () => {
    expect(source).not.toMatch(/^\s*(vec[234]|ivec[234]|float|int)\s+\w+\s*\[\s*\w+\s*\]\s*=/m);
  });

  it("ranks no pair of materials for the border, so a third material draws no straight cut", () => {
    expect(source).not.toMatch(/drawnPairField|\.lo\b|\.hi\b|drawnSamePair/);
  });
});
