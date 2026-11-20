import { BUILD_FILES, publicUrl, type PublicFiles } from "../../public-url";
import { el } from "../dom";
import { token } from "../tokens";
import { uiSize } from "../ui-size";
import { boxStyle, svgNode, type Box, type PlateSpec, type Point as PlatePoint } from "./skin";
import statsDesktop from "./baked/stats.desktop.json";
import statsFlat from "./baked/stats.flat.json";
import keysDesktop from "./baked/keys.desktop.json";
import keysFlat from "./baked/keys.flat.json";
import driveDesktop from "./baked/drive.desktop.json";
import driveFlat from "./baked/drive.flat.json";
import weaponsDesktop from "./baked/weapons.desktop.json";
import weaponsFlat from "./baked/weapons.flat.json";
import radioDesktop from "./baked/radio.desktop.json";
import radioFlat from "./baked/radio.flat.json";
import truckDesktop from "./baked/truck.desktop.json";
import truckFlat from "./baked/truck.flat.json";
import railDesktop from "./baked/rail.desktop.json";
import railFlat from "./baked/rail.flat.json";
import tipDesktop from "./baked/tip.desktop.json";
import tipFlat from "./baked/tip.flat.json";
import menuDesktop from "./baked/menu.desktop.json";
import menuFlat from "./baked/menu.flat.json";
import journalDesktop from "./baked/journal.desktop.json";
import journalFlat from "./baked/journal.flat.json";
import dialogDesktop from "./baked/dialog.desktop.json";
import dialogFlat from "./baked/dialog.flat.json";
import piecesDesktop from "./baked/pieces.desktop.json";
import piecesFlat from "./baked/pieces.flat.json";

export type Point = readonly [number, number];
export type Quad = readonly [Point, Point, Point, Point];

function pivot(rows: number[][], col: number): void {
  let best = col;
  for (let r = col + 1; r < rows.length; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[best][col])) best = r;
  [rows[col], rows[best]] = [rows[best], rows[col]];
}

function eliminate(rows: number[][], col: number): void {
  const n = rows.length;
  for (let r = 0; r < n; r++) {
    if (r === col) continue;
    const f = rows[r][col] / rows[col][col];
    for (let k = col; k <= n; k++) rows[r][k] -= f * rows[col][k];
  }
}

function solve(a: number[][], b: number[]): number[] {
  const rows = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < b.length; col++) {
    pivot(rows, col);
    eliminate(rows, col);
  }
  return rows.map((row, i) => row[b.length] / row[i]);
}

export function homography(width: number, height: number, quad: Quad): number[] {
  const corners: Quad = [[0, 0], [width, 0], [width, height], [0, height]];
  const a: number[][] = [];
  const b: number[] = [];
  corners.forEach(([x, y], i) => {
    const [tx, ty] = quad[i];
    a.push([x, y, 1, 0, 0, 0, -x * tx, -y * tx], [0, 0, 0, x, y, 1, -x * ty, -y * ty]);
    b.push(tx, ty);
  });
  return solve(a, b);
}

