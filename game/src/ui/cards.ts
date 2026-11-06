
import { oilSlickLength } from "../data/utilities";
import { chassisDef, isTruckPaint, PAINT, samePaint, type TruckPaint } from "../data/chassis";
import { partDef, type PartDef, type PartKind, type WeaponDef, type EngineDef, type ShieldDef, type ScannerDef, type CargoDef, type StoreDef, type UtilityDef, type FieldRepair } from "../data/parts";
import { VIEW } from "../data/view";
import { playerVehicle } from "../sim/damage";
import { accelFactor, chassisTopSpeed } from "../sim/chassis-features";
import { bareGrid, cargoCellsGained, cargoRowsOn, cellCount, mountedParts, type Cell } from "../sim/grid";
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
import { say } from "../text/language";
import { roundDamage } from "../sim/combat";
import { el } from "./dom";
import { conditionStatus, conditionTier, showsCondition, wearLabel } from "./format";
import { fuelLiters, hp, kph, meters, mps2 } from "./units";
import { canvasReadable } from "../three/render/pixelReadback";

export const ART = {
  trade: '<path d="M1.5 3.5h8v-2l5 3.5-5 3.5v-2h-8zM14.5 9.5h-8v-2L1.5 11l5 3.5v-2h8z"/>',
  fuel: '<path d="M2 2h8v13H2zM4 4h4v3.5H4z"/><path d="M10 4.5h2.5L15 7v5.5h-1.5V7.5L12 6h-2z"/>',
  supplies: '<path d="M5.5 1.5L8 3l2.5-1.5v2h-5zM7 3.5h2V5.5H7zM5 5.5h6l2.5 3.5c1 3.5 0 6-5.5 6S1.5 12.5 2.5 9z"/>',
  health: '<path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z"/>',
  engineHeat: '<path d="M6.5 1h3v5.5a3 3 0 1 1-3 0zM1.5 13l2.5-1.5L6.5 13l2.5-1.5 2.5 1.5 2.5-1.5v2L11.5 15 9 13.5 6.5 15 4 13.5 1.5 15z"/>',
  driver: '<path d="M8 2a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM2 15c0-4.5 2.5-5.5 6-5.5s6 1 6 5.5z"/>',
  truck:
    '<path d="M1 2.5h9v2h2.5L15 7.5v1H1zM11 5.5h1.5l1.5 2H11z"/><path d="M4.5 10a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM11.5 10a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z"/>',
  engine:
    '<path d="M1.5 7h2V5.5H6V3.5H4.5v-1.5h5v1.5H8V5.5h3L12.5 7H15v4.5h-1.5L12 13H5.5L3.5 11V9.5h-2z"/>',
  armor: '<path d="M8 1.5L14 3.5V8C14 11.5 11 13.5 8 14.5 5 13.5 2 11.5 2 8V3.5zM8 4L12 5.5V8C12 10 10 11.5 8 12.5 6 11.5 4 10 4 8V5.5z"/>',
  cargo: '<path d="M1.5 3h13v11h-13zM3.5 5h9v7h-9z"/><path d="M3.5 5H6l6.5 7H10z"/><path d="M12.5 5H10L3.5 12H6z"/>',
  wheel:
    '<path d="M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM8 3.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z"/><path d="M7 3.5h2v9H7z"/><path d="M3.5 7h9v2h-9z"/>',
  transmission: '<path d="M2 3h1.5v4.5h9V3H14v10h-1.5V9h-9v4H2z"/><path d="M8 5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z"/>',
  cab: '<path d="M2 15V6.5L5 2.5h6.5L14 7v8zM5.5 5.5L4 7.5h8L10.5 5.5z"/>',
  salt: '<path d="M7 3h2v10H7zM4.5 13.5h7V15h-7zM1.5 3h13v1.5h-13zM3 4.5h2V8H3zM11 4.5h2V8h-2zM1 8h6c0 2.5-1.5 4-3 4S1 10.5 1 8zM9 8h6c0 2.5-1.5 4-3 4S9 10.5 9 8z"/>',
  star: '<path d="M8 1.5L10 6L14.5 6.5L11 9.5L12 14L8 11.5L4 14L5 9.5L1.5 6.5L6 6z"/>',
  turn: '<path d="M2.5 2.5L11 8l-8.5 5.5zM12.5 2.5h2v11h-2z"/>',
  tools:
    '<path d="M1 13L8.5 5.5L10.5 7.5L3 15zM11 1.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM11 3.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z"/>',
  parts:
    '<path d="M8 3a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM8 6a2 2 0 1 1 0 4a2 2 0 1 1 0-4z"/><path d="M7 1h2v2H7zM7 13h2v2H7zM1 7h2v2H1zM13 7h2v2h-2zM12.5 2L14 3.5L12.5 5L11 3.5zM3.5 2L5 3.5L3.5 5L2 3.5zM12.5 11L14 12.5L12.5 14L11 12.5zM3.5 11L5 12.5L3.5 14L2 12.5z"/>',
  scanner: '<path d="M2 5.5L10.5 14C5.5 14.5 2 11 2 5.5z"/><path d="M7.5 7.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM8 2a6 6 0 0 1 6 6h-1.5A4.5 4.5 0 0 0 8 3.5zM8 5.5A2.5 2.5 0 0 1 10.5 8H9A1 1 0 0 0 8 7z"/>',
  utility: '<path d="M3 6h8v9H3zM4.5 9h5v1.5h-5z"/><path d="M5.5 3.5h3V6h-3zM9 4l2.5-1.5.5 1L9.5 5zM13 1.5l.5 1.5 1.5.5-1.5.5L13 5.5 12.5 4 11 3.5 12.5 3z"/>',
  damage: '<path d="M10.5 1.5L10 6L14.5 5.5L11 8L14.5 10.5L10 10L10.5 14.5L8 11L5.5 14.5L6 10L1.5 10.5L5 8L1.5 5.5L6 6L5.5 1.5L8 5z"/>',
  pen: '<path d="M6.5 1.5H9v13H6.5zM1.5 7H12V9H1.5z"/><path d="M12 5.5L15 8l-3 2.5z"/>',
  range: '<path d="M1.5 3H3v10H1.5zM13 3h1.5v10H13zM4 8l3-3v2h2V5l3 3-3 3V9H7v2z"/>',
  reload: '<path d="M8 2a6 6 0 1 0 6 6h-1.5A4.5 4.5 0 1 1 8 3.5zM11 8h4l-2-3.5z"/>',
  cooldown: '<path d="M3 1.5h10V3h-1v1.5L9 8l3 3.5V13h1v1.5H3V13h1v-1.5L7 8 4 4.5V3H3z"/>',
  magazine: '<path d="M5 4V3L6 1.5 7 3v1zM9 4V3l1-1.5L11 3v1zM5 5.5h6c.5 3 1.5 6 2.5 9H7.5C7 11 6 8 5 5.5z"/>',
  spread: '<path d="M2 8L14 2.5V4.5zM2 7h12v2H2zM2 8L14 13.5V11.5z"/>',
  arc: '<path d="M8 14.5L2 5.5Q8 1 14 5.5z"/>',
  speed: '<path d="M1.5 12a6.5 6.5 0 0 1 13 0h-1.5a5 5 0 0 0-10 0z"/><path d="M6.5 12.5L11 6l1.5 1.5-3 5.5z"/><path d="M8 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z"/>',
  accel: '<path d="M1.5 12a4 4 0 0 1 8 0H8a2.5 2.5 0 0 0-5 0z"/><path d="M4 12.5L7.5 8 9 9.5l-3 3.5z"/><path d="M12.5 1.5L15 5h-1.5v8H12V5h-1.5z"/>',
  noise: '<path d="M1.5 6H4l3.5-3v10L4 10H1.5zM9 5.5a2.5 2.5 0 0 1 0 5v-1.5a1 1 0 0 0 0-2zM9 2.5a5.5 5.5 0 0 1 0 11v-1.5a4 4 0 0 0 0-8z"/>',
  ram: '<path d="M1.5 3.5H7L11.5 8 7 12.5H1.5zM13 2h1.5v12H13z"/>',
  rows: '<path d="M1.5 2H7v3H1.5zM8.5 2h6v3h-6zM1.5 6.5h8v3h-8zM11 6.5h3.5v3H11zM1.5 11H5v3H1.5zM6.5 11h8v3h-8z"/>',
  hp: '<path d="M8 14.5L2 8.5C1 7 1 3.5 4.5 2.5 6 2.5 7.5 3.5 8 5 8.5 3.5 10 2.5 11.5 2.5 15 3.5 15 7 14 8.5z"/>',
  mass: '<path d="M2.5 14.5L4 6.5H12L13.5 14.5zM8 1a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM8 2.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z"/>',
  turning: '<path d="M3 15V8Q3 3.5 7.5 3.5H10V1.5L14.5 5 10 8.5V6.5H7.5Q6 6.5 6 8V15z"/>',
  cells: '<path d="M1.5 1.5H7V7H1.5zM9 1.5h5.5V7H9zM1.5 9H7v5.5H1.5zM9 9h5.5v5.5H9z"/>',
  load: '<path d="M3.5 2h9v4.5h-9zM4 7.5h1.5v4H4zM10.5 7.5H12v4h-1.5zM1.5 12h13v2.5h-13z"/>',
  power: '<path d="M9.5 1L3 9h4l-1 6 7-9H9z"/>',
  recoil: '<path d="M3 2.5h12V5h-6l-1 1.5V8H5.5V6.5L3 5zM14.5 11.5h-8v-2L1.5 12.5l5 3v-2h8z"/>',
  blast: '<path d="M8 1.5L14 3.5V8C14 11.5 11 13.5 8 14.5 5 13.5 2 11.5 2 8V3.5zM11 8L9.5 9L9.5 10.5L8 9.5L6.5 10.5L6.5 9L5 8L6.5 7.5L6.5 5.5L8 6.5L9.5 5.5L9.5 7z"/>',
  heat: '<path d="M3.5 3.5a1.5 1.5 0 0 1 3 0V9.5a3 3 0 1 1-3 0zM11 3.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM10 1h2v1.5h-2zM13.5 5h1.5v2h-1.5zM10 9.5h2V11h-2z"/>',
  patch: '<path d="M2 10L10 2L14 6L6 14zM6 8L8 6L10 8L8 10z"/>',
  tall: '<path d="M8 1.5L11.5 5H9v4h2.5L8 12.5 4.5 9H7V5H4.5zM1.5 13.5h13V15h-13z"/>',
  clock: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM8 3a5 5 0 1 1 0 10a5 5 0 1 1 0-10z"/><path d="M7 4.5h2v3.5h3v2H7z"/>',
  paint: '<path d="M4.5 6h6v9h-6zM5.5 9.5h4v2h-4z"/><path d="M5.5 3.5h4V6h-4zM6.5 2h2v1.5h-2zM11.5 1.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM14 3.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM11.5 5.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2z"/>',
  lock: '<path d="M3 7h10v8H3zM8 9a1.5 1.5 0 0 1 1 2.5V13H7v-1.5A1.5 1.5 0 0 1 8 9z"/><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h-1.5V5a2 2 0 0 0-4 0v2z"/>',
  journal: '<path d="M4.5 1.5h9v13h-9zM7 4h4.5v1.5H7zM7 7h4.5v1.5H7zM7 10h2.5v1.5H7z"/><path d="M1.5 3h3v1.5h-3zM1.5 6.5h3V8h-3zM1.5 10h3v1.5h-3z"/>',
  cut: '<path d="M4.5 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM4.5 11a1 1 0 1 1 0 2a1 1 0 1 1 0-2zM11.5 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM11.5 11a1 1 0 1 1 0 2a1 1 0 1 1 0-2z"/><path d="M5 9l7.5-7.5L14 3 7 10zM11 9L3.5 1.5 2 3l7 7z"/>',
  gun: '<path d="M1.5 3h8v5.5h-8zM9.5 4.5H15v2H9.5zM13 3h2v1.5h-2zM4 9.5h2L4 15H2zM7 9.5h2l2 5.5H9z"/>',
  store: '<path d="M2 5L4.5 2.5H14V15H2zM4.5 5h4v2h-4z"/><path d="M10.5 1h2.5v1.5h-2.5z"/>',
} as const;

