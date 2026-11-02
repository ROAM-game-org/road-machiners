import * as THREE from 'three';
import { loadModels, paintSurfaceMasks } from './render/models';
import { boundsOf, flipRows, linearToSrgb, unpremultiply } from './render/portraitPixels';
import { canvasOf, hideOutlines, poseAtRest, withRendererState } from './render/truckPortrait';
import { VehicleView, type RebuildBudget } from './render/vehicle';
import { CHASSIS, type TruckPaint } from '../data/chassis';
import type { Vehicle } from '../sim/types';
import { SPRITES, spritePlan, truckOf, type SpriteCell, type SpriteEntry, type SpriteManifest, type SpriteWant } from './sim-sprite-plan';

declare global {
  interface Window {
    __SIM_SPRITES__?: { files: Record<string, string>; manifest: SpriteManifest };
    __SIM_SPRITES_ERROR__?: string;
  }
}

const CAMERA = { riseDeg: 35, distance: 60, margin: 0.2 };
const LIGHT = { ambient: 2.5, key: 1.5, keyAt: [-4, 8, 6] as const };
const SUPERSAMPLE = 3;
const SAMPLES = 4;
const WEBP_QUALITY = 0.92;

type Frame = { canvas: HTMLCanvasElement; fromCenterX: number; fromCenterY: number };

function canvasOfSize(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

function onceMore(): RebuildBudget {
  let spent = false;
  return { take: () => !spent && (spent = true), ready: () => true };
}

function builtView(truck: Vehicle, paint: TruckPaint): VehicleView {
  const view = new VehicleView(null, false, paint, 'portrait');
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

function cameraFor(radius: number, height: number): { camera: THREE.OrthographicCamera; small: { width: number; height: number } } {
  const rise = THREE.MathUtils.degToRad(CAMERA.riseDeg);
  const small = {
    width: Math.ceil(2 * (radius + CAMERA.margin) * SPRITES.pxPerMeter),
    height: Math.ceil(2 * (radius * Math.sin(rise) + height * Math.cos(rise) + CAMERA.margin) * SPRITES.pxPerMeter),
  };
  const halfWide = small.width / SPRITES.pxPerMeter / 2;
  const halfTall = small.height / SPRITES.pxPerMeter / 2;
  const camera = new THREE.OrthographicCamera(-halfWide, halfWide, halfTall, -halfTall, 0.1, CAMERA.distance * 2);
  camera.position.set(0, Math.sin(rise) * CAMERA.distance, Math.cos(rise) * CAMERA.distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return { camera, small };
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

function croppedFrame(px: Uint8ClampedArray, big: { width: number; height: number }, small: { width: number; height: number }): Frame {
  const reduced = canvasOfSize(small.width, small.height);
  contextOf(reduced).drawImage(canvasOf(px, big), 0, 0, small.width, small.height);
  const box = boundsOf(contextOf(reduced).getImageData(0, 0, small.width, small.height).data, small);
  const canvas = canvasOfSize(box.width, box.height);
  contextOf(canvas).drawImage(reduced, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return { canvas, fromCenterX: box.x - small.width / 2, fromCenterY: box.y - small.height / 2 };
}

function frames(renderer: THREE.WebGLRenderer, want: SpriteWant): { frames: Frame[]; radius: number } {
  const truck = truckOf(want.chassisId, want.paint);
  const view = builtView(truck, want.paint.player);
  try {
    const { radius, height } = reach(view.root);
    const { camera, small } = cameraFor(radius, height);
    const big = { width: small.width * SUPERSAMPLE, height: small.height * SUPERSAMPLE };
    const target = new THREE.WebGLRenderTarget(big.width, big.height, { samples: SAMPLES, depthBuffer: true, stencilBuffer: false });
    const scene = litStage(view.root);
    const out: Frame[] = [];
    try {
      for (let k = 0; k < SPRITES.yaws; k++) {
        view.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-k * 2 * Math.PI) / SPRITES.yaws);
        view.root.updateMatrixWorld(true);
        out.push(croppedFrame(shot(renderer, target, scene, camera), big, small));
      }
    } finally {
      scene.remove(view.root);
      target.dispose();
    }
    return { frames: out, radius };
  } finally {
    view.dispose();
  }
}

function sheetOf(list: readonly Frame[]): { sheet: HTMLCanvasElement; cells: SpriteCell[] } {
  const cellW = Math.max(...list.map((f) => f.canvas.width));
  const cellH = Math.max(...list.map((f) => f.canvas.height));
  const rows = Math.ceil(list.length / SPRITES.cellsAcross);
  const sheet = canvasOfSize(cellW * SPRITES.cellsAcross, cellH * rows);
  const ctx = contextOf(sheet);
  const cells = list.map((f, i) => {
    const x = (i % SPRITES.cellsAcross) * cellW;
    const y = Math.floor(i / SPRITES.cellsAcross) * cellH;
    ctx.drawImage(f.canvas, x, y);
    return { x, y, w: f.canvas.width, h: f.canvas.height, fromCenterX: f.fromCenterX, fromCenterY: f.fromCenterY };
  });
  return { sheet, cells };
}

async function bakeAll(): Promise<{ files: Record<string, string>; manifest: SpriteManifest }> {
  await loadModels();
  await paintSurfaceMasks();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const files: Record<string, string> = {};
  const sprites: Record<string, SpriteEntry> = {};
  for (const want of spritePlan()) {
    const { frames: list, radius } = frames(renderer, want);
    const { sheet, cells } = sheetOf(list);
    const file = `${want.key}.webp`;
    files[file] = sheet.toDataURL('image/webp', WEBP_QUALITY);
    sprites[want.key] = { file, radiusM: Math.round(radius * 100) / 100, cells };
  }
  renderer.dispose();
  return { files, manifest: { yaws: SPRITES.yaws, pxPerMeter: SPRITES.pxPerMeter, chassis: Object.keys(CHASSIS).sort(), sprites } };
}

export function runSimSprites(): void {
  bakeAll().then(
    (result) => {
      window.__SIM_SPRITES__ = result;
    },
    (e: unknown) => {
      window.__SIM_SPRITES_ERROR__ = e instanceof Error ? (e.stack ?? e.message) : String(e);
    },
  );
}
