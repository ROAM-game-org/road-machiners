import { PHYSICS } from "../../data/physics";
import { spanOf } from "../../sim/body";
import { token } from "../tokens";
import { SPRITES, spriteKey, type SpriteCell, type SpriteManifest, type SpritePaint } from "../../three/sim-sprite-plan";

const LEVEL_STEP = Math.SQRT2;
const SHADOW = { reach: 1, blur: 1, alpha: 0.9, darken: 0.5 };
const PAD_PX = SHADOW.reach + SHADOW.blur * 2;
const OUT_FILTER = "grayscale(1) brightness(0.55)";
const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const REBAKE = "Run npm run sim:sprites";

export type IconLook = { color: string; out: boolean };

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

function drawShadow(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, color: string): void {
  const mask = shadowMask(base, color);
  ctx.globalAlpha = SHADOW.alpha;
  ctx.filter = `blur(${SHADOW.blur}px)`;
  for (const [dx, dy] of OFFSETS) ctx.drawImage(mask, PAD_PX + dx * SHADOW.reach, PAD_PX + dy * SHADOW.reach);
  ctx.drawImage(mask, PAD_PX, PAD_PX);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
}

function iconOf(base: HTMLCanvasElement, look: IconLook): HTMLCanvasElement {
  const icon = canvasOfSize(base.width + 2 * PAD_PX, base.height + 2 * PAD_PX);
  const ctx = contextOf(icon);
  drawShadow(ctx, base, look.color);
  if (look.out) ctx.filter = OUT_FILTER;
  ctx.drawImage(base, PAD_PX, PAD_PX);
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
  private madeLevel = -1;
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
    const level = Math.max(0, Math.round(Math.log(this.pxPerMeterBase / pxPerMeter) / Math.log(LEVEL_STEP)));
    const yaw = set.yawFor(heading);
    const icon = this.iconFor(set, yaw, level, look);
    const scale = pxPerMeter / (this.pxPerMeterBase / LEVEL_STEP ** level);
    const cell = set.cells[yaw]!;
    const left = at.x + (cell.fromCenterX / this.pxPerMeterBase) * pxPerMeter - PAD_PX * scale;
    const top = at.y + (cell.fromCenterY / this.pxPerMeterBase) * pxPerMeter - PAD_PX * scale;
    ctx.drawImage(icon, left, top, icon.width * scale, icon.height * scale);
  }

  private iconFor(set: SpriteSet, yaw: number, level: number, look: IconLook): HTMLCanvasElement {
    if (level !== this.madeLevel) {
      this.made.clear();
      this.madeLevel = level;
    }
    const key = `${set.key}|${yaw}|${look.color}|${look.out}`;
    const cached = this.made.get(key);
    if (cached) return cached;
    const icon = iconOf(scaledTo(set.piece(yaw), 1 / LEVEL_STEP ** level), look);
    this.made.set(key, icon);
    return icon;
  }
}
