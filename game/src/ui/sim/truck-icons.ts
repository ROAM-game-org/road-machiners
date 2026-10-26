import * as THREE from "three";
import { CHASSIS, PAINT } from "../../data/chassis";
import { PHYSICS } from "../../data/physics";
import { bareVehicle } from "../../sim/factory";
import { GARAGE_PX_PER_METER, GarageRenders, gridOrigin, type GarageSprite } from "../../three/render/garageRender";
import { loadModels, paintSurfaceMasks } from "../../three/render/models";

const LEVEL_STEP = Math.SQRT2;
const LEVELS = 14;
const EDGE_PX = 1;
const EDGE_ALPHA = 0.6;
const GLOW_PX = 4;
const GLOW_ALPHA = 0.85;
const PAD_PX = 2 * GLOW_PX;
const OUT_ALPHA = 0.75;
const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export type IconLook = { fill: string; edge: string; halo: string; out: boolean };

type Sprite = { widthM: number; heightM: number; anchorXM: number; anchorYM: number; levels: HTMLCanvasElement[] };

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

function halved(source: HTMLCanvasElement): HTMLCanvasElement {
  const half = canvasOfSize(source.width / 2, source.height / 2);
  contextOf(half).drawImage(source, 0, 0, half.width, half.height);
  return half;
}

function lessened(source: HTMLCanvasElement): HTMLCanvasElement {
  const smaller = canvasOfSize(source.width / LEVEL_STEP, source.height / LEVEL_STEP);
  contextOf(smaller).drawImage(source, 0, 0, smaller.width, smaller.height);
  return smaller;
}

function levelsOf(full: HTMLCanvasElement): HTMLCanvasElement[] {
  const levels = [full];
  for (let i = 1; i < LEVELS; i++) levels.push(i % 2 === 0 ? halved(levels[i - 2]!) : lessened(levels[i - 1]!));
  return levels;
}

function loaded(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A truck icon render could not be read back"));
    image.src = url;
  });
}

async function spriteOf(chassisId: string, drawn: GarageSprite): Promise<Sprite> {
  const image = await loaded(drawn.url);
  const full = canvasOfSize(image.width, image.height);
  contextOf(full).drawImage(image, 0, 0);
  const origin = gridOrigin(chassisId);
  return {
    widthM: drawn.width,
    heightM: drawn.height,
    anchorXM: -origin.z - drawn.left,
    anchorYM: origin.x - drawn.top,
    levels: levelsOf(full),
  };
}

function silhouette(base: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const mask = canvasOfSize(base.width, base.height);
  const ctx = contextOf(mask);
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, mask.width, mask.height);
  return mask;
}

function stamp(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement, reaches: number): void {
  for (let reach = 1; reach <= reaches; reach++) for (const [dx, dy] of OFFSETS) ctx.drawImage(mask, PAD_PX + dx * reach, PAD_PX + dy * reach);
}

function body(base: HTMLCanvasElement, look: IconLook): HTMLCanvasElement {
  if (!look.out) return base;
  const dark = canvasOfSize(base.width, base.height);
  const ctx = contextOf(dark);
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = OUT_ALPHA;
  ctx.fillStyle = look.fill;
  ctx.fillRect(0, 0, dark.width, dark.height);
  return dark;
}

function iconOf(base: HTMLCanvasElement, look: IconLook): HTMLCanvasElement {
  const icon = canvasOfSize(base.width + 2 * PAD_PX, base.height + 2 * PAD_PX);
  const ctx = contextOf(icon);
  const color = silhouette(base, look.edge);
  ctx.globalAlpha = GLOW_ALPHA;
  ctx.filter = `blur(${GLOW_PX / 2}px)`;
  stamp(ctx, color, GLOW_PX);
  ctx.filter = "none";
  ctx.globalAlpha = EDGE_ALPHA;
  stamp(ctx, color, EDGE_PX);
  ctx.globalAlpha = 1;
  ctx.drawImage(body(base, look), PAD_PX, PAD_PX);
  return icon;
}

function levelFor(pxPerMeter: number): number {
  const level = Math.round(Math.log(GARAGE_PX_PER_METER / pxPerMeter) / Math.log(LEVEL_STEP));
  return Math.min(LEVELS - 1, Math.max(0, level));
}

export class TruckIcons {
  private readonly made = new Map<string, HTMLCanvasElement>();

  private readonly shortestM: number;

  private constructor(private readonly sprites: Map<string, Sprite>) {
    this.shortestM = Math.min(...[...sprites.values()].map((s) => Math.max(s.widthM, s.heightM)));
  }

  static async load(): Promise<TruckIcons> {
    await loadModels();
    await paintSurfaceMasks();
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const renders = new GarageRenders(renderer);
    const sprites = new Map<string, Sprite>();
    for (const chassisId of Object.keys(CHASSIS)) sprites.set(chassisId, await TruckIcons.render(renders, chassisId));
    renderer.dispose();
    return new TruckIcons(sprites);
  }

  private static async render(renders: GarageRenders, chassisId: string): Promise<Sprite> {
    const world = { nextId: 1 };
    const truck = bareVehicle(world, { faction: "player", chassisId, pos: { x: 0, y: 0 }, heading: 0, brain: null });
    renders.ensureNow([{ truck, paint: PAINT.standard, parts: [] }]);
    const body = renders.body(truck, PAINT.standard);
    if (!body?.image.url) throw new Error(`The ${chassisId} drew no top view`);
    return spriteOf(chassisId, body.image);
  }

  private sprite(chassisId: string): Sprite {
    const sprite = this.sprites.get(chassisId);
    if (!sprite) throw new Error(`No truck icon for the chassis ${chassisId}`);
    return sprite;
  }

  pxPerMeter(tileSize: number, shortestPx: number): number {
    return Math.max(tileSize / PHYSICS.metersPerTile, shortestPx / this.shortestM);
  }

  radius(chassisId: string, pxPerMeter: number): number {
    const sprite = this.sprite(chassisId);
    return (Math.hypot(sprite.widthM, sprite.heightM) / 2) * pxPerMeter;
  }

  draw(ctx: CanvasRenderingContext2D, chassisId: string, at: { x: number; y: number }, angle: number, pxPerMeter: number, look: IconLook): void {
    const sprite = this.sprite(chassisId);
    const level = levelFor(pxPerMeter);
    const levelPxPerMeter = sprite.levels[level]!.width / sprite.widthM;
    const icon = this.iconFor(sprite, chassisId, level, look);
    const scale = pxPerMeter / levelPxPerMeter;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.drawImage(icon, -(sprite.anchorXM * levelPxPerMeter + PAD_PX) * scale, -(sprite.anchorYM * levelPxPerMeter + PAD_PX) * scale, icon.width * scale, icon.height * scale);
    ctx.restore();
  }

  private iconFor(sprite: Sprite, chassisId: string, level: number, look: IconLook): HTMLCanvasElement {
    const key = `${chassisId}|${level}|${look.fill}|${look.edge}|${look.halo}|${look.out}`;
    const cached = this.made.get(key);
    if (cached) return cached;
    const icon = iconOf(sprite.levels[level]!, look);
    this.made.set(key, icon);
    return icon;
  }
}
