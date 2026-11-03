import { describe, expect, it } from "vitest";
import { loadMinimapSetting, MINIMAP_KEY, MinimapSetting, minimapSetting } from "./minimap-setting";

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("minimap setting", () => {
  it("is off with nothing stored or with a value it does not know", () => {
    expect(new MinimapSetting(store()).on()).toBe(false);
    expect(new MinimapSetting(store({ [MINIMAP_KEY]: "yes" })).on()).toBe(false);
    expect(new MinimapSetting(store({ [MINIMAP_KEY]: "off" })).on()).toBe(false);
    expect(new MinimapSetting(store({ [MINIMAP_KEY]: "on" })).on()).toBe(true);
  });

  it("stores the pick and tells subscribers until they leave", () => {
    const saved = store();
    const setting = new MinimapSetting(saved);
    const seen: boolean[] = [];
    const leave = setting.subscribe(() => seen.push(setting.on()));
    setting.set(true);
    expect(saved.data.get(MINIMAP_KEY)).toBe("on");
    setting.set(true);
    leave();
    setting.set(false);
    expect(saved.data.get(MINIMAP_KEY)).toBe("off");
    expect(seen).toEqual([true]);
  });

  it("makes the loaded setting the one every screen reads", () => {
    const loaded = loadMinimapSetting(store({ [MINIMAP_KEY]: "on" }));
    expect(minimapSetting()).toBe(loaded);
    expect(minimapSetting().on()).toBe(true);
  });
});
