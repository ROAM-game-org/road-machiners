import { describe, expect, it } from "vitest";
import { COARSE_QUERY, inputModeOf, PHONE_MAX, phoneQuery } from "./input-mode";

function screen(width: number, height: number, coarse: boolean): (q: string) => boolean {
  return (q) => {
    if (q === COARSE_QUERY) return coarse;
    if (q === phoneQuery(PHONE_MAX)) return width <= PHONE_MAX.width || height <= PHONE_MAX.height;
    throw new Error(`unexpected query ${q}`);
  };
}

describe("input mode", () => {
  it("is touch and phone on a portrait phone", () => {
    expect(inputModeOf(screen(390, 844, true))).toEqual({ touch: true, phone: true });
  });
  it("is touch and phone on a landscape phone", () => {
    expect(inputModeOf(screen(844, 390, true))).toEqual({ touch: true, phone: true });
  });
  it("is neither on a desktop window", () => {
    expect(inputModeOf(screen(1280, 720, false))).toEqual({ touch: false, phone: false });
  });
  it("is phone but not touch on a narrow desktop window", () => {
    expect(inputModeOf(screen(700, 800, false))).toEqual({ touch: false, phone: false });
    expect(inputModeOf(screen(500, 800, false))).toEqual({ touch: false, phone: true });
  });
  it("is touch but not phone on a tablet", () => {
    expect(inputModeOf(screen(1024, 768, true))).toEqual({ touch: true, phone: false });
  });
});
