import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACTS } from "../data/market";
import { haulBlocked, shopState, siteOf, takeContract, type Contract } from "../sim/market";
import { sitePads } from "../sim/sites";
import { emptyWorld } from "../sim/testkit";
import { cloneWorld } from "../sim/world";
import { acceptRefusal, boardFull, haulRefusal, needCell } from "./contract-board";

class FakeNode {
  className = "";
  children: FakeNode[] = [];
  constructor(readonly tag: string, readonly text = "") {}
  append(...c: FakeNode[]) { this.children.push(...c); }
  setAttribute() {}
  addEventListener() {}
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(""); }
}

beforeEach(() => {
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createElementNS: (_ns: string, t: string) => new FakeNode(t), createTextNode: (s: string) => new FakeNode("#text", s) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const haul = (units: number, id = "ct-haul"): Extract<Contract, { kind: "haul" }> => ({ id, shop: "bowl", kind: "haul", good: "salt", units, to: "nose", reward: 100, deadline: 5000, window: 500, rush: false, tier: 1 });

function atBowl(offer: Contract) {
  const w = emptyWorld(sitePads(siteOf("bowl"))[0]);
  shopState(w, "bowl").contracts = [offer];
  return w;
}

describe("a haul offer's refusal", () => {
  it("is empty exactly when the sim would take it", () => {
    const w = atBowl(haul(1));
    shopState(w, "bowl").goods.salt = 5;
    expect(haulBlocked(w, haul(1))).toBe(false);
    expect(haulRefusal(w, haul(1))).toBeNull();
    expect(() => takeContract(cloneWorld(w), "ct-haul")).not.toThrow();
  });

  it("names the debt", () => {
    const w = atBowl(haul(1));
    w.player.money = -5;
    expect(haulBlocked(w, haul(1))).toBe(true);
    expect(haulRefusal(w, haul(1))?.key).toBe("contract.inDebt");
  });

  it("names the cells short", () => {
    const w = atBowl(haul(999));
    expect(haulBlocked(w, haul(999))).toBe(true);
    expect(haulRefusal(w, haul(999))?.key).toBe("contract.cellsShort");
  });

  it("names the missing stock", () => {
    const w = atBowl(haul(1));
    shopState(w, "bowl").goods.salt = 0;
    expect(haulRefusal(w, haul(1))?.key).toBe("contract.noStock");
  });
});

describe("acceptRefusal", () => {
  it("refuses everything on a full board with the full reason", () => {
    const w = atBowl(haul(1));
    expect(acceptRefusal(w, haul(1), true)?.key).toBe("contract.full");
  });

  it("is not full below the limit", () => {
    const w = atBowl(haul(1));
    expect(boardFull(w)).toBe(false);
    w.player.contracts = Array.from({ length: CONTRACTS.maxActive }, (_, i) => haul(1, `h${i}`));
    expect(boardFull(w)).toBe(true);
  });
});

describe("needCell", () => {
  it("marks a haul that does not fit as bad", () => {
    const w = atBowl(haul(999));
    expect((needCell(w, haul(999)) as unknown as FakeNode).className).toContain("bad");
  });

  it("has nothing for a claim", () => {
    const w = atBowl(haul(1));
    const claim: Contract = { id: "c", shop: "bowl", kind: "claim", partId: "mg", reward: 1, deadline: 9, window: 9, tier: 1 } as unknown as Contract;
    expect(needCell(w, claim)).toBeNull();
  });
});
