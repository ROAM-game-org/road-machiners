import { t } from "../../text/msg";
import { el, moveTo } from "../dom";
import { radialSpot, type PadKey, type PadTarget, type Point, type RadialEntry } from "./pad-model";

export const PAD_POINTER_ID = 7331;
const DRAG_POINTER_ID = 7332;

const CONTROLS = [
  "button:not(:disabled)",
  "[role=button]",
  "[role=switch]",
  "[role=tab]",
  "[role=menuitem]",
  "a[href]",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
  ".inv-cell[data-cell]",
  ".inv-chip",
].join(", ");

const TAB_SELECTOR = "[role=tab], [data-tab]";
const CONTROL_TARGET_PX = 18;

function centreOf(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function reachable(node: Element, at: Point): boolean {
  const hit = document.elementFromPoint(at.x, at.y);
  return hit !== null && (hit === node || node.contains(hit) || hit.closest(".inv-grid") === node.closest(".inv-grid") && node.matches(".inv-cell"));
}

function shown(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

let nextKey = 0;
const keys = new WeakMap<Element, string>();

function keyOf(node: Element): string {
  let key = keys.get(node);
  if (key === undefined) {
    key = `control-${nextKey++}`;
    keys.set(node, key);
  }
  return key;
}

export function controlTargets(skip: (node: Element) => boolean): PadTarget[] {
  const found: PadTarget[] = [];
  for (const node of document.querySelectorAll(CONTROLS)) {
    if (skip(node)) continue;
    const rect = node.getBoundingClientRect();
    const at = centreOf(rect);
    if (!shown(rect) || !reachable(node, at)) continue;
    found.push({ key: keyOf(node), kind: "control", x: at.x, y: at.y, r: Math.max(CONTROL_TARGET_PX, Math.min(rect.width, rect.height) / 2) });
  }
  return found;
}

export function focusedTarget(targets: readonly PadTarget[]): PadTarget | null {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const key = keys.get(active);
  return targets.find((t) => t.key === key) ?? null;
}

function under(at: Point): Element {
  return document.elementFromPoint(at.x, at.y) ?? document.body;
}

function pointer(type: string, at: Point, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, isPrimary: true, ...init });
}

export function hoverAt(at: Point): void {
  under(at).dispatchEvent(pointer("pointermove", at, { pointerType: "mouse", pointerId: 1, buttons: 0 }));
}

export class PadPress {
  private target: Element | null = null;
  private at: Point = { x: 0, y: 0 };

  down(at: Point): void {
    this.at = at;
    this.target = under(at);
    this.target.dispatchEvent(pointer("pointerdown", at, { pointerType: "touch", pointerId: PAD_POINTER_ID, button: 0, buttons: 1 }));
  }

  move(at: Point): void {
    if (!this.target) return;
    this.at = at;
    under(at).dispatchEvent(pointer("pointermove", at, { pointerType: "touch", pointerId: PAD_POINTER_ID, button: -1, buttons: 1 }));
  }

  up(click: boolean): void {
    const target = this.target;
    if (!target) return;
    this.target = null;
    const end = under(this.at);
    end.dispatchEvent(pointer("pointerup", this.at, { pointerType: "touch", pointerId: PAD_POINTER_ID, button: 0, buttons: 0 }));
    if (click && target.contains(end) && !(end instanceof HTMLCanvasElement)) end.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, clientX: this.at.x, clientY: this.at.y, detail: 1 }));
  }

  pressing(): boolean {
    return this.target !== null;
  }
}

export class PadDrag {
  private at: Point | null = null;

  constructor(private readonly surface: () => HTMLElement | null) {}