export function warpTransform(width: number, height: number, quad: Quad): string {
  const m = homography(width, height, quad);
  return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`;
}

export function mapPoint(m: number[], x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + 1;
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}


export type BakeView = "desktop" | "flat";
export type CropBox = readonly [number, number, number, number];

export interface BakedZone {
  quad: Quad;
  size: Point;
}

export interface BakedSprite {
  crop: CropBox;
  frames: readonly string[];
}

export interface BakedMeta {
  width: number;
  height: number;
  face: Quad;
  zones: Record<string, BakedZone>;
  sprites: Record<string, BakedSprite>;
  scales: readonly number[];
  source: string;
}

export type BakedViews = Record<BakeView, BakedMeta>;

export function bakeView(layer: { width: number; height: number }, desktopAspect: number): BakeView {
  return layer.width / layer.height >= desktopAspect ? "desktop" : "flat";
}

function pictureSet(part: string, view: BakeView, meta: BakedMeta, file: string, width: number): string {
  return meta.scales.map((s) => `${publicUrl(`hud/baked/${part}/${view}/${file}@${s}x.webp`)} ${Math.round(width * s)}w`).join(", ");
}

interface Placed {
  node: HTMLElement;
  zone: string;
}

export class SpriteFrames {
  readonly root: HTMLElement;
  private readonly pictures: Map<string, HTMLImageElement>;
  private current: string;

  constructor(readonly name: string, frames: readonly string[], first: string) {
    this.pictures = new Map(frames.map((f) => [f, el("img", { class: "baked-frame", draggable: "false", role: "presentation", "data-frame": f }) as HTMLImageElement]));
    this.root = el("span", { class: `baked-sprite baked-${name}`, "aria-hidden": "true" }, ...this.pictures.values());
    this.current = first;
    this.show(first);
  }

  show(frame: string): void {
    if (!this.pictures.has(frame)) throw new Error(`sprite ${this.name} has no frame ${frame}`);
    this.current = frame;
    for (const [f, img] of this.pictures) img.hidden = f !== frame;
  }

  hide(): void {
    for (const img of this.pictures.values()) img.hidden = true;
  }

  count(): number {
    return this.pictures.size;
  }

  shown(): string {
    return this.current;
  }

  pictureList(): [string, HTMLImageElement][] {
    return [...this.pictures];
  }
}

export class BakedPart<K extends string = never> {
  readonly root: HTMLElement;
  private readonly housing = el("img", { class: "baked-housing", draggable: "false", role: "presentation" }) as HTMLImageElement;
  private readonly placed: Placed[] = [];
  private readonly sprites = new Map<string, SpriteFrames>();
  private view: BakeView = "desktop";

  constructor(readonly part: string, private readonly views: BakedViews, className: string, readonly spec: Omit<PlateSpec<K>, "art">) {
    this.root = el("div", { class: `hud-plate baked-part ${className}`, style: `aspect-ratio:${spec.width} / ${spec.height}` }, this.housing);
    new ResizeObserver(() => this.layout()).observe(this.root);
    window.addEventListener("resize", () => this.layout());
  }

  zone<T extends HTMLElement>(node: T, zone: string): T {
    this.zoneOf(zone);
    node.classList.add("plate-part", "baked-zone");
    this.placed.push({ node, zone });
    this.root.append(node);
    this.layout();
    return node;
  }

  unzone(node: HTMLElement): void {
    const at = this.placed.findIndex((p) => p.node === node);
    if (at >= 0) this.placed.splice(at, 1);
    node.remove();
    this.layout();
  }

  place<T extends Element>(node: T, box: K | Box): T {
    const area = typeof box === "string" ? this.spec.boxes[box] : box;
    node.classList.add("plate-part");
    node.setAttribute("style", `${node.getAttribute("style") ?? ""};${boxStyle(area, this.spec.width, this.spec.height)}`);
    this.root.append(node);
    return node;
  }

  pin<T extends Element>(node: T, at: K | Box | PlatePoint): T {
    const area = typeof at === "string" ? this.spec.boxes[at] : at;
    const [x, y] = area.length === 2 ? area : [(area[0] + area[2]) / 2, (area[1] + area[3]) / 2];
    node.classList.add("plate-pin");
    node.setAttribute("style", `${node.getAttribute("style") ?? ""};left:${((x / this.spec.width) * 100).toFixed(3)}%;top:${((y / this.spec.height) * 100).toFixed(3)}%`);
    this.root.append(node);
    return node;
  }

  drawing(className: string): SVGSVGElement {
    const svg = svgNode("svg", { class: `plate-drawing ${className}`, viewBox: `0 0 ${this.spec.width} ${this.spec.height}`, "aria-hidden": "true" }) as SVGSVGElement;
    this.root.append(svg);
    return svg;
  }

  follow(node: HTMLElement, up: string, down: string): (pressed: boolean) => void {
    this.zone(node, up);
    this.zoneOf(down);
    const entry = this.placed[this.placed.length - 1];
    return (pressed) => {
      entry.zone = pressed ? down : up;
      this.layout();
    };
  }

  sprite(name: string, first: string): SpriteFrames {
    const sprite = this.views.desktop.sprites[name];
    if (!sprite || !this.views.flat.sprites[name]) throw new Error(`${this.part} has no sprite ${name}`);
    const frames = new SpriteFrames(name, sprite.frames, first);
    this.sprites.set(name, frames);
    this.housing.after(frames.root);
    return frames;
  }

  layout(): void {
    const width = this.root.offsetWidth;
    if (width === 0) return;
    this.view = bakeView(uiSize().layerSize(), Number(token("--hud-bake-desktop-aspect")));
    const meta = this.meta();
    const [fx, fy] = meta.face[0];
    const u = width / (meta.face[1][0] - fx);
    this.picture(this.housing, "housing", [0, 0, meta.width, meta.height], u);
    for (const frames of this.sprites.values()) this.placeSprite(frames, u);
    for (const p of this.placed) this.placeZone(p, u, fx, fy);
  }

  private meta(): BakedMeta {
    return this.views[this.view];
  }

  private zoneOf(name: string): BakedZone {
    const zone = this.views.desktop.zones[name];
    if (!zone || !this.views.flat.zones[name]) throw new Error(`${this.part} has no zone ${name}`);
    return zone;
  }

  private placeSprite(frames: SpriteFrames, u: number): void {
    const crop = this.meta().sprites[frames.name].crop;
    for (const [file, img] of frames.pictureList()) this.picture(img, file, crop, u);
  }

  private picture(img: HTMLImageElement, file: string, [x0, y0, x1, y1]: CropBox, u: number): void {
    const [fx, fy] = this.meta().face[0];
    const width = (x1 - x0) * u;
    img.sizes = `${Math.ceil(width)}px`;
    const set = pictureSet(this.part, this.view, this.meta(), file, x1 - x0);
    if (img.srcset !== set) img.srcset = set;
    Object.assign(img.style, { left: `${(x0 - fx) * u}px`, top: `${(y0 - fy) * u}px`, width: `${width}px`, height: `${(y1 - y0) * u}px` });
  }

  private placeZone({ node, zone }: Placed, u: number, fx: number, fy: number): void {
    const { quad, size } = this.meta().zones[zone];
    const [w, h] = [size[0] * u, size[1] * u];
    const target = quad.map(([x, y]) => [(x - fx) * u, (y - fy) * u] as const) as unknown as Quad;
    Object.assign(node.style, { left: "0px", top: "0px", width: `${w}px`, height: `${h}px`, transformOrigin: "0 0", transform: warpTransform(w, h, target) });
  }
}

function placeStrip(img: HTMLImageElement, part: string, views: BakedViews): void {
  const view = bakeView(uiSize().layerSize(), Number(token("--hud-bake-desktop-aspect")));
  const meta = views[view];
  const [[fx, fy], [rx], [, by]] = meta.face;
  const [fw, fh] = [rx - fx, by - fy];
  Object.assign(img.style, { left: `${(-fx / fw) * 100}%`, top: `${(-fy / fh) * 100}%`, width: `${(meta.width / fw) * 100}%`, height: `${(meta.height / fh) * 100}%` });
  img.sizes = `${Math.ceil(window.innerWidth * (meta.width / fw))}px`;
  const set = pictureSet(part, view, meta, "housing", meta.width);
  if (img.srcset !== set) img.srcset = set;
}

export function bakedStrip(part: string, views: BakedViews): HTMLImageElement {
  const img = el("img", { class: "baked-strip", draggable: "false", role: "presentation" }) as HTMLImageElement;
  placeStrip(img, part, views);
  window.addEventListener("resize", () => placeStrip(img, part, views));
  return img;
}

export function artSet(scales: readonly number[], file: (scale: number) => string, files: PublicFiles = BUILD_FILES): string {
  return `image-set(${scales.map((s) => `url("${new URL(publicUrl(file(s), files), document.baseURI).href}") ${s}x`).join(", ")})`;
}

export function pieceArt(file: string): string {
  return artSet(BAKED.pieces.desktop.scales, (s) => `hud/baked/pieces/desktop/${file}@${s}x.webp`);
}

export function pieceImage(file: string, className: string): HTMLImageElement {
  const meta = BAKED.pieces.desktop;
  const img = el("img", { class: `baked-piece ${className}`, draggable: "false", role: "presentation" }) as HTMLImageElement;
  img.srcset = meta.scales.map((s) => `${publicUrl(`hud/baked/pieces/desktop/${file}@${s}x.webp`)} ${s}x`).join(", ");
  return img;
}

const views = (desktop: unknown, flat: unknown): BakedViews => ({ desktop: desktop as BakedMeta, flat: flat as BakedMeta });

export const BAKED = {
  stats: views(statsDesktop, statsFlat),
  keys: views(keysDesktop, keysFlat),
  drive: views(driveDesktop, driveFlat),
  weapons: views(weaponsDesktop, weaponsFlat),
  radio: views(radioDesktop, radioFlat),
  truck: views(truckDesktop, truckFlat),
  rail: views(railDesktop, railFlat),
  tip: views(tipDesktop, tipFlat),
  menu: views(menuDesktop, menuFlat),
  journal: views(journalDesktop, journalFlat),
  dialog: views(dialogDesktop, dialogFlat),
  pieces: views(piecesDesktop, piecesFlat),
} as const satisfies Record<string, BakedViews>;
