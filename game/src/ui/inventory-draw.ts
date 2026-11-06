
import { CRATE_MASS, PARCEL } from "../data/goods";
import { itemLookId } from "../render/partLooks";
import { partDef, type WeaponDef } from "../data/parts";
import { gunBlockers, gunSpans, type FireSpan } from "../sim/armor";
import { baseGrid, cellsTurned, facingOf, gridOf, itemCells, itemSize, layerOf, plateSide, type Cell, type Grid, type SideLetter } from "../sim/grid";
import type { GridItem, PartInstance, Vehicle, World } from "../sim/types";
import { plannedRefit } from "../sim/inventory";
import { playerVehicle } from "../sim/damage";
import { workOf } from "../sim/states";
import { el } from "./dom";
import { cellSteps } from "../sim/body";
import { uiSize } from "./ui-size";
import { truckOutline } from "./plans";
import { coreArt, dressGrid, drawnSprite, hiddenArt, partArt, tierAttr, truckBackdrop, type GarageLook } from "./garage-draw";
import { conditionMeter, gridItemIcon, itemTip, jobDone, toneStyle, workMeterEl } from "./cards";
import { kg } from "./units";
import { byId, t, type Msg } from "../text/msg";
import { goodName, partName } from "../text/names";

const SPARE_GAP_CELLS = 0.3;
const CARGO_BESIDE_GAP_PX = 20;
const CELL_PX = 42;
const MIN_CLICK_CELL_PX = 24;
const STACKED_MIN_CELL_PX = 28;

export type PixelRect = { left: number; top: number; width: number; height: number };

export type GridMetrics = {
  readonly pxPerMeter: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly cols: number;
  readonly rows: number;
  readonly chassisRows: number;
  readonly spareGap: number;
  readonly cargoBeside: boolean;
};

export function gridMetrics(chassisId: string, g: Grid, pxPerMeter: number, cargoBeside = false): GridMetrics {
  const steps = cellSteps(chassisId);
  const cellW = steps.col * pxPerMeter;
  const cellH = steps.row * pxPerMeter;
  const beside = cargoBeside && g.h > g.chassisH;
  const spareGap = g.h <= g.chassisH ? 0 : beside ? CARGO_BESIDE_GAP_PX : Math.round(SPARE_GAP_CELLS * cellW);
  return { pxPerMeter, cellW, cellH, cols: g.w, rows: g.h, chassisRows: g.chassisH, spareGap, cargoBeside: beside };
}

export function rowTop(m: GridMetrics, y: number): number {
  if (y < m.chassisRows) return y * m.cellH;
  const spareStart = m.cargoBeside ? 0 : m.chassisRows * m.cellH + m.spareGap;
  return spareStart + (y - m.chassisRows) * m.cellW;
}

function rowHeight(m: GridMetrics, y: number): number {
  return y < m.chassisRows ? m.cellH : m.cellW;
}

function cargoLeft(m: GridMetrics): number {
  return m.cols * m.cellW + m.spareGap;
}

function colLeft(m: GridMetrics, x: number, y: number): number {
  return (m.cargoBeside && y >= m.chassisRows ? cargoLeft(m) : 0) + x * m.cellW;
}

export function rectOf(m: GridMetrics, x: number, y: number, w: number, h: number): PixelRect {
  const top = rowTop(m, y);
  const lastRow = m.cargoBeside && y < m.chassisRows ? Math.min(y + h - 1, m.chassisRows - 1) : y + h - 1;
  return { left: colLeft(m, x, y), top, width: w * m.cellW, height: rowTop(m, lastRow) + rowHeight(m, lastRow) - top };
}

export function gridSize(m: GridMetrics): { width: number; height: number } {
  if (!m.cargoBeside) return { width: m.cols * m.cellW, height: rowTop(m, m.rows - 1) + rowHeight(m, m.rows - 1) };
  return { width: cargoLeft(m) + m.cols * m.cellW, height: Math.max(m.chassisRows * m.cellH, (m.rows - m.chassisRows) * m.cellW) };
}

export function truckArea(m: GridMetrics): { width: number; height: number } {
  return m.cargoBeside ? { width: m.cols * m.cellW, height: m.chassisRows * m.cellH } : gridSize(m);
}

