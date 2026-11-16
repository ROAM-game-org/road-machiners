import { TOUCH } from "../config";
import { verbatim } from "../text/msg";
import { el } from "./dom";
import { token } from "./tokens";
import { uiSize } from "./ui-size";

export interface TipTarget {
  parentElement: TipTarget | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

type TipContent = Node | string;

const sources = new WeakMap<object, () => TipContent>();
const DEPTH = 8;

export function registerTipSource(target: object, source: () => TipContent): void {
  sources.set(target, source);
}

const richTips = new WeakMap<object, () => TipContent>();

export function registerRichTip(target: object, source: () => TipContent): void {
  richTips.set(target, source);
}

function ancestors(target: TipTarget | null): TipTarget[] {
  const nodes: TipTarget[] = [];
  for (let node = target; node && nodes.length < DEPTH; node = node.parentElement) nodes.push(node);
  return nodes;
}

function pressTipOf(node: TipTarget): TipContent | null | undefined {
  if (node.hasAttribute("data-hold")) return null;
  const source = sources.get(node) ?? richTips.get(node);
  if (source) return source();
  return node.getAttribute("data-reason") || node.getAttribute("title") || undefined;
}

export function tipTextOf(target: TipTarget | null): TipContent | null {
  for (const node of ancestors(target)) {
    const tip = pressTipOf(node);
    if (tip !== undefined) return tip;
  }
  return null;
}

const HELD_TITLE = "data-held-title";

function ownTip(node: TipTarget): string | null {
  return node.getAttribute("data-reason") ?? node.getAttribute(HELD_TITLE) ?? node.getAttribute("title");
}

const CONTROL_ROLES = new Set(["button", "switch", "slider", "menuitem", "tab", "timer"]);

function isControl(node: TipTarget): boolean {
  return (node as Partial<Element>).tagName === "BUTTON" || CONTROL_ROLES.has(node.getAttribute("role") ?? "");
}

function settledHoverTip(node: TipTarget): TipContent | null | undefined {
  if (node.hasAttribute("data-hold") || sources.has(node)) return null;
  const rich = richTips.get(node);
  if (rich) return rich();
  const text = ownTip(node);
  return text && isControl(node) ? text : undefined;
}

export function hoverTipOf(target: TipTarget | null): TipContent | null {
  let first: string | null = null;
  for (const node of ancestors(target)) {
    const settled = settledHoverTip(node);
    if (settled !== undefined) return settled;
    first ??= ownTip(node);
  }
  return first;
}

function holdTitles(from: Element | null): void {
  for (let node = from, depth = 0; node && depth < DEPTH; depth += 1, node = node.parentElement) {
    const title = node.getAttribute("title");
    if (title === null) continue;
    node.setAttribute(HELD_TITLE, title);
    node.removeAttribute("title");
  }
}

function isVisible(node: Element): boolean {
  return node.isConnected && node.getClientRects().length > 0;
}

function fillTip(tip: HTMLElement, text: TipContent): void {
  if (typeof text === "string") {
    if (tip.textContent !== text) tip.replaceChildren(text);
    return;
  }
  if (tip.innerHTML !== (text as HTMLElement).outerHTML) tip.replaceChildren(text);
}

class HoverTip {
  private shown: HTMLElement | null = null;
  private over: Element | null = null;
  private blocked: Element | null = null;
  private x = 0;
  private y = 0;
  private frame = 0;
  private readonly watcher = new MutationObserver(() => holdTitles(this.over));

  constructor(private readonly root: HTMLElement, private readonly touch: () => boolean) {}

  install(): void {
    const close = (): void => this.close();
    this.root.addEventListener("pointermove", (e) => this.move(e));
    this.root.addEventListener("pointerleave", close);
    this.root.addEventListener("pointerdown", (e) => this.press(e), true);
    this.root.addEventListener("pointerup", () => (this.blocked = null), true);
    this.root.addEventListener("wheel", close, { passive: true, capture: true });
    this.root.addEventListener("scroll", close, true);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", close);
  }

  private press(e: PointerEvent): void {
    this.blocked = e.target as Element;
    this.close();
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === "touch" || this.touch()) return;
    const target = e.target as Element;
    if (this.blocked === target) return;
    this.blocked = null;
    this.x = e.clientX;
    this.y = e.clientY;
    this.watch(target);
    this.refresh();
  }

  private watch(target: Element): void {
    this.over = target;
    holdTitles(target);
    this.watcher.disconnect();
    for (let node: Element | null = target, depth = 0; node && depth < DEPTH; depth += 1, node = node.parentElement) this.watcher.observe(node, { attributeFilter: ["title"] });
  }

