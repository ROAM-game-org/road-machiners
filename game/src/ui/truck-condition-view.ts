import { partDef } from "../data/parts";
import { PX_PER_METER } from "../three/render/portraitPixels";
import { bodyOf } from "../sim/body";
import { baseGrid } from "../sim/grid";
import type { Vehicle } from "../sim/types";
import type { Portrait, TruckPortraits } from "../three/render/truckPortrait";
import { bindAttr, unbindAttr } from "../text/language";
import { t, verbatim } from "../text/msg";
import { workMeterEl } from "./cards";
import { el } from "./dom";
import { conditionLabel, TruckConditionReadout } from "./hud-readout";
import { token } from "./tokens";
import { registerTipSource } from "./touch-tip";
import "./truck-condition.css";

const CELL = 30;
const FLASH_MS = 300;
const FLASH_TURNS = 2;
const FLASH_HOLD = 0.65;

export type PartLook = "cab" | "icon";

export function partLook(defId: string): PartLook {
  const def = partDef(defId);
  if (def.kind !== "core") return "icon";
  return def.role === "cab" ? "cab" : "icon";
}

type ConditionPart = ReturnType<TruckConditionReadout["update"]>[number];
export type PartWork = { partId: string; done: number };
export type ConditionAim = { marks: ReadonlyMap<string, number[]>; pick: (partId: string) => void };

const urls = new WeakMap<HTMLCanvasElement, string>();

function urlOf(canvas: HTMLCanvasElement): string {
  const known = urls.get(canvas);
  if (known) return known;
  const url = canvas.toDataURL("image/png");
  urls.set(canvas, url);
  return url;
}

function layerImage(className: string, canvas: HTMLCanvasElement, tier: string): HTMLElement {
  const img = el("img", { class: className, "data-tier": tier, "aria-hidden": "true" });
  (img as HTMLImageElement).src = urlOf(canvas);
  return img;
}

function hatchLayer(canvas: HTMLCanvasElement): HTMLElement {
  const layer = el("div", { class: "cond-hatch" });
  layer.style.setProperty("-webkit-mask-image", `url("${urlOf(canvas)}")`);
  layer.style.setProperty("mask-image", `url("${urlOf(canvas)}")`);
  return layer;
}

function keepsOwnColor(part: ConditionPart): boolean {
  const def = partDef(part.defId);
  return def.kind !== "armor" && !(def.kind === "core" && def.role === "wheel");
}

function glowLayers(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  const glowing = parts.filter((part) => part.tier !== "ok" || !keepsOwnColor(part));
  return glowing.map((part) => layerImage("cond-glow", portrait.glow(part.id, part.tier), part.tier));
}

function haloLayers(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  const lit = parts.filter((part) => part.tier === "crit" || part.tier === "broken");
  return lit.map((part) => layerImage("cond-halo", portrait.glow(part.id, part.tier), part.tier));
}

function hatchLayers(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  return parts.filter((part) => part.tier === "broken").map((part) => hatchLayer(portrait.glow(part.id, part.tier)));
}

function layersFor(portrait: Portrait, parts: ConditionPart[]): HTMLElement[] {
  return [
    layerImage("cond-body", portrait.body, "ok"),
    ...haloLayers(portrait, parts),
    layerImage("cond-parts", portrait.parts, "ok"),
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
  private layered: Portrait | null = null;
  private layerKey = "";
  private parts: ConditionPart[] = [];
  private aim: ConditionAim | undefined;
  private scale = 1;
  private hoverId: string | null = null;
  private pointerType = "mouse";
  private pressedId: string | null = null;

  constructor(private readonly portraits: TruckPortraits) {
    this.stage.append(this.layers, this.outline, this.marks, this.flashes, this.hit, this.tip);
    this.root.append(this.stage);
    this.hit.addEventListener("pointerdown", (e) => this.pressed(e));
    this.hit.addEventListener("pointermove", (e) => this.moved(e));
    this.hit.addEventListener("pointerleave", (e) => this.left(e));
    this.hit.addEventListener("click", (e) => this.clicked(e));
    registerTipSource(this.hit, () => el("div", { class: "tooltip-row" }, ...this.tipRowsOfPress()));
    this.tip.style.display = "none";
  }

  private naturalSize(): { width: number; height: number } {
    if (!this.portrait) throw new Error("The condition view has no truck drawn yet");
    const pad = pxToken("--cond-pad");
    return { width: this.portrait.width * this.scale + 2 * pad, height: this.portrait.height * this.scale + 2 * pad };
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

  render(vehicle: Vehicle, aim?: ConditionAim, working?: PartWork | null): void {
    const portrait = this.portraits.portraitOf(vehicle);
    this.portrait = portrait;
    this.aim = aim;
    this.parts = this.readout.update(vehicle);
    this.scale = CELL / (PX_PER_METER * ((2 * bodyOf(vehicle.chassisId).half.x) / baseGrid(vehicle.chassisId).h));
    this.stage.style.width = `${portrait.width * this.scale}px`;
    this.stage.style.height = `${portrait.height * this.scale}px`;
    this.root.classList.toggle("aimable", aim !== undefined);
    this.paintLayers(portrait);
    this.paintMarks(portrait, aim, working);
    for (const part of this.parts.filter((p) => p.hit)) this.flash(portrait, part);
    this.focus(this.parts.some((p) => p.id === this.hoverId) ? this.hoverId : null);
  }

  private paintLayers(portrait: Portrait): void {
    const key = this.parts.map((part) => `${part.id}:${part.tier}`).join(",");
    if (this.layered === portrait && this.layerKey === key) return;
    this.layered = portrait;
    this.layerKey = key;
    this.layers.replaceChildren(...layersFor(portrait, this.parts));
  }

  private paintMarks(portrait: Portrait, aim: ConditionAim | undefined, working: PartWork | null | undefined): void {
    const nodes: HTMLElement[] = [];
    for (const part of this.parts) {
      const mark = markFor(aim?.marks.get(part.id), doneOf(working, part.id));
      if (!mark) continue;
      placeAt(mark, portrait.centerOf(part.id), this.scale);
      nodes.push(mark);
    }
    this.marks.replaceChildren(...nodes);
  }

  private flash(portrait: Portrait, part: ConditionPart): void {
    const flash = el("div", { class: "cond-flash" });
    flash.style.setProperty("-webkit-mask-image", `url("${urlOf(portrait.glow(part.id, part.tier))}")`);
    flash.style.setProperty("mask-image", `url("${urlOf(portrait.glow(part.id, part.tier))}")`);
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
    return this.parts.find((p) => p.id === this.hoverId);
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
    if (!part || !this.portrait || !this.aim) return this.outline.replaceChildren();
    this.outline.replaceChildren(layerImage("cond-pick", this.portrait.glow(part.id, part.tier), part.tier));
  }
}