export type IconName = keyof typeof ART;

export const ICON_NAMES = Object.keys(ART) as IconName[];

const iconName = (name: IconName): Msg => t(`icon.${name}`);

export function createIcon(name: IconName): HTMLElement {
  const icon = el("span", {
    class: `icon icon-${name}`,
    title: iconName(name),
    "aria-hidden": "true",
  });
  icon.innerHTML = `<svg viewBox="0 0 16 16" fill-rule="evenodd" focusable="false">${ART[name]}</svg>`;
  return icon;
}

export function dialShare(speed: number, maxSpeed: number): number {
  if (maxSpeed <= 0) return speed === 0 ? 0 : 1;
  return Math.min(Math.abs(speed) / maxSpeed, 1);
}

const DIAL_STEP = 20;
const DIAL_X = 60;
const DIAL_Y = 50;
const DIAL_R = 40;

function dialPoint(share: number, r: number): string {
  const a = share * Math.PI;
  return `${(DIAL_X - r * Math.cos(a)).toFixed(2)} ${(DIAL_Y - r * Math.sin(a)).toFixed(2)}`;
}

function dialScale(top: number): string {
  const ticks: string[] = [];
  for (let v = 0; v <= top; v += DIAL_STEP / 2) {
    const share = v / top;
    const major = v % DIAL_STEP === 0;
    ticks.push(`<path class="${major ? "dial-major" : "dial-minor"}" d="M${dialPoint(share, DIAL_R)}L${dialPoint(share, DIAL_R - (major ? 6 : 3))}"/>`);
  }
  return ticks.join("");
}

