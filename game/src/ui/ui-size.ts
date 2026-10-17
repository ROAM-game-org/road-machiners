export const UI_SIZES = [0.8, 0.9, 1, 1.15, 1.3] as const;
export const UI_SIZE_KEY = "roam.uiSize";
export const LAYER_MIN = { long: 640, short: 360 };

export interface Extent {
  width: number;
  height: number;
}

export interface LayerBox {
  style: { width: string; height: string; transform: string; transformOrigin: string };
}

export interface ScaleRoot {
  style: { setProperty(name: string, value: string): void };
}

export interface Measured {
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
}

export interface LayerRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

type SizeStore = Pick<Storage, "getItem" | "setItem">;

function requireSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) throw new Error(`UI size ${size} is not a positive number`);
  return size;
}

function stepOf(pick: number): number {
  const step = UI_SIZES.find((s) => s === pick);
  if (step === undefined) throw new Error(`UI size ${pick} is not a step`);
  return step;
}

export function fitsLayer(size: number, window: Extent, min: typeof LAYER_MIN): boolean {
  requireSize(size);
  const width = window.width / size;
  const height = window.height / size;
  return Math.max(width, height) >= min.long && Math.min(width, height) >= min.short;
}

export function appliedSize(pick: number, window: Extent, min: typeof LAYER_MIN): number {
  const chosen = stepOf(pick);
  const fitting = UI_SIZES.filter((s) => s <= chosen && fitsLayer(s, window, min));
  return fitting.length > 0 ? Math.max(...fitting) : UI_SIZES[0];
}

function usable(window: Extent): boolean {
  return Number.isFinite(window.width) && Number.isFinite(window.height) && window.width > 0 && window.height > 0;
}

function storedPick(raw: string | null): number {
  return UI_SIZES.find((s) => String(s) === raw) ?? 1;
}

function askedPick(search: string): number | null {
  const asked = new URLSearchParams(search).get("ui-size");
  if (asked === null) return null;
  const step = UI_SIZES.find((s) => Math.round(s * 100) === Number(asked));
  if (step === undefined) throw new Error(`?ui-size=${asked} is no UI size step`);
  return step;
}

export class UiSize {
  private chosen: number;
  private size: number;
  private window: Extent;
  private readonly subscribers = new Set<() => void>();

  constructor(
    private readonly storage: SizeStore | null,
    private readonly layers: LayerBox[],
    private readonly root: ScaleRoot | null,
    viewport: Extent,
    pick = 1,
    private readonly min = LAYER_MIN,
  ) {
    this.chosen = stepOf(pick);
    this.window = usable(viewport) ? { ...viewport } : { width: this.min.long, height: this.min.short };
    this.size = appliedSize(this.chosen, this.window, this.min);
    this.write();
  }

  pick(): number {
    return this.chosen;
  }

  applied(): number {
    return this.size;
  }

  set(pick: number): void {
    this.chosen = stepOf(pick);
    this.storage?.setItem(UI_SIZE_KEY, String(this.chosen));
    this.update();
  }

  refit(window: Extent): void {
    if (!usable(window)) return;
    this.window = { width: window.width, height: window.height };
    this.update();
  }

  fits(size: number): boolean {
    return fitsLayer(size, this.window, this.min);
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  layerSize(): Extent {
    return { width: this.window.width / this.size, height: this.window.height / this.size };
  }

  toLayer(px: number): number {
    return px / this.size;
  }

  layerPoint(x: number, y: number): { x: number; y: number } {
    return { x: x / this.size, y: y / this.size };
  }

  layerRect(element: Measured): LayerRect {
    const r = element.getBoundingClientRect();
    const s = this.size;
    return { left: r.left / s, top: r.top / s, right: r.right / s, bottom: r.bottom / s, width: r.width / s, height: r.height / s };
  }

  private update(): void {
    const next = appliedSize(this.chosen, this.window, this.min);
    this.size = next;
    this.write();
    for (const fn of this.subscribers) fn();
  }

  private write(): void {
    requireSize(this.size);
    this.root?.style.setProperty("--ui-scale", String(this.size));
    const { width, height } = this.layerSize();
    for (const layer of this.layers) {
      layer.style.width = this.size === 1 ? "" : `${width}px`;
      layer.style.height = this.size === 1 ? "" : `${height}px`;
      layer.style.transform = this.size === 1 ? "" : `scale(${this.size})`;
      layer.style.transformOrigin = this.size === 1 ? "" : "0 0";
    }
  }
}

let active = new UiSize(null, [], null, typeof window === "undefined" ? { width: LAYER_MIN.long, height: LAYER_MIN.short } : windowExtent());

export function loadUiSize(storage: SizeStore, search: string, dev: boolean, layers: LayerBox[], root: ScaleRoot, viewport: Extent): UiSize {
  const asked = dev ? askedPick(search) : null;
  const pick = asked ?? storedPick(storage.getItem(UI_SIZE_KEY));
  active = new UiSize(storage, layers, root, viewport, pick);
  return active;
}

export function uiSize(): UiSize {
  return active;
}

export function windowExtent(): Extent {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function layerPointOf(screen: { x: number; y: number }): { x: number; y: number } {
  return active.layerPoint(screen.x, screen.y);
}
