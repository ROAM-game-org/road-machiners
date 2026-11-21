import { publicUrl } from "../public-url";
import { BAKED } from "./dash/baked";
import { el } from "./dom";

const DRAG_GAIN = 2;
const CLICK_SLOP_PX = 3;
const PAGE_SHARE = 0.9;
const SCROLL_SLACK_PX = 1;

export const SCROLL_SCREENS = [
  ".journal-body",
  ".shop-body",
  ".truck-body",
  ".truck-body .inv-side",
  ".inv-body",
  ".inv-details > .stat-grid",
  ".inv-bench .well .inv-storage",
  ".inv-bench .inv-side-column > .well:not(.inv-target)",
  ".rank-ladder",
  ".ink-page .ink-panel",
  ".ink-page .ink-scroll",
  ".ink-page .ink-side",
  ".quest-talk",
  ".quest-text",
  ".quest-body",
  ".quest-side",
  ".dialogue .dialogue-line",
  ".dialogue .dialogue-options",
  ".info .info-content > .hud-screen",
  ".info .hitcard",
].join(", ");

const FLAT = BAKED.radio.flat;
const FRAMES = FLAT.sprites.wheel.frames;

export type FrameOf = (scrollTop: number, frames: number) => number;

export interface ScrollTarget {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function canScroll(target: ScrollTarget): boolean {
  return target.scrollHeight - target.clientHeight > SCROLL_SLACK_PX;
}

export function dragTarget(start: number, travel: number): number {
  return start + travel * DRAG_GAIN;
}

export function pageTarget(target: ScrollTarget, clickY: number, wheelTop: number, wheelHeight: number): number {
  const direction = clickY < wheelTop + wheelHeight / 2 ? -1 : 1;
  return target.scrollTop + direction * target.clientHeight * PAGE_SHARE;
}

export interface WheelPlacement {
  aspect: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function wheelPlacement(): WheelPlacement {
  const [[zx, zy], [zr], [, zb]] = FLAT.zones.wheel.quad;
  const [cx0, cy0, cx1, cy1] = FLAT.sprites.wheel.crop;
  const [w, h] = [zr - zx, zb - zy];
  return { aspect: w / h, left: (-(zx - cx0) / w) * 100, top: (-(zy - cy0) / h) * 100, width: ((cx1 - cx0) / w) * 100, height: ((cy1 - cy0) / h) * 100 };
}

export class WheelGate {
  private open = false;

  constructor(private readonly target: ScrollTarget, private readonly onChange: (open: boolean) => void) {}

  refresh(): boolean {
    const open = canScroll(this.target);
    if (open !== this.open) {
      this.open = open;
      this.onChange(open);
    }
    return open;
  }
}

function dragWheel(wheel: HTMLElement, scroller: HTMLElement, down: PointerEvent): void {
  if (down.button !== 0) return;
  const start = scroller.scrollTop;
  const stop = new AbortController();
  let moved = false;
  wheel.setPointerCapture(down.pointerId);
  wheel.addEventListener("pointermove", (e) => {
    const travel = e.clientY - down.clientY;
    moved ||= Math.abs(travel) > CLICK_SLOP_PX;
    scroller.scrollTop = dragTarget(start, travel);
  }, { signal: stop.signal });
  wheel.addEventListener("pointerup", (e) => {
    stop.abort();
    const box = wheel.getBoundingClientRect();
    if (!moved) scroller.scrollTop = pageTarget(scroller, e.clientY, box.top, box.height);
  }, { signal: stop.signal });
  wheel.addEventListener("pointercancel", () => stop.abort(), { signal: stop.signal });
}

export function bindWheel(wheel: HTMLElement, scroller: HTMLElement, show: (scrollTop: number) => void, signal?: AbortSignal): void {
  scroller.addEventListener("scroll", () => show(scroller.scrollTop), { signal });
  wheel.addEventListener("wheel", (e) => {
    e.preventDefault();
    scroller.scrollTop += e.deltaY;
  }, { passive: false, signal });
  wheel.addEventListener("pointerdown", (e) => dragWheel(wheel, scroller, e), { signal });
  show(scroller.scrollTop);
}

function frameImages(): HTMLImageElement[] {
  const place = wheelPlacement();
  return FRAMES.map((name) => {
    const img = el("img", { class: "scroll-wheel-frame", draggable: "false", role: "presentation" }) as HTMLImageElement;
    img.src = publicUrl(`hud/baked/radio/flat/${name}@2x.webp`);
    Object.assign(img.style, { left: `${place.left}%`, top: `${place.top}%`, width: `${place.width}%`, height: `${place.height}%` });
    img.hidden = true;
    return img;
  });
}

class ScreenWheel {
  readonly node: HTMLElement;
  private readonly images = frameImages();
  private readonly gate: WheelGate;
  private readonly stop = new AbortController();
  private readonly resize = new ResizeObserver(() => this.sync());
  private readonly mutate = new MutationObserver(() => this.watch());
  private shown = -1;

  constructor(private readonly screen: HTMLElement, private readonly frameOf: FrameOf) {
    this.node = el("span", { class: "scroll-wheel", role: "scrollbar", "aria-orientation": "vertical", hidden: true }, ...this.images);
    this.node.style.setProperty("--scroll-wheel-aspect", String(wheelPlacement().aspect));
    this.gate = new WheelGate(screen, (open) => this.toggle(open));
    screen.after(this.node);
    bindWheel(this.node, screen, (top) => this.turn(top), this.stop.signal);
    this.mutate.observe(screen, { childList: true, subtree: true, characterData: true });
    this.watch();
  }

  destroy(): void {
    this.stop.abort();
    this.resize.disconnect();
    this.mutate.disconnect();
    this.screen.classList.remove("scroll-wheeled");
    this.node.remove();
  }

  private watch(): void {
    this.resize.disconnect();
    for (const node of [this.screen, this.screen.parentElement, ...this.screen.children]) if (node) this.resize.observe(node);
    this.sync();
  }

  private sync(): void {
    if (this.gate.refresh()) this.place();
  }

  private toggle(open: boolean): void {
    this.node.hidden = !open;
    this.screen.classList.toggle("scroll-wheeled", open);
    if (open) this.place();
  }

  private place(): void {
    const { screen, node } = this;
    node.style.left = `${screen.offsetLeft + screen.offsetWidth}px`;
    node.style.top = `${screen.offsetTop + screen.offsetHeight / 2}px`;
    node.style.setProperty("--scroll-wheel-room", `${screen.clientHeight}px`);
    this.turn(screen.scrollTop);
  }

  private turn(scrollTop: number): void {
    const frame = this.frameOf(scrollTop, this.images.length);
    if (frame === this.shown) return;
    if (this.shown >= 0) this.images[this.shown].hidden = true;
    this.images[frame].hidden = false;
    this.shown = frame;
    this.node.setAttribute("aria-valuenow", String(Math.round(scrollTop)));
  }
}

export function mountScrollWheels(root: HTMLElement, selector: string, frameOf: FrameOf): void {
  const mounted = new Map<HTMLElement, ScreenWheel>();
  const sync = (): void => {
    for (const [screen, wheel] of mounted) {
      if (screen.isConnected) continue;
      wheel.destroy();
      mounted.delete(screen);
    }
    for (const screen of root.querySelectorAll<HTMLElement>(selector)) if (!mounted.has(screen)) mounted.set(screen, new ScreenWheel(screen, frameOf));
  };
  new MutationObserver(sync).observe(root, { childList: true, subtree: true });
  sync();
}
