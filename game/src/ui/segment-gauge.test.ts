import { afterEach, describe, expect, it, vi } from "vitest";
import { maxHp } from "../sim/wear";
import type { PartInstance } from "../sim/types";
import { cellStates, conditionMeter, gaugeEl, hpReadout, litCells, segmentGauge, workMeterEl, type CellState } from "./cards";
import { haulerReadout } from "./hauler-gauge";

class Node {
  className = "";
  attrs: Record<string, string> = {};
  children: Node[] = [];
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  removeAttribute(name: string) {
    delete this.attrs[name];
  }
  addEventListener() {}
  append(...children: Node[]) {
    this.children.push(...children);
  }
}

const states = (gauge: HTMLElement): string[] => (gauge as unknown as Node).children.map((c) => c.className || "off");
const node = (gauge: HTMLElement): Node => gauge as unknown as Node;
const row = (...cells: CellState[]): CellState[] => cells;

describe("litCells", () => {
  it("lights no cell for nothing and every cell for full", () => {
    expect(litCells(0, 10)).toBe(0);
    expect(litCells(1, 10)).toBe(10);
    expect(litCells(1.4, 10)).toBe(10);
  });
  it("lights one cell for a trace and keeps one dark short of full", () => {
    expect(litCells(0.01, 10)).toBe(1);
    expect(litCells(0.97, 10)).toBe(9);
  });
  it("rounds a share in between to the nearest cell", () => {
    expect(litCells(0.15, 20)).toBe(3);
    expect(litCells(0.5, 10)).toBe(5);
  });
});

describe("cellStates", () => {
  it("lights the filled cells and leaves the rest off", () => {
    expect(cellStates(0.3, 5)).toEqual(row("on", "on", "off", "off", "off"));
    expect(cellStates(0, 4)).toEqual(row("off", "off", "off", "off"));
    expect(cellStates(2, 4)).toEqual(row("on", "on", "on", "on"));
  });

  it("marks the cells of a picked part at the end of the lit run and dims the rest", () => {
    expect(cellStates(0.4, 10, { share: { left: 0.2, width: 0.2 } }).slice(0, 6)).toEqual(row("rest", "rest", "on", "on", "off", "off"));
  });

  it("keeps one cell for a part too light for a whole cell", () => {
    const load = cellStates(1565 / 4240, 10, { share: { left: (1565 - 110) / 4240, width: 110 / 4240 } });
    expect(load.filter((s) => s === "on")).toHaveLength(1);
    expect(load.filter((s) => s === "rest")).toHaveLength(3);
    expect(load.indexOf("on")).toBe(3);
  });

  it("never marks a part cell outside the lit cells", () => {
    expect(cellStates(0.97, 10, { share: { left: 0.9, width: 0.07 } })).toEqual(row("rest", "rest", "rest", "rest", "rest", "rest", "rest", "rest", "on", "off"));
    expect(cellStates(0, 10, { share: { left: 0, width: 0.3 } }).every((s) => s === "off")).toBe(true);
  });

  it("plans the cells a part would add right after the lit ones", () => {
    expect(cellStates(0.4, 10, { after: { left: 0.4, width: 0.25 } })).toEqual(row("on", "on", "on", "on", "plan", "plan", "plan", "off", "off", "off"));
  });

  it("keeps one planned cell for a change too small for a whole cell", () => {
    expect(cellStates(0.4, 10, { after: { left: 0.4, width: 0.01 } }).filter((s) => s === "plan")).toHaveLength(1);
    expect(cellStates(0, 10, { after: { left: 0, width: 0.3 } }).filter((s) => s === "plan")).toHaveLength(3);
  });

  it("plans nothing past the last cell", () => {
    expect(cellStates(1, 10, { after: { left: 1, width: 0.2 } }).every((s) => s === "on")).toBe(true);
    expect(cellStates(0.92, 10, { after: { left: 0.92, width: 0.5 } }).filter((s) => s === "plan")).toHaveLength(1);
  });

  it("ignores a span with no width", () => {
    expect(cellStates(0.4, 10, { share: { left: 0.3, width: 0 }, after: { left: 0.4, width: 0 } })).toEqual(cellStates(0.4, 10));
  });
});