  private refresh(): void {
    const text = this.over ? hoverTipOf(this.over) : null;
    if (text === null) return this.close();
    if (!this.shown) {
      this.shown = el("div", { class: "tooltip touch-tip hover-tip", role: "tooltip" });
      this.root.append(this.shown);
      this.frame = requestAnimationFrame(() => this.check());
    }
    fillTip(this.shown, text);
    placeTip(this.shown, this.x, this.y);
  }

  private underPointer(): boolean {
    const hit = document.elementFromPoint(this.x, this.y);
    return hit !== null && this.over !== null && this.over.contains(hit);
  }

  private check(): void {
    if (!this.shown || !this.over) return;
    if (!isVisible(this.over) || !this.underPointer()) return this.close();
    this.refresh();
    if (this.shown) this.frame = requestAnimationFrame(() => this.check());
  }

  private close(): void {
    cancelAnimationFrame(this.frame);
    this.shown?.remove();
    this.shown = null;
  }
}

export function installHoverTips(root: HTMLElement, touch: () => boolean): void {
  new HoverTip(root, touch).install();
}

export interface ClosestTarget extends TipTarget {
  closest(selector: string): ClosestTarget | null;
}

export function disabledReasonAt(target: ClosestTarget): TipContent | null {
  const disabled = target.closest('[aria-disabled="true"]');
  return disabled ? tipTextOf(disabled) : null;
}

interface Press {
  id: number;
  x: number;
  y: number;
  target: Element;
  timer: ReturnType<typeof setTimeout>;
  opened: boolean;
}

export function installTouchTips(root: HTMLElement, touch: () => boolean, extraSurfaces: readonly HTMLElement[] = []): void {
  const surfaces = [root, ...extraSurfaces];
  let press: Press | null = null;
  let shown: HTMLElement | null = null;
  const close = (): void => {
    shown?.remove();
    shown = null;
    root.removeAttribute("data-pinned-tip");
  };
  const open = (content: TipContent, x: number, y: number): void => {
    close();
    shown = el("div", { class: "tooltip touch-tip", role: "tooltip" }, typeof content === "string" ? verbatim(content) : content);
    root.append(shown);
    root.setAttribute("data-pinned-tip", "");
    placeTip(shown, x, y);
  };
  const end = (): void => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  for (const surface of surfaces) surface.addEventListener("pointerdown", (e) => {
    close();
    if (e.pointerType !== "touch") return;
    end();
    const target = e.target as Element;
    const timer = setTimeout(() => {
      const content = tipTextOf(target);
      if (!press || content === null) return;
      press.opened = true;
      open(content, press.x, press.y);
    }, TOUCH.longPressMs);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, target, timer, opened: false };
  }, true);
  for (const surface of surfaces) surface.addEventListener("pointermove", (e) => {
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TOUCH.slopPx) end();
  });
  for (const surface of surfaces) surface.addEventListener("pointerup", (e) => {
    if (!press || press.id !== e.pointerId) return;
    const { target, x, y, opened } = press;
    end();
    const disabled = target.closest('[aria-disabled="true"]');
    if (opened || !disabled || !touch()) return;
    const content = tipTextOf(disabled);
    if (content !== null) open(content, x, y);
  });
  root.addEventListener("click", (e) => {
    if (touch()) return;
    const content = disabledReasonAt(e.target as Element);
    if (content === null) return;
    const spot = e.detail === 0 ? (e.target as Element).getBoundingClientRect() : null;
    open(content, spot ? spot.left + spot.width / 2 : e.clientX, spot ? spot.top + spot.height / 2 : e.clientY);
  });
  for (const surface of surfaces) surface.addEventListener("pointercancel", end);
  root.addEventListener("scroll", close, true);
  document.addEventListener("keydown", close);
}

function placeTip(tip: HTMLElement, screenX: number, screenY: number): void {
  const { x, y } = uiSize().layerPoint(screenX, screenY);
  const layer = uiSize().layerSize();
  const margin = parseFloat(token("--hud-inset"));
  const lift = parseFloat(token("--btn-h-l"));
  const box = uiSize().layerRect(tip);
  const left = Math.min(Math.max(x - box.width / 2, margin), layer.width - margin - box.width);
  const above = y - lift - box.height;
  const top = above >= margin ? above : Math.min(y + lift, layer.height - margin - box.height);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

export function installTips(root: HTMLElement, touch: () => boolean, extraSurfaces: readonly HTMLElement[]): void {
  installTouchTips(root, touch, extraSurfaces);
  installHoverTips(root, touch);
}
