import { PHYSICS } from "../../data/physics";
import { spanOf } from "../../sim/body";
import { token } from "../tokens";
import { SPRITES, spriteKey, type SpriteCell, type SpriteManifest, type SpritePaint } from "../../three/sim-sprite-plan";

const SIZE_STEPS_PER_OCTAVE = 8;
const SHADOW = { alpha: 0.9, darken: 0.5 };
const OUT_FILTER = "grayscale(1) brightness(0.55)";
const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const REBAKE = "Run npm run sim:sprites";

export type IconLook = { color: string; out: boolean };
type Shadow = { reach: number; blur: number; pad: number };

export function iconScreenScale(wantedPxPerMeter: number, sheetPxPerMeter: number): number {
  const octaves = Math.log2(wantedPxPerMeter / sheetPxPerMeter);
  return sheetPxPerMeter * 2 ** (Math.round(octaves * SIZE_STEPS_PER_OCTAVE) / SIZE_STEPS_PER_OCTAVE);
}

export function shadowFor(ratio: number): Shadow {
  const reach = Math.max(1, Math.round(ratio));
  return { reach, blur: reach, pad: reach * 3 };
}

export function iconCorner(at: { x: number; y: number }, ratio: number, cell: { fromCenterX: number; fromCenterY: number }, sheetPxPerMeter: number, screenPxPerMeter: number, pad: number): { left: number; top: number } {
  return {
    left: Math.round(at.x * ratio + (cell.fromCenterX / sheetPxPerMeter) * screenPxPerMeter) - pad,
    top: Math.round(at.y * ratio + (cell.fromCenterY / sheetPxPerMeter) * screenPxPerMeter) - pad,
  };
}

export class SpriteSet {
  constructor(readonly key: string, readonly sheet: HTMLImageElement, readonly cells: readonly SpriteCell[], readonly radiusM: number) {}

  yawFor(heading: number): number {
    const turn = heading / (2 * Math.PI);
    return ((Math.round(turn * SPRITES.yaws) % SPRITES.yaws) + SPRITES.yaws) % SPRITES.yaws;
  }

  piece(yaw: number): HTMLCanvasElement {
    const cell = this.cells[yaw]!;
    const canvas = canvasOfSize(cell.w, cell.h);
    contextOf(canvas).drawImage(this.sheet, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
    return canvas;
  }
}

function canvasOfSize(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

function scaledTo(source: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  let current = source;
  let left = factor;
  while (left < 0.5) {
    const half = canvasOfSize(current.width / 2, current.height / 2);
    contextOf(half).drawImage(current, 0, 0, half.width, half.height);
    current = half;
    left *= 2;
  }
  const out = canvasOfSize(source.width * factor, source.height * factor);
  contextOf(out).drawImage(current, 0, 0, out.width, out.height);
  return out;
}

function shadowMask(base: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const mask = canvasOfSize(base.width, base.height);
  const ctx = contextOf(mask);
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, mask.width, mask.height);
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = SHADOW.darken;
  ctx.fillStyle = token("--color-void");
  ctx.fillRect(0, 0, mask.width, mask.height);
  return mask;
}

function drawShadow(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, color: string, shadow: Shadow): void {
  const mask = shadowMask(base, color);
  ctx.globalAlpha = SHADOW.alpha;
  ctx.filter = `blur(${shadow.blur}px)`;
  for (const [dx, dy] of OFFSETS) ctx.drawImage(mask, shadow.pad + dx * shadow.reach, shadow.pad + dy * shadow.reach);
  ctx.drawImage(mask, shadow.pad, shadow.pad);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
}

function iconOf(base: HTMLCanvasElement, look: IconLook, shadow: Shadow): HTMLCanvasElement {
  const icon = canvasOfSize(base.width + 2 * shadow.pad, base.height + 2 * shadow.pad);
  const ctx = contextOf(icon);
  drawShadow(ctx, base, look.color, shadow);
  if (look.out) ctx.filter = OUT_FILTER;
  ctx.drawImage(base, shadow.pad, shadow.pad);
  ctx.filter = "none";
  return icon;
}

function imageAt(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`The sprite sheet ${url} did not load. ${REBAKE}`));
    image.src = url;
  });
}

async function manifestAt(folder: string): Promise<SpriteManifest> {
  const response = await fetch(`${folder}${SPRITES.manifest}`);
  if (!response.ok) throw new Error(`The sprite manifest is missing (${response.status}). ${REBAKE}`);
  return (await response.json()) as SpriteManifest;
}

export class TruckIcons {
  private readonly made = new Map<string, HTMLCanvasElement>();
  private madeSize = "";
  private readonly shortestM: number;

  private constructor(private readonly sets: Map<string, SpriteSet>, private readonly pxPerMeterBase: number, chassis: readonly string[]) {
    this.shortestM = Math.min(...chassis.map((id) => 2 * spanOf(id).half.x));
  }

  static async load(): Promise<TruckIcons> {
    const folder = `${import.meta.env.BASE_URL}${SPRITES.folder}/`;
    const manifest = await manifestAt(folder);
    const entries = Object.entries(manifest.sprites);
    const sheets = await Promise.all(entries.map(([, entry]) => imageAt(`${folder}${entry.file}`)));
    const sets = new Map(entries.map(([key, entry], i) => [key, new SpriteSet(key, sheets[i]!, entry.cells, entry.radiusM)]));
    return new TruckIcons(sets, manifest.pxPerMeter, manifest.chassis);
  }

  setFor(chassisId: string, paint: SpritePaint): SpriteSet {
    const key = spriteKey(chassisId, paint);
    const set = this.sets.get(key);
    if (!set) throw new Error(`No baked sprite for ${key}. ${REBAKE}`);
    return set;
  }

  pxPerMeter(tileSize: number, shortestPx: number): number {
    return Math.max(tileSize / PHYSICS.metersPerTile, shortestPx / this.shortestM);
  }

  radius(set: SpriteSet, pxPerMeter: number): number {
    return set.radiusM * pxPerMeter;
  }

  draw(ctx: CanvasRenderingContext2D, set: SpriteSet, at: { x: number; y: number }, heading: number, pxPerMeter: number, look: IconLook): void {
    const ratio = ctx.getTransform().a;
    const screen = iconScreenScale(pxPerMeter * ratio, this.pxPerMeterBase);
    const shadow = shadowFor(ratio);
    const yaw = set.yawFor(heading);
    const icon = this.iconFor(set, yaw, screen, shadow, look);
    const { left, top } = iconCorner(at, ratio, set.cells[yaw]!, this.pxPerMeterBase, screen, shadow.pad);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(icon, left, top);
    ctx.restore();
  }

  private iconFor(set: SpriteSet, yaw: number, screen: number, shadow: Shadow, look: IconLook): HTMLCanvasElement {
    const size = `${screen}|${shadow.pad}`;
    if (size !== this.madeSize) {
      this.made.clear();
      this.madeSize = size;
    }
    const key = `${set.key}|${yaw}|${look.color}|${look.out}`;
    const cached = this.made.get(key);
    if (cached) return cached;
    const icon = iconOf(scaledTo(set.piece(yaw), screen / this.pxPerMeterBase), look, shadow);
    this.made.set(key, icon);
    return icon;
  }
}
