import { baseGrid, deepestFirst, itemCells, itemSize } from "../sim/grid";
import type { GridItem } from "../sim/types";
import { PX_PER_METER } from "../three/render/portraitPixels";
import { el } from "./dom";
import { gridMetrics, gridSize, pxStyle, rectOf, turnedIcon, type GridMetrics } from "./inventory-draw";
import { truckOutline } from "./plans";

export type PlanPart = { id: string; x: number; y: number; w: number; h: number };
export type PlanRect = { id: string; x: number; y: number; w: number; h: number };
type Tiered = { id: string; tier: string };
type PartItem = Extract<GridItem, { kind: "part" }>;

export function planRects(chassisId: string, parts: readonly PlanPart[], pxPerMeter: number): { width: number; height: number; rects: PlanRect[] } {
  const grid = baseGrid(chassisId);
  const m = gridMetrics(chassisId, grid, pxPerMeter);
  const { width, height } = gridSize(m);
  const rects = parts.map((part) => {
    if (part.x < 0 || part.y < 0 || part.x + part.w > grid.w || part.y + part.h > grid.h) throw new Error(`Condition part ${part.id} lies outside the ${chassisId} grid`);
    const r = rectOf(m, part.x, part.y, part.w, part.h);
    return { id: part.id, x: width - r.left - r.width, y: height - r.top - r.height, w: r.width, h: r.height };
  });
  return { width, height, rects };
}

function partOf(item: PartItem): PlanPart {
  const cells = itemCells(item);
  const { w, h } = itemSize(item);
  return { id: item.part.id, x: Math.min(...cells.map((c) => c.x)), y: Math.min(...cells.map((c) => c.y)), w, h };
}

export class ConditionPlan {
  readonly width: number;
  readonly height: number;
  private readonly metrics: GridMetrics;
  private readonly rects: Map<string, PlanRect>;
  private readonly items: Map<string, PartItem>;
  private readonly cellOwner = new Map<string, string>();

  constructor(private readonly chassisId: string, items: readonly PartItem[], pxPerMeter: number = PX_PER_METER) {
    const parts = deepestFirst(chassisId, items).map(partOf);
    const plan = planRects(chassisId, parts, pxPerMeter);
    this.width = plan.width;
    this.height = plan.height;
    this.metrics = gridMetrics(chassisId, baseGrid(chassisId), pxPerMeter);
    this.rects = new Map(plan.rects.map((r) => [r.id, r]));
    this.items = new Map(items.map((item) => [item.part.id, item]));
    for (const part of parts)
      for (let y = part.y; y < part.y + part.h; y++)
        for (let x = part.x; x < part.x + part.w; x++) this.cellOwner.set(`${x},${y}`, part.id);
  }

  has(partId: string): boolean {
    return this.rects.has(partId);
  }

  partAt(x: number, y: number): string | null {
    const m = this.metrics;
    const cellX = Math.floor((this.width - x) / m.cellW);
    const cellY = Math.floor((this.height - y) / m.cellH);
    return this.cellOwner.get(`${cellX},${cellY}`) ?? null;
  }

  centerOf(partId: string): { x: number; y: number } {
    const r = this.rectOf(partId);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  layers(drawn: readonly Tiered[], scale: number): HTMLElement[] {
    const boxes = drawn.map((part) => this.boxOf(part));
    const turned = el("div", { class: "cond-plan-turned" }, truckOutline(this.chassisId, this.metrics), ...boxes);
    turned.style.cssText = `width:${this.width}px;height:${this.height}px`;
    const root = el("div", { class: "cond-plan", "aria-hidden": "true" }, turned);
    root.style.cssText = `width:${this.width}px;height:${this.height}px;transform:scale(${scale})`;
    return [root];
  }

  flashOf(partId: string): HTMLElement {
    return this.placed(el("div", { class: "cond-plan-flash" }), partId);
  }

  pickOf(partId: string): HTMLElement {
    return this.placed(el("div", { class: "cond-plan-pick" }), partId);
  }

  private boxOf(part: Tiered): HTMLElement {
    const item = this.items.get(part.id);
    if (!item) throw new Error(`Condition part ${part.id} is not on the plan`);
    const r = this.rectOf(part.id);
    const turned = { left: this.width - r.x - r.w, top: this.height - r.y - r.h, width: r.w, height: r.h };
    return el("div", { class: "cond-plan-part", "data-tier": part.tier, style: pxStyle(turned) }, turnedIcon(item, this.metrics));
  }

  private placed(node: HTMLElement, partId: string): HTMLElement {
    const r = this.rectOf(partId);
    node.style.left = `${(100 * r.x) / this.width}%`;
    node.style.top = `${(100 * r.y) / this.height}%`;
    node.style.width = `${(100 * r.w) / this.width}%`;
    node.style.height = `${(100 * r.h) / this.height}%`;
    return node;
  }

  private rectOf(partId: string): PlanRect {
    const r = this.rects.get(partId);
    if (!r) throw new Error(`Condition part ${partId} is not on the plan`);
    return r;
  }
}
