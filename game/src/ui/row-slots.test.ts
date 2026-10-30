import { describe, expect, it } from "vitest";
import { Msg } from "../text/msg";
import { RowSlots, slotOrder, type SlotRow } from "./row-slots";

describe("the order of slots on a trade list", () => {
  it("keeps a spent id in its old place", () => {
    expect(slotOrder(["a", "b", "c"], ["a", "c"], new Set(["b"]))).toEqual(["a", "b", "c"]);
  });

  it("drops a gone id that is not spent", () => {
    expect(slotOrder(["a", "b", "c"], ["a", "c"], new Set())).toEqual(["a", "c"]);
  });

  it("puts new ids after every id the player saw, in live order", () => {
    expect(slotOrder(["a", "b"], ["z", "b", "y", "a"], new Set())).toEqual(["a", "b", "z", "y"]);
  });

  it("is stable when nothing changes", () => {
    expect(slotOrder(["a", "b"], ["a", "b"], new Set())).toEqual(["a", "b"]);
  });
});

type Fake = { id: string; listeners: (() => void)[]; attrs: Map<string, string> };

const fakeNode = (id: string): Fake => ({ id, listeners: [], attrs: new Map() });

function slotRow(id: string): SlotRow & { fake: Fake; click: () => void } {
  const action = fakeNode(`${id}-action`);
  const node = {
    setAttribute: (k: string, v: string) => action.attrs.set(k, v),
    getAttribute: (k: string) => action.attrs.get(k) ?? null,
    addEventListener: (_: string, fn: () => void) => action.listeners.push(fn),
  };
  return { id, row: { id } as unknown as HTMLElement, action: node as unknown as HTMLElement, done: new Msg("trade.done.sold", {}), fake: action, click: () => action.listeners.forEach((fn) => fn()) };
}

const names = (placed: HTMLElement[]) => placed.map((n) => (n as unknown as { id: string; spent?: boolean }).id);

function slots(): RowSlots {
  return new RowSlots((last) => ({ id: `${(last as unknown as { id: string }).id}:spent` }) as unknown as HTMLElement);
}

describe("the slots of one trade list", () => {
  it("keeps the sold row in its slot, so the next row does not slide up", () => {
    const memory = slots();
    const first = ["a", "b", "c"].map(slotRow);
    memory.place("sell", first);
    first[0].click();
    const placed = memory.place("sell", ["b", "c"].map(slotRow));
    expect(names(placed)).toEqual(["a:spent", "b", "c"]);
    expect(memory.has("sell")).toBe(true);
  });

  it("reports the last sold row as held before the list is drawn again", () => {
    const memory = slots();
    const only = ["a"].map(slotRow);
    memory.place("sell", only);
    expect(memory.has("sell")).toBe(false);
    only[0].click();
    expect(memory.has("sell")).toBe(true);
  });

  it("does not spend a row whose command was refused and is still listed", () => {
    const memory = slots();
    const first = ["a", "b"].map(slotRow);
    memory.place("sell", first);
    first[0].click();
    expect(names(memory.place("sell", ["a", "b"].map(slotRow)))).toEqual(["a", "b"]);
    expect(memory.has("sell")).toBe(false);
  });

  it("spends a row on its own list only", () => {
    const memory = slots();
    const sell = ["a"].map(slotRow);
    memory.place("sell", sell);
    memory.place("buy", ["x"].map(slotRow));
    sell[0].click();
    expect(names(memory.place("buy", ["x"].map(slotRow)))).toEqual(["x"]);
    expect(names(memory.place("sell", []))).toEqual(["a:spent"]);
  });

  it("spends every id of one action, as Pay all does", () => {
    const memory = slots();
    memory.place("cases", ["a", "b", "c"].map(slotRow));
    memory.actOn("cases", ["a", "c"]);
    expect(names(memory.place("cases", ["b"].map(slotRow)))).toEqual(["a:spent", "b", "c:spent"]);
  });

  it("appends a row that arrives after the player saw the list", () => {
    const memory = slots();
    memory.place("sell", ["a", "b"].map(slotRow));
    expect(names(memory.place("sell", ["n", "a", "b"].map(slotRow)))).toEqual(["a", "b", "n"]);
  });

  it("forgets every list, spent rows and the acted mark", () => {
    const memory = slots();
    const rows = ["a", "b"].map(slotRow);
    memory.place("sell", rows);
    rows[0].click();
    memory.forget();
    expect(names(memory.place("sell", ["b"].map(slotRow)))).toEqual(["b"]);
    expect(memory.has("sell")).toBe(false);
  });

  it("does not watch a refused action", () => {
    const memory = slots();
    const refused = slotRow("a");
    refused.fake.attrs.set("aria-disabled", "true");
    memory.place("sell", [refused]);
    expect(refused.fake.listeners).toHaveLength(0);
  });
});
