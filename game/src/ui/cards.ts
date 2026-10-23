
import { oilSlickLength } from "../data/utilities";
import { CHASSIS, chassisDef, isTruckPaint, PAINT, samePaint, type TruckPaint } from "../data/chassis";
import { partDef, type PartDef, type PartKind, type WeaponDef, type EngineDef, type ShieldDef, type ScannerDef, type CargoDef, type StoreDef, type UtilityDef, type FieldRepair } from "../data/parts";
import { playerVehicle } from "../sim/damage";
import { baseGrid, cargoCellsGained, cellCount, mountedParts, type Cell } from "../sim/grid";
import { maxHp, partValue, wornDef } from "../sim/wear";
import type { GridItem, Job, PartInstance, Vehicle, World } from "../sim/types";
import { workOf } from "../sim/states";
import { GOODS, PARCEL } from "../data/goods";
import { CHASSIS_MASK, CHASSIS_SHEET, itemLookId, itemTone } from "../render/partLooks";
import { fetchAsset } from "../fetch-asset";
import { noteError } from "../three/crash";
import { publicUrl } from "../public-url";
import { ITEM_TONES, paintSheetPixels, playerColors } from "../render/palette";
import ICONS from "../data/item-icons.json";
import { num, t, type Msg } from "../text/msg";
import { chassisName, goodLore, goodName, partLore, partName } from "../text/names";
import { roundDamage } from "../sim/combat";
import { el } from "./dom";
import { conditionStatus, conditionTier, showsCondition, wearLabel } from "./format";
import { fuelLiters, hp, kph, meters, mps2 } from "./units";

