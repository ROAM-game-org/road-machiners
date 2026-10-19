import { describe, expect, it } from "vitest";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { pressureHint, townPageOnOpen } from "./town";
import { shortBy } from "./shop-rows";
import { SHOPS, type ShopDef } from "../data/market";
import { placeProse } from "../text/names";
import type { ShopState } from "../sim/market";

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
  const def = { makes: ["salt"], needs: ["scrap"] } as unknown as ShopDef;
  const state = (pressure: Record<string, number>) => ({ pressure }) as unknown as ShopState;

  it("tints a made good as cheap and a needed good as dear", () => {
    expect(hint(def, state({}), "salt")).toEqual({ tone: "good", title: "Cheap here" });
    expect(hint(def, state({}), "scrap")).toEqual({ tone: "bad", title: "Dear here" });
  });

  it("says nothing about a good the shop neither makes nor needs", () => {
    expect(pressureHint(def, state({}), "parts")).toBeNull();
  });

  it("lets a strong price pressure outrank what the shop makes", () => {
    expect(hint(def, state({ salt: 1 }), "salt")).toEqual({ tone: "bad", title: "Short here" });
    expect(hint(def, state({ scrap: -1 }), "scrap")).toEqual({ tone: "good", title: "Flooded here" });
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
