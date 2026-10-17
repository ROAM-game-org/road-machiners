import { describe, expect, it } from "vitest";
import { appliedSize, fitsLayer, LAYER_MIN, loadUiSize, UI_SIZE_KEY, UI_SIZES, UiSize, type LayerBox } from "./ui-size";

const PHONE = { width: 798, height: 375 };
const PORTRAIT = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 720 };
const BIG = { width: 3840, height: 2160 };

function fitting(window: { width: number; height: number }): number[] {
  return UI_SIZES.filter((s) => fitsLayer(s, window, LAYER_MIN));
}

function layer(): LayerBox {
  return { style: { width: "", height: "", transform: "", transformOrigin: "" } };
}

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

function root() {
  const props = new Map<string, string>();
  return { style: { setProperty: (n: string, v: string) => void props.set(n, v) }, props };
}

describe("fitting steps", () => {
  it("offers 80, 90 and 100 on the reporter's phone", () => {
    expect(fitting(PHONE)).toEqual([0.8, 0.9, 1]);
  });
  it("offers the same on a portrait phone", () => {
    expect(fitting(PORTRAIT)).toEqual([0.8, 0.9, 1]);
  });
  it("offers every step on a laptop and on a 4K screen", () => {
    expect(fitting(LAPTOP)).toEqual([...UI_SIZES]);
    expect(fitting(BIG)).toEqual([...UI_SIZES]);
  });
  it("applies the largest fitting step at most the pick", () => {
    expect(appliedSize(1.3, PHONE, LAYER_MIN)).toBe(1);
    expect(appliedSize(0.9, PHONE, LAYER_MIN)).toBe(0.9);
    expect(appliedSize(1.3, LAPTOP, LAYER_MIN)).toBe(1.3);
  });
  it("falls back to 80% on a window too small for any step", () => {
    expect(appliedSize(1, { width: 400, height: 200 }, LAYER_MIN)).toBe(0.8);
    expect(appliedSize(1, { width: 512, height: 288 }, LAYER_MIN)).toBe(0.8);
  });
  it("throws on a pick that is no step", () => {
    expect(() => appliedSize(1.1, LAPTOP, LAYER_MIN)).toThrow();
  });
  it("throws on a non-finite or non-positive size", () => {
    expect(() => fitsLayer(Number.NaN, LAPTOP, LAYER_MIN)).toThrow();
    expect(() => fitsLayer(0, LAPTOP, LAYER_MIN)).toThrow();
    expect(() => fitsLayer(-1, LAPTOP, LAYER_MIN)).toThrow();
  });
});

describe("UiSize", () => {
  it("writes no style at 100%", () => {
    const box = layer();
    new UiSize(null, [box], root(), LAPTOP, 1);
    expect(box.style).toEqual({ width: "", height: "", transform: "", transformOrigin: "" });
  });
  it("sizes the layer box by the layer units and scales it at 130%", () => {
    const box = layer();
    const scale = root();
    new UiSize(null, [box], scale, LAPTOP, 1.3);
    expect(box.style.transform).toBe("scale(1.3)");
    expect(box.style.transformOrigin).toBe("0 0");
    expect(box.style.width).toBe("var(--layer-w)");
    expect(box.style.height).toBe("var(--layer-h)");
    expect(scale.props.get("--ui-scale")).toBe("1.3");
  });
  it("clears the style when the size returns to 100%", () => {
    const box = layer();
    const size = new UiSize(null, [box], root(), LAPTOP, 0.8);
    size.set(1);
    expect(box.style.transform).toBe("");
    expect(box.style.width).toBe("");
  });
  it("keeps the stored pick when a turn makes it too big", () => {
    const saved = store();
    const size = new UiSize(saved, [layer()], root(), LAPTOP, 1);
    size.set(1.3);
    size.refit({ width: 720, height: 1280 / 1.3 });
    size.refit(PHONE);
    expect(size.applied()).toBe(1);
    expect(size.pick()).toBe(1.3);
    expect(saved.data.get(UI_SIZE_KEY)).toBe("1.3");
    size.refit(LAPTOP);
    expect(size.applied()).toBe(1.3);
  });
  it("keeps the last good layer on a zero or non-finite window", () => {
    const size = new UiSize(null, [layer()], root(), LAPTOP, 1.3);
    size.refit({ width: 0, height: 0 });
    size.refit({ width: Number.NaN, height: 300 });
    expect(size.applied()).toBe(1.3);
    expect(size.layerSize().width).toBeCloseTo(1280 / 1.3);
  });
  it("converts pixels, points and rects to layer pixels", () => {
    const small = new UiSize(null, [], null, LAPTOP, 0.8);
    const big = new UiSize(null, [], null, LAPTOP, 1.3);
    expect(small.toLayer(80)).toBeCloseTo(100);
    expect(big.toLayer(130)).toBeCloseTo(100);
    expect(big.layerPoint(130, 260)).toEqual({ x: 100, y: 200 });
    const rect = { getBoundingClientRect: () => ({ left: 13, top: 26, right: 39, bottom: 52, width: 26, height: 26 }) };
    expect(big.layerRect(rect)).toEqual({ left: 10, top: 20, right: 30, bottom: 40, width: 20, height: 20 });
  });
  it("notifies subscribers on a pick and stops after unsubscribe", () => {
    const size = new UiSize(null, [], null, LAPTOP, 1);
    let calls = 0;
    const off = size.subscribe(() => calls++);
    size.set(1.15);
    off();
    size.set(1);
    expect(calls).toBe(1);
  });
});

describe("loadUiSize", () => {
  it("loads 100% for a missing or unknown stored value", () => {
    expect(loadUiSize(store(), "", false, [], root(), LAPTOP).pick()).toBe(1);
    expect(loadUiSize(store({ [UI_SIZE_KEY]: "7" }), "", false, [], root(), LAPTOP).pick()).toBe(1);
  });
  it("loads the stored pick", () => {
    expect(loadUiSize(store({ [UI_SIZE_KEY]: "0.8" }), "", false, [], root(), LAPTOP).pick()).toBe(0.8);
  });
  it("takes ?ui-size in dev for the visit without storing it", () => {
    const saved = store();
    expect(loadUiSize(saved, "?ui-size=130", true, [], root(), LAPTOP).pick()).toBe(1.3);
    expect(saved.data.size).toBe(0);
    expect(loadUiSize(saved, "?ui-size=130", false, [], root(), LAPTOP).pick()).toBe(1);
  });
});
