import { describe, expect, it } from "vitest";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { pressureHint } from "./town";
import { shortBy } from "./shop-rows";
import { SHOPS } from "../data/market";
import { stockTarget, type ShopState } from "../sim/market";

const en = (msg: Msg | null): string | null => (msg === null ? null : resolve(msg, "en"));
const hint = (...args: Parameters<typeof pressureHint>) => {
  const found = pressureHint(...args);
  return found && { tone: found.tone, title: en(found.title) };
};

describe("the reason a purchase is out of reach", () => {
  it("is empty when the money covers the price", () => {
    expect(shortBy(1000, 1000)).toBeNull();
    expect(shortBy(5000, 1000)).toBeNull();
  });

  it("names the missing money in whole M", () => {
    expect(en(shortBy(0, 1200))).toBe("Need 12 M's more");
  });

  it("counts a debt into what is missing", () => {
    expect(en(shortBy(-300, 1200))).toBe("Need 15 M's more");
  });
});

describe("the price hint of a good", () => {
  const def = SHOPS.nose;
  const state = (goods: Record<string, number>) => ({ goods: { salt: stockTarget("nose", "salt"), scrap: stockTarget("nose", "scrap"), ...goods } }) as unknown as ShopState;

  it("tints a made good as cheap and a needed good as dear", () => {
    expect(hint(def, state({}), "salt")).toEqual({ tone: "good", title: "Cheap here" });
    expect(hint(def, state({}), "scrap")).toEqual({ tone: "bad", title: "Dear here" });
  });

  it("lets a strong stock shortage or glut outrank what the shop makes", () => {
    expect(hint(def, state({ salt: 0 }), "salt")).toEqual({ tone: "bad", title: "Short here" });
    expect(hint(def, state({ scrap: 2 * stockTarget("nose", "scrap") }), "scrap")).toEqual({ tone: "good", title: "Flooded here" });
  });
});
