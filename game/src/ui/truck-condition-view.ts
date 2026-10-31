import type { TruckPaint } from "../data/chassis";
import { isShield, partDef } from "../data/parts";
import { PX_PER_METER } from "../three/render/portraitPixels";
import { spanOf } from "../sim/body";
import type { Vehicle } from "../sim/types";
import { chassisSize, type Glow, type Portrait, type TruckPortraits } from "../three/render/truckPortrait";
import { bindAttr, unbindAttr } from "../text/language";
import { t, verbatim } from "../text/msg";
import { workMeterEl } from "./cards";
import { el } from "./dom";
import { conditionLabel, TruckConditionReadout } from "./hud-readout";
import { token } from "./tokens";
import { registerTipSource } from "./touch-tip";
import "./truck-condition.css";

const CELL = 30;
const METERS_PER_CELL = 0.65;
const FLASH_MS = 300;
const FLASH_TURNS = 2;
const FLASH_HOLD = 0.65;

type ConditionPart = ReturnType<TruckConditionReadout["update"]>[number];
export type PartWork = { partId: string; done: number };
export type ConditionAim = { marks: ReadonlyMap<string, number[]>; pick: (partId: string) => void };

function encoded(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("A truck portrait layer could not be encoded")))));
}

function withUrl(portrait: Portrait, canvas: HTMLCanvasElement, use: (url: string) => void): void {
  const pending = portrait.masks.get(canvas) ?? encoded(canvas);
  portrait.masks.set(canvas, pending);
  void pending.then(use);
}

function wholeOf(portrait: Portrait, canvas: HTMLCanvasElement): Glow {
  return { canvas, x: 0, y: 0, width: portrait.width, height: portrait.height };
}

function placeGlow(node: HTMLElement, portrait: Portrait, glow: Glow): HTMLElement {
  node.style.left = `${(100 * glow.x) / portrait.width}%`;
  node.style.top = `${(100 * glow.y) / portrait.height}%`;
  node.style.width = `${(100 * glow.width) / portrait.width}%`;
  node.style.height = `${(100 * glow.height) / portrait.height}%`;
  return node;
}

function layerImage(className: string, portrait: Portrait, glow: Glow, tier: string): HTMLElement {
  const copy = el("canvas", { class: className, "data-tier": tier, "aria-hidden": "true" }) as HTMLCanvasElement;
  copy.width = glow.canvas.width;
  copy.height = glow.canvas.height;
  const ctx = copy.getContext("2d");
  if (!ctx) throw new Error("No 2d canvas context for a truck portrait layer");
  ctx.drawImage(glow.canvas, 0, 0);
  return placeGlow(copy, portrait, glow);
}

function maskedLayer(className: string, portrait: Portrait, glow: Glow): HTMLElement {
  const layer = el("div", { class: className });
  withUrl(portrait, glow.canvas, (url) => {
    layer.style.setProperty("-webkit-mask-image", `url("${url}")`);
    layer.style.setProperty("mask-image", `url("${url}")`);
  });
  return placeGlow(layer, portrait, glow);
}

export function edgedWhenHealthy(defId: string): boolean {
  const def = partDef(defId);
  return isShield(def) || def.kind === "weapon" || (def.kind === "core" && def.role === "wheel");
}

function glowLayers(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  const glowing = parts.filter((part) => part.tier !== "ok" || edgedWhenHealthy(part.defId));
  return glowing.map((part) => layerImage("cond-glow", portrait, portrait.glow(part.id, part.tier), part.tier));
}

function haloLayers(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  const lit = parts.filter((part) => part.tier !== "ok");
  return lit.map((part) => layerImage("cond-halo", portrait, portrait.glow(part.id, part.tier), part.tier));
}

function hatchLayers(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  return parts.filter((part) => part.tier === "broken").map((part) => maskedLayer("cond-hatch", portrait, portrait.glow(part.id, part.tier)));
}

function layersFor(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  return [
    layerImage("cond-body", portrait, wholeOf(portrait, portrait.body), "ok"),
    ...haloLayers(portrait, parts),
    layerImage("cond-parts", portrait, wholeOf(portrait, portrait.parts), "ok"),
    ...glowLayers(portrait, parts),
    ...hatchLayers(portrait, parts),
  ];
}

function tipRows(part: ConditionPart): HTMLElement[] {
  return [
    el("span", {}, part.name),
    el("span", { class: part.percent === 0 ? "num bad" : "num" }, part.percent === 0 ? t("cond.broken") : t("setting.percent", { n: part.percent })),
  ];
}

function doneOf(working: PartWork | null | undefined, partId: string): number | null {
  return working?.partId === partId ? working.done : null;
}

