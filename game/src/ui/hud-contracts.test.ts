import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorld } from "../sim/testkit";
import type { Contract } from "../sim/market";
import { resolve } from "../text/resolve";
import { dockSummary, heldContractClock } from "./format";
import { heldContractLine } from "./hud";

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
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (s: string) => new FakeNode("#text", s) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = { shop: "bowl", reward: 1, deadline: 100, window: 100, tier: 1 } as const;
const en = (msg: Parameters<typeof resolve>[0]): string => resolve(msg, "en");

const contracts: Contract[] = [
  { ...base, id: "h", kind: "haul", good: "parts", units: 3, to: "nose", rush: false },
  { ...base, id: "p", kind: "procure", good: "water", units: 4, cratePay: 10 },
  { ...base, id: "e", kind: "escort", client: "gone", to: "nose", threat: "low" as never, span: 1, together: 0, seen: null, apart: 0, stuck: 0, holdUntil: null },
];

describe("held contract line", () => {
  for (const c of contracts) {
    it(`names what the ${c.kind} contract asks (${c.id})`, () => {
      const line = heldContractLine(emptyWorld(), c) as unknown as FakeNode;
      expect(line.className).toBe("contract-line");
      expect(line.textContent).toContain(en(dockSummary(c)));
      if (c.kind !== "escort") expect(line.textContent).toContain(en(heldContractClock(emptyWorld(), c)));
    });
  }
});

describe("held claim line", () => {
  const claim: Contract = { ...base, id: "c", kind: "claim", stockId: "tank-3", at: { x: 300, y: 40 }, partId: "p1", defId: "mg", rivalAt: 100, rival: null, leads: [] };

  it("names the part, the wreck and the square, and the time left, without the long clue", () => {
    const text = (heldContractLine(emptyWorld(), claim) as unknown as FakeNode).textContent;
    expect(text).toContain(en(dockSummary(claim)));
    expect(text).toMatch(/in square [A-H][1-8]/);
    expect(text).not.toMatch(/about .* out/);
    expect(text).toContain(" left");
  });
});
