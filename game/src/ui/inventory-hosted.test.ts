import { afterEach, describe, expect, it, vi } from "vitest";
import { REGION } from "../data/region";
import { makePart } from "../sim/factory";
import { playerVehicle } from "../sim/damage";
import { sitePads } from "../sim/sites";
import { addVehicle, emptyWorld } from "../sim/testkit";
import type { World } from "../sim/types";
import { FakeNode, stubDom, ui } from "./inventory-fake-dom";
import { InventoryView } from "./inventory";

const bowl = REGION.towns.find((t) => t.id === "bowl")!;

function garageWorld(stored: number): World {
  const w = emptyWorld(sitePads(bowl)[0]);
  addVehicle(w, "independent", "buggy", ["mg", "stockEngine"], sitePads(bowl)[0]);
  for (let i = 0; i < stored; i++) w.player.storage.push(makePart(w, "cage", 0));
  return w;
}

function hostedView(w: World, selected: string | null): FakeNode {
  stubDom();
  const host = { world: () => w, apply: () => {}, announce: () => {}, searchStock: () => {}, menuOpen: () => false, getTurnPhase: () => null } as never;
  const view = new InventoryView(host, () => {}, true);
  (view as unknown as { selectedItem: string | null }).selectedItem = selected;
  return view.render() as unknown as FakeNode;
}

const named = (root: FakeNode, cls: string) => root.all((n) => n.className.split(" ").includes(cls));

describe("the hosted inventory at a garage", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it("keeps stored parts on a screen of their own, apart from the card screen", () => {
    const w = garageWorld(3);
    const root = hostedView(w, playerVehicle(w).items.find((it) => it.kind === "part")!.id);
    const side = named(root, "inv-side")[0];
    const store = named(root, "inv-store")[0];
    expect(named(store, "inv-chip")).toHaveLength(3);
    expect(named(side, "inv-chip")).toHaveLength(0);
    expect(named(store, "inv-details")).toHaveLength(0);
    expect(named(side, "inv-details")).toHaveLength(1);
    expect(store.attrs.get("data-drop")).toBe("storage");
    expect(side.attrs.get("data-drop")).toBeUndefined();
  });

  it("keeps the cost lines first on the card screen", () => {
    const w = garageWorld(1);
    const root = hostedView(w, null);
    expect(named(root, "inv-side")[0].children[0]).toBe(named(root, "inv-costs")[0]);
  });

  it("prints the empty storage line on the storage screen", () => {
    const root = hostedView(garageWorld(0), null);
    expect(named(named(root, "inv-store")[0], "dim")).toHaveLength(2);
  });

  it("draws no storage screen away from a garage", () => {
    const w = garageWorld(2);
    playerVehicle(w).pos = { x: 5, y: 5 };
    expect(named(hostedView(w, null), "inv-store")).toHaveLength(0);
  });
});