function markFor(guns: number[] | undefined, done: number | null): HTMLElement | null {
  if (!guns && done === null) return null;
  const mark = el("div", { class: "condition-mark" });
  if (guns) mark.append(el("span", { class: "condition-aim", title: t("condition.aimedBy", { guns: verbatim(guns.join(", ")) }) }, verbatim(guns.join(" "))));
  if (done !== null) mark.append(workMeterEl(done));
  return mark;
}

function pxToken(name: string): number {
  const value = token(name);
  const alias = value.match(/^var\((--[a-z0-9-]+)\)$/);
  const px = parseFloat(alias ? token(alias[1]!) : value);
  if (!Number.isFinite(px)) throw new Error(`tokens: ${name} is ${value}, not a length in px`);
  return px;
}

function placeAt(node: HTMLElement, center: { x: number; y: number }, scale: number): void {
  node.style.left = `${center.x * scale}px`;
  node.style.top = `${center.y * scale}px`;
}

export class TruckConditionView {
  readonly root = el("div", { class: "truck-condition", "aria-label": t("condition.panel") });
  private readonly stage = el("div", { class: "condition-stage" });
  private readonly layers = el("div", { class: "condition-layers" });
  private readonly outline = el("div", { class: "condition-hover" });
  private readonly marks = el("div", { class: "condition-marks" });
  private readonly flashes = el("div", { class: "condition-flashes" });
  private readonly hit = el("div", { class: "condition-hit" });
  private readonly tip = el("div", { class: "condition-tip tooltip" });
  private readonly readout = new TruckConditionReadout();
  private portrait: Portrait | null = null;
  private size: { width: number; height: number } | null = null;
  private last: { vehicle: Vehicle; playerPaint: TruckPaint; aim: ConditionAim | undefined; working: PartWork | null | undefined } | null = null;
  private layered: Portrait | null = null;
  private layerKey = "";
  private parts: ConditionPart[] = [];
  private aim: ConditionAim | undefined;
  private scale = 1;
  private hoverId: string | null = null;
  private pointerType = "mouse";
  private pressedId: string | null = null;

  constructor(private readonly portraits: TruckPortraits, private readonly maxLength: number | null) {
    this.stage.append(this.layers, this.outline, this.marks, this.flashes, this.hit, this.tip);
    this.root.append(this.stage);
    this.hit.addEventListener("pointerdown", (e) => this.pressed(e));
    this.hit.addEventListener("pointermove", (e) => this.moved(e));
    this.hit.addEventListener("pointerleave", (e) => this.left(e));
    this.hit.addEventListener("click", (e) => this.clicked(e));
    registerTipSource(this.hit, () => el("div", { class: "tooltip-row" }, ...this.tipRowsOfPress()));
    this.tip.style.display = "none";
    portraits.onReady((vehicleId) => {
      if (this.last?.vehicle.id === vehicleId) this.render(this.last.vehicle, this.last.playerPaint, this.last.aim, this.last.working);
    });
  }

  private naturalSize(): { width: number; height: number } {
    if (!this.size) throw new Error("The condition view has no truck drawn yet");
    const pad = pxToken("--cond-pad");
    return { width: this.size.width * this.scale + 2 * pad, height: this.size.height * this.scale + 2 * pad };
  }

  fitTo(box: HTMLElement): void {
    const outline = parseFloat(token("--space-4"));
    const natural = this.naturalSize();
    this.root.style.zoom = String(Math.min((box.clientHeight - outline) / natural.height, (box.clientWidth - outline) / natural.width));
  }

  boxFor(cell: number): { width: number; height: number } {
    const outline = parseFloat(token("--space-4"));
    const natural = this.naturalSize();
    const k = cell / CELL;
    return { width: natural.width * k + outline, height: natural.height * k + outline };
  }

  render(vehicle: Vehicle, playerPaint: TruckPaint, aim?: ConditionAim, working?: PartWork | null): void {
    const portrait = this.portraits.shown(vehicle, playerPaint);
    this.portrait = portrait;
    this.last = { vehicle, playerPaint, aim, working };
    this.aim = aim;
    this.parts = this.readout.update(vehicle);
    const drawn = portrait ? this.parts.filter((part) => portrait.has(part.id)) : [];
    const length = 2 * spanOf(vehicle.chassisId).half.x;
    this.scale = CELL / (PX_PER_METER * METERS_PER_CELL);
    if (this.maxLength !== null) this.root.style.zoom = String(Math.min(1, this.maxLength / length));
    this.size = portrait ?? chassisSize(vehicle.chassisId);
    this.stage.style.width = `${this.size.width * this.scale}px`;
    this.stage.style.height = `${this.size.height * this.scale}px`;
    this.root.classList.toggle("aimable", aim !== undefined);
    this.paintLayers(portrait, drawn);
    this.paintMarks(portrait, drawn, aim, working);
    if (portrait) for (const part of drawn.filter((p) => p.hit)) this.flash(portrait, part);
    this.focus(this.parts.some((p) => p.id === this.hoverId) ? this.hoverId : null);
  }