const ART = {
  trade: '<ellipse cx="18" cy="9" rx="11" ry="5"/><path d="M7 9v15c0 7 22 7 22 0V9M7 16c0 7 22 7 22 0"/>',
  fuel: '<path d="M8 10h16v23H8zM11 4h10v6M15 15l6 6-9 8M24 12h7v18h5V15l-5-5"/>',
  supplies: '<path fill-rule="evenodd" d="M5 6h30v29H5zM9 10h22v5H9zM9 18h22v5H9zM9 26h22v5H9z"/>',
  health: '<path d="M15 5h10v10h10v10H25v10H15V25H5V15h10z"/>',
  engineHeat: '<path d="M17 4h6v15a6 6 0 1 1-6 0z"/><path fill="none" d="M3 32q4.25-3 8.5 0t8.5 0t8.5 0t8.5 0M3 37q4.25-3 8.5 0t8.5 0t8.5 0t8.5 0M25 8h5M25 13h5"/>',
  driver:
    '<circle cx="20" cy="12" r="7"/><path d="M7 35v-6q13-15 26 0v6M17 27h6M20 24v6"/>',
  truck:
    '<path d="M10 5h20v31H10zM12 10h16v9H12zM12 25h16M12 30h16M6 8v8M34 8v8M6 27v8M34 27v8"/>',
  engine:
    '<path d="M8 8h24v25H8zM4 15h4M32 15h5M13 4v33M20 4v33M27 4v33M7 14h26M7 26h26"/>',
  armor: '<path d="M6 6h28v23L20 37 6 29zM11 11h18v15l-9 5-9-5z"/>',
  cargo: '<path d="M4 10h32v26H4zM4 10l8-6h18l6 6M4 10l32 26M36 10L4 36"/>',
  wheel:
    '<rect x="10" y="3" width="20" height="34" rx="5"/><path d="M12 9h16M12 16h16M12 23h16M12 30h16M20 4v32"/>',
  transmission: '<path d="M7 16h26v10H7zM14 9v24M26 9v24M4 21h32"/>',
  cab: '<path d="M6 9l5-5h18l5 5v26H6zM10 9h20v13H10zM20 9v13M10 28h20"/>',
  salt: '<path d="M12 5h16l-3 7 8 17q1 8-13 8T7 29l8-17zM14 13h12M16 25h8M20 21v8"/>',
  star: '<path d="M20 3l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z"/>',
  turn: '<path d="M5 14h16V5l16 15-16 15v-9H5z"/>',
  tools:
    '<path d="M12 5l6 7-6 6-7-6q-3 10 10 11l14 14 8-8-14-14q1-13-11-10z"/>',
  parts:
    '<circle cx="20" cy="20" r="8"/><circle cx="20" cy="20" r="3"/><path d="M20 4v6M20 30v6M4 20h6M30 20h6M9 9l4 4M27 27l4 4M31 9l-4 4M9 31l4-4"/>',
  scanner: '<path d="M8 30q-4-16 12-22l6 12zM17 19l9-9M26 10l4-4M20 30v6M12 36h16"/>',
  utility: '<path d="M6 14h28v20H6zM10 14V8h20v6M20 18v12M14 24h12M30 8l5-4"/>',
  damage: '<path d="M20 3l4 10 11-3-7 9 8 8-11-1-1 11-5-9-7 8v-11l-10-3 10-5-4-10 10 5z"/>',
  pen: '<path d="M22 5v30M4 20h28M26 14l7 6-7 6"/>',
  range: '<path d="M4 20h32M4 13v14M36 13v14M12 17v6M20 16v8M28 17v6"/>',
  reload: '<path d="M33 20a13 13 0 1 1-4-9.5M33 5v9h-9"/>',
  cooldown: '<path d="M11 5h18M11 35h18M13 5q0 11 7 15q-7 4-7 15M27 5q0 11-7 15q7 4 7 15"/>',
  magazine: '<path d="M14 6h12v28H14zM14 13h12M14 20h12M14 27h12"/>',
  spread: '<path d="M5 20l30-12M5 20l30 12M5 20h30"/>',
  arc: '<path d="M20 33L7 12M20 33l13-21M9 15q11-9 22 0"/>',
  speed: '<path d="M5 30a15 15 0 1 1 30 0M20 30l9-11M10 30h3M27 30h3"/>',
  accel: '<path d="M7 9l11 11-11 11M20 9l11 11-11 11"/>',
  noise: '<path d="M5 15h6l9-8v26l-9-8H5zM26 14q4 6 0 12M31 9q8 11 0 22"/>',
  ram: '<path d="M4 20h19M17 13l7 7-7 7M30 5v30M35 5v30"/>',
  rows: '<path d="M5 6h30v28H5zM5 15h30M5 25h30M20 25v9"/>',
  hp: '<path d="M20 34L6 20Q0 12 7 7q7-4 13 4 6-8 13-4 7 5 1 13z"/>',
  mass: '<path d="M9 34l4-19h14l4 19zM16 15a4 4 0 1 1 8 0"/>',
  turning: '<path d="M10 35V22q0-12 14-12h6M25 4l7 6-7 6"/>',
  cells: '<path d="M5 5h30v30H5zM5 20h30M20 5v30"/>',
  load: '<path d="M3 27h34v6H3zM9 27V13h22v14M9 33v3M31 33v3"/>',
  power: '<path d="M23 3L9 22h10l-3 15 15-20H21z"/>',
  recoil: '<path d="M16 20h20M16 14v12M4 20l8-6v12z"/>',
  blast: '<path d="M20 4l3 9 9-4-4 9 9 2-9 3 4 9-9-4-3 9-3-9-9 4 4-9-9-3 9-2-4-9 9 4z"/>',
  heat: '<path d="M16 25V7a4 4 0 0 1 8 0v18a7 7 0 1 1-8 0zM20 13v15"/>',
  patch: '<path d="M8 14l14-9 11 17-14 9zM15 15l3 5M20 12l3 5M18 22l3 5"/>',
  tall: '<path d="M14 36V8h12v28M6 36h28M20 8V3"/>',
  clock: '<circle cx="20" cy="20" r="15"/><path d="M20 10v10l7 5"/>',
  paint: '<path d="M11 15h14v21H11zM14 15v-5h8v5M16 10V5h4v5M29 7l5-2M29 12h6M29 17l5 2"/>',
  lock: '<path d="M9 18h22v18H9zM14 18v-6a6 6 0 0 1 12 0v6M20 25v5"/>',
  journal: '<path d="M9 5h21v30H9zM14 5v30M18 12h8M18 18h8M18 24h5"/>',
  cut: '<circle cx="11" cy="30" r="5"/><circle cx="29" cy="30" r="5"/><path d="M14 26L31 4M26 26L9 4"/>',
} as const;

export type IconName = keyof typeof ART;

const iconName = (name: IconName): Msg => t(`icon.${name}`);

