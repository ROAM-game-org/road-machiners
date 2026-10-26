
import { CRATE_MASS, PARCEL } from "../data/goods";
import { itemLookId } from "../render/partLooks";
import { partDef, type WeaponDef } from "../data/parts";
import { gunBlockers, gunSpans, type FireSpan } from "../sim/armor";
import { baseGrid, facingOf, gridOf, itemCells, itemSize, layerOf, plateSide, type Cell, type Grid, type SideLetter } from "../sim/grid";
import type { GridItem, PartInstance, Rot, Vehicle, World } from "../sim/types";
import { plannedRefit } from "../sim/inventory";
import { playerVehicle } from "../sim/damage";
import { workOf } from "../sim/states";
import { el } from "./dom";
import { cellSteps } from "../sim/body";
import { uiSize } from "./ui-size";
import { truckOutline } from "./plans";
import { coreArt, drawnSprite, partArt, tierAttr, truckBackdrop, type GarageLook } from "./garage-draw";
import { conditionMeter, gridItemIcon, itemTip, jobDone, toneStyle, workMeterEl } from "./cards";
import { kg } from "./units";
import { byId, t, type Msg } from "../text/msg";
import { goodName, partName } from "../text/names";

const SPARE_GAP_CELLS = 0.3;
const CELL_PX = 42;
const MIN_CELL_PX = 28;

export type PixelRect = { left: number; top: number; width: number; height: number };

export type GridMetrics = {
  readonly pxPerMeter: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly cols: number;
  readonly rows: number;
  readonly chassisRows: number;
  readonly spareGap: number;
};

export function gridMetrics(chassisId: string, g: Grid, pxPerMeter: number): GridMetrics {
  const steps = cellSteps(chassisId);
  const cellW = steps.col * pxPerMeter;
  const cellH = steps.row * pxPerMeter;
  const spareGap = g.h > g.chassisH ? Math.round(SPARE_GAP_CELLS * cellW) : 0;
  return { pxPerMeter, cellW, cellH, cols: g.w, rows: g.h, chassisRows: g.chassisH, spareGap };
}

export function rowTop(m: GridMetrics, y: number): number {
  return y * m.cellH + (y >= m.chassisRows ? m.spareGap : 0);
}

export function rectOf(m: GridMetrics, x: number, y: number, w: number, h: number): PixelRect {
  const top = rowTop(m, y);
  return { left: x * m.cellW, top, width: w * m.cellW, height: rowTop(m, y + h - 1) + m.cellH - top };
}

export function gridSize(m: GridMetrics): { width: number; height: number } {
  return { width: m.cols * m.cellW, height: rowTop(m, m.rows - 1) + m.cellH };
}

export function cellAt(m: GridMetrics, px: number, py: number): { x: number; y: number } {
  const chassisBottom = m.chassisRows * m.cellH;
  const y = py < chassisBottom + m.spareGap / 2 || m.rows === m.chassisRows ? Math.floor(py / m.cellH) : m.chassisRows + Math.floor((py - chassisBottom - m.spareGap) / m.cellH);
  return { x: Math.floor(px / m.cellW), y };
}

export function smallestSide(m: GridMetrics): number {
  return Math.min(m.cellW, m.cellH);
}

export function cellUnder(m: GridMetrics, grid: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const r = grid.getBoundingClientRect();
  return cellAt(m, uiSize().toLayer(clientX - r.left), uiSize().toLayer(clientY - r.top));
}

export class GridScale {
  private pxPerMeter: number | null = null;
  private own: GridMetrics | null = null;
  private target: GridMetrics | null = null;

  reset(): void {
    this.pxPerMeter = null;
    this.target = null;
  }

  measure(v: Vehicle, own: boolean): GridMetrics {
    this.pxPerMeter ??= CELL_PX / cellSteps(v.chassisId).col;
    const m = gridMetrics(v.chassisId, gridOf(v), this.pxPerMeter);
    if (own) this.own = m;
    else this.target = m;
    return m;
  }

  get mine(): GridMetrics {
    if (!this.own) throw new Error("The inventory grid is not measured yet");
    return this.own;
  }

