import { describe, expect, it } from "vitest";
import { partDef } from "../data/parts";
import { haulerOf, playerVehicle } from "../sim/damage";
import { canStowPart, stowPart } from "../sim/inventory";
import { chaosHighwayWorld, parkInYard } from "../sim/testkit";
import { endTurn } from "../sim/world";
import { filteredStock, GARAGE_TABS, kindFilter, sellableParts, STOCK_FILTERS, stockCount } from "./garage-tabs";
import { OUTPOST_TABS } from "./outpost";

function atOutpost() {
  const w = chaosHighwayWorld();
  parkInYard(w, 1);
  return endTurn(w, () => {});
}

describe("the garage tabs the outpost shares with the town", () => {
  it("offers every town garage tab, with the market first", () => {
    for (const tab of GARAGE_TABS) expect(OUTPOST_TABS).toContain(tab);
    expect(OUTPOST_TABS[0]).toBe("market");
  });

  it("filters a stock by kind and counts each kind", () => {
    const stock = atOutpost().chaosHighway!.outposts[1].stock;
    for (const f of STOCK_FILTERS) {
      const shown = filteredStock(stock, f);
      expect(stockCount(stock, f)).toBe(shown.length);
      if (f !== "all") expect(shown.every((p) => kindFilter(partDef(p.defId).kind) === f)).toBe(true);
    }
    expect(filteredStock(stock, "all")).toEqual(stock);
  });

  it("lists storage and only the shown truck's spares for sale", () => {
    const w = atOutpost();
    const hauler = haulerOf(w);
    const spare = w.chaosHighway!.outposts[1].stock.find((p) => canStowPart(hauler, p))!;
    stowPart(w, hauler, spare);

    expect(sellableParts(w, hauler).map((p) => p.id)).toEqual([spare.id]);
    expect(sellableParts(w, playerVehicle(w)).map((p) => p.id)).toEqual([]);
  });
});
