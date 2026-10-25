
import { CRATE_MASS, PARCEL } from "../data/goods";
import { itemLookId } from "../render/partLooks";
import { partDef, type WeaponDef } from "../data/parts";
import { gunBlockers, gunSpans, type FireSpan } from "../sim/armor";
import { baseGrid, facingOf, itemCells, itemSize, layerOf, plateSide, type Cell, type Grid, type SideLetter } from "../sim/grid";
import type { GridItem, PartInstance, Rot, Vehicle, World } from "../sim/types";
import { plannedRefit } from "../sim/inventory";
import { playerVehicle } from "../sim/damage";
import { workOf } from "../sim/states";
import { el } from "./dom";
import { truckOutline } from "./plans";
import { conditionMeter, gridItemIcon, itemTip, jobDone, toneStyle, workMeterEl } from "./cards";
import { kg } from "./units";
import { byId, t, type Msg } from "../text/msg";
import { goodName, partName } from "../text/names";

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

export function gridEl(g: Grid, chassisId: string, cell: number): HTMLElement {
  const grid = el("div", { class: "inv-grid", style: `width:${g.w * cell}px;height:${g.h * cell}px` });
  grid.addEventListener("contextmenu", (e) => e.preventDefault());
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const node = gridCellEl(g, x, y, cell);
      if (node) grid.append(node);
    }
  grid.append(truckOutline(chassisId, cell));
  return grid;
}

function gridCellEl(g: Grid, x: number, y: number, cell: number): HTMLElement | null {
  const c = g.cells[y][x];
  if (c !== null) return cellEl(c, x, y, cell);
  if (y < g.deadFrom) return null;
  return el("div", { class: "inv-cell c-dead", style: pos(x, y, 1, 1, cell), title: t("cell.deadRows") });
}

export function cellEl(c: Cell, x: number, y: number, cell: number): HTMLElement {
  return el("div", { class: `inv-cell c-${c === "." ? "plain" : c}`, style: pos(x, y, 1, 1, cell), title: CELL_TITLE[c] });
}

export function turnedIcon(it: GridItem, cell: number): HTMLElement {
  const icon = gridItemIcon(it);
  const gun = weaponDefOf(it);
  if (gun) icon.style.cssText += `;position:absolute;left:50%;top:50%;width:${gun.w * cell}px;height:${gun.h * cell}px;transform:translate(-50%,-50%) rotate(${facingOf(it)}deg)`;
  return icon;
}

export function itemBox(it: GridItem, chassisId: string, mounted: boolean, cell: number): HTMLElement {
  const cells = itemCells(it);
  const x = Math.min(...cells.map((c) => c.x));
  const y = Math.min(...cells.map((c) => c.y));
  const size = itemSize(it);
  const id = itemLookId(it);
  const icon = turnedIcon(it, cell);
  const outer = mounted && layerOf(baseGrid(chassisId), it) === "accessory";
  const box = outer ? outerHalf(x, y, size, plateSide(chassisId, it), cell) : pos(x, y, size.w, size.h, cell);
  const node = el(
    "div",
    { class: `${itemClass(it, mounted)}${outer ? " outer" : ""}`, "data-hold": "", "data-item-id": it.id, style: `${box};${toneStyle(id)}`, title: itemTip(id), tabindex: 0, role: "button", "aria-label": itemName(it) },
    icon,
    el("span", { class: "inv-item-name" }, itemLabel(it).short),
  );
  if (it.kind === "part") node.append(conditionMeter(it.part));
  return node;
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

function pos(x: number, y: number, w: number, h: number, cell: number): string {
  return `left:${x * cell}px;top:${y * cell}px;width:${w * cell}px;height:${h * cell}px`;
}

function outerHalf(x: number, y: number, size: { w: number; h: number }, side: SideLetter, cell: number): string {
  const half = cell / 2;
  const left = x * cell + (side === "R" ? half : 0);
  const top = y * cell + (side === "B" ? half : 0);
  const across = side === "F" || side === "B";
  return `left:${left}px;top:${top}px;width:${across ? size.w * cell : half}px;height:${across ? half : size.h * cell}px`;
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

export function fanSvg(v: Vehicle, it: GridItem, def: WeaponDef, size: { w: number; h: number }, cell: number): SVGSVGElement {
  const { w, h } = itemSize(it);
  const cx = (it.x + w / 2) * cell;
  const cy = (it.y + h / 2) * cell;
  const radius = Math.max(size.w, size.h) * cell;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "inv-fan");
  svg.setAttribute("width", String(size.w * cell));
  svg.setAttribute("height", String(size.h * cell));
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
