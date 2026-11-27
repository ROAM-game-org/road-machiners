import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeNode, stubDom, ui } from "./inventory-fake-dom";
import { addGoods, stowParcel } from "../sim/inventory";
import { addVehicle, emptyWorld, sizedUp, spotWorld } from "../sim/testkit";
import type { GridItem, World } from "../sim/types";
import { PARCEL } from "../data/goods";
import { itemLookId } from "../render/partLooks";
import { LANGUAGE_KEY, loadLanguage, say } from "../text/language";
import { itemLore, itemLoreEl, partDetail } from "./cards";
import { lootGoodItem } from "./inventory-draw";
import { InventoryScreen } from "./inventory";

type Pickable = { view: { selectedItem: string | null; onChange(): void } };

function screenOver(world: World): InventoryScreen {
  stubDom();
  return new InventoryScreen({ world: () => world, apply: () => {}, announce: () => {}, searchStock: () => {}, getTurnPhase: () => null } as never);
}

function speak(lang: "en" | "ru"): void {
  const items = new Map([[LANGUAGE_KEY, lang]]);
  loadLanguage({ getItem: (k: string) => items.get(k) ?? null, setItem: () => {} } as never, "", false, null);
}

function textOf(n: FakeNode): string {
  return n.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}

function pick(screen: InventoryScreen, id: string): FakeNode {
  const view = (screen as unknown as Pickable).view;
  view.selectedItem = id;
  view.onChange();
  return ui.children[ui.children.length - 1] as FakeNode;
}

function loreOf(root: FakeNode): FakeNode[] {
  return root.all((n) => n.className.split(" ").includes("item-lore"));
}

function truckWithAllKinds(): { w: World; part: GridItem; good: GridItem; parcel: GridItem } {
  const w = emptyWorld();
  const me = w.vehicles[0];
  addGoods(w, me, "parts", 1);
  w.player.contracts.push({
    id: "c1", shop: "bowl", kind: "search", target: "t1", driver: "Jed Cobb", template: "trader",
    lead: { at: { x: 0, y: 0 }, turn: 0 }, reward: { money: 1 }, deadline: 900, window: 600, tier: 1, delivered: false,
  } as never);
  stowParcel(me, { id: "parcel1", x: 0, y: 0, rot: 0, kind: "parcel", contract: "c1" });
  const part = me.items.find((it) => it.kind === "part" && it.part.defId === "mg");
  const good = me.items.find((it) => it.kind === "good");
  const parcel = me.items.find((it) => it.kind === "parcel");
  if (!part || !good || !parcel) throw new Error("The truck lacks an item kind");
  return { w, part, good, parcel };
}

describe("the item lore on the inventory card", () => {
  afterEach(() => {
    ui.children = [];
    speak("en");
    vi.unstubAllGlobals();
  });

  for (const lang of ["en", "ru"] as const) {
    it(`puts the lore right under the title on the card of a part, a good and the parcel with its lore in ${lang}`, () => {
      speak(lang);
      const { w, part, good, parcel } = truckWithAllKinds();
      const screen = screenOver(w);
      screen.toggle();
      for (const item of [part, good, parcel]) {
        const root = pick(screen, item.id);
        const lore = loreOf(root);
        expect(lore).toHaveLength(1);
        expect(textOf(lore[0])).toBe(say(itemLore(itemLookId(item))));
        const details = root.all((n) => n.className.split(" ").includes("inv-details"))[0];
        expect(details.children[1]).toBe(lore[0]);
      }
      expect(PARCEL.id).toBe(itemLookId(parcel));
    });
  }

  it("shows no lore while nothing is picked", () => {
    const { w } = truckWithAllKinds();
    const screen = screenOver(w);
    screen.toggle();
    expect(loreOf(ui.children[ui.children.length - 1] as FakeNode)).toHaveLength(0);
  });

  it("shows the lore of a loot good", () => {
    const { w, stock } = spotWorld();
    stock.goods = { parts: 2 };
    const screen = screenOver(w);
    screen.openLoot(stock.id);
    const items = Object.keys(stock.goods).map(lootGoodItem);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const lore = loreOf(pick(screen, item.id));
      expect(lore).toHaveLength(1);
      expect(textOf(lore[0])).toBe(say(itemLore(itemLookId(item))));
    }
  });

  it("shows the lore of an item on a looked-over truck", () => {
    const { w } = truckWithAllKinds();
    const other = addVehicle(w, "independent", "buggy", ["mg", "stockEngine"], { x: 6, y: 5 });
    sizedUp(w, w.vehicles[0], other);
    const screen = screenOver(w);
    expect(screen.openLookedOver(w, other.id)).toBe(true);
    const gun = other.items.find((it) => it.kind === "part" && it.part.defId === "mg");
    if (!gun) throw new Error("No gun");
    const lore = loreOf(pick(screen, gun.id));
    expect(lore).toHaveLength(1);
    expect(textOf(lore[0])).toBe(say(itemLore("mg")));
  });

  it("prints the shop row detail lore with the piece the card uses", () => {
    stubDom();
    const { w, part } = truckWithAllKinds();
    if (part.kind !== "part") throw new Error("Not a part");
    const last = partDetail(w, part.part, null).slice(-1)[0] as unknown as FakeNode;
    expect(last.className).toBe((itemLoreEl("mg") as unknown as FakeNode).className);
    expect(textOf(last)).toBe(say(itemLore("mg")));
  });
});
