import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "../sim/market";
import { addVehicle, emptyWorld } from "../sim/testkit";
import SURVEY_SITES_FILE from "../data/survey-sites.json";
import { surveyPlaceThreat } from "../sim/survey";
import { contractRow, heldContractRow } from "./contract-row";

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
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (s: string) => new FakeNode("#text", s) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function postedEscort(threat: number) {
  const w = emptyWorld();
  const trader = addVehicle(w, "independent", "scout", ["mg", "stockEngine"], { x: 46, y: 40 });
  const c: Contract = { shop: "bowl", reward: 100, deadline: 100, window: 100, tier: 1, id: "e", kind: "escort", client: trader.id, to: "nose", threat: threat as 1, span: 1, together: 0, seen: null, apart: 0, stuck: 0, holdUntil: null };
  return () => contractRow(w, c, new FakeNode("button") as unknown as HTMLElement, true) as unknown as FakeNode;
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
    [["survey-house-52", "survey-house-82"], "Dangerous ground", "tag bad"],
  ];
  for (const [sites, word, cls] of cases) {
    it(`shows ${word} on the board, the held row and the journal row`, () => {
      const c = survey(sites);
      const rows = [contractRow(w, c, button(), true), contractRow(w, c, button()), heldContractRow(w, c)] as unknown as FakeNode[];
      for (const row of rows) {
        const tags = groundTags(row);
        expect(tags).toHaveLength(1);
        expect(tags[0]!.className).toBe(cls);
        expect(tags[0]!.textContent).toBe(word);
      }
    });
  }
});
