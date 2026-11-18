import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./groundShader.ts", import.meta.url), "utf8");

describe("ground shader source", () => {
  it("builds no array constructor, which some Android drivers compile without a precision", () => {
    expect(source).not.toMatch(/\b(vec[234]|ivec[234]|float|int)\s*\[\s*\w+\s*\]\s*\(/);
  });

  it("declares no local array of values", () => {
    expect(source).not.toMatch(/^\s*(vec[234]|ivec[234]|float|int)\s+\w+\s*\[\s*\w+\s*\]\s*=/m);
  });
});
