import * as THREE from "three";
import { CHASSIS, type TruckPaint } from "../../data/chassis";
import { FACTIONS } from "../../data/npc-behavior";
import { PHYSICS } from "../../data/physics";
import { paintOf } from "../../render/palette";
import { spanOf } from "../../sim/body";
import { bareVehicle } from "../../sim/factory";
import type { Faction, NpcBrain, NpcFactionId, Vehicle } from "../../sim/types";
import { boundsOf, flipRows, linearToSrgb, unpremultiply, type PixelBox } from "../../three/render/portraitPixels";
import { loadModels, paintSurfaceMasks } from "../../three/render/models";
import { canvasOf, hideOutlines, poseAtRest, withRendererState } from "../../three/render/truckPortrait";
import { VehicleView, type RebuildBudget } from "../../three/render/vehicle";
import { token } from "../tokens";

const YAWS = 16;
const CAMERA = { riseDeg: 35, distance: 60, margin: 0.2 };
const LIGHT = { ambient: 2.5, key: 1.5, keyAt: [-4, 8, 6] as const };
const BASE_PX_PER_METER = 40;
const SAMPLES = 4;
const LEVEL_STEP = Math.SQRT2;
const SHADOW = { reach: 1, blur: 1, alpha: 0.9, darken: 0.5 };
const PAD_PX = SHADOW.reach + SHADOW.blur * 2;
const OUT_FILTER = "grayscale(1) brightness(0.55)";
const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export type IconLook = { color: string; out: boolean };
export type IconPaint = { faction: string; template: string | null; player: TruckPaint };

type Yaw = { canvas: HTMLCanvasElement; fromCenterX: number; fromCenterY: number };

export class SpriteSet {
  constructor(readonly key: string, readonly yaws: Yaw[], readonly radiusM: number) {}

  yawFor(heading: number): number {
    const turn = heading / (2 * Math.PI);
    return ((Math.round(turn * YAWS) % YAWS) + YAWS) % YAWS;
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

function factionOf(text: string): Faction {
  if (text === "player") return text;
  const found = (Object.keys(FACTIONS) as NpcFactionId[]).find((id) => id === text);
  if (!found) throw new Error(`The faction ${text} is not in the game`);
  return found;
}

function brainOf(templateId: string): NpcBrain {
  return { templateId, driver: "", traits: [], personality: "kind", goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { x: 0, y: 0 }, stepIndex: 0, memories: [] };
}

function truckOf(chassisId: string, paint: IconPaint): Vehicle {
  const faction = factionOf(paint.faction);
  const brain = faction === "player" ? null : paint.template === null ? null : brainOf(paint.template);
  return bareVehicle({ nextId: 1 }, { faction, chassisId, pos: { x: 0, y: 0 }, heading: 0, brain });
}

function onceMore(): RebuildBudget {
  let spent = false;
  return { take: () => !spent && (spent = true), ready: () => true };
}

function builtView(truck: Vehicle, paint: TruckPaint): VehicleView {
  const view = new VehicleView(null, false, paint, "portrait");
  while (!view.built) view.update(truck, false, paint, onceMore());
  poseAtRest(view, truck);
  hideOutlines(view.root);
  return view;
}

function reach(root: THREE.Object3D): { radius: number; height: number } {
  root.updateMatrixWorld(true);
  let radius = 0;
  let height = 0;
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    box.setFromObject(o);
    radius = Math.max(radius, Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))));
    height = Math.max(height, Math.abs(box.min.y), Math.abs(box.max.y));
  });
  return { radius, height };
}

function cameraFor(radius: number, height: number): THREE.OrthographicCamera {
  const rise = THREE.MathUtils.degToRad(CAMERA.riseDeg);
  const halfWide = radius + CAMERA.margin;
  const halfTall = radius * Math.sin(rise) + height * Math.cos(rise) + CAMERA.margin;
  const camera = new THREE.OrthographicCamera(-halfWide, halfWide, halfTall, -halfTall, 0.1, CAMERA.distance * 2);
  camera.position.set(0, Math.sin(rise) * CAMERA.distance, Math.cos(rise) * CAMERA.distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function litStage(root: THREE.Object3D): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient));
  const key = new THREE.DirectionalLight(0xffffff, LIGHT.key);
  key.position.set(...LIGHT.keyAt);
  scene.add(key);
  scene.add(root);
  return scene;
}