export function createIcon(name: IconName): HTMLElement {
  const icon = el("span", {
    class: `icon icon-${name}`,
    title: iconName(name),
    "aria-hidden": "true",
  });
  icon.innerHTML = `<svg viewBox="0 0 40 40" focusable="false">${ART[name]}</svg>`;
  return icon;
}

export function dialShare(speed: number, maxSpeed: number): number {
  if (maxSpeed <= 0) return speed === 0 ? 0 : 1;
  return Math.min(Math.abs(speed) / maxSpeed, 1);
}

const DIAL_STEP = 20;
const DIAL_TOP = Math.ceil(Math.max(...Object.values(CHASSIS).map((c) => kph(c.maxSpeed))) / DIAL_STEP) * DIAL_STEP;
const DIAL_X = 60;
const DIAL_Y = 50;
const DIAL_R = 40;

function dialPoint(share: number, r: number): string {
  const a = share * Math.PI;
  return `${(DIAL_X - r * Math.cos(a)).toFixed(2)} ${(DIAL_Y - r * Math.sin(a)).toFixed(2)}`;
}

function dialScale(): string {
  const ticks: string[] = [];
  for (let v = 0; v <= DIAL_TOP; v += DIAL_STEP / 2) {
    const share = v / DIAL_TOP;
    const major = v % DIAL_STEP === 0;
    ticks.push(`<path class="${major ? "dial-major" : "dial-minor"}" d="M${dialPoint(share, DIAL_R)}L${dialPoint(share, DIAL_R - (major ? 6 : 3))}"/>`);
  }
  return ticks.join("");
}

const DIAL_SCALE = dialScale();

export function createSpeedDial(speed: number, maxSpeed: number): HTMLElement {
  const dial = el("span", { class: "speed-dial", "aria-hidden": "true" });
  const angle = dialShare(speed, DIAL_TOP) * 180;
  const limit = dialShare(maxSpeed, DIAL_TOP);
  const redline = `<path class="dial-redline" d="M${dialPoint(limit, DIAL_R - 1)}A${DIAL_R - 1} ${DIAL_R - 1} 0 0 1 ${dialPoint(1, DIAL_R - 1)}"/>`;
  const needle = `<path class="dial-needle" d="M${DIAL_X - DIAL_R + 3} ${DIAL_Y}L${DIAL_X} ${DIAL_Y - 1.4}L${DIAL_X + 7} ${DIAL_Y - 0.8}V${DIAL_Y + 0.8}L${DIAL_X} ${DIAL_Y + 1.4}z" transform="rotate(${angle} ${DIAL_X} ${DIAL_Y})"/>`;
  dial.innerHTML = `<svg viewBox="0 0 120 72"><rect class="dial-rim" x="1" y="1" width="118" height="70" rx="9"/><rect class="dial-face" x="4" y="4" width="112" height="64" rx="6"/>${redline}${DIAL_SCALE}${needle}<circle class="dial-pin" cx="${DIAL_X}" cy="${DIAL_Y}" r="4.5"/><circle class="dial-cap" cx="${DIAL_X}" cy="${DIAL_Y}" r="1.6"/></svg>`;
  return dial;
}

type Sheet = "items" | "chassis";
type View = "top" | "diagonal";

export type Box = { x: number; y: number; w: number; h: number };

export type IconCell = {
  sheet: Sheet;
  file: string;
  label: Msg;
  col: number;
  row: number;
  cols: number;
  rows: number;
  box: Box;
  view: View;
};

type ManifestCell = { index: number; box: number[] };

export function itemIconCell(id: string): IconCell {
  const good = id in GOODS || id === PARCEL.id;
  const label = itemIconLabel(id);
  const icons: Record<string, ManifestCell> = ICONS.items;
  const icon = icons[id];
  if (!icon) throw new Error(`No items icon for ${id}. Run npm run icons.`);
  return { ...sheetCell("items", icon, label), view: viewOf(good ? ICONS.views.good : ICONS.views.part) };
}

function itemIconLabel(id: string): Msg {
  if (id === PARCEL.id) return t("item.parcel");
  return id in GOODS ? goodName(id) : partName(partDef(id).id);
}

export function itemLore(id: string): Msg {
  if (id === PARCEL.id) return t("lore.parcel");
  return id in GOODS ? goodLore(id) : partLore(partDef(id).id);
}

