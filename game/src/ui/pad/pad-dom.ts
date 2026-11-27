import { t } from "../../text/msg";
import { el, moveTo } from "../dom";
import { radialRadii, radialSpot, type PadKey, type PadTarget, type Point, type RadialEntry } from "./pad-model";

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

const SCREENS = ".modal, .dialog, [role=dialog], [role=alertdialog], [role=menu]";

function onTop(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  if (!shown(rect)) return false;
  const at = centreOf(rect);
  const hit = document.elementFromPoint(at.x, at.y);
  return hit !== null && node.contains(hit);
}

function openScreens(): Element[] {
  return [...document.querySelectorAll(SCREENS)].filter(onTop);
}

function controlTarget(node: Element): PadTarget | null {
  const rect = node.getBoundingClientRect();
  const at = centreOf(rect);
  if (!shown(rect) || !reachable(node, at)) return null;
  return { key: keyOf(node), kind: "control", x: at.x, y: at.y, r: Math.max(CONTROL_TARGET_PX, Math.min(rect.width, rect.height) / 2), label: node.textContent ?? "" };
}

function inScreens(screens: readonly Element[], node: Element): boolean {
  return screens.length === 0 || screens.some((screen) => screen.contains(node));
}

export function controlTargets(skip: (node: Element) => boolean): PadTarget[] {
  const screens = openScreens();
  return [...document.querySelectorAll(CONTROLS)].filter((node) => !skip(node) && inScreens(screens, node)).flatMap((node) => controlTarget(node) ?? []);
}

function targetOf(node: Element | null, targets: readonly PadTarget[]): PadTarget | null {
  const key = node ? keys.get(node) : undefined;
  return key === undefined ? null : (targets.find((t) => t.key === key) ?? null);
}

export function landingTarget(targets: readonly PadTarget[]): PadTarget | null {
  const active = document.activeElement;
  const focused = active && active !== document.body ? targetOf(active, targets) : null;
  return focused ?? [...document.querySelectorAll(".quest-choice, .quest-next")].map((node) => targetOf(node, targets)).find((target) => target !== null) ?? null;
}

function under(at: Point): Element {
  return document.elementFromPoint(at.x, at.y) ?? document.body;
}

const captured = new Map<number, Element>();
const PAD_POINTERS: ReadonlySet<number> = new Set([PAD_POINTER_ID, DRAG_POINTER_ID]);

export function emulatePadCapture(): void {
  const proto = Element.prototype;
  const { setPointerCapture, releasePointerCapture, hasPointerCapture } = proto;
  proto.setPointerCapture = function (this: Element, id: number): void {
    if (!PAD_POINTERS.has(id)) return setPointerCapture.call(this, id);
    captured.set(id, this);
  };
  proto.releasePointerCapture = function (this: Element, id: number): void {
    if (!PAD_POINTERS.has(id)) return releasePointerCapture.call(this, id);
    if (captured.get(id) === this) loseCapture(id);
  };
  proto.hasPointerCapture = function (this: Element, id: number): boolean {
    if (!PAD_POINTERS.has(id)) return hasPointerCapture.call(this, id);
    return captured.get(id) === this;
  };
}

function loseCapture(id: number): void {
  const holder = captured.get(id);
  if (!holder) return;
  captured.delete(id);
  holder.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, composed: true, pointerId: id, pointerType: id === PAD_POINTER_ID ? "touch" : "mouse", isPrimary: true }));
}

function receiver(id: number, at: Point): Element {
  return captured.get(id) ?? under(at);
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
    receiver(PAD_POINTER_ID, at).dispatchEvent(pointer("pointermove", at, { pointerType: "touch", pointerId: PAD_POINTER_ID, button: -1, buttons: 1 }));
  }

  up(click: boolean): void {
    const target = this.target;
    if (!target) return;
    this.target = null;
    const end = under(this.at);
    receiver(PAD_POINTER_ID, this.at).dispatchEvent(pointer("pointerup", this.at, { pointerType: "touch", pointerId: PAD_POINTER_ID, button: 0, buttons: 0 }));
    loseCapture(PAD_POINTER_ID);
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
    (captured.get(DRAG_POINTER_ID) ?? window).dispatchEvent(pointer("pointermove", this.at, { pointerType: "mouse", pointerId: DRAG_POINTER_ID, button: -1, buttons: 2 }));
  }

  end(): void {
    if (!this.at) return;
    (captured.get(DRAG_POINTER_ID) ?? window).dispatchEvent(pointer("pointerup", this.at, { pointerType: "mouse", pointerId: DRAG_POINTER_ID, button: 2, buttons: 0 }));
    loseCapture(DRAG_POINTER_ID);
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

function screenScroller(): Element | null {
  for (const screen of openScreens()) {
    const inside = [screen, ...screen.querySelectorAll("*")].find((node) => scrollerOf(node) === node);
    if (inside) return inside;
  }
  return null;
}

export function scrollAt(at: Point, dy: number): void {
  (scrollerOf(under(at)) ?? screenScroller())?.scrollBy({ top: dy, behavior: "instant" });
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
const RADIAL_GAP_PX = 8;

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
    this.spots = this.entries.map((entry) => el("div", { class: "pad-radial-entry screen-line" }, t(entry.label)));
    this.node = el("div", { class: "pad-radial", role: "menu" }, el("div", { class: "pad-radial-hub" }, ...this.spots));
    document.body.append(this.node);
    const entry = { width: Math.max(...this.spots.map((spot) => spot.offsetWidth)), height: Math.max(...this.spots.map((spot) => spot.offsetHeight)) };
    const radii = radialRadii({ width: window.innerWidth, height: window.innerHeight }, entry, this.entries.length, RADIAL_RADIUS_SHARE, RADIAL_GAP_PX);
    this.spots.forEach((spot, i) => {
      const at = radialSpot(i, this.entries.length, radii);
      moveTo(spot, at.x, at.y);
    });
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
