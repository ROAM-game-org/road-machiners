import { CARD_ZOOM } from "../data/card-zoom";
import { WORLD_MAP } from "../data/minimap";
import { SUPERSAMPLE } from "../three/render/portraitPixels";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

function positive(value: number, what: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Card zoom: ${what} is ${value}, not a positive number`);
  return value;
}

function sized(size: Size, what: string): Size {
  positive(size.width, `${what} width`);
  positive(size.height, `${what} height`);
  return size;
}

export function densityCap(scale: number, devicePixelRatio: number): number {
  return Math.max(CARD_ZOOM.minFitCap, SUPERSAMPLE / (positive(scale, "the view scale") * positive(devicePixelRatio, "the device pixel ratio")));
}

export function fitZoom(screen: Size, natural: Size, cap: number): number {
  sized(screen, "the screen");
  sized(natural, "the drawing");
  return Math.min(positive(cap, "the fit cap"), screen.height / natural.height, screen.width / natural.width);
}

function limit(drawn: number, screen: number): number {
  return Math.max(0, (drawn - screen) / 2);
}

function clamp(value: number, bound: number): number {
  return Math.min(bound, Math.max(-bound, value));
}

export class CardZoom {
  private fit = 0;
  private screen: Size = { width: 0, height: 0 };
  private drawing: Size = { width: 0, height: 0 };
  private pxPerMeterAtOne = 0;
  private magnify = 1;
  private offset: Point = { x: 0, y: 0 };

  refit(fit: number, screen: Size, drawing: Size, pxPerMeterAtOne: number): void {
    this.fit = positive(fit, "the fit");
    this.screen = { ...sized(screen, "the screen") };
    this.drawing = { ...sized(drawing, "the drawing") };
    this.pxPerMeterAtOne = positive(pxPerMeterAtOne, "the drawing density");
    this.magnify = Math.min(this.magnify, this.maxMagnify());
    this.offset = this.clamped(this.offset);
  }

  private ready(): void {
    if (this.fit === 0) throw new Error("Card zoom was used before its first refit");
  }

  private maxMagnify(): number {
    return Math.max(1, CARD_ZOOM.closestPxPerMeter / (this.pxPerMeterAtOne * this.fit));
  }

  private clamped(point: Point): Point {
    const total = this.fit * this.magnify;
    return {
      x: clamp(point.x, limit(this.drawing.width * total, this.screen.width)),
      y: clamp(point.y, limit(this.drawing.height * total, this.screen.height)),
    };
  }

  zoomAt(factor: number, point: Point): void {
    this.ready();
    positive(factor, "the zoom factor");
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Card zoom: the zoom point is not finite");
    const next = Math.min(this.maxMagnify(), Math.max(1, this.magnify * factor));
    const ratio = next / this.magnify;
    this.magnify = next;
    this.offset = this.clamped({ x: point.x - (point.x - this.offset.x) * ratio, y: point.y - (point.y - this.offset.y) * ratio });
  }

  step(direction: 1 | -1): void {
    this.zoomAt(WORLD_MAP.buttonStep ** direction, { x: 0, y: 0 });
  }

  panBy(dx: number, dy: number): void {
    this.ready();
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Card zoom: the pan is not finite");
    this.offset = this.clamped({ x: this.offset.x + dx, y: this.offset.y + dy });
  }

  reset(): void {
    this.magnify = 1;
    this.offset = { x: 0, y: 0 };
  }

  total(): number {
    this.ready();
    return this.fit * this.magnify;
  }

  pan(): Point {
    return { ...this.offset };
  }

  magnified(): boolean {
    return this.magnify > 1;
  }

  canZoomIn(): boolean {
    this.ready();
    return this.magnify < this.maxMagnify() - 1e-9;
  }

  canZoomOut(): boolean {
    this.ready();
    return this.magnify > 1 + 1e-9;
  }
}