  by(dx: number, dy: number): void {
    const surface = this.surface();
    if (!surface) return;
    if (!this.at) {
      const r = surface.getBoundingClientRect();
      this.at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      surface.dispatchEvent(pointer("pointerdown", this.at, { pointerType: "mouse", pointerId: DRAG_POINTER_ID, button: 2, buttons: 2 }));
    }
    this.at = { x: this.at.x + dx, y: this.at.y + dy };
    window.dispatchEvent(pointer("pointermove", this.at, { pointerType: "mouse", pointerId: DRAG_POINTER_ID, button: -1, buttons: 2 }));
  }

  end(): void {
    if (!this.at) return;
    window.dispatchEvent(pointer("pointerup", this.at, { pointerType: "mouse", pointerId: DRAG_POINTER_ID, button: 2, buttons: 0 }));
    this.at = null;
  }
}

export function sendKey(type: "keydown" | "keyup", key: PadKey): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent(type, { code: key.code, key: key.key, bubbles: true, cancelable: true, composed: true }));
}

export function pressKey(key: PadKey): void {
  sendKey("keydown", key);
  sendKey("keyup", key);
}

export function zoomAt(surface: HTMLElement, deltaY: number): void {
  const r = surface.getBoundingClientRect();
  surface.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
}

function scrollerOf(node: Element | null): Element | null {
  for (let at = node; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (/(auto|scroll)/.test(style.overflowY) && at.scrollHeight > at.clientHeight) return at;
  }
  return null;
}

export function scrollAt(at: Point, dy: number): void {
  scrollerOf(under(at))?.scrollBy({ top: dy });
}

function tabsNear(at: Point): HTMLElement[] {
  const scope = under(at).closest("[role=dialog], [role=alertdialog], .panel, section") ?? document.body;
  return [...scope.querySelectorAll<HTMLElement>(TAB_SELECTOR)].filter((tab) => shown(tab.getBoundingClientRect()));
}

function isCurrentTab(tab: HTMLElement): boolean {
  return tab.getAttribute("aria-selected") === "true" || tab.classList.contains("on") || tab.classList.contains("active");
}

export function stepTab(at: Point, step: 1 | -1): boolean {
  const tabs = tabsNear(at);
  if (tabs.length < 2) return false;
  const index = Math.max(0, tabs.findIndex(isCurrentTab));
  tabs[(index + step + tabs.length) % tabs.length]!.click();
  return true;
}

const RADIAL_RADIUS_SHARE = 0.32;

export class PadReticle {
  private readonly node = el("div", { class: "pad-reticle", "aria-hidden": "true" });
  private at: Point = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  constructor() {
    document.body.append(this.node);
    this.show(false);
  }

  where(): Point {
    return this.at;
  }

  place(at: Point, onTarget: boolean): void {
    this.at = at;
    moveTo(this.node, at.x, at.y);
    this.node.classList.toggle("on-target", onTarget);
  }

  pressed(down: boolean): void {
    this.node.classList.toggle("pressed", down);
  }

  show(on: boolean): void {
    this.node.hidden = !on;
  }
}

export class PadRadial {
  private node: HTMLElement | null = null;
  private spots: HTMLElement[] = [];

  constructor(private readonly entries: readonly RadialEntry[]) {}

  isOpen(): boolean {
    return this.node !== null;
  }

  open(): void {
    if (this.node) return;
    const radius = Math.min(window.innerWidth, window.innerHeight) * RADIAL_RADIUS_SHARE;
    this.spots = this.entries.map((entry, i) => {
      const spot = el("div", { class: "pad-radial-entry screen-line" }, t(entry.label));
      const at = radialSpot(i, this.entries.length, radius);
      moveTo(spot, at.x, at.y);
      return spot;
    });
    this.node = el("div", { class: "pad-radial", role: "menu" }, el("div", { class: "pad-radial-hub" }, ...this.spots));
    document.body.append(this.node);
  }

  highlight(index: number | null): void {
    this.spots.forEach((spot, i) => spot.classList.toggle("picked", i === index));
  }

  close(): void {
    this.node?.remove();
    this.node = null;
    this.spots = [];
  }
}
