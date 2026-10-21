import { describe, expect, it } from "vitest";
import { BODY_ID, EMPTY_ID, TINTS, boundsOf, centerOf, cropOf, flipRows, hiddenOver, idsOf, linearToSrgb, partMaskOf, regionOf, ringed, solidMaskOf, tintMask, unpremultiply } from "./portraitPixels";

const size = (width: number, height: number) => ({ width, height });

function ids(width: number, rows: number[][]): Uint16Array {
  return Uint16Array.from(rows.flat());
}

function litAll(count: number, alpha = 255): Uint8ClampedArray {
  const lit = new Uint8ClampedArray(count * 4);
  for (let p = 0; p < count; p++) lit.set([120, 100, 80, alpha], p * 4);
  return lit;
}

describe("partMaskOf", () => {
  it("keeps the lit pixels of one part and clears the rest", () => {
    const map = ids(3, [[0, 2, 2], [1, 2, 3]]);
    const mask = partMaskOf(litAll(6), map, 2);
    const alphas = Array.from({ length: 6 }, (_, p) => mask[p * 4 + 3]);
    expect(alphas).toEqual([0, 255, 255, 0, 255, 0]);
    expect(Array.from(mask.slice(4, 8))).toEqual([120, 100, 80, 255]);
  });

  it("drops pixels the lit render left transparent", () => {
    const map = ids(2, [[2, 2]]);
    const lit = litAll(2);
    lit[7] = 0;
    const mask = partMaskOf(lit, map, 2);
    expect([mask[3], mask[7]]).toEqual([255, 0]);
  });

  it("rejects a lit buffer of another size", () => {
    expect(() => partMaskOf(litAll(3), ids(2, [[0, 0]]), 2)).toThrow();
  });
});

describe("centerOf", () => {
  it("is a part pixel next to the middle of the part's pixels", () => {
    const map = ids(4, [[0, 0, 0, 0], [0, 5, 5, 0], [0, 5, 5, 0], [0, 0, 0, 0]]);
    expect(centerOf(map, size(4, 4), 5)).toEqual({ x: 1.5, y: 1.5 });
  });

  it("stays on the part when the middle of a bent part falls outside it", () => {
    const map = ids(3, [[5, 5, 5], [0, 0, 5], [0, 0, 5]]);
    const c = centerOf(map, size(3, 3), 5);
    expect(map[Math.floor(c.y) * 3 + Math.floor(c.x)]).toBe(5);
  });

  it("fails loud for a part with no pixels", () => {
    expect(() => centerOf(ids(2, [[0, 0]]), size(2, 1), 7)).toThrow();
  });
});

describe("ringed", () => {
  it("draws an unbroken ring of the color around the region and keeps the inside", () => {
    const px = new Uint8ClampedArray(5 * 5 * 4);
    const region = new Uint8Array(25);
    region[12] = 1;
    px.set([9, 9, 9, 255], 12 * 4);
    const out = ringed(px, region, size(5, 5), 1, [200, 100, 0]);
    const alpha = Array.from({ length: 25 }, (_, p) => (out[p * 4 + 3] ? 1 : 0));
    expect(alpha).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(out.subarray(12 * 4, 12 * 4 + 4))).toEqual([9, 9, 9, 255]);
    expect(Array.from(out.subarray(6 * 4, 6 * 4 + 4))).toEqual([200, 100, 0, 255]);
  });

  it("rings the cells of a part even where the part has no pixels", () => {
    const mask = new Uint8ClampedArray(3 * 4);
    const region = regionOf(mask, ids(3, [[0, 4, 0]]), 4);
    expect(Array.from(region)).toEqual([0, 1, 0]);
  });
});

