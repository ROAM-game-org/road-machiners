import { describe, expect, it } from "vitest";
import { CAMERA_KEY, CameraSetting, RENDER_SCALE_KEY, RenderScaleSetting, cameraSetting, followRenderScale, loadCameraSetting, loadRenderScaleSetting, renderScaleSetting } from "./camera-setting";

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("camera setting", () => {
  it("is auto with nothing stored or with a value it does not know", () => {
    expect(new CameraSetting(store()).mode()).toBe("auto");
    expect(new CameraSetting(store({ [CAMERA_KEY]: "wide" })).mode()).toBe("auto");
    expect(new CameraSetting(store({ [CAMERA_KEY]: "auto" })).mode()).toBe("auto");
    expect(new CameraSetting(store({ [CAMERA_KEY]: "centered" })).mode()).toBe("centered");
  });

  it("stores the pick and tells subscribers until they leave", () => {
    const saved = store();
    const setting = new CameraSetting(saved);
    const seen: string[] = [];
    const leave = setting.subscribe(() => seen.push(setting.mode()));
    setting.set("centered");
    expect(saved.data.get(CAMERA_KEY)).toBe("centered");
    setting.set("centered");
    leave();
    setting.set("auto");
    expect(saved.data.get(CAMERA_KEY)).toBe("auto");
    expect(seen).toEqual(["centered"]);
  });

  it("flips between the two modes and stores each", () => {
    const saved = store();
    const setting = new CameraSetting(saved);
    setting.toggle();
    expect(setting.mode()).toBe("centered");
    expect(saved.data.get(CAMERA_KEY)).toBe("centered");
    setting.toggle();
    expect(setting.mode()).toBe("auto");
  });

  it("makes the loaded setting the one every screen reads", () => {
    const loaded = loadCameraSetting(store({ [CAMERA_KEY]: "centered" }));
    expect(cameraSetting()).toBe(loaded);
    expect(cameraSetting().mode()).toBe("centered");
  });
});

describe("render scale setting", () => {
  it("is full with nothing stored or with a value it does not know", () => {
    expect(new RenderScaleSetting(store()).scale()).toBe(1);
    expect(new RenderScaleSetting(store({ [RENDER_SCALE_KEY]: "0.6" })).scale()).toBe(1);
    expect(new RenderScaleSetting(store({ [RENDER_SCALE_KEY]: "half" })).scale()).toBe(1);
    expect(new RenderScaleSetting(store({ [RENDER_SCALE_KEY]: "0.75" })).scale()).toBe(0.75);
    expect(new RenderScaleSetting(store({ [RENDER_SCALE_KEY]: "0.5" })).scale()).toBe(0.5);
  });

  it("stores the pick and tells subscribers until they leave", () => {
    const saved = store();
    const setting = new RenderScaleSetting(saved);
    const seen: number[] = [];
    const leave = setting.subscribe(() => seen.push(setting.scale()));
    setting.set(0.75);
    expect(saved.data.get(RENDER_SCALE_KEY)).toBe("0.75");
    setting.set(0.75);
    leave();
    setting.set(0.5);
    expect(saved.data.get(RENDER_SCALE_KEY)).toBe("0.5");
    expect(seen).toEqual([0.75]);
  });

  it("gives the renderer a share of the screen pixel density", () => {
    const setting = new RenderScaleSetting(store());
    expect(setting.pixelRatio(2)).toBe(2);
    setting.set(0.75);
    expect(setting.pixelRatio(2)).toBe(1.5);
    setting.set(0.5);
    expect(setting.pixelRatio(2)).toBe(1);
    expect(setting.pixelRatio(1)).toBe(0.5);
  });

  it("keeps the loaded setting for the game to read", () => {
    const loaded = loadRenderScaleSetting(store({ [RENDER_SCALE_KEY]: "0.5" }));
    expect(renderScaleSetting()).toBe(loaded);
    expect(renderScaleSetting().scale()).toBe(0.5);
  });

  it("sets the renderer's ratio at once and again with a refit on each pick", () => {
    loadRenderScaleSetting(store());
    const ratios: number[] = [];
    let refits = 0;
    followRenderScale({ setPixelRatio: (r) => ratios.push(r) }, () => 2, () => refits++);
    renderScaleSetting().set(0.75);
    expect(ratios).toEqual([2, 1.5]);
    expect(refits).toBe(1);
  });
});