describe("gauge elements", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(): void {
    vi.stubGlobal("document", {
      createElement: (tag: string) => new Node(tag),
      createTextNode: (value: string) => Object.assign(new Node("#text"), { data: value }),
    });
  }

  it("draws a gauge of a fixed number of cells for every value", () => {
    stub();
    for (const share of [0, 0.01, 0.5, 0.99, 1, 3]) expect(node(segmentGauge(share)).children).toHaveLength(10);
    expect(node(segmentGauge(0.5, { cells: 4 })).children).toHaveLength(4);
    expect(node(segmentGauge(0.5)).className).toBe("segments");
  });

  it("puts the tone on the gauge", () => {
    stub();
    expect(node(segmentGauge(0.5, { tone: "warn" })).className).toBe("segments warn");
    expect(node(segmentGauge(0.5, { tone: "good" })).className).toBe("segments good");
  });

  it("takes no meter or gauge class that the old flat bars styled", () => {
    stub();
    for (const gauge of [segmentGauge(0.5), gaugeEl(0.5), workMeterEl(0.5)]) expect(node(gauge).className).not.toMatch(/\b(meter|gauge)\b/);
  });

  it("shows the planned cells of a gauge beside its lit cells", () => {
    stub();
    expect(states(gaugeEl(0.3, { after: { left: 0.3, width: 0.2 } })).slice(0, 6)).toEqual(["on", "on", "on", "plan", "plan", "off"]);
    expect(states(gaugeEl(0.3, { share: { left: 0.2, width: 0.1 } })).slice(0, 4)).toEqual(["rest", "rest", "on", "off"]);
  });

  it("warns when the load or the draw goes over its capacity", () => {
    stub();
    expect(node(gaugeEl(1.2)).className).toBe("segments warn");
    expect(node(gaugeEl(1)).className).toBe("segments");
    expect(node(gaugeEl(0.5, { tone: "warn" })).className).toBe("segments warn");
  });

  it("hides every cell from the accessibility tree", () => {
    stub();
    expect(node(segmentGauge(0.5)).children.every((c) => c.attrs["aria-hidden"] === "true")).toBe(true);
  });

  it("shows a part's condition in five cells, or as many as asked, with the exact value in the title", () => {
    stub();
    const part: PartInstance = { id: "p1", defId: "stockEngine", hp: 1, wear: 0 };
    const on = (hp: number) => states(conditionMeter({ ...part, hp })).filter((s) => s === "on").length;
    expect(node(conditionMeter(part)).children).toHaveLength(5);
    expect(on(maxHp(part))).toBe(5);
    expect(on(0)).toBe(0);
    expect(on(1)).toBe(1);
    expect(node(conditionMeter(part)).attrs.title).toBeDefined();
    expect(node(conditionMeter(part, 10)).children).toHaveLength(10);
  });

  it("shows work done as lit cells of a progress gauge", () => {
    stub();
    const gauge = workMeterEl(0.4);
    expect(node(gauge).className).toBe("segments progress");
    expect(states(gauge)).toEqual(["on", "on", "off", "off", "off"]);
  });

  it("prints a broken part as broken in the bad tone, since no cell is lit for it", () => {
    stub();
    const part: PartInstance = { id: "p1", defId: "stockEngine", hp: 0, wear: 0 };
    const broken = node(hpReadout(part)!);
    expect(broken.className).toBe("num bad");
    expect((broken.children[0] as unknown as { data: string }).data).toBe("broken");
    expect(states(conditionMeter(part)).every((s) => s === "off")).toBe(true);
  });

  it("prints the hit points of a working part in the dim tone and nothing for scrap", () => {
    stub();
    const part: PartInstance = { id: "p1", defId: "stockEngine", hp: 3, wear: 0 };
    const working = node(hpReadout(part)!);
    expect(working.className).toBe("num dim");
    expect((working.children[0] as unknown as { data: string }).data).toBe(`3/${maxHp(part)} HP`);
    expect(hpReadout({ ...part, wear: 99 })).toBeNull();
  });

  it("prints the hauler's share as a percent beside its gauge", () => {
    stub();
    const [gauge, number] = haulerReadout(0.45).map(node);
    expect(gauge.className).toBe("segments");
    expect(gauge.children.filter((c) => c.className === "on")).toHaveLength(5);
    expect(number.className).toBe("num");
    expect((number.children[0] as unknown as { data: string }).data).toBe("45%");
  });

  it("marks a hauler with nothing left in the bad tone with every cell dark", () => {
    stub();
    const [gauge, number] = haulerReadout(0).map(node);
    expect(gauge.children.every((c) => c.className === "")).toBe(true);
    expect(number.className).toBe("num bad");
    expect((number.children[0] as unknown as { data: string }).data).toBe("0%");
  });
});
