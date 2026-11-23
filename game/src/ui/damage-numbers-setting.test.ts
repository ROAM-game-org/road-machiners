import { describe, expect, it } from "vitest";
import { loadDamageNumbersSetting, DAMAGE_NUMBERS_KEY, DamageNumbersSetting, damageNumbersSetting } from "./damage-numbers-setting";

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("damage numbers setting", () => {
  it("is on with nothing stored or with a value it does not know", () => {
    expect(new DamageNumbersSetting(store()).on()).toBe(true);
    expect(new DamageNumbersSetting(store({ [DAMAGE_NUMBERS_KEY]: "yes" })).on()).toBe(true);
    expect(new DamageNumbersSetting(store({ [DAMAGE_NUMBERS_KEY]: "off" })).on()).toBe(false);
    expect(new DamageNumbersSetting(store({ [DAMAGE_NUMBERS_KEY]: "on" })).on()).toBe(true);
  });

  it("stores the pick and tells subscribers until they leave", () => {
    const saved = store();
    const setting = new DamageNumbersSetting(saved);
    const seen: boolean[] = [];
    const leave = setting.subscribe(() => seen.push(setting.on()));
    setting.set(false);
    expect(saved.data.get(DAMAGE_NUMBERS_KEY)).toBe("off");
    setting.set(false);
    leave();
    setting.set(true);
    expect(saved.data.get(DAMAGE_NUMBERS_KEY)).toBe("on");
    expect(seen).toEqual([false]);
  });

  it("makes the loaded setting the one every screen reads", () => {
    const loaded = loadDamageNumbersSetting(store({ [DAMAGE_NUMBERS_KEY]: "off" }));
    expect(damageNumbersSetting()).toBe(loaded);
    expect(damageNumbersSetting().on()).toBe(false);
  });
});
