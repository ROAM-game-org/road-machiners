import { artSet, pieceArt, pieceImage, type BakedMeta } from "./baked";
import { BAKED } from "./baked";
import { bindAttr, say, textNode, unbindAttr, type TextAttr } from "../../text/language";
import { concat, LINE_BREAK, type Msg, verbatim } from "../../text/msg";
import { createIcon } from "../cards";
import { el, spokenReason, type Child } from "../dom";
import { keyTip } from "../input-mode";
import { token } from "../tokens";

export function setText(slot: Element, msg: Msg): void {
  if (slot.textContent === say(msg) && slot.firstChild !== null) return;
  slot.replaceChildren(textNode(msg));
}

export function setLcd(node: HTMLElement, text: string, cells: number): void {
  setText(node, verbatim(text));
  setData(node, "ghost", "8".repeat(Math.max(cells, text.length)));
  setVar(node, "--lcd-cells", Math.max(cells, text.length));
}

export function setAttrText(node: Element, name: TextAttr, msg: Msg | null): void {
  if (msg === null) unbindAttr(node, name);
  else bindAttr(node, name, msg);
}

export function setVar(node: HTMLElement, name: `--${string}`, value: number): void {
  const next = String(value);
  if (node.style.getPropertyValue(name) !== next) node.style.setProperty(name, next);
}

export function setFlag(node: Element, name: string, on: boolean): void {
  node.classList.toggle(name, on);
}

export function setData(node: HTMLElement, name: string, value: string): void {
  if (node.dataset[name] !== value) node.dataset[name] = value;
}

export function setOff(node: HTMLElement, reason: Msg | null): void {
  if (reason === null) node.removeAttribute("aria-disabled");
  else node.setAttribute("aria-disabled", "true");
  setAttrText(node, "data-reason", spokenReason(reason));
}

export type Lamp = "off" | "amber" | "green" | "red";

export interface ControlView {
  title: Msg;
  reason: Msg | null;
  key?: string;
}

export function showControl(button: HTMLElement, view: ControlView): void {
  const spoken = spokenReason(view.reason);
  const said = spoken ? concat([view.title, LINE_BREAK, spoken]) : view.title;
  const tip = view.key ? keyTip(said, view.key) : said;
  setAttrText(button, "title", tip);
  setOff(button, view.reason);
  if (spoken) setAttrText(button, "data-reason", tip);
}

export function isOff(node: Element): boolean {
  return node.getAttribute("aria-disabled") === "true";
}

export function pressIfOn(button: HTMLElement, action: () => void): () => void {
  return () => {
    if (!isOff(button)) action();
  };
}

export function pressButton(className: string, label: Msg | null, action: () => void): HTMLButtonElement {
  const button = el("button", { type: "button", class: className }, label) as HTMLButtonElement;
  button.addEventListener("click", pressIfOn(button, action));
  return button;
}

export function clampShare(share: number): number {
  if (Number.isNaN(share)) throw new Error("A gauge needs a share between 0 and 1, got NaN");
  return Math.min(1, Math.max(0, share));
}

export interface PlateKeyView {
  title: Msg;
  reason: Msg | null;
  key?: string;
}

export function plateKey(className: string, label: Msg, action: () => void, ...content: HTMLElement[]): HTMLButtonElement {
  const button = el("button", { type: "button", class: `plate-key ${className}`, "aria-label": label }, ...content) as HTMLButtonElement;
  button.addEventListener("click", pressIfOn(button, action));
  return button;
}

export function keyCap(className: string, label: Msg, action: () => void, face: HTMLElement): HTMLButtonElement {
  return plateKey(`key-cap ${className}`, label, action, el("span", { class: "key-face" }, face));
}

export function lamp(className: string): HTMLElement {
  const piece = kitPiece("lamp", `kit-lamp-piece ${className}`);
  piece.append(el("span", { class: "lamp-glow", "aria-hidden": "true" }));
  return piece;
}

export interface RockerView {
  checked: boolean;
  title: Msg;
  reason: Msg | null;
  locked: boolean;
}