export function itemTip(id: string): Msg {
  return t("item.tip", { name: itemIconLabel(id), lore: itemLore(id) });
}

export function chassisPortraitCell(chassisId: string, paint: TruckPaint): IconCell {
  const icons: Record<string, ManifestCell> = ICONS.chassis;
  const icon = icons[chassisId];
  if (!icon) throw new Error(`No chassis icon for ${chassisId}. Run npm run icons.`);
  if (!isTruckPaint(paint)) throw new Error(`No paint ${JSON.stringify(paint)}`);
  const cell = sheetCell("chassis", icon, chassisName(chassisDef(chassisId).id));
  return { ...cell, file: CHASSIS_SHEET, view: viewOf(ICONS.views.chassis) };
}

function viewOf(view: string): View {
  if (view !== "top" && view !== "diagonal") throw new Error(`Unknown icon view ${view}. Run npm run icons.`);
  return view;
}

function sheetCell(sheet: Sheet, icon: ManifestCell, label: Msg): Omit<IconCell, "view"> {
  const cols = ICONS.cols[sheet];
  const rows = Math.ceil(Object.keys(ICONS[sheet]).length / cols);
  const [x, y, w, h] = icon.box;
  return { sheet, file: SHEET_FILES[sheet], label, col: icon.index % cols, row: Math.floor(icon.index / cols), cols, rows, box: { x, y, w, h } };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SHEET_FILES: Record<Sheet, string> = { items: "items.svg", chassis: CHASSIS_SHEET };

function sheetIcon(cell: IconCell, cls: string, crop: Box, title: Msg | null): HTMLElement {
  const icon = el("span", { class: cls, role: "img", "aria-label": cell.label, ...(title ? { title } : {}) });
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${crop.w} ${crop.h}`);
  svg.setAttribute("focusable", "false");
  const clip = document.createElementNS(SVG_NS, "svg");
  clip.setAttribute("viewBox", `${cell.col + crop.x} ${cell.row + crop.y} ${crop.w} ${crop.h}`);
  for (const [k, v] of [["width", crop.w], ["height", crop.h]] as const) clip.setAttribute(k, String(v));
  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("href", publicUrl(`icons/${cell.file}`));
  image.setAttribute("width", String(cell.cols));
  image.setAttribute("height", String(cell.rows));
  image.setAttribute("preserveAspectRatio", "none");
  clip.append(image);
  svg.append(clip);
  icon.append(svg);
  return icon;
}

function toneIcon(id: string, title: (cell: IconCell) => Msg): HTMLElement {
  const cell = itemIconCell(id);
  const icon = sheetIcon(cell, "icon item-icon", cell.box, title(cell));
  icon.setAttribute("style", toneStyle(id));
  return icon;
}

export function createItemIcon(id: string): HTMLElement {
  return toneIcon(id, (cell) => cell.label);
}

export function createItemTipIcon(id: string): HTMLElement {
  return toneIcon(id, () => itemTip(id));
}

export function createBareItemIcon(id: string): HTMLElement {
  const cell = itemIconCell(id);
  return sheetIcon(cell, "icon item-icon bare", cell.box, cell.label);
}

export function toneStyle(id: string): string {
  return `--tone:#${ITEM_TONES[itemTone(id)].toString(16).padStart(6, "0")}`;
}

export function partIconEl(part: PartInstance): HTMLElement {
  return createItemTipIcon(part.defId);
}

export function itemIconEl(item: GridItem): HTMLElement {
  return createItemTipIcon(itemLookId(item));
}

export function gridItemIcon(item: GridItem): HTMLElement {
  const cell = itemIconCell(itemLookId(item));
  return sheetIcon(cell, "icon item-icon", cell.box, null);
}

export function chassisPortrait(chassisId: string, paint: TruckPaint): HTMLElement {
  const cell = chassisPortraitCell(chassisId, paint);
  const portrait = sheetIcon(cell, "chassis-portrait", cell.box, cell.label);
  if (!samePaint(paint, PAINT.standard)) void showPainted(portrait, paint);
  return portrait;
}

const PAINTED_KEPT = 4;
const painted = new Map<string, Promise<string>>();
let paintFailureNoted = false;

async function showPainted(portrait: HTMLElement, paint: TruckPaint): Promise<void> {
  try {
    const url = await paintedSheetUrl(paint);
    portrait.querySelector("image")?.setAttribute("href", url);
  } catch (err) {
    if (!paintFailureNoted) noteError(err);
    paintFailureNoted = true;
  }
}

export function paintedSheetUrl(paint: TruckPaint): Promise<string> {
  const key = `${paint.body}|${paint.cab}|${paint.gear}`;
  const made = painted.get(key) ?? paintedSheet(paint);
  painted.delete(key);
  painted.set(key, made);
  made.catch(() => painted.delete(key));
  for (const [old, url] of painted) {
    if (painted.size <= PAINTED_KEPT) break;
    painted.delete(old);
    url.then((u) => URL.revokeObjectURL(u), () => undefined);
  }
  return made;
}

async function paintedSheet(paint: TruckPaint): Promise<string> {
  const [sheet, mask] = await Promise.all([CHASSIS_SHEET, CHASSIS_MASK].map(sheetBitmap));
  const canvas = document.createElement("canvas");
  canvas.width = sheet.width;
  canvas.height = sheet.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D canvas context to paint the chassis sheet");
  const pixels = (image: ImageBitmap): ImageData => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };
  const shades = pixels(mask).data;
  const standard = pixels(sheet);
  standard.data.set(paintSheetPixels(standard.data, shades, playerColors(PAINT.standard), playerColors(paint)));
  ctx.putImageData(standard, 0, 0);
  const blob = await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("The painted chassis sheet did not encode"))), "image/png"));
  return URL.createObjectURL(blob);
}