const COMPASS = { rim: 31, face: 27, tick: 25, letters: 17, needle: 14 };
const COMPASS_POINTS = [
  { key: "map.north", rad: -Math.PI / 2, north: true },
  { key: "map.east", rad: 0, north: false },
  { key: "map.south", rad: Math.PI / 2, north: false },
  { key: "map.west", rad: Math.PI, north: false },
] as const;
const CARD_TURN = -Math.PI / 2 - Math.atan2(VIEW.screenUp.y, VIEW.screenUp.x);

export function compassAngle(mapRad: number): number {
  return mapRad + CARD_TURN;
}

function polar(rad: number, r: number): string {
  return `${(Math.cos(rad) * r).toFixed(2)} ${(Math.sin(rad) * r).toFixed(2)}`;
}

function compassTicks(): string {
  const ticks: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = compassAngle((k * Math.PI) / 4);
    ticks.push(`M${polar(a, k % 2 === 0 ? COMPASS.tick - 3 : COMPASS.tick - 1.5)}L${polar(a, COMPASS.tick)}`);
  }
  return `<path class="compass-tick" d="${ticks.join("")}"/>`;
}

const COMPASS_TICKS = compassTicks();

function compassLetters(): string {
  return COMPASS_POINTS.map((p) => {
    const [x, y] = polar(compassAngle(p.rad), COMPASS.letters).split(" ");
    return `<text class="${p.north ? "compass-north" : "compass-letter"}" x="${x}" y="${y}">${say(t(p.key))}</text>`;
  }).join("");
}

