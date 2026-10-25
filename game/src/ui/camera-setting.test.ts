import { describe, expect, it } from "vitest";
import { CAMERA_KEY, CameraSetting, cameraSetting, loadCameraSetting } from "./camera-setting";

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