  get other(): GridMetrics {
    if (!this.target) throw new Error("The other truck's grid is not measured yet");
    return this.target;
  }

  shrinkBy(over: number): void {
    const grids = [this.mine, ...(this.target ? [this.target] : [])];
    const height = Math.max(...grids.map((m) => gridSize(m).height));
    const least = Math.max(...grids.map((m) => MIN_CELL_PX / smallestSide(m)));
    this.pxPerMeter = (this.pxPerMeter ?? 1) * Math.max(least, (height - over) / height);
  }

  slop(): number {
    return (this.own ? smallestSide(this.own) : MIN_CELL_PX) / 4;
  }
}

export function pxStyle(r: PixelRect): string {
  return `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
}

const CELL_TITLE: Record<Cell, Msg | undefined> = {
  D: t("cell.deck"),
  C: t("cell.bay"),
  E: t("cell.engine"),
  F: t("cell.front"),
  B: t("cell.back"),
  L: t("cell.left"),
  R: t("cell.right"),
  X: t("cell.builtIn"),
  ".": undefined,
};

export function storageItem(part: PartInstance): GridItem {
  return { id: `store-${part.id}`, x: 0, y: 0, rot: 0, kind: "part", part };
}

export function lootPartItem(part: PartInstance): GridItem {
  return { id: `loot-${part.id}`, x: 0, y: 0, rot: 0, kind: "part", part };
}

export function lootGoodItem(good: string): GridItem {
  return { id: `loot-${good}`, x: 0, y: 0, rot: 0, kind: "good", good };
}

export function gridEl(g: Grid, chassisId: string, m: GridMetrics, look: GarageLook | null): HTMLElement {
  const size = gridSize(m);
  const grid = el("div", { class: look ? "inv-grid drawn" : "inv-grid", style: `width:${size.width}px;height:${size.height}px` });
  grid.addEventListener("contextmenu", (e) => e.preventDefault());
  grid.append(look ? lookUnder(look, m) : truckOutline(chassisId, m));
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const node = gridCellEl(g, x, y, m);
      if (node) grid.append(node);
    }
  return grid;
}

function lookUnder(look: GarageLook, m: GridMetrics): HTMLElement {
  const body = look.renders.body(look.truck, look.paint);
  if (!body) throw new Error(`The ${look.truck.chassisId} garage render is not ready`);
  return truckBackdrop(body, m);
}

function gridCellEl(g: Grid, x: number, y: number, m: GridMetrics): HTMLElement | null {
  const c = g.cells[y][x];
  if (c !== null) return cellEl(c, x, y, m);
  if (y < g.deadFrom) return null;
  return el("div", { class: "inv-cell c-dead", style: pxStyle(rectOf(m, x, y, 1, 1)), title: t("cell.deadRows") });
}

export function cellEl(c: Cell, x: number, y: number, m: GridMetrics): HTMLElement {
  const spare = y >= m.chassisRows ? " spare" : "";
  return el("div", { class: `inv-cell c-${c === "." ? "plain" : c}${spare}`, "data-cell": `${x},${y}`, style: pxStyle(rectOf(m, x, y, 1, 1)), title: CELL_TITLE[c] });
}

export function turnedIcon(it: GridItem, m: GridMetrics): HTMLElement {
  const icon = gridItemIcon(it);
  const gun = weaponDefOf(it);
  if (!gun) return icon;
  const box = footprint(it);
  const across = it.rot % 2 === 1;
  const width = (across ? box.h * m.cellH : box.w * m.cellW) - 2;
  const height = (across ? box.w * m.cellW : box.h * m.cellH) - 2;
  icon.style.cssText += `;position:absolute;left:50%;top:50%;width:${width}px;height:${height}px;transform:translate(-50%,-50%) rotate(${facingOf(it)}deg)`;
  return icon;
}

export function itemBox(it: GridItem, chassisId: string, mounted: boolean, m: GridMetrics, look: GarageLook | null): HTMLElement {
  const outer = mounted && layerOf(baseGrid(chassisId), it) === "accessory";
  const rect = boxOf(it, chassisId, outer, m);
  const art = look ? artOf(look, it, m, rect) : null;
  const id = itemLookId(it);
  return el(
    "div",
    { class: itemClasses(it, mounted, outer, art !== null), "data-hold": "", "data-item-id": it.id, "data-tier": tierAttr(it), style: `${pxStyle(rect)};${toneStyle(id)}${drawnLayer(it, art)}`, title: itemTip(id), tabindex: 0, role: "button", "aria-label": itemName(it) },
    art ?? turnedIcon(it, m),
    el("span", { class: "inv-item-name" }, itemLabel(it).short),
    ...meterOf(it, art),
  );
}

function itemClasses(it: GridItem, mounted: boolean, outer: boolean, drawn: boolean): string {
  return `${itemClass(it, mounted)}${outer ? " outer" : ""}${drawn ? " drawn" : ""}`;
}

function drawnLayer(it: GridItem, art: HTMLElement | null): string {
  return art ? `;z-index:${it.y + itemSize(it).h}` : "";
}

function meterOf(it: GridItem, art: HTMLElement | null): HTMLElement[] {
  return it.kind === "part" && !art ? [conditionMeter(it.part)] : [];
}

function boxOf(it: GridItem, chassisId: string, outer: boolean, m: GridMetrics): PixelRect {
  const cells = itemCells(it);
  const x = Math.min(...cells.map((c) => c.x));
  const y = Math.min(...cells.map((c) => c.y));
  const size = itemSize(it);
  return outer ? outerHalf(m, x, y, size, plateSide(chassisId, it)) : rectOf(m, x, y, size.w, size.h);
}

function artOf(look: GarageLook, it: GridItem, m: GridMetrics, rect: PixelRect): HTMLElement | null {
  if (it.kind === "part" && partDef(it.part.defId).kind === "core") {
    const body = look.renders.body(look.truck, look.paint);
    return body ? (coreArt(body, it.part, m, rect) ?? el("span", { class: "inv-art" })) : null;
  }
  const sprite = drawnSprite(look, it);
  return sprite ? partArt(sprite, m, rect) : null;
}

function itemClass(it: GridItem, mounted: boolean): string {
  if (it.kind !== "part") return "inv-item";
  if (partDef(it.part.defId).kind === "core") return "inv-item fixed";
  return mounted ? "inv-item mounted" : "inv-item spare";
}

export type RefitMark = "working" | "queued";

export function takenMarks(w: World, parts: readonly PartInstance[]): Map<string, RefitMark> {
  const me = playerVehicle(w);
  if (me.job?.kind !== "refit") return new Map();
  const head = me.job.pickup?.partId;
  const taken = plannedRefit(w, me).taken;
  return new Map(parts.filter((p) => taken.has(p.id)).map((p) => [p.id, p.id === head ? "working" : "queued"] as const));
}

export function markTaken(w: World, node: HTMLElement, mark: RefitMark | undefined): HTMLElement {
  const job = playerVehicle(w).job;
  if (mark === "working" && job) markWorking(node, jobDone(job));
  if (mark === "queued") node.classList.add("refitting");
  return node;
}

export function removalMarks(w: World, target: Vehicle): Map<string, RefitMark> {
  const byPart = takenMarks(w, target.items.flatMap((it) => (it.kind === "part" ? [it.part] : [])));
  return new Map(target.items.flatMap((it) => (it.kind === "part" && byPart.has(it.part.id) ? [[it.id, byPart.get(it.part.id)!] as const] : [])));
}

function outerHalf(m: GridMetrics, x: number, y: number, size: { w: number; h: number }, side: SideLetter): PixelRect {
  const full = rectOf(m, x, y, size.w, size.h);
  if (side === "F" || side === "B") return { ...full, top: full.top + (side === "B" ? m.cellH / 2 : 0), height: m.cellH / 2 };
  return { ...full, left: full.left + (side === "R" ? m.cellW / 2 : 0), width: m.cellW / 2 };
}

export function refitMarks(w: World, v: Vehicle): Map<string, RefitMark> {
  if (v.job?.kind !== "refit") return new Map();
  const planned = plannedRefit(w, v);
  const working = changedItems(v.items, planned.head);
  const queued = changedItems(planned.head, planned.items).filter((id) => !working.includes(id));
  return new Map([...working.map((id) => [id, "working"] as const), ...queued.map((id) => [id, "queued"] as const)]);
}

function changedItems(before: readonly GridItem[], after: readonly GridItem[]): string[] {
  return after.filter((it) => !before.some((old) => old.id === it.id && old.x === it.x && old.y === it.y && old.rot === it.rot)).map((it) => it.id);
}

export function footprint(it: GridItem): { w: number; h: number } {
  const cells = itemCells({ ...it, x: 0, y: 0 });
  return {
    w: Math.max(...cells.map((c) => c.x)) + 1,
    h: Math.max(...cells.map((c) => c.y)) + 1,
  };
}

export function itemLabel(it: GridItem): { short: Msg } {
  if (it.kind === "parcel") return { short: t("item.parcel") };
  if (it.kind === "good") return { short: byId(`good.${it.good}.short`) };
  return { short: partName(it.part.defId) };
}

export function itemName(it: GridItem): Msg {
  if (it.kind === "parcel") return t("item.parcel");
  return it.kind === "good" ? goodName(it.good) : partName(it.part.defId);
}

export function itemState(it: GridItem, mounted: boolean): Msg {
  if (it.kind === "parcel") return kg(PARCEL.mass);
  if (it.kind === "good") return t("item.cargo", { mass: kg(CRATE_MASS) });
  if (partDef(it.part.defId).kind === "core") return t("item.builtIn");
  return mounted ? t("item.mounted") : t("item.spare");
}

const SVG = "http://www.w3.org/2000/svg";

export function nextRot(it: GridItem): Rot {
  if (weaponDefOf(it)) return ((it.rot + 1) % 4) as Rot;
  return it.rot === 0 ? 1 : 0;
}

export function weaponDefOf(it: GridItem): WeaponDef | null {
  if (it.kind !== "part") return null;
  const def = partDef(it.part.defId);
  return def.kind === "weapon" ? def : null;
}

export function blockerIds(v: Vehicle, it: GridItem): string[] {
  return gunBlockers(v, it).map((b) => b.id);
}

export function fanSvg(v: Vehicle, it: GridItem, m: GridMetrics): SVGSVGElement {
  const { w, h } = itemSize(it);
  const box = rectOf(m, it.x, it.y, w, h);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const size = gridSize(m);
  const radius = Math.max(size.width, size.height);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "inv-fan");
  svg.setAttribute("width", String(size.width));
  svg.setAttribute("height", String(size.height));
  for (const span of gunSpans(v, it)) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", spanPath(cx, cy, radius, span));
    svg.append(path);
  }
  return svg;
}

function spanPath(cx: number, cy: number, r: number, span: FireSpan): string {
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  };
  if (span.to - span.from >= 360) return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  const large = span.to - span.from > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${at(span.from)} A ${r} ${r} 0 ${large} 1 ${at(span.to)} Z`;
}

export function clearFan(grid: HTMLElement): void {
  grid.querySelector(".inv-fan")?.remove();
  for (const node of grid.querySelectorAll(".blocking")) node.classList.remove("blocking");
}

export type WorkMark = { itemIds: ReadonlySet<string>; done: number };

export function workMarkOf(w: World, v: Vehicle): WorkMark | null {
  const work = workOf(w, v);
  if (work?.from !== "job") return null;
  const job = work.job;
  if (job.kind === "refit") return { itemIds: new Set([...refitMarks(w, v)].flatMap(([id, mark]) => (mark === "working" ? [id] : []))), done: jobDone(job) };
  if (job.kind !== "repair" && job.kind !== "strip") return null;
  const ids = v.items.filter((it) => it.kind === "part" && it.part.id === job.partId).map((it) => it.id);
  return { itemIds: new Set(ids), done: jobDone(job) };
}

export function markWorking(node: HTMLElement, done: number): HTMLElement {
  node.classList.add("working");
  node.append(workMeterEl(done));
  return node;
}