export function rockerButton(label: Msg, painted = true): HTMLButtonElement {
  return el("button", { type: "button", class: painted ? "plate-key rocker" : "plate-key baked-key", role: "switch", "aria-label": label }, ...(painted ? [rockerFace()] : [])) as HTMLButtonElement;
}

export function rockerFace(): HTMLElement {
  return el("span", { class: "rocker-face", "aria-hidden": "true" }, kitPiece("rockerOff", "rocker-off"), kitPiece("rockerOn", "rocker-on"));
}

export class Rocker {
  readonly root: HTMLButtonElement;
  readonly label: HTMLElement;

  constructor(text: Msg, private readonly key: string | undefined, onFlip: () => void, painted = true) {
    this.label = el("span", { class: "plate-label" }, text);
    this.root = rockerButton(text, painted);
    this.root.addEventListener("click", pressIfOn(this.root, onFlip));
  }

  update(view: RockerView): void {
    this.root.setAttribute("aria-checked", String(view.checked));
    setFlag(this.root, "on", view.checked);
    setFlag(this.root, "locked", view.locked);
    showControl(this.root, { title: view.title, reason: view.reason, key: this.key });
  }
}

export type Box = readonly [number, number, number, number];
export type Point = readonly [number, number];

export interface PlateSpec<K extends string> {
  art: string;
  width: number;
  height: number;
  boxes: Record<K, Box>;
}

export const DRIVE_PLATE = {
  art: "drive",
  width: 1633,
  height: 713,
  boxes: {
    face: [36, 138, 782, 681],
    coolKey: [1338, 200, 1538, 385],
    rockerA: [857, 509, 950, 632],
    rockerB: [1087, 509, 1179, 632],
    rockerC: [1317, 509, 1410, 632],
    labelA: [813, 413, 994, 473],
    labelB: [1043, 413, 1223, 473],
    labelC: [1273, 413, 1454, 473],
    dialHub: [407, 513, 407, 513],
    dialGlass: [69, 175, 745, 851],
  },
} as const satisfies PlateSpec<string>;

export const WEAPONS_PLATE = { width: 1969, height: 734 } as const;

const PIECES = { tape: "tape", lamp: "lamp", rockerOff: "rocker-off", rockerOn: "rocker-on" } as const;


