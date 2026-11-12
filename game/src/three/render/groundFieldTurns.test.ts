import { describe, expect, it } from "vitest";
import type { LookType } from "../../render/groundPaint";
import { FIELD_TURN_REACH, fieldTurns } from "./groundFieldTurns";

const SIDE = 20;

function map(fieldAt: (x: number, y: number) => boolean): LookType[] {
  return Array.from({ length: SIDE * SIDE }, (_, i) => (fieldAt(i % SIDE, Math.floor(i / SIDE)) ? "field" : "sand"));
}

describe("field furrow turns", () => {
  it("gives every tile of one field the same turn", () => {
    const turns = fieldTurns(map((x, y) => x >= 2 && x < 8 && y >= 2 && y < 8), SIDE);
    const first = turns[2 * SIDE + 2];
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) expect(turns[y * SIDE + x]).toBe(first);
  });

  it("gives two separate fields their own turns", () => {
    const turns = fieldTurns(map((x, y) => y >= 2 && y < 6 && (x < 4 || x >= 14)), SIDE);
    expect(turns[3 * SIDE + 1]).not.toBe(turns[3 * SIDE + 16]);
  });

  it("carries a field's turn a few tiles past its edge, so its warped border keeps the direction", () => {
    const turns = fieldTurns(map((x, y) => x >= 8 && x < 12 && y >= 8 && y < 12), SIDE);
    const own = turns[9 * SIDE + 9];
    expect(turns[9 * SIDE + 8 - FIELD_TURN_REACH]).toBe(own);
    expect(turns[9 * SIDE + 8 - FIELD_TURN_REACH - 1]).toBe(0);
  });
});
