import { describe, expect, it } from "vitest";
import { clipped, coveredControl, escapes, intersect, latinLeft, outsideViewport, pairOverlaps, sidewaysOverflow, smallTarget } from "./dom";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("clipped", () => {
  const fits = { clientWidth: 100, clientHeight: 20, scrollWidth: 100, scrollHeight: 20 };
  const wide = { ...fits, scrollWidth: 140 };

  it("reports content wider than a box that clips sideways", () => {
    expect(clipped(wide, { x: true, y: false })).toBe(true);
  });

  it("lets content overflow a box that does not clip on that axis", () => {
    expect(clipped(wide, { x: false, y: true })).toBe(false);
  });

  it("forgives a pixel of rounding", () => {
    expect(clipped({ ...fits, scrollWidth: 101 }, { x: true, y: true })).toBe(false);
  });
});

describe("escapes", () => {
  it("reports text that pokes out of its clipping box", () => {
    expect(escapes(box(90, 0, 130, 20), box(0, 0, 100, 40))).toBe(true);
  });

  it("keeps text inside its box, and ignores an empty text box", () => {
    expect(escapes(box(10, 5, 90, 20), box(0, 0, 100, 40))).toBe(false);
    expect(escapes(box(500, 500, 500, 500), box(0, 0, 100, 40))).toBe(false);
  });
});

describe("intersect", () => {
  it("keeps the part of a control its scroll box shows", () => {
    expect(intersect(box(0, 90, 50, 120), box(0, 0, 100, 100))).toEqual(box(0, 90, 50, 100));
  });

  it("leaves an empty box for a control scrolled out of view, which overlaps nothing", () => {
    const hidden = intersect(box(0, 110, 50, 130), box(0, 0, 100, 100));
    expect(pairOverlaps([hidden, box(0, 105, 100, 140)])).toEqual([]);
  });
});

describe("pairOverlaps", () => {
  it("names each overlapping pair once", () => {
    expect(pairOverlaps([box(0, 0, 50, 20), box(40, 0, 90, 20), box(200, 0, 250, 20)])).toEqual([[0, 1]]);
  });

  it("lets touching boxes be", () => {
    expect(pairOverlaps([box(0, 0, 50, 20), box(50, 0, 90, 20)])).toEqual([]);
  });
});

describe("latinLeft", () => {
  it("finds Latin words in Russian text", () => {
    expect(latinLeft("Доставить Salt", [])).toBe(true);
  });

  it("lets allowed names and single letters stay", () => {
    expect(latinLeft("Бродяга Ada Volkov", ["Ada Volkov"])).toBe(false);
    expect(latinLeft("Ремонт [R], форсированный V8", [])).toBe(false);
  });
});

describe("sidewaysOverflow", () => {
  it("reports content wider than its box", () => {
    expect(sidewaysOverflow({ scrollWidth: 600, clientWidth: 390 })).toBe(true);
  });

  it("passes content that fits and forgives a pixel of rounding", () => {
    expect(sidewaysOverflow({ scrollWidth: 390, clientWidth: 390 })).toBe(false);
    expect(sidewaysOverflow({ scrollWidth: 391, clientWidth: 390 })).toBe(false);
  });
});

describe("outsideViewport", () => {
  it("reports a box that reaches past the window sideways", () => {
    expect(outsideViewport(box(0, 0, 600, 40), { width: 390 })).toBe(true);
    expect(outsideViewport(box(-40, 0, 100, 40), { width: 390 })).toBe(true);
  });

  it("passes a box inside the window", () => {
    expect(outsideViewport(box(10, 0, 380, 40), { width: 390 })).toBe(false);
  });
});

describe("coveredControl", () => {
  const control = { contains: (other: unknown) => other === child } as unknown as Element;
  const child = {} as Element;
  const cover = {} as Element;

  it("passes the control itself and its own child", () => {
    expect(coveredControl(control, control)).toBe(false);
    expect(coveredControl(child, control)).toBe(false);
  });

  it("reports another element on top and an empty point", () => {
    expect(coveredControl(cover, control)).toBe(true);
    expect(coveredControl(null, control)).toBe(true);
  });
});

describe("smallTarget", () => {
  it("reports a control under the minimum on either side", () => {
    expect(smallTarget(box(0, 0, 20, 40), 32)).toBe(true);
    expect(smallTarget(box(0, 0, 40, 24), 32)).toBe(true);
  });

  it("passes a control at the minimum and ignores an empty box", () => {
    expect(smallTarget(box(0, 0, 32, 32), 32)).toBe(false);
    expect(smallTarget(box(0, 0, 0, 0), 32)).toBe(false);
  });
});