export function compassSvg(heading: number): string {
  const a = compassAngle(heading);
  const side = a + Math.PI / 2;
  const needle = `<path class="compass-needle" d="M${polar(a, COMPASS.needle)}L${polar(side, 2.2)}L${polar(a + Math.PI, 4)}L${polar(side + Math.PI, 2.2)}z"/>`;
  return `<svg viewBox="-32 -32 64 64"><circle class="compass-rim" r="${COMPASS.rim}"/><circle class="compass-face" r="${COMPASS.face}"/>${COMPASS_TICKS}${compassLetters()}${needle}<circle class="compass-pin" r="2"/></svg>`;
}

export function createCompassDial(heading: number): HTMLElement {
  const dial = el("span", { class: "compass-dial", "aria-hidden": "true" });
  dial.innerHTML = compassSvg(heading);
  return dial;
}

export function dialPaceTick(pace: number | null, top: number): string {
  if (pace === null) return "";
  const share = dialShare(pace, top);
  return `<path class="dial-pace" d="M${dialPoint(share, DIAL_R + 1)}L${dialPoint(share, DIAL_R - 10)}"/>`;
}

export function createSpeedDial(speed: number, maxSpeed: number, top: number, pace: number | null = null): HTMLElement {
  const dial = el("span", { class: "speed-dial", "aria-hidden": "true" });
  dial.innerHTML = speedDialSvg(speed, maxSpeed, top, pace);
  return dial;
}