async function sheetBitmap(file: string): Promise<ImageBitmap> {
  const bytes = await fetchAsset("Chassis sheet", publicUrl(`icons/${file}`));
  return createImageBitmap(new Blob([bytes], { type: "image/png" }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
}

export function statGrid(diffs: StatDiff[]): HTMLElement {
  return el(
    "div",
    { class: "stat-grid" },
    ...diffs.map((d) =>
      el(
        "div",
        { class: "stat", title: d.stat.label },
        createIcon(d.stat.icon),
        el("span", { class: "stat-name" }, iconName(d.stat.icon)),
        el("span", { class: "stat-val" }, statValue(d.stat)),
        d.delta === null ? el("span") : el("span", { class: `delta ${d.verdict}` }, d.delta === 0 ? t("stat.same") : d.text),
      ),
    ),
  );
}

const TIGHT_UNITS = ["unit.deg", "unit.times"];

export function statValue(s: Stat): Msg {
  if (s.unit === null) return s.text;
  return t(TIGHT_UNITS.includes(s.unit.key) ? "stat.valueTight" : "stat.value", { text: s.text, unit: s.unit });
}

export function footprint(w: number, h: number): HTMLElement {
  return el(
    "div",
    { class: "footprint", title: t("stat.footprint", { w, h }), style: `grid-template-columns:repeat(${w},1fr)` },
    ...Array.from({ length: w * h }, () => el("i")),
  );
}

export function conditionMeter(part: PartInstance): HTMLElement {
  const max = maxHp(part);
  const broken = part.hp === 0;
  return el(
    "div",
    { class: `meter${broken ? " broken" : ""}`, title: t("stat.condition", { hp: hp(part.hp), max: hp(max) }) },
    el("div", { style: `width:${(part.hp / max) * 100}%` }),
  );
}

export function jobDone(job: Job): number {
  return job.total > 0 ? Math.min(1, Math.max(0, 1 - job.turnsLeft / job.total)) : 0;
}

export function repairingPart(w: World, v: Vehicle): { partId: string; done: number } | null {
  const work = workOf(w, v);
  return work?.from === "job" && work.job.kind === "repair" ? { partId: work.job.partId, done: jobDone(work.job) } : null;
}

export function workMeterEl(done: number): HTMLElement {
  return el("div", { class: "meter s progress" }, el("div", { style: `width:${done * 100}%` }));
}

export function conditionTag(part: PartInstance): HTMLElement | null {
  if (!showsCondition(part)) return null;
  const tier = conditionTier(part);
  return el("span", { class: `cond cond-${tier}` }, ...(tier === "pristine" ? [createIcon("star")] : []), wearLabel(part));
}

export function conditionRow(part: PartInstance): HTMLElement | null {
  if (!showsCondition(part)) return null;
  const status = conditionStatus(part);
  return el("div", { class: "card-cond" }, conditionTag(part), el("span", { class: status.tone }, status.text));
}

export function headlineStat(world: World, part: PartInstance, base: PartInstance | null): StatDiff {
  const first = diffStats(partStats(world, part), base ? partStats(world, base) : null)[0];
  if (!first) throw new Error(`${part.defId} has no stats to headline`);
  return first;
}

export function statChip(d: StatDiff): HTMLElement {
  return el(
    "span",
    { class: "stat-chip", title: d.stat.label },
    createIcon(d.stat.icon),
    el("span", { class: "stat-val" }, statValue(d.stat)),
    d.delta === null ? null : el("span", { class: `delta ${d.verdict}` }, d.delta === 0 ? t("stat.same") : d.text),
  );
}

export type PartCardOptions = {
  world: World;
  part: PartInstance;
  base: PartInstance | null;
  action: HTMLElement | null;
  onHover?: (on: boolean) => void;
};

export function partCard(o: PartCardOptions): HTMLElement {
  const def = partDef(o.part.defId);
  const diffs = diffStats(partStats(o.world, o.part), o.base ? partStats(o.world, o.base) : null);
  const card = el(
    "div",
    { class: `card tile toned k-${def.kind}`, style: toneStyle(def.id) },
    el(
      "div",
      { class: "card-head" },
      createItemIcon(def.id),
      el("div", { class: "card-name" }, el("b", {}, partName(def.id))),
      footprint(def.w, def.h),
    ),
    conditionRow(o.part),
    ...(o.base ? [compareLine(o.base)] : []),
    conditionMeter(o.part),
    statGrid(diffs),
    el("div", { class: "card-foot" }, el("span"), o.action),
  );
  if (o.onHover) {
    const hover = o.onHover;
    card.addEventListener("mouseenter", () => hover(true));
    card.addEventListener("mouseleave", () => hover(false));
  }
  return card;
}

export function partDetail(world: World, part: PartInstance, base: PartInstance | null): HTMLElement[] {
  const rest = diffStats(partStats(world, part), base ? partStats(world, base) : null).slice(1);
  const hpText = hpReadout(part);
  return [
    ...(base ? [compareLine(base)] : []),
    el("div", { class: "part-hp" }, conditionMeter(part), hpText ? el("span", { class: "num dim" }, hpText) : null),
    ...(rest.length ? [statGrid(rest)] : []),
    el("p", { class: "dim" }, partLore(part.defId)),
  ];
}

function hpReadout(part: PartInstance): Msg | null {
  const status = conditionStatus(part);
  return status.tone === "dim" && conditionTier(part) !== "junk" ? status.text : null;
}

export function compareBase(selected: PartInstance | null, part: PartInstance): PartInstance | null {
  return selected && selected.id !== part.id ? selected : null;
}

function compareLine(base: PartInstance): HTMLElement {
  return el("div", { class: "card-compare" }, t("stat.compared", { part: partName(base.defId) }), conditionTag(base));
}

export function chassisMap(chassisId: string): HTMLElement {
  const g = baseGrid(chassisId);
  return el(
    "div",
    { class: "chassis-map", title: t("stat.layout", { chassis: chassisName(chassisDef(chassisId).id) }), style: `grid-template-columns:repeat(${g.w},1fr)` },
    ...g.cells.flat().map((c) => el("i", { class: cellClass(c) })),
  );
}

function cellClass(c: Cell | null): string {
  if (c === null) return "hole";
  return `c-${c === "." ? "plain" : c}`;
}

export type StatIcon =
  | "damage"
  | "pen"
  | "range"
  | "reload"
  | "cooldown"
  | "magazine"
  | "spread"
  | "arc"
  | "speed"
  | "accel"
  | "fuel"
  | "supplies"
  | "noise"
  | "armor"
  | "ram"
  | "rows"
  | "hp"
  | "mass"
  | "turning"
  | "cells"
  | "load"
  | "scanner"
  | "recoil"
  | "power"
  | "blast"
  | "heat"
  | "patch"
  | "tall"
  | "clock";

export type Stat = {
  icon: StatIcon;
  label: Msg;
  value: number;
  text: Msg;
  unit: Msg | null;
  decimals: 0 | 1;
  better: "more" | "less" | null;
};

export type Verdict = "better" | "worse" | "same";

export type StatDiff = { stat: Stat; delta: number; text: Msg; verdict: Verdict } | { stat: Stat; delta: null };

type StatUnit = "kg" | "m" | "t" | "deg" | "kph" | "mps2" | "times" | "liters" | "blast";

function stat(icon: StatIcon, label: Msg, value: number, unit: StatUnit | null, better: Stat["better"], decimals: 0 | 1 = 0): Stat {
  return { icon, label, value, text: formatNumber(value, decimals), unit: unit && t(`unit.${unit}`), decimals, better };
}

function formatNumber(value: number, decimals: 0 | 1): Msg {
  return num(value, decimals === 0 ? "int" : "dec1");
}

function signed(value: number, decimals: 0 | 1): Msg {
  const n = Math.abs(value);
  if (decimals === 1) return value < 0 ? t("stat.minus1", { n }) : t("stat.plus1", { n });
  return value < 0 ? t("stat.minus0", { n }) : t("stat.plus0", { n });
}

export function partStats(world: World, part: PartInstance): Stat[] {
  const def = partDef(part.defId);
  return [...KIND_STATS[def.kind](world, part), stat("mass", t("stat.mass"), def.mass, "kg", "less")];
}

const KIND_STATS: Record<PartKind, (world: World, part: PartInstance) => Stat[]> = {
  weapon: weaponStats,
  engine: (_, part) => engineStats(part),
  armor: (_, part) => armorStats(part),
  accessory: (_, part) => armorStats(part),
  cargo: cargoStats,
  scanner: (_, part) => [stat("scanner", t("stat.detection"), meters(wornDef<ScannerDef>(part).range), "m", "more")],
  store: (_, part) => storeStats(part),
  core: () => [],
  utility: (_, part) => utilityStats(part),
};

function utilityStats(part: PartInstance): Stat[] {
  const d = wornDef<UtilityDef>(part);
  const reload = d.reload === null ? [] : [stat("reload", t("stat.recharge"), d.reload, "t", "less")];
  const lasts = "turns" in d.effect ? [stat("clock", t("stat.lasts"), d.effect.turns, "t", "more")] : [];
  return [...reload, ...utilityReach(d), ...lasts];
}

function utilityReach(d: UtilityDef): Stat[] {
  const e = d.effect;
  if ("maxRange" in e) return [stat("range", t("stat.range"), meters(e.maxRange), "m", "more")];
  if (e.type === "oil") return [stat("range", t("stat.slick"), meters(oilSlickLength()), "m", "more")];
  return "radius" in e ? [stat("range", t("stat.radius"), meters(e.radius), "m", "more")] : [];
}

function storeStats(part: PartInstance): Stat[] {
  const d = partDefOf<StoreDef>(part);
  if (d.holds === "fuel") return [{ ...stat("fuel", t("stat.extraFuel"), fuelLiters(d.amount), "liters", "more"), text: signed(fuelLiters(d.amount), 0) }];
  return [{ ...stat("supplies", t("stat.extraSupplies"), d.amount, null, "more"), text: signed(d.amount, 0) }];
}

function cargoStats(world: World, part: PartInstance): Stat[] {
  const d = partDefOf<CargoDef>(part);
  const cells = cargoCellsGained(playerVehicle(world).chassisId, part.defId);
  const gained = { ...stat("cells", t("stat.cells"), cells, null, "more"), text: signed(cells, 0) };
  const rows = { ...stat("rows", t("stat.extraRows"), d.extraRows, null, "more"), text: signed(d.extraRows, 0), unit: t("stat.rowsUnit", { n: d.extraRows }) };
  return [gained, rows, tallStat(d)];
}

function penStat(d: WeaponDef): Stat {
  return { ...stat("pen", t("stat.pen"), d.round.pen, d.round.blast ? "blast" : null, "more") };
}

function tallStat(d: PartDef): Stat {
  return { ...stat("tall", t("stat.height"), d.tall ? 1 : 0, null, "less"), text: d.tall ? t("stat.tall") : t("stat.low") };
}

function partDefOf<T>(part: PartInstance): T {
  return partDef(part.defId) as T;
}

function weaponStats(world: World, part: PartInstance): Stat[] {
  const d = wornDef<WeaponDef>(part);
  const round = roundDamage(world, d);
  const shot = { ...stat("damage", t("stat.damage"), d.rounds * round, null, "more", 1) };
  if (d.rounds > 1) shot.text = t("stat.roundsTimes", { n: d.rounds, damage: round });
  return [
    shot,
    penStat(d),
    stat("range", t("stat.range"), meters(d.range), "m", "more"),
    stat("cooldown", t("stat.cooldown"), d.cooldown, "t", "less"),
    stat("magazine", t("stat.magazine"), d.magazine, null, "more"),
    stat("reload", t("stat.reload"), d.reload, "t", "less"),
    stat("arc", t("stat.arc"), d.arc, "deg", "more"),
    stat("spread", t("stat.spread"), d.spread, "deg", "less", 1),
    stat("recoil", t("stat.recoil"), d.recoil, "deg", "less", 1),
    stat("power", t("stat.draw"), d.draw, null, "less", 1),
    ...(d.line ? [stat("clock", t("stat.lineHolds"), d.line.turns, "t", "more")] : []),
  ];
}

function engineStats(part: PartInstance): Stat[] {
  const d = wornDef<EngineDef>(part);
  const speed = stat("speed", t("stat.topSpeed"), kph(d.speedBonus), "kph", "more");
  const accel = stat("accel", t("stat.accel"), mps2(d.accelBonus), "mps2", "more", 1);
  return [
    { ...speed, text: signed(speed.value, 0) },
    { ...accel, text: signed(accel.value, 1) },
    stat("power", t("stat.gunPower"), d.capacity, null, "more"),
    stat("fuel", t("stat.fuelUse"), d.fuelMult, "times", "less", 1),
    stat("heat", t("stat.heat"), d.heat, "times", "less", 1),
  ];
}

function armorStats(part: PartInstance): Stat[] {
  const d = wornDef<ShieldDef>(part);
  const armor = stat("armor", t("stat.armor"), Math.round(d.armor), null, "more");
  const blast = stat("blast", t("stat.blastArmor"), Math.round(d.blastArmor), null, "more");
  const stats = [armor, blast, fieldRepairStat(d.fieldRepair)];
  return d.ramMult > 1 ? [...stats, stat("ram", t("stat.ram"), d.ramMult, "times", "more", 1)] : stats;
}

const FIELD_REPAIR_RANK: Record<FieldRepair, number> = { none: 0, capped: 1, full: 2 };

function fieldRepairStat(repair: FieldRepair): Stat {
  return { ...stat("patch", t(`stat.repair.${repair}`), FIELD_REPAIR_RANK[repair], null, "more"), text: t(`stat.repairShort.${repair}`) };
}

export function chassisStats(chassisId: string): Stat[] {
  const c = chassisDef(chassisId);
  const turning = stat("turning", t("stat.turning"), (c.turnFast + c.turnSlow) / 2, "deg", "more");
  return [
    stat("speed", t("stat.baseSpeed"), kph(c.maxSpeed), "kph", "more"),
    stat("accel", t("stat.accel"), mps2(c.accel), "mps2", "more", 1),
    { ...turning, text: t("stat.span", { a: c.turnFast, b: c.turnSlow }) },
    stat("cells", t("stat.cells"), cellCount(baseGrid(chassisId)), null, "more"),
    stat("load", t("stat.ratedLoad"), c.ratedMass, "kg", "more"),
    stat("mass", t("stat.emptyMass"), c.mass, "kg", "less"),
    stat("fuel", t("stat.fuelTank"), fuelLiters(c.fuelCap), "liters", "more"),
  ];
}

export function diffStats(stats: Stat[], base: Stat[] | null): StatDiff[] {
  return stats.map((s) => {
    const b = base?.find((x) => x.icon === s.icon);
    if (!b) return { stat: s, delta: null };
    const delta = Number((s.value - b.value).toFixed(s.decimals));
    return { stat: s, delta, text: signed(delta, s.decimals), verdict: verdictOf(delta, s.better) };
  });
}

function verdictOf(delta: number, better: Stat["better"]): Verdict {
  if (delta === 0 || better === null) return "same";
  return (delta > 0) === (better === "more") ? "better" : "worse";
}

export function baselinePart(v: Vehicle, kind: PartKind): PartInstance | null {
  return [...mountedParts(v, kind)].sort((a, b) => partValue(b) - partValue(a))[0] ?? null;
}