function pct(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(3)}%`;
}

export function boxStyle(box: Box, width: number, height: number): string {
  const [x0, y0, x1, y1] = box;
  return `left:${pct(x0, width)};top:${pct(y0, height)};width:${pct(x1 - x0, width)};height:${pct(y1 - y0, height)}`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svgNode(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

const AMBER_TINT = "hud-amber-tint";

export function amberTint(): void {
  if (document.getElementById(AMBER_TINT)) return;
  const filter = svgNode("filter", { id: AMBER_TINT, "color-interpolation-filters": "sRGB" });
  filter.append(svgNode("feFlood", { class: "hud-tint-flood" }), svgNode("feComposite", { in2: "SourceAlpha", operator: "in" }));
  const holder = svgNode("svg", { class: "hud-filters", width: 0, height: 0, "aria-hidden": "true" });
  holder.append(filter);
  document.body.append(holder);
}

export function tray(className: string, ...items: HTMLElement[]): HTMLElement {
  return el("div", { class: `hud-tray ${className}` }, ...items);
}

export type Tone = "dim" | "good" | "bad";

export interface PanelClose {
  label: Msg;
  onClose: () => void;
}

export function panelHead(title: Msg | null, close?: PanelClose): HTMLElement {
  return el("div", { class: "hud-panel-head" }, title === null ? null : el("h3", { class: "hud-panel-title" }, title), close ? closeKey(close) : null);
}

export function closeKey(close: PanelClose): HTMLElement {
  return el("button", { type: "button", class: "hud-close", "aria-label": close.label, onclick: close.onClose }, createIcon("close"));
}

export function screen(...lines: Child[]): HTMLElement {
  return el("div", { class: "hud-screen" }, ...lines);
}

export function screenLine(tone: Tone | null, ...parts: Child[]): HTMLElement {
  return el("div", { class: tone === null ? "screen-line" : `screen-line ${tone}` }, ...parts);
}

export function controls(...keys: (HTMLElement | null)[]): HTMLElement {
  const shown = keys.filter((key): key is HTMLElement => key !== null);
  return el("div", { class: "hud-controls", "data-count": shown.length }, ...shown);
}

export function textKey(label: Msg, attrs: Parameters<typeof el>[1], danger = false): HTMLElement {
  return el("button", { type: "button", ...attrs, class: danger ? "hud-key danger" : "hud-key" }, el("span", { class: "key-label" }, label));
}

export function kitPiece(name: keyof typeof PIECES, className: string): HTMLElement {
  return el("span", { class: `kit-piece kit-${name} ${className}` }, pieceImage(PIECES[name], "plate-art"));
}

export function paintSkin(root: HTMLElement = document.documentElement): void {
  const art = { "--hud-keycap-art": "keycap-up", "--hud-keycap-down-art": "keycap-down", "--hud-keycap-lit-art": "keycapLit-up", "--hud-keycap-red-art": "keycapRed-up", "--hud-keycap-red-down-art": "keycapRed-down", "--hud-frame-art": "frame", "--hud-screen-art": "screen", "--hud-tape-art": "tape", "--hud-note-art": "note", "--hud-input-art": "input" };
  for (const [name, file] of Object.entries(art)) root.style.setProperty(name, pieceArt(file));
  frameVars(root, "--hud-truck-frame", { meta: BAKED.truck.desktop, part: "truck", inset: TRUCK_FRAME_INSET, cssWidth: TRUCK_CARD_CSS_W });
}

const TRUCK_FRAME_INSET = 12;

interface FrameArt {
  meta: BakedMeta;
  part: string;
  inset: number;
  cssWidth: number;
}

function frameVars(root: HTMLElement, prefix: string, { meta, part, inset, cssWidth }: FrameArt): void {
  const [[x0, y0], [x1], [, y1]] = meta.face;
  const k = (x1 - x0) / cssWidth;
  const sides = [y0, meta.width - x1, meta.height - y1, x0];
  const spans = [meta.height, meta.width, meta.height, meta.width];
  root.style.setProperty(`${prefix}-art`, artSet(meta.scales, (s) => `hud/baked/${part}/desktop/housing@${s}x.webp`));
  root.style.setProperty(`${prefix}-slice`, sides.map((m, i) => `${(((m + inset) / spans[i]) * 100).toFixed(2)}%`).join(" "));
  root.style.setProperty(`${prefix}-width`, sides.map((m) => `${((m + inset) / k).toFixed(2)}px`).join(" "));
  root.style.setProperty(`${prefix}-outset`, sides.map((m) => `${(m / k).toFixed(2)}px`).join(" "));
}

const TRUCK_CARD_CSS_W = 144.5;

export function deviceCast(): SVGSVGElement {
  const svg = svgNode("svg", { class: "device-cast", "aria-hidden": "true" }) as SVGSVGElement;
  svg.append(svgNode("polygon", {}));
  return svg;
}

export function placeDeviceCasts(): void {
  for (const plate of document.querySelectorAll<HTMLElement>("#ui :is(.hud-weapons, .hud-radio) > .baked-part")) drawCast(plate);
}

function drawCast(plate: HTMLElement): void {
  if (plate.getClientRects().length === 0) return;
  const root = plate.parentElement!;
  const cast = parseFloat(token("--hud-cast-reach"));
  const floor = parseFloat(token("--hud-top-depth")) - parseFloat(token("--hud-rail-show"));
  const contact = parseFloat(token("--hud-contact-shade"));
  const left = plate.offsetLeft;
  const right = left + plate.offsetWidth;
  const base = plate.offsetTop + plate.offsetHeight;
  const castLayer = root.querySelector<SVGSVGElement>(":scope > .device-cast")!;
  castLayer.setAttribute("viewBox", `0 0 ${root.offsetWidth} ${root.offsetHeight}`);
  const points = [[left, base + contact], [right, base + contact], [right + cast, base - floor], [left + cast, base - floor]];
  castLayer.querySelector("polygon")!.setAttribute("points", points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "));
}
