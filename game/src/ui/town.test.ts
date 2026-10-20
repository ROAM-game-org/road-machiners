import { describe, expect, it } from "vitest";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { GARAGE_ONLY, goodRoutesTitle, marketHint, pressureHint, showsRelief, tradeEstimate } from "./town";
import { resetSeeAll, toggleSeeAll } from "./see-all";
import { emptyWorld } from "../sim/testkit";
import { RELIEF } from "../data/market";
import { shortHere } from "../sim/market";
import { livePaintPlan, paletteStyle, shortBy } from "./shop-rows";
import { PAINT } from "../data/chassis";
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

describe("trade hints and the sale profit under Acumen", () => {
  const def = SHOPS.nose;
  const state = { goods: { salt: stockTarget("nose", "salt") } } as unknown as ShopState;

  it("are absent at Social 0, while the price stays", () => {
    const w = emptyWorld();
    w.player.costBasis.salt = 100;
    expect(marketHint(w, def, state, "salt")).toBeNull();
    expect(tradeEstimate(w, 3, 150, "salt")).toEqual({ kind: "none" });
  });

  it("show from Social 1", () => {
    const w = emptyWorld();
    w.player.ranks.social = 1;
    w.player.costBasis.salt = 100;
    expect(marketHint(w, def, state, "salt")?.tone).toBe("good");
    expect(tradeEstimate(w, 3, 150, "salt")).toEqual({ kind: "gain", perUnit: 50, avgCost: 100 });
  });
});

describe("production on the market tab", () => {
  const relieved = () => {
    const w = emptyWorld();
    w.turn = RELIEF.delayTurns + 10;
    w.shops.granary.goods.grain = 0;
    w.shops.granary.shortSince.grain = 0;
    return w;
  };

  it("hides where a good is made and used, and the slow import, from the player", () => {
    resetSeeAll();
    expect(goodRoutesTitle("grain")).toBeNull();
    expect(showsRelief(relieved(), "granary", "grain")).toBe(false);
  });

  it("shows them under see all", () => {
    resetSeeAll();
    toggleSeeAll();
    expect(en(goodRoutesTitle("grain"))).toMatch(/^Made at .*Bowl.*\. Used at .*Granary/);
    expect(showsRelief(relieved(), "granary", "grain")).toBe(true);
    resetSeeAll();
  });
});

describe("the short tone and the short rule", () => {
  it("agree for every shop and traded good at every stock level", () => {
    const w = emptyWorld();
    for (const def of Object.values(SHOPS)) {
      for (const good of def.goods) {
        const target = stockTarget(def.id, good);
        for (const stock of [0, Math.floor(target / 2), Math.floor(target * 0.7), target, target * 2]) {
          w.shops[def.id].goods[good] = stock;
          expect(hint(def, w.shops[def.id], good)?.title === "Short here").toBe(shortHere(w, def.id, good));
        }
      }
    }
  });
});

describe("the paint tab", () => {
  it("colors each swatch with its palette color", () => {
    expect(paletteStyle("tan")).toBe("--paint:#9c7a3e");
    expect(paletteStyle("navy")).toBe("--paint:#26346a");
  });

  it("offers a repaint only for a plan that differs from the current paint in some slot", () => {
    expect(livePaintPlan(PAINT.standard, null)).toBeNull();
    expect(livePaintPlan(PAINT.standard, { ...PAINT.standard })).toBeNull();
    expect(livePaintPlan(PAINT.standard, { ...PAINT.standard, gear: "mint" })).toEqual({ ...PAINT.standard, gear: "mint" });
    expect(livePaintPlan({ ...PAINT.standard, cab: "navy" }, { ...PAINT.standard, cab: "navy" })).toBeNull();
  });

  it("shows only at a garage, right after the trucks", () => {
    expect(GARAGE_ONLY).toEqual(["trucks", "paint"]);
  });
});