function shot(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Uint8ClampedArray {
  const bytes = new Uint8Array(target.width * target.height * 4);
  withRendererState(renderer, () => {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, bytes);
  });
  const px = new Uint8ClampedArray(bytes.buffer);
  unpremultiply(px);
  linearToSrgb(px);
  flipRows(px, target.width, target.height);
  return px;
}

function croppedYaw(px: Uint8ClampedArray, size: { width: number; height: number }): Yaw {
  const box: PixelBox = boundsOf(px, size);
  const full = canvasOf(px, size);
  const canvas = canvasOfSize(box.width, box.height);
  contextOf(canvas).drawImage(full, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return { canvas, fromCenterX: box.x - size.width / 2, fromCenterY: box.y - size.height / 2 };
}

function renderSet(renderer: THREE.WebGLRenderer, key: string, truck: Vehicle, paint: TruckPaint): SpriteSet {
  const view = builtView(truck, paint);
  try {
    const { radius, height } = reach(view.root);
    const camera = cameraFor(radius, height);
    const size = { width: Math.round((camera.right - camera.left) * BASE_PX_PER_METER), height: Math.round((camera.top - camera.bottom) * BASE_PX_PER_METER) };
    const target = new THREE.WebGLRenderTarget(size.width, size.height, { samples: SAMPLES, depthBuffer: true, stencilBuffer: false });
    const scene = litStage(view.root);
    const yaws: Yaw[] = [];
    try {
      for (let k = 0; k < YAWS; k++) {
        view.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-k * 2 * Math.PI) / YAWS);
        view.root.updateMatrixWorld(true);
        yaws.push(croppedYaw(shot(renderer, target, scene, camera), size));
      }
    } finally {
      scene.remove(view.root);
      target.dispose();
    }
    return new SpriteSet(key, yaws, radius);
  } finally {
    view.dispose();
  }
}

export class TruckIcons {
  private readonly sets = new Map<string, SpriteSet>();
  private readonly made = new Map<string, HTMLCanvasElement>();
  private madeLevel = -1;

  private constructor(private readonly renderer: THREE.WebGLRenderer, private readonly shortestM: number) {}

  static async load(): Promise<TruckIcons> {
    await loadModels();
    await paintSurfaceMasks();
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const shortestM = Math.min(...Object.keys(CHASSIS).map((id) => 2 * spanOf(id).half.x));
    return new TruckIcons(renderer, shortestM);
  }

  setFor(chassisId: string, paint: IconPaint): SpriteSet {
    const truck = truckOf(chassisId, paint);
    const colors = paintOf(truck, paint.player);
    const key = `${chassisId}|${colors.body}|${colors.cab}|${colors.gear}`;
    const known = this.sets.get(key);
    if (known) return known;
    const made = renderSet(this.renderer, key, truck, paint.player);
    this.sets.set(key, made);
    return made;
  }

  pxPerMeter(tileSize: number, shortestPx: number): number {
    return Math.max(tileSize / PHYSICS.metersPerTile, shortestPx / this.shortestM);
  }

  radius(set: SpriteSet, pxPerMeter: number): number {
    return set.radiusM * pxPerMeter;
  }

  draw(ctx: CanvasRenderingContext2D, set: SpriteSet, at: { x: number; y: number }, heading: number, pxPerMeter: number, look: IconLook): void {
    const level = Math.max(0, Math.round(Math.log(BASE_PX_PER_METER / pxPerMeter) / Math.log(LEVEL_STEP)));
    const yaw = set.yawFor(heading);
    const icon = this.iconFor(set, yaw, level, look);
    const scale = pxPerMeter / (BASE_PX_PER_METER / LEVEL_STEP ** level);
    const entry = set.yaws[yaw]!;
    const left = at.x + (entry.fromCenterX / BASE_PX_PER_METER) * pxPerMeter - PAD_PX * scale;
    const top = at.y + (entry.fromCenterY / BASE_PX_PER_METER) * pxPerMeter - PAD_PX * scale;
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
    const levelScale = 1 / LEVEL_STEP ** level;
    const icon = iconOf(scaledTo(set.yaws[yaw]!.canvas, levelScale), look);
    this.made.set(key, icon);
    return icon;
  }
}