describe("solidMaskOf", () => {
  it("fills every pixel of the id opaque and leaves the rest clear", () => {
    const mask = solidMaskOf(ids(3, [[4, BODY_ID, 4]]), 4);
    expect(Array.from(mask)).toEqual([255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
  });
});

describe("hiddenOver", () => {
  it("claims only body pixels", () => {
    const map = ids(4, [[EMPTY_ID, BODY_ID, 3, BODY_ID]]);
    const hidden = ids(4, [[8, 8, 8, EMPTY_ID]]);
    expect(Array.from(hiddenOver(map, hidden))).toEqual([EMPTY_ID, 8, 3, BODY_ID]);
  });
});

describe("idsOf", () => {
  it("reads the id from red and green and treats clear pixels as empty", () => {
    const rgba = Uint8ClampedArray.from([5, 0, 0, 255, 0x2c, 0x01, 0, 255, 9, 9, 9, 0]);
    expect(Array.from(idsOf(rgba))).toEqual([5, 0x12c, EMPTY_ID]);
  });
});

describe("boundsOf and cropOf", () => {
  it("crops a mask to its lit pixels", () => {
    const rgba = new Uint8ClampedArray(4 * 3 * 4);
    rgba.set([9, 9, 9, 255], (1 * 4 + 1) * 4);
    rgba.set([7, 7, 7, 255], (2 * 4 + 2) * 4);
    const box = boundsOf(rgba, size(4, 3));
    expect(box).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(Array.from(cropOf(rgba, size(4, 3), box))).toEqual([9, 9, 9, 255, 0, 0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 255]);
  });

  it("fails loud on a mask with no lit pixels", () => {
    expect(() => boundsOf(new Uint8ClampedArray(16), size(2, 2))).toThrow();
  });
});

describe("tintMask", () => {
  function gradient(): Uint8ClampedArray {
    const mask = new Uint8ClampedArray(100 * 4);
    for (let p = 0; p < 100; p++) mask.set([p * 2, p * 2, p * 2, 255], p * 4);
    return mask;
  }

  it("recolors with the tint and maps brightness between its levels", () => {
    const out = tintMask(gradient(), TINTS.hurt);
    const tint = TINTS.hurt;
    const darkest = out.slice(0, 3);
    const brightest = out.slice(99 * 4, 99 * 4 + 3);
    expect(darkest[0]).toBeCloseTo(tint.rgb[0] * tint.lo, 0);
    expect(brightest[0]).toBeCloseTo(tint.rgb[0] * tint.hi, 0);
    expect(brightest[2]).toBeCloseTo(tint.rgb[2] * tint.hi, 0);
  });

  it("gives a flat patch the full tint, not the darkest level", () => {
    const flat = litAll(50);
    const out = tintMask(flat, TINTS.crit);
    expect(out[0]).toBeCloseTo(TINTS.crit.rgb[0] * TINTS.crit.hi, 0);
  });

  it("keeps alpha and skips clear pixels", () => {
    const mask = gradient();
    mask.set([200, 200, 200, 0], 0);
    const out = tintMask(mask, TINTS.steel);
    expect(Array.from(out.slice(0, 4))).toEqual([200, 200, 200, 0]);
    expect(out[7]).toBe(255);
  });

  it("fails loud on a mask with no pixels", () => {
    expect(() => tintMask(new Uint8ClampedArray(8), TINTS.tire)).toThrow();
  });
});

describe("readback fixes", () => {
  it("divides color by alpha", () => {
    const px = Uint8ClampedArray.from([10, 20, 5, 51, 9, 9, 9, 0]);
    unpremultiply(px);
    expect(Array.from(px.slice(0, 4))).toEqual([50, 100, 25, 51]);
    expect(Array.from(px.slice(4, 8))).toEqual([9, 9, 9, 0]);
  });

  it("encodes linear bytes to sRGB and leaves alpha", () => {
    const px = Uint8ClampedArray.from([0, 13, 255, 77]);
    linearToSrgb(px);
    expect(Array.from(px)).toEqual([0, 64, 255, 77]);
  });

  it("flips rows", () => {
    const px = Uint8ClampedArray.from([1, 1, 1, 1, 2, 2, 2, 2]);
    flipRows(px, 1, 2);
    expect(Array.from(px)).toEqual([2, 2, 2, 2, 1, 1, 1, 1]);
  });

  it("flips id rows too", () => {
    const map = Uint16Array.from([1, 2, 3, 4]);
    flipRows(map, 2, 2);
    expect(Array.from(map)).toEqual([3, 4, 1, 2]);
  });
});
