import { TOUCH } from "../config";
import { verbatim } from "../text/msg";
import { el } from "./dom";
import { token } from "./tokens";

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

export function tipTextOf(target: TipTarget | null): TipContent | null {
  let node = target;
  for (let depth = 0; node && depth < DEPTH; depth += 1, node = node.parentElement) {
    if (node.hasAttribute("data-hold")) return null;
    const source = sources.get(node);
    if (source) return source();
    const text = node.getAttribute("data-reason") ?? node.getAttribute("title");
    if (text) return text;
  }
  return null;
}

interface Press {
  id: number;
  x: number;
  y: number;
  target: Element;
  timer: ReturnType<typeof setTimeout>;
  opened: boolean;
}

export function installTouchTips(root: HTMLElement, touch: () => boolean): void {
  let press: Press | null = null;
  let shown: HTMLElement | null = null;
  const close = (): void => {
    shown?.remove();
    shown = null;
  };
  const open = (content: TipContent, x: number, y: number): void => {
    close();
    shown = el("div", { class: "tooltip touch-tip", role: "tooltip" }, typeof content === "string" ? verbatim(content) : content);
    root.append(shown);
    placeTip(shown, x, y);
  };
  const end = (): void => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  root.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    close();
    end();
    const target = e.target as Element;
    const timer = setTimeout(() => {
      const content = tipTextOf(target);
      if (!press || content === null) return;
      press.opened = true;
      open(content, press.x, press.y);
    }, TOUCH.longPressMs);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, target, timer, opened: false };
  });
  root.addEventListener("pointermove", (e) => {
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TOUCH.slopPx) end();
  });
  root.addEventListener("pointerup", (e) => {
    if (!press || press.id !== e.pointerId) return;
    const { target, x, y, opened } = press;
    end();
    const disabled = target.closest('[aria-disabled="true"]');
    if (opened || !disabled || !touch()) return;
    const content = tipTextOf(disabled);
    if (content !== null) open(content, x, y);
  });
  root.addEventListener("pointercancel", end);
  root.addEventListener("scroll", close, true);
}

function placeTip(tip: HTMLElement, x: number, y: number): void {
  const margin = parseFloat(token("--hud-inset"));
  const lift = parseFloat(token("--btn-h-l"));
  const box = tip.getBoundingClientRect();
  const left = Math.min(Math.max(x - box.width / 2, margin), window.innerWidth - margin - box.width);
  const above = y - lift - box.height;
  const top = above >= margin ? above : Math.min(y + lift, window.innerHeight - margin - box.height);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