  private paintLayers(portrait: Portrait | null, drawn: ConditionPart[]): void {
    const key = drawn.map((part) => `${part.id}:${part.tier}`).join(",");
    if (this.layered === portrait && this.layerKey === key) return;
    this.layered = portrait;
    this.layerKey = key;
    this.layers.replaceChildren(...(portrait ? layersFor(portrait, drawn) : []));
  }

  private paintMarks(portrait: Portrait | null, drawn: ConditionPart[], aim: ConditionAim | undefined, working: PartWork | null | undefined): void {
    if (!portrait) return this.marks.replaceChildren();
    const nodes: HTMLElement[] = [];
    for (const part of drawn) {
      const mark = markFor(aim?.marks.get(part.id), doneOf(working, part.id));
      if (!mark) continue;
      placeAt(mark, portrait.centerOf(part.id), this.scale);
      nodes.push(mark);
    }
    this.marks.replaceChildren(...nodes);
  }

  private flash(portrait: Portrait, part: ConditionPart): void {
    const flash = maskedLayer("cond-flash", portrait, portrait.glow(part.id, part.tier));
    this.flashes.append(flash);
    const run = flash.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: FLASH_HOLD },
        { opacity: 0, offset: 1 },
      ],
      { duration: FLASH_MS, iterations: FLASH_TURNS },
    );
    run.onfinish = () => flash.remove();
  }

  private partUnder(e: MouseEvent): string | null {
    if (!this.portrait) return null;
    const rect = this.hit.getBoundingClientRect();
    return this.portrait.partAt(((e.clientX - rect.left) / rect.width) * this.portrait.width, ((e.clientY - rect.top) / rect.height) * this.portrait.height);
  }

  private pressed(e: PointerEvent): void {
    this.pointerType = e.pointerType;
    this.pressedId = this.partUnder(e);
    this.hit.toggleAttribute("data-hold", this.pressedId === null);
  }

  private moved(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this.focus(this.partUnder(e));
  }

  private left(e: PointerEvent): void {
    if (e.pointerType !== "touch") this.focus(null);
  }

  private clicked(e: MouseEvent): void {
    const id = this.partUnder(e);
    if (this.pointerType === "touch") return this.tapped(id);
    if (id && this.aim) this.aim.pick(id);
  }

  private tapped(id: string | null): void {
    if (id !== null && id === this.hoverId && this.aim) return this.aim.pick(id);
    this.focus(id);
  }

  private focus(id: string | null): void {
    this.hoverId = id;
    this.hit.dataset.over = id === null ? "" : "part";
    this.labelHit();
    this.showTip();
    this.showOutline();
  }

  private labelHit(): void {
    const part = this.hovered();
    if (part) bindAttr(this.hit, "aria-label", conditionLabel(part));
    else unbindAttr(this.hit, "aria-label");
  }

  private hovered(): ConditionPart | undefined {
    return this.parts.find((p) => p.id === this.hoverId && this.portrait?.has(p.id));
  }

  private tipRowsOfPress(): HTMLElement[] {
    const part = this.parts.find((p) => p.id === this.pressedId);
    return part ? tipRows(part) : [];
  }

  private showTip(): void {
    const part = this.hovered();
    this.tip.style.display = part && this.portrait ? "" : "none";
    if (!part || !this.portrait) return;
    const center = this.portrait.centerOf(part.id);
    this.tip.replaceChildren(...tipRows(part));
    this.tip.dataset.side = center.y < this.portrait.height / 2 ? "below" : "above";
    placeAt(this.tip, { x: this.tipX(center.x), y: center.y }, this.scale);
  }

  private tipX(x: number): number {
    if (!this.portrait) throw new Error("The condition view has no truck drawn yet");
    const half = this.tip.offsetWidth / 2 / this.scale;
    return Math.min(Math.max(x, half), Math.max(half, this.portrait.width - half));
  }

  private showOutline(): void {
    const part = this.hovered();
    if (!part || !this.portrait) return this.outline.replaceChildren();
    this.outline.replaceChildren(
      maskedLayer("cond-cells", this.portrait, this.portrait.footprint(part.id)),
      layerImage("cond-pick", this.portrait, this.portrait.glow(part.id, part.tier), part.tier),
    );
  }
}