export function speedDialSvg(speed: number, maxSpeed: number, top: number, pace: number | null): string {
  const angle = dialShare(speed, top) * 180;
  const limit = dialShare(maxSpeed, top);
  const redline = limit < 1 ? `<path class="dial-redline" d="M${dialPoint(limit, DIAL_R - 1)}A${DIAL_R - 1} ${DIAL_R - 1} 0 0 1 ${dialPoint(1, DIAL_R - 1)}"/>` : "";
  const held = dialPaceTick(pace, top);
  const needle = `<path class="dial-needle" d="M${DIAL_X - DIAL_R + 3} ${DIAL_Y}L${DIAL_X} ${DIAL_Y - 1.4}L${DIAL_X + 7} ${DIAL_Y - 0.8}V${DIAL_Y + 0.8}L${DIAL_X} ${DIAL_Y + 1.4}z" transform="rotate(${angle} ${DIAL_X} ${DIAL_Y})"/>`;
  return `<svg viewBox="0 0 120 72"><rect class="dial-rim" x="1" y="1" width="118" height="70" rx="9"/><rect class="dial-face" x="4" y="4" width="112" height="64" rx="6"/>${redline}${dialScale(top)}${held}${needle}<circle class="dial-pin" cx="${DIAL_X}" cy="${DIAL_Y}" r="4.5"/><circle class="dial-cap" cx="${DIAL_X}" cy="${DIAL_Y}" r="1.6"/></svg>`;
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
  if (!samePaint(paint, PAINT.standard) && canvasReadable()) void showPainted(portrait, paint);
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
  const g = bareGrid(chassisId);
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
  const chassisId = playerVehicle(world).chassisId;
  const cells = cargoCellsGained(chassisId, part.defId);
  const extraRows = cargoRowsOn(chassisId, part.defId);
  const gained = { ...stat("cells", t("stat.cells"), cells, null, "more"), text: signed(cells, 0) };
  const rows = { ...stat("rows", t("stat.extraRows"), extraRows, null, "more"), text: signed(extraRows, 0), unit: t("stat.rowsUnit", { n: extraRows }) };
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
    stat("speed", t("stat.baseSpeed"), kph(chassisTopSpeed(chassisId)), "kph", "more"),
    stat("accel", t("stat.accel"), mps2(c.accel * accelFactor(chassisId)), "mps2", "more", 1),
    { ...turning, text: t("stat.span", { a: c.turnFast, b: c.turnSlow }) },
    stat("cells", t("stat.cells"), cellCount(bareGrid(chassisId)), null, "more"),
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
