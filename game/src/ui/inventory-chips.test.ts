import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeNode, stubDom, ui } from "./inventory-fake-dom";
import { makePart } from "../sim/factory";
import { spotWorld } from "../sim/testkit";
import { InventoryScreen, partChipBody } from "./inventory";

const hasClass = (n: FakeNode, name: string) => n.className.split(" ").includes(name);

describe("a part chip", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it("holds the condition meter in the title column under the name, not loose in the chip", () => {
    stubDom();
    const { w } = spotWorld();
    const body = partChipBody(makePart(w, "plates", 4), null) as unknown as FakeNode[];
    const title = body.find((n) => n && hasClass(n, "chip-title"));
    if (!title) throw new Error("No title column");
    const [name, meter] = title.children as FakeNode[];
    expect(name.tag).toBe("span");
    expect(hasClass(meter, "segments")).toBe(true);
    expect(body.filter((n) => n && hasClass(n, "segments"))).toEqual([]);
  });

  it("is built the same way in the loot list", () => {
    stubDom();
    const { w, stock } = spotWorld();
    stock.parts = [makePart(w, "plates", 4)];
    const screen = new InventoryScreen({ world: () => w, apply: () => {}, announce: () => {}, searchStock: () => {}, getTurnPhase: () => null } as never);
    screen.openLoot(stock.id);
    const root = ui.children[ui.children.length - 1] as FakeNode;
    const chips = root.all((n) => hasClass(n, "inv-chip"));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.children.some((c) => typeof c !== "string" && hasClass(c, "segments"))).toBe(false);
      expect(chip.all((n) => hasClass(n, "chip-title") && n.all((m) => hasClass(m, "segments")).length === 1).length).toBe(1);
    }
  });
});