export function cellAt(m: GridMetrics, px: number, py: number): { x: number; y: number } {
  if (m.cargoBeside) return cellBeside(m, px, py);
  const chassisBottom = m.chassisRows * m.cellH;
  const onTruck = py < chassisBottom + m.spareGap / 2 || m.rows === m.chassisRows;
  return { x: Math.floor(px / m.cellW), y: onTruck ? Math.floor(py / m.cellH) : m.chassisRows + Math.floor((py - chassisBottom - m.spareGap) / m.cellW) };
}

function cellBeside(m: GridMetrics, px: number, py: number): { x: number; y: number } {
  const onCargo = px >= m.cols * m.cellW + m.spareGap / 2;
  if (onCargo) return { x: Math.floor((px - cargoLeft(m)) / m.cellW), y: m.chassisRows + Math.floor(py / m.cellW) };
  return { x: Math.floor(px / m.cellW), y: Math.min(m.chassisRows - 1, Math.floor(py / m.cellH)) };
}

export function smallestSide(m: GridMetrics): number {
  return Math.min(m.cellW, m.cellH);
}

export function cellUnder(m: GridMetrics, grid: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const r = grid.getBoundingClientRect();
  return cellAt(m, uiSize().toLayer(clientX - r.left), uiSize().toLayer(clientY - r.top));
}

export type FitRoom = { columns: number; width: number; height: number };
export type GridLayout = { columns: number; cargoBeside: boolean; pxPerMeter: number };

export function truckMeters(chassisId: string, g: Grid): { width: number; truckHeight: number; spareHeight: number; col: number } {
  const steps = cellSteps(chassisId);
  return { width: g.w * steps.col, truckHeight: g.chassisH * steps.row, spareHeight: (g.h - g.chassisH) * steps.col, col: steps.col };
}

type TruckMeters = ReturnType<typeof truckMeters>;

function pxPerMeterIn(room: FitRoom, truck: TruckMeters, cargoBeside: boolean): number {
  const across = cargoBeside ? (room.width - CARGO_BESIDE_GAP_PX) / (2 * truck.width) : room.width / truck.width;
  const gap = truck.spareHeight > 0 ? SPARE_GAP_CELLS * truck.col : 0;
  const down = cargoBeside ? room.height / Math.max(truck.truckHeight, truck.spareHeight) : room.height / (truck.truckHeight + gap + truck.spareHeight);
  return Math.min(CELL_PX / truck.col, across, down);
}

export function chooseLayout(rooms: readonly FitRoom[], truck: TruckMeters): GridLayout {
  const places = truck.spareHeight > 0 ? [false, true] : [false];
  const tries = rooms.flatMap((room) => places.map((cargoBeside) => ({ columns: room.columns, cargoBeside, pxPerMeter: pxPerMeterIn(room, truck, cargoBeside) })));
  const first = tries.find((t) => t.pxPerMeter * truck.col >= MIN_CLICK_CELL_PX);
  return first ?? tries.reduce((best, t) => (t.pxPerMeter > best.pxPerMeter ? t : best));
}

export function stackedLayout(height: number, truck: TruckMeters): GridLayout {
  const gap = truck.spareHeight > 0 ? SPARE_GAP_CELLS * truck.col : 0;
  const fits = height / (truck.truckHeight + gap + truck.spareHeight);
  const pxPerMeter = Math.min(CELL_PX, Math.max(STACKED_MIN_CELL_PX, fits * truck.col)) / truck.col;
  return { columns: 1, cargoBeside: false, pxPerMeter };
}

export class GridScale {
  private own: GridMetrics | null = null;
  private target: GridMetrics | null = null;
  private layout: GridLayout | null = null;
  private targetLayout: GridLayout | null = null;
  private fitKey: string | null = null;

  reset(): void {
    this.layout = null;
    this.targetLayout = null;
    this.target = null;
    this.fitKey = null;
  }

  holds(key: string): boolean {
    return this.layout !== null && this.fitKey === key;
  }

  apply(key: string, layout: GridLayout, targetLayout: GridLayout | null): void {
    this.fitKey = key;
    this.layout = layout;
    this.targetLayout = targetLayout;
  }

