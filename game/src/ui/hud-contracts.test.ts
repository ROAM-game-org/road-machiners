import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWorld } from "../sim/testkit";
import type { Contract } from "../sim/market";
import { resolve } from "../text/resolve";
import { contractSummary, heldContractDue } from "./format";
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

const base = { shop: "bowl", reward: 100, deadline: 100, window: 100, tier: 1 } as const;
const en = (msg: Parameters<typeof resolve>[0]): string => resolve(msg, "en");

const contracts: Contract[] = [
  { ...base, id: "h", kind: "haul", good: "parts", units: 3, to: "nose", rush: false },
  { ...base, id: "f", kind: "fetch", defId: "mg" },
  { ...base, id: "b", kind: "bounty", template: "buggy", fulfilled: false },
  { ...base, id: "bm", kind: "bounty", template: "buggy", fulfilled: true },
  { ...base, id: "e", kind: "escort", client: "gone", to: "nose", threat: "low" as never, span: 1, together: 0, seen: null, apart: 0, stuck: 0, holdUntil: null },
];

describe("held contract line", () => {
  for (const c of contracts) {
    it(`names what the ${c.kind} contract asks (${c.id})`, () => {
      const line = heldContractLine(emptyWorld(), c) as unknown as FakeNode;
      expect(line.className).toBe("contract-line");
      expect(line.textContent).toContain(en(contractSummary(c)));
      if (c.kind !== "escort") expect(line.textContent).toContain(en(heldContractDue(c)));
    });
  }
});
