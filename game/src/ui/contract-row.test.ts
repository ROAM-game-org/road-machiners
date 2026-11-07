import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "../sim/market";
import { addVehicle, emptyWorld } from "../sim/testkit";
import SURVEY_SITES_FILE from "../data/survey-sites.json";
import { surveyPlaceThreat } from "../sim/survey";
import { boardHeldRow, heldContractRow, offerRow } from "./contract-row";

class FakeNode {
  className = "";
  children: FakeNode[] = [];
  constructor(readonly tag: string, readonly text = "") {}
  append(...c: FakeNode[]) { this.children.push(...c); }
  setAttribute() {}
  addEventListener() {}
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(""); }
}

function findAll(node: FakeNode, test: (n: FakeNode) => boolean): FakeNode[] {
  return [...(test(node) ? [node] : []), ...node.children.flatMap((c) => findAll(c, test))];
}

beforeEach(() => {
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createElementNS: (_ns: string, t: string) => new FakeNode(t), createTextNode: (s: string) => new FakeNode("#text", s) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function postedEscort(threat: number) {
  const w = emptyWorld();
  const trader = addVehicle(w, "independent", "scout", ["mg", "stockEngine"], { x: 46, y: 40 });
  const c: Contract = { shop: "bowl", reward: 1, deadline: 100, window: 100, tier: 1, id: "e", kind: "escort", client: trader.id, to: "nose", threat: threat as 1, span: 1, together: 0, seen: null, apart: 0, stuck: 0, holdUntil: null };
  return () => offerRow(w, c, new FakeNode("button") as unknown as HTMLElement, null) as unknown as FakeNode;
}

describe("escort offer road tag", () => {
  const cases: [number, string, string][] = [
    [1, "Safe road", "tag dim"],
    [2, "Risky road", "tag"],
    [3, "Dangerous road", "tag bad"],
  ];
  for (const [threat, word, cls] of cases) {
    it(`names threat ${threat} as ${word}`, () => {
      const row = postedEscort(threat)();
      const tags = findAll(row, (n) => n.className.startsWith("tag"));
      expect(tags).toHaveLength(1);
      expect(tags[0]!.className).toBe(cls);
      expect(tags[0]!.textContent).toBe(word);
      expect(findAll(row, (n) => n.className.includes("skill-level"))).toHaveLength(0);
    });
  }

  for (const bad of [0, 4, 1.5]) {
    it(`throws on threat ${bad}`, () => {
      expect(postedEscort(bad)).toThrow(/threat/);
    });
  }
});

describe("survey ground tag", () => {
  const w = emptyWorld();
  const siteOfStep = (step: number) => {
    const site = SURVEY_SITES_FILE.sites.find((s) => surveyPlaceThreat(w, s.id) === step);
    if (!site) throw new Error(`No survey site at step ${step}`);
    return [site.id];
  };
  const survey = (sites: string[]): Contract => ({ shop: "bowl", reward: 100, deadline: 100, window: 100, tier: 1, id: "s", kind: "survey", points: sites.map((site) => ({ site, found: false, done: false })) }) as unknown as Contract;
  const button = () => new FakeNode("button") as unknown as HTMLElement;
  const groundTags = (row: FakeNode) => findAll(row, (n) => n.className.startsWith("tag") && n.textContent.endsWith(" ground"));
  const cases: [string[], string, string][] = [
    [siteOfStep(1), "Safe ground", "tag dim"],
    [siteOfStep(2), "Risky ground", "tag"],
    [siteOfStep(3), "Dangerous ground", "tag bad"],
  ];
  for (const [sites, word, cls] of cases) {
    it(`shows ${word} on the board offer and the journal row`, () => {
      const c = survey(sites);
      const rows = [offerRow(w, c, button(), null), heldContractRow(w, c)] as unknown as FakeNode[];
      for (const row of rows) {
        const tags = groundTags(row);
        expect(tags).toHaveLength(1);
        expect(tags[0]!.className).toBe(cls);
        expect(tags[0]!.textContent).toBe(word);
      }
    });
  }
});

describe("held clocks in a row", () => {
  const base = { shop: "bowl", reward: 1, deadline: 100, window: 100, tier: 1 } as const;
  const claim: Contract = { ...base, id: "c", kind: "claim", stockId: "tank-3", at: { x: 300, y: 40 }, partId: "p1", defId: "mg", rivalAt: 100, rival: null, leads: [] };

  it("counts down a held job and keeps a claim short", () => {
    const row = heldContractRow(emptyWorld(), claim) as unknown as FakeNode;
    expect(row.textContent).toMatch(/\d+:\d\d left/);
    expect(row.textContent).not.toMatch(/about .* out/);
  });

  it("counts down a posted escort offer", () => {
    const row = postedEscort(1)() as unknown as FakeNode;
    expect(row.textContent).toMatch(/leaves in \d+:\d\d/);
  });
});

describe("one row form for every kind", () => {
  const base = { shop: "bowl", reward: 7, deadline: 100, window: 100, tier: 1 } as const;
  const trader = () => {
    const w = emptyWorld();
    return { w, client: addVehicle(w, "independent", "scout", ["mg", "stockEngine"], { x: 46, y: 40 }).id };
  };
  const kinds = (client: string): Contract[] => [
    { ...base, id: "h", kind: "haul", good: "salt", units: 2, to: "nose", rush: false },
    { ...base, id: "r", kind: "haul", good: "salt", units: 2, to: "nose", rush: true },
    { ...base, id: "p", kind: "procure", good: "salt", units: 2, cratePay: 3 },
    { ...base, id: "c", kind: "claim", stockId: "tank-3", at: { x: 300, y: 40 }, partId: "p1", defId: "mg", rivalAt: 100, rival: null, leads: [] },
    { ...base, id: "e", kind: "escort", client, to: "nose", threat: 2, span: 1, together: 0, seen: null, apart: 0, stuck: 0, holdUntil: null },
    { ...base, id: "u", kind: "rescue", client, driver: "Jed Cobb", need: "fuel", area: { x: 50, y: 40 }, fulfilled: false },
    { ...base, id: "s", kind: "search", target: client, driver: "Jed Cobb", template: "trader", lead: { at: { x: 50, y: 40 }, turn: 0 }, delivered: false },
    { ...base, id: "v", kind: "survey", points: [{ site: SURVEY_SITES_FILE.sites[0]!.id, found: false, done: false }] },
  ];

  it("gives an offer row of icon, title, a meta row of time and pay, and action", () => {
    const { w, client } = trader();
    for (const c of kinds(client)) {
      const row = offerRow(w, c, new FakeNode("button") as unknown as HTMLElement, null) as unknown as FakeNode;
      expect(row.children, c.id).toHaveLength(4);
      const meta = row.children[2]!;
      expect(meta.children.at(-1)!.textContent, c.id).toContain("7");
      expect(row.children[3]!.tag, c.id).toBe("button");
    }
  });

  it("gives a held board row of icon, title, meta and action, and no way text for a survey", () => {
    const { w, client } = trader();
    for (const c of kinds(client)) {
      const row = boardHeldRow(w, c, new FakeNode("button") as unknown as HTMLElement) as unknown as FakeNode;
      expect(row.children, c.id).toHaveLength(4);
      expect(row.textContent, c.id).not.toMatch(/Leave by|Take the road/);
    }
  });
});