  get columns(): number {
    return this.layout?.columns ?? 3;
  }

  measure(v: Vehicle, own: boolean): GridMetrics {
    const fallback: GridLayout = { columns: 3, cargoBeside: false, pxPerMeter: CELL_PX / cellSteps(v.chassisId).col };
    const chosen = (own ? this.layout : (this.targetLayout ?? this.layout)) ?? fallback;
    const m = gridMetrics(v.chassisId, gridOf(v), chosen.pxPerMeter, chosen.cargoBeside);
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

  slop(): number {
    return (this.own ? smallestSide(this.own) : MIN_CLICK_CELL_PX) / 4;
  }
}

export function scrollAncestor(box: HTMLElement): HTMLElement | null {
  let outermost: HTMLElement | null = null;
  for (let node = box.parentElement; node; node = node.parentElement) {
    const y = getComputedStyle(node).overflowY;
    if (y === "auto" || y === "scroll") outermost = node;
  }
  return outermost;
}

function lowestGrid(root: HTMLElement): number {
  const trucks = [...root.querySelectorAll(".inv-truck")];
  return Math.max(...trucks.map((t) => t.getBoundingClientRect().bottom));
}

export function overflowIn(frame: HTMLElement, root: HTMLElement): number {
  return uiSize().toLayer(lowestGrid(root) - frame.getBoundingClientRect().top) + frame.scrollTop - (frame.clientHeight - pxOf(getComputedStyle(frame).paddingBottom));
}

function widthOf(node: Element | null): number {
  return node ? uiSize().toLayer(node.getBoundingClientRect().width) : 0;
}

function pxOf(value: string | undefined): number {
  return parseFloat(value ?? "") || 0;
}

function sidePadding(node: Element | null): number {
  if (!node) return 0;
  const style = getComputedStyle(node);
  return pxOf(style.paddingLeft) + pxOf(style.paddingRight);
}

export function hostedWidth(box: HTMLElement, root: HTMLElement): number {
  const split = box.closest(".town-split");
  if (!split) return Infinity;
  const shop = split.querySelector(".town-shop");
  const column = box.parentElement;
  if (!shop || !column) throw new Error("A hosted inventory sits outside its split");
  const gaps = pxOf(getComputedStyle(split).columnGap) + pxOf(getComputedStyle(column).paddingRight);
  const wrap = root.querySelector(".inv-wrap");
  const wrapGap = wrap ? pxOf(getComputedStyle(wrap).columnGap) : 0;
  const shopRoom = pxOf(getComputedStyle(shop).getPropertyValue("--panel-l"));
  return widthOf(split) - gaps - shopRoom - widthOf(root.querySelector(".inv-side")) - wrapGap - sidePadding(root.querySelector(".truck-shell"));
}

export function benchRooms(frame: HTMLElement, root: HTMLElement, grid: HTMLElement | null): FitRoom[] {
  const middle = root.querySelector(".inv-middle");
  const bench = root.querySelector(".inv-bench");
  if (!middle || !grid || !bench) throw new Error("The inventory bench is not rendered");
  const style = getComputedStyle(frame);
  const top = uiSize().toLayer(grid.getBoundingClientRect().top - middle.getBoundingClientRect().top);
  const height = middle.clientHeight - top;
  const across = pxOf(style.maxWidth) - sidePadding(frame) - 2 * pxOf(style.borderLeftWidth);
  const column = widthOf(root.querySelector(".inv-side-column")) + pxOf(getComputedStyle(bench).columnGap);
  return [
    { columns: 3, width: across - 2 * column, height },
    { columns: 2, width: across - column, height },
  ];
}

export function targetRoom(root: HTMLElement, share: number): FitRoom | null {
  const shell = root.querySelector(".inv-target");
  const well = shell?.parentElement;
  if (!shell || !well) return null;
  const style = getComputedStyle(well);
  const above = uiSize().toLayer(shell.getBoundingClientRect().top - well.getBoundingClientRect().top);
  const head = shell.querySelector("h3");
  const headHeight = head ? uiSize().toLayer(head.getBoundingClientRect().height) + pxOf(getComputedStyle(head).marginBottom) : 0;
  return { columns: 1, width: well.clientWidth - sidePadding(well), height: (well.clientHeight - pxOf(style.paddingBottom) - above - headHeight) * share };
}

export function trimFrame(frame: HTMLElement, spare: number): void {
  if (spare <= 0) return;
  const full = frame.offsetHeight;
  const usual = Math.min(pxOf(getComputedStyle(frame).getPropertyValue("--modal-height")) || full, full);
  frame.style.height = `${Math.max(usual, full - spare)}px`;
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

export function storedGoodItem(good: string): GridItem {
  return { id: `stored-${good}`, x: 0, y: 0, rot: 0, kind: "good", good };
}

export function gridEl(g: Grid, chassisId: string, m: GridMetrics, look: GarageLook | null, picked: { item: GridItem } | null): HTMLElement {
  const size = gridSize(m);
  const grid = el("div", { class: look ? "inv-grid drawn" : "inv-grid", style: `width:${size.width}px;height:${size.height}px` });
  grid.addEventListener("contextmenu", (e) => e.preventDefault());
  grid.append(look ? truckBackdrop(look.body, m) : truckOutline(chassisId, m));
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const node = gridCellEl(g, x, y, m);
      if (node) grid.append(node);
    }
  if (look) dressGrid(grid, m, picked?.item ?? null);
  return grid;
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

export function iconBox(it: GridItem, m: GridMetrics): { width: number; height: number } {
  const box = footprint(it);
  const sideways = facingOf(it) % 180 === 90;
  const across = cellsTurned(it);
  const wide = box.w * m.cellW - 2;
  const tall = box.h * m.cellH - 2;
  const room = { width: sideways ? tall : wide, height: sideways ? wide : tall };
  if (across === sideways) return room;
  const own = itemSize({ ...it, rot: 0 });
  const k = Math.min(room.width / own.w, room.height / own.h);
  return { width: own.w * k, height: own.h * k };
}

export function turnedIcon(it: GridItem, m: GridMetrics): HTMLElement {
  const icon = gridItemIcon(it);
  const gun = weaponDefOf(it);
  if (!gun) return icon;
  const { width, height } = iconBox(it, m);
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

export const LAYERS_PER_BAND = 32;

export function drawnLayer(it: GridItem, art: HTMLElement | null): string {
  if (!art) return "";
  const row = Math.min(it.y + itemSize(it).h, LAYERS_PER_BAND - 1);
  return `;z-index:${weaponBand(it) + row}`;
}

function weaponBand(it: GridItem): number {
  return it.kind === "part" && partDef(it.part.defId).kind === "weapon" ? LAYERS_PER_BAND : 0;
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
  const hidden = hiddenArt(look, it, m, rect);
  if (hidden) return hidden;
  if (it.kind === "part" && partDef(it.part.defId).kind === "core") return builtInArt(look, it, m, rect);
  const sprite = drawnSprite(look, it);
  return sprite ? partArt(sprite, m, rect) : null;
}

function builtInArt(look: GarageLook, it: Extract<GridItem, { kind: "part" }>, m: GridMetrics, rect: PixelRect): HTMLElement | null {
  return coreArt(look.body, it.part, m, rect) ?? el("span", { class: "inv-art" });
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

export function weaponDefOf(it: GridItem): WeaponDef | null {
  if (it.kind !== "part") return null;
  const def = partDef(it.part.defId);
  return def.kind === "weapon" ? def : null;
}

export function blockerIds(v: Vehicle, it: GridItem): string[] {
  return gunBlockers(v, it).map((b) => b.id);
}

export type PixelPoint = { x: number; y: number };

function tileCenter(m: GridMetrics, it: GridItem): PixelPoint {
  const { w, h } = itemSize(it);
  const box = rectOf(m, it.x, it.y, w, h);
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function fanSvg(v: Vehicle, it: GridItem, m: GridMetrics, pivot: PixelPoint | null): SVGSVGElement {
  const { x: cx, y: cy } = pivot ?? tileCenter(m, it);
  const size = truckArea(m);
  const radius = Math.max(size.width, size.height);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "inv-fan");
  svg.style.zIndex = String(LAYERS_PER_BAND);
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
