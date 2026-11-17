import { publicUrl } from "../../public-url";
import { bindAttr, say, textNode, unbindAttr, type TextAttr } from "../../text/language";
import { concat, LINE_BREAK, type Msg, verbatim } from "../../text/msg";
import { createIcon } from "../cards";
import { el, type Child } from "../dom";
import { keyTip } from "../input-mode";

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
  setAttrText(node, "data-reason", reason);
}

export type Lamp = "off" | "amber" | "green" | "red";

export interface ControlView {
  title: Msg;
  reason: Msg | null;
  key?: string;
}

export function showControl(button: HTMLElement, view: ControlView): void {
  const said = view.reason ? concat([view.title, LINE_BREAK, view.reason]) : view.title;
  const tip = view.key ? keyTip(said, view.key) : said;
  setAttrText(button, "title", tip);
  setOff(button, view.reason);
  if (view.reason) setAttrText(button, "data-reason", tip);
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

export function rockerButton(label: Msg): HTMLButtonElement {
  return el("button", { type: "button", class: "plate-key rocker", role: "switch", "aria-label": label }, rockerFace()) as HTMLButtonElement;
}

export function rockerFace(): HTMLElement {
  return el("span", { class: "rocker-face", "aria-hidden": "true" }, kitPiece("rockerOff", "rocker-off"), kitPiece("rockerOn", "rocker-on"));
}

export class Rocker {
  readonly root: HTMLButtonElement;
  readonly label: HTMLElement;

  constructor(text: Msg, private readonly key: string | undefined, onFlip: () => void) {
    this.label = el("span", { class: "plate-label" }, text);
    this.root = rockerButton(text);
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
    fuel: [762, 184, 1038, 380],
    heat: [1058, 183, 1331, 380],
    coolKey: [1338, 200, 1538, 385],
    rockerA: [857, 509, 950, 632],
    rockerB: [1087, 509, 1179, 632],
    rockerC: [1317, 509, 1410, 632],
    labelA: [813, 413, 994, 473],
    labelB: [1043, 413, 1223, 473],
    labelC: [1273, 413, 1454, 473],
    dialHub: [407, 513, 407, 513],
    fuelHub: [908, 349, 908, 349],
    heatHub: [1194, 349, 1194, 349],
    dialGlass: [69, 175, 745, 851],
  },
} as const satisfies PlateSpec<string>;

export const WEAPONS_PLATE = {
  art: "weapons",
  width: 1969,
  height: 734,
  boxes: {
    screen: [108, 68, 1606, 468],
    allKey: [1712, 92, 1900, 282],
    autoBox: [1645, 295, 1920, 450],
    autoLabel: [1676, 300, 1784, 440],
    autoLever: [1812, 318, 1888, 432],
    strip: [290, 528, 1720, 692],
  },
} as const satisfies PlateSpec<string>;

export const RADIO_PLATE = {
  art: "radio",
  width: 1279,
  height: 695,
  boxes: {
    talk: [20, 18, 1028, 205],
    log: [21, 222, 956, 521],
    wheel: [970, 221, 1030, 525],
    lcd: [122, 599, 571, 677],
    knob: [722, 601, 798, 677],
    knobMarks: [620, 575, 900, 703],
    play: [962, 593, 1104, 685],
  },
} as const satisfies PlateSpec<string>;

export const KIT = {
  tape: { art: "kit/tape", width: 167, height: 76, boxes: {} },
  lamp: { art: "kit/lamp", width: 64, height: 64, boxes: {} },
  knob: { art: "kit/knob", width: 148, height: 148, boxes: {} },
  keycap: { art: "kit/keycap", width: 328, height: 394, boxes: {} },
  keycapLit: { art: "kit/keycap-lit", width: 328, height: 394, boxes: {} },
  keycapRed: { art: "kit/keycap-red", width: 328, height: 394, boxes: {} },
  rockerOff: { art: "kit/rocker-off", width: 387, height: 698, boxes: {} },
  rockerOn: { art: "kit/rocker-on", width: 387, height: 698, boxes: {} },
  wheel: { art: "kit/wheel", width: 247, height: 240, boxes: {} },
  glass: { art: "kit/glass", width: 512, height: 512, boxes: {} },
  grime: { art: "kit/grime", width: 512, height: 512, boxes: {} },
  dust: { art: "kit/dust", width: 1024, height: 1024, boxes: {} },
  olive: { art: "kit/olive", width: 400, height: 400, boxes: {} },
  playkey: { art: "kit/playkey", width: 246, height: 160, boxes: {} },
  rim: { art: "kit/rim", width: 90, height: 90, boxes: {} },
  well: { art: "kit/well", width: 90, height: 90, boxes: {} },
  driveHood: { art: "drive-hood", width: 1633, height: 713, boxes: {} },
  driveBack: { art: "drive-back", width: 1633, height: 713, boxes: {} },
  visor: { art: "visor", width: 420, height: 88, boxes: {} },
} as const satisfies Record<string, PlateSpec<never>>;


function pct(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(3)}%`;
}

export function boxStyle(box: Box, width: number, height: number): string {
  const [x0, y0, x1, y1] = box;
  return `left:${pct(x0, width)};top:${pct(y0, height)};width:${pct(x1 - x0, width)};height:${pct(y1 - y0, height)}`;
}

function patinaLayers(art: string): HTMLElement[] {
  const masks = `--plate-metal:url("${publicUrl(`hud/${art}-patina.webp`)}");--plate-art:url("${publicUrl(`hud/${art}.webp`)}")`;
  return [el("span", { class: "plate-patina", "aria-hidden": "true", style: masks }), el("span", { class: "plate-glaze", "aria-hidden": "true", style: masks })];
}

export function artLayers(art: string): HTMLElement[] {
  return [
    el("img", { class: "plate-art", src: publicUrl(`hud/${art}.webp`), draggable: "false", role: "presentation" }),
    el("span", { class: "plate-tint", "aria-hidden": "true", style: `--plate-mask:url("${publicUrl(`hud/${art}-housing.webp`)}")` }),
  ];
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

export class Plate<K extends string> {
  readonly root: HTMLElement;

  constructor(readonly spec: PlateSpec<K>, className: string) {
    this.root = el("div", { class: `hud-plate ${className}`, style: `aspect-ratio:${spec.width} / ${spec.height}` }, ...artLayers(spec.art), ...patinaLayers(spec.art));
  }

  place<T extends Element>(node: T, box: K | Box): T {
    const area = typeof box === "string" ? this.spec.boxes[box] : box;
    node.classList.add("plate-part");
    node.setAttribute("style", `${node.getAttribute("style") ?? ""};${boxStyle(area, this.spec.width, this.spec.height)}`);
    this.root.append(node);
    return node;
  }

  pin<T extends Element>(node: T, at: K | Box | Point): T {
    const area = typeof at === "string" ? this.spec.boxes[at] : at;
    const [x, y] = area.length === 2 ? area : [(area[0] + area[2]) / 2, (area[1] + area[3]) / 2];
    node.classList.add("plate-pin");
    node.setAttribute("style", `${node.getAttribute("style") ?? ""};left:${pct(x, this.spec.width)};top:${pct(y, this.spec.height)}`);
    this.root.append(node);
    return node;
  }

  drawing(className: string): SVGSVGElement {
    const svg = svgNode("svg", { class: `plate-drawing ${className}`, viewBox: `0 0 ${this.spec.width} ${this.spec.height}`, "aria-hidden": "true" }) as SVGSVGElement;
    this.root.append(svg);
    return svg;
  }
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

export function kitPiece(name: keyof typeof KIT, className: string): HTMLElement {
  return el("span", { class: `kit-piece kit-${name} ${className}`, style: `--kit-art:url("${publicUrl(`hud/${KIT[name].art}.webp`)}")` }, ...artLayers(KIT[name].art));
}

function loaded(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

export async function paintSkin(root: HTMLElement = document.documentElement): Promise<void> {
  root.style.setProperty("--hud-wheel-art", `url("${publicUrl(`hud/${KIT.wheel.art}.webp`)}")`);
  root.style.setProperty("--hud-keycap-art", `url("${publicUrl(`hud/${KIT.keycap.art}.webp`)}")`);
  root.style.setProperty("--hud-playkey-art", `url("${publicUrl(`hud/${KIT.playkey.art}.webp`)}")`);
  root.style.setProperty("--hud-keycap-lit-art", `url("${publicUrl(`hud/${KIT.keycapLit.art}.webp`)}")`);
  root.style.setProperty("--hud-keycap-red-art", `url("${publicUrl(`hud/${KIT.keycapRed.art}.webp`)}")`);
  root.style.setProperty("--hud-glass-art", `url("${publicUrl(`hud/${KIT.glass.art}.webp`)}")`);
  root.style.setProperty("--hud-grime-art", `url("${publicUrl(`hud/${KIT.grime.art}.webp`)}")`);
  root.style.setProperty("--hud-dust-art", `url("${publicUrl(`hud/${KIT.dust.art}.webp`)}")`);
  root.style.setProperty("--hud-drive-art", `url("${publicUrl(`hud/${DRIVE_PLATE.art}.webp`)}")`);
  root.style.setProperty("--hud-drive-hood-art", `url("${publicUrl(`hud/${KIT.driveHood.art}.webp`)}")`);
  root.style.setProperty("--hud-drive-back-art", `url("${publicUrl(`hud/${KIT.driveBack.art}.webp`)}")`);
  root.style.setProperty("--hud-visor-art", `url("${publicUrl(`hud/${KIT.visor.art}.webp`)}")`);
  const [olive, rim, well] = await Promise.all([KIT.olive, KIT.rim, KIT.well].map((piece) => tinted(piece.art, root)));
  root.style.setProperty("--hud-rim-art", `url("${rim}")`);
  root.style.setProperty("--hud-well-art", `url("${well}")`);
  root.style.setProperty("--hud-olive-art", `url("${olive}")`);
}

async function tinted(art: string, root: HTMLElement): Promise<string> {
  const [image, mask] = await Promise.all([loaded(publicUrl(`hud/${art}.webp`)), loaded(publicUrl(`hud/${art}-housing.webp`))]);
  const tint = document.createElement("canvas");
  tint.width = image.width;
  tint.height = image.height;
  const tintPen = tint.getContext("2d")!;
  tintPen.fillStyle = getComputedStyle(root).getPropertyValue("--hud-housing").trim();
  tintPen.fillRect(0, 0, tint.width, tint.height);
  tintPen.globalCompositeOperation = "destination-in";
  tintPen.drawImage(mask, 0, 0);
  const out = document.createElement("canvas");
  out.width = image.width;
  out.height = image.height;
  const pen = out.getContext("2d")!;
  pen.drawImage(image, 0, 0);
  pen.globalCompositeOperation = "multiply";
  pen.drawImage(tint, 0, 0);
  pen.globalCompositeOperation = "destination-in";
  pen.drawImage(image, 0, 0);
  return out.toDataURL("image/png");
}
