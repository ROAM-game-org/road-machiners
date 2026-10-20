import { describe, expect, it } from "vitest";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { goodRoutesTitle, pressureHint, showsRelief } from "./town";
import { resetSeeAll, toggleSeeAll } from "./see-all";
import { emptyWorld } from "../sim/testkit";
import { RELIEF } from "../data/market";
import { shortHere } from "../sim/market";
import { livePaintPick, paintStyle, shortBy } from "./shop-rows";
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

describe("the paint row", () => {
  it("colors each swatch with its preset's body and cab", () => {
    expect(paintStyle("standard")).toBe("--paint-top:#9c7a3e;--paint-cab:#7e8a5a");
    expect(paintStyle("bone")).toBe("--paint-top:#f4e8c0;--paint-cab:#26346a");
  });

  it("offers a repaint only for a pick that differs from the current paint", () => {
    expect(livePaintPick("standard", null)).toBeNull();
    expect(livePaintPick("standard", "standard")).toBeNull();
    expect(livePaintPick("standard", "mint")).toBe("mint");
    expect(livePaintPick("mint", "mint")).toBeNull();
  });
});
