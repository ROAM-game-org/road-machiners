import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { GARAGE_ONLY, goodRoutesTitle, marketHint, newsWell, pressureHint, showsRelief, townPageOnOpen, tradeEstimate } from "./town";
import { resetSeeAll, toggleSeeAll } from "./see-all";
import { emptyWorld } from "../sim/testkit";
import { RELIEF, SHOPS } from "../data/market";
import { shortHere, stockTarget, type ShopState } from "../sim/market";
import { livePaintPlan, paletteStyle, planWithSlot, schemeStyle, shortBy } from "./shop-rows";
import { PAINT, PAINT_SCHEMES } from "../data/chassis";
import { placeProse } from "../text/names";

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
    expect(paletteStyle("slate")).toBe("--paint:#4a5060");
  });

  it("offers a repaint only for a plan that differs from the current paint in some slot", () => {
    expect(livePaintPlan(PAINT.standard, null)).toBeNull();
    expect(livePaintPlan(PAINT.standard, { ...PAINT.standard })).toBeNull();
    expect(livePaintPlan(PAINT.standard, { ...PAINT.standard, gear: "chalk" })).toEqual({ ...PAINT.standard, gear: "chalk" });
    expect(livePaintPlan({ ...PAINT.standard, cab: "slate" }, { ...PAINT.standard, cab: "slate" })).toBeNull();
  });

  it("colors a scheme chip with the body, cab and gear of its scheme", () => {
    expect(schemeStyle({ body: "slate", cab: "chalk", gear: "petrol" })).toBe("--paint-body:#4a5060;--paint-cab:#f0ece2;--paint-gear:#1e5258");
  });

  it("plans a scheme whole and lets one row pick change only that surface", () => {
    const scheme = PAINT_SCHEMES[3];
    const plan = planWithSlot(PAINT.standard, { ...scheme }, "cab", "sand");
    expect(plan).toEqual({ ...scheme, cab: "sand" });
    expect(planWithSlot(PAINT.standard, null, "gear", "umber")).toEqual({ ...PAINT.standard, gear: "umber" });
    expect(livePaintPlan(PAINT.standard, { ...PAINT_SCHEMES[0] })).toBeNull();
  });

  it("shows only at a garage, right after the trucks", () => {
    expect(GARAGE_ONLY).toEqual(["trucks", "paint"]);
  });
});

describe("the town page on open", () => {
  const open = { open: true } as const;
  const access = { garage: open, market: open, board: open, people: open, bar: { open: false, reason: "noDrivers" } } as const;
  const closedAt = { shopId: "nose", turn: 40 };

  it("keeps the page the player left when the place and the turn are the same", () => {
    expect(townPageOnOpen("garage", closedAt, "nose", 40, access)).toBe("garage");
  });

  it("opens on the front page after a turn, at another place or into a section now off", () => {
    expect(townPageOnOpen("garage", closedAt, "nose", 41, access)).toBeNull();
    expect(townPageOnOpen("garage", closedAt, "bowl", 40, access)).toBeNull();
    expect(townPageOnOpen("bar", closedAt, "nose", 40, access)).toBeNull();
  });

  it("opens on the front page on a first visit", () => {
    expect(townPageOnOpen("garage", null, "nose", 40, access)).toBeNull();
    expect(townPageOnOpen(null, closedAt, "nose", 40, access)).toBeNull();
  });
});

describe("the front page prose", () => {
  it("has a paragraph for every place with a shop, in English and Russian", () => {
    for (const id of Object.keys(SHOPS)) {
      expect(resolve(placeProse(id), "en").length, id).toBeGreaterThan(40);
      expect(resolve(placeProse(id), "ru").length, id).toBeGreaterThan(40);
    }
  });
});

class FakeNode {
  className = "";
  style = { setProperty: () => {} };
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) {
    this.children.push(...c);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  addEventListener() {}
  text(): string {
    return this.children.map((c) => (typeof c === "string" ? c : c.text())).join("");
  }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    const here = pred(this) ? [this] : [];
    return [...here, ...this.children.flatMap((c) => (typeof c === "string" ? [] : c.all(pred)))];
  }
  has(cls: string): boolean {
    return this.className.split(" ").includes(cls);
  }
}

describe("the road news well", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => new FakeNode(tag),
      createElementNS: (_ns: string, tag: string) => new FakeNode(tag),
      createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is absent without news", () => {
    expect(newsWell(emptyWorld())).toBeNull();
  });

  it("has a caption, counts crates above one and explains each kind on hover", () => {
    const w = emptyWorld();
    w.turn = 100;
    w.roadNews = [
      { turn: 90, kind: "robbed", good: "rations", units: 2, from: "granary", to: "bowl" },
      { turn: 90, kind: "knockedOut", good: "grain", units: 1, from: "bowl", to: "granary" },
      { turn: 90, kind: "destroyed", good: "salt", units: 1, from: "bowl", to: "granary" },
    ];
    const well = newsWell(w) as unknown as FakeNode;
    expect(well.all((n) => n.has("news-head")).map((n) => n.text())).toEqual(["Road news"]);
    const rows = well.all((n) => n.has("news-row")).reverse();
    const counts = rows.map((r) => r.all((n) => n.has("recipe-good"))[0].all((n) => n.has("num")).map((n) => n.text())[0] ?? null);
    expect(counts).toEqual(["2", null, null]);
    expect(rows.map((r) => r.attrs.get("title"))).toEqual([
      expect.stringContaining("was robbed"),
      expect.stringContaining("knocked out"),
      expect.stringContaining("destroyed"),
    ]);
  });
});
