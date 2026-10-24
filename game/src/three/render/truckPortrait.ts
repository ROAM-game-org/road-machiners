import * as THREE from 'three';
import { isShield, partDef, type PartDef } from '../../data/parts';
import { PHYSICS } from '../../data/physics';
import { wheelMounts } from '../../phys/body';
import {
  BODY_ID,
  FIRST_PART_ID,
  OPAQUE_ALPHA,
  PX_PER_METER,
  SUPERSAMPLE,
  TINTS,
  boundsOf,
  centerOf,
  cropOf,
  conditionItems,
  flipRows,
  hiddenOver,
  idsOf,
  indexIds,
  linearToSrgb,
  partMaskOf,
  solidMaskOf,
  tintMask,
  unpremultiply,
  type IdIndex,
  type PixelBox,
  type PixelSize,
  type Tier,
  type TintName,
} from './portraitPixels';
import { cellRect, highestUnder, spanOf, unitBody, unitsOf } from '../../sim/body';
import type { TruckPaint } from '../../data/chassis';
import type { VehicleFrame } from '../../phys/frames';
import { itemCells } from '../../sim/grid';
import type { Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { signatureOf, VehicleView, type RebuildBudget } from './vehicle';
import { withCut, type CutSpec } from './armorCut';

export const PORTRAIT_TILT_DEG = 25;

const LOOK = {
  pxPerMeter: PX_PER_METER,
  supersample: SUPERSAMPLE,
  tiltDeg: PORTRAIT_TILT_DEG,
  cameraDistance: 40,
  depthMargin: 1,
  samples: 4,
  glassModel: 0x2a3438,
  glassMatch: 0.02,
  glassSheen: 0x8aa4b0,
  neutralRed: 0x4a4642,
  redMaxHue: 0.025,
  redMinSaturation: 0.5,
  hiddenSpansM: [0.2, 1.2],
  skyColor: 0xfff4e0,
  groundColor: 0x504030,
  skyIntensity: 1.6,
  sunColor: 0xffffff,
  sunIntensity: 2.2,
  sunAt: [6, 20, -8],
} as const;

const BYTE = 255;
const NOSE_DOWN = new THREE.Vector3(-1, 0, 0);

type PartItem = ReturnType<typeof conditionItems>[number];
type Drawn = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
type Disposable = { dispose(): void };
type Numbering = (partId: string) => number;
type Canvases = { body: HTMLCanvasElement; parts: HTMLCanvasElement };
type Maps = { size: PixelSize; lit: Uint8ClampedArray; ids: Uint16Array; cells: Uint16Array };

export type Glow = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };

export type Portrait = {
  width: number;
  height: number;
  body: HTMLCanvasElement;
  parts: HTMLCanvasElement;
  masks: Map<HTMLCanvasElement, Promise<string>>;
  has(partId: string): boolean;
  partAt(x: number, y: number): string | null;
  centerOf(partId: string): { x: number; y: number };
  glow(partId: string, tier: Tier): Glow;
  footprint(partId: string): Glow;
  release(): void;
};

export type PortraitWait = Promise<unknown> | void;
export type PortraitBuild = { steps: Generator<PortraitWait, Portrait, void>; dispose(): void };
export type BuildPortrait = (renderer: THREE.WebGLRenderer, pristine: Vehicle, playerPaint: TruckPaint) => PortraitBuild;

export const PORTRAIT_STEP_MS = 4;
export const PORTRAIT_KEEP = 8;
const PORTRAIT_JOBS = 2;

export function pristineOf(v: Vehicle): Vehicle {
  const items = conditionItems(v).map((item) => {
    const part = { ...item.part, wear: 0 };
    return { ...item, part: { ...part, hp: maxHp(part) } };
  });
  return { ...v, items };
}

export function chassisSize(chassisId: string): PixelSize {
  const tilt = THREE.MathUtils.degToRad(LOOK.tiltDeg);
  const height = 2 * Math.max(...unitsOf(chassisId).map((u) => u.body.half.y));
  const { half } = spanOf(chassisId);
  return {
    width: 2 * half.z * LOOK.pxPerMeter,
    height: (2 * half.x * Math.cos(tilt) + height * Math.sin(tilt)) * LOOK.pxPerMeter,
  };
}

type Wanted = { vehicleId: string; key: string; pristine: Vehicle; paint: TruckPaint; ahead: boolean };
type Ready = { vehicleId: string; portrait: Portrait; seen: number };
type Job = { wanted: Wanted; build: PortraitBuild; waiting: boolean; failure: { error: unknown } | null };

export class TruckPortraits {
  private readonly ready = new Map<string, Ready>();
  private readonly latest = new Map<string, string>();
  private readonly jobs = new Map<string, Job>();
  private readonly failed = new Set<string>();
  private readonly listeners: ((vehicleId: string) => void)[] = [];
  private order: Wanted[] = [];
  private wantedKeys = new Map<string, string>();
  private tick = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly build: BuildPortrait = startPortrait,
    private readonly now: () => number = () => performance.now(),
  ) {}

  shown(v: Vehicle, playerPaint: TruckPaint): Portrait | null {
    const current = this.ready.get(keyOf(pristineOf(v), playerPaint));
    if (current) return current.portrait;
    const last = this.latest.get(v.id);
    return (last && this.ready.get(last)?.portrait) || null;
  }

  settled(vehicleId: string): boolean {
    const key = this.wantedKeys.get(vehicleId);
    return key !== undefined && this.ready.has(key);
  }

  onReady(listener: (vehicleId: string) => void): void {
    this.listeners.push(listener);
  }

  want(own: readonly Vehicle[], seen: readonly Vehicle[], focusId: string | null, playerPaint: TruckPaint): void {
    const focus = [...own, ...seen].filter((v) => v.id === focusId);
    const ordered = [...own, ...focus, ...seen];
    const taken = new Set<string>();
    this.order = [];
    for (const v of ordered) {
      if (taken.has(v.id)) continue;
      taken.add(v.id);
      const pristine = pristineOf(v);
      const ahead = own.includes(v) || v.id === focusId;
      this.order.push({ vehicleId: v.id, key: keyOf(pristine, playerPaint), pristine, paint: playerPaint, ahead });
    }
    this.wantedKeys = new Map(this.order.map((w) => [w.vehicleId, w.key]));
    this.tick++;
    for (const w of this.order) {
      const known = this.ready.get(w.key);
      if (known) known.seen = this.tick;
    }
    this.dropUnwantedJobs();
    this.dropForgotten();
  }

  step(budgetMs: number, aheadOnly: boolean): void {
    const start = this.now();
    let ran = 0;
    for (;;) {
      if (ran > 0 && this.now() - start >= budgetMs) return;
      const job = this.nextJob(aheadOnly);
      if (!job) return;
      this.advance(job);
      ran++;
    }
  }

  private dropUnwantedJobs(): void {
    for (const [vehicleId, job] of this.jobs) {
      if (this.wantedKeys.get(vehicleId) === job.wanted.key) continue;
      job.build.dispose();
      this.jobs.delete(vehicleId);
    }
  }

  private dropForgotten(): void {
    const away = [...this.ready].filter(([, entry]) => !this.wantedKeys.has(entry.vehicleId));
    const newest = away.sort((a, b) => b[1].seen - a[1].seen);
    for (const [key] of newest.slice(PORTRAIT_KEEP)) this.drop(key);
  }

  private drop(key: string): void {
    const entry = this.ready.get(key);
    if (!entry) return;
    entry.portrait.release();
    this.ready.delete(key);
    if (this.latest.get(entry.vehicleId) === key) this.latest.delete(entry.vehicleId);
  }

  private nextJob(aheadOnly: boolean): Job | null {
    for (const wanted of this.order) {
      if (aheadOnly && !wanted.ahead) continue;
      if (this.ready.has(wanted.key) || this.failed.has(wanted.key)) continue;
      const job = this.jobs.get(wanted.vehicleId);
      if (job) {
        if (!job.waiting) return job;
        continue;
      }
      if (this.jobs.size < PORTRAIT_JOBS) return this.start(wanted);
    }
    return null;
  }

  private start(wanted: Wanted): Job {
    const job: Job = { wanted, build: this.build(this.renderer, wanted.pristine, wanted.paint), waiting: false, failure: null };
    this.jobs.set(wanted.vehicleId, job);
    return job;
  }

  private advance(job: Job): void {
    if (job.failure) return this.fail(job, job.failure.error);
    let result: IteratorResult<PortraitWait, Portrait>;
    try {
      result = job.build.steps.next();
    } catch (error) {
      return this.fail(job, error);
    }
    if (result.done) return this.finish(job, result.value);
    if (result.value) this.wait(job, result.value);
  }

  private wait(job: Job, pending: Promise<unknown>): void {
    job.waiting = true;
    pending.then(
      () => {
        job.waiting = false;
      },
      (error: unknown) => {
        job.failure = { error };
        job.waiting = false;
      },
    );
  }

  private fail(job: Job, error: unknown): never {
    this.failed.add(job.wanted.key);
    this.jobs.delete(job.wanted.vehicleId);
    job.build.dispose();
    throw error;
  }

  private finish(job: Job, portrait: Portrait): void {
    const { vehicleId, key } = job.wanted;
    this.jobs.delete(vehicleId);
    job.build.dispose();
    for (const [other, entry] of this.ready) if (entry.vehicleId === vehicleId) this.drop(other);
    this.ready.set(key, { vehicleId, portrait, seen: this.tick });
    this.latest.set(vehicleId, key);
    for (const listener of this.listeners) listener(vehicleId);
  }
}

function keyOf(pristine: Vehicle, playerPaint: TruckPaint): string {
  return `${pristine.id}|${signatureOf(pristine, playerPaint)}`;
}

function drawnMeshes(root: THREE.Object3D): Drawn[] {
  const meshes: Drawn[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible && !o.userData.outline) meshes.push(o as Drawn);
  });
  return meshes;
}

function hideOutlines(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.outline) o.visible = false;
  });
}

function poseAtRest(view: VehicleView, v: Vehicle): void {
  const rest = (unit: number) => wheelMounts(unitBody(v.chassisId, unit), unit).map(() => ({ steer: 0, spin: 0, suspension: PHYSICS.truck.suspensionRest, ground: true }));
  const units = unitsOf(v.chassisId);
  const frame: VehicleFrame = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels: rest(0) };
  if (units[1]) frame.rear = { pos: { x: units[1].offset, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, wheels: rest(1) };
  view.pose(frame, 0);
  view.root.updateMatrixWorld(true);
}

const GLASS = new THREE.Color(LOOK.glassModel);

export function glassMeshes(meshes: Drawn[]): Drawn[] {
  return meshes.filter((m) => {
    const color = (m.material as THREE.Material & { color?: THREE.Color }).color;
    return m.material instanceof THREE.MeshLambertMaterial && color && Math.abs(color.r - GLASS.r) + Math.abs(color.g - GLASS.g) + Math.abs(color.b - GLASS.b) <= LOOK.glassMatch;
  });
}

function sheenGlass(meshes: Drawn[]): void {
  const glass = glassMeshes(meshes);
  if (glass.length === 0) throw new Error('No glass mesh found to tint');
  for (const mesh of glass) (mesh.material as THREE.MeshLambertMaterial).color.setHex(LOOK.glassSheen);
}

function isRed(color: THREE.Color): boolean {
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 });
  return Math.min(hsl.h, 1 - hsl.h) <= LOOK.redMaxHue && hsl.s >= LOOK.redMinSaturation;
}

export function neutralizeReds(meshes: Drawn[], trash: Disposable[]): void {
  for (const mesh of meshes) {
    const color = (mesh.material as THREE.Material & { color?: THREE.Color }).color;
    if (!color || !isRed(color)) continue;
    if (mesh.userData.armor) {
      color.setHex(LOOK.neutralRed);
      continue;
    }
    const own = mesh.material.clone() as THREE.Material & { color: THREE.Color };
    own.color.setHex(LOOK.neutralRed);
    mesh.material = own;
    trash.push(own);
  }
}

function litScene(root: THREE.Object3D): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(LOOK.skyColor, LOOK.groundColor, LOOK.skyIntensity));
  const sun = new THREE.DirectionalLight(LOOK.sunColor, LOOK.sunIntensity);
  sun.position.set(...LOOK.sunAt);
  scene.add(sun);
  scene.add(root);
  return scene;
}

function cameraBounds(meshes: Drawn[], camera: THREE.Camera): THREE.Box3 {
  const bounds = new THREE.Box3();
  const p = new THREE.Vector3();
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) bounds.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse));
  }
  return bounds;
}

function settledCamera(meshes: Drawn[]): { camera: THREE.OrthographicCamera; size: PixelSize } {
  const tilt = THREE.MathUtils.degToRad(LOOK.tiltDeg);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.set(Math.sin(tilt) * LOOK.cameraDistance, Math.cos(tilt) * LOOK.cameraDistance, 0);
  camera.up.copy(NOSE_DOWN);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const bounds = cameraBounds(meshes, camera);
  camera.left = bounds.min.x;
  camera.right = bounds.max.x;
  camera.top = bounds.max.y;
  camera.bottom = bounds.min.y;
  camera.near = -bounds.max.z - LOOK.depthMargin;
  camera.far = -bounds.min.z + LOOK.depthMargin;
  camera.updateProjectionMatrix();
  const pxPerMeter = LOOK.pxPerMeter * LOOK.supersample;
  return { camera, size: { width: Math.round((bounds.max.x - bounds.min.x) * pxPerMeter), height: Math.round((bounds.max.y - bounds.min.y) * pxPerMeter) } };
}

function withRendererState<T>(renderer: THREE.WebGLRenderer, run: () => T): T {
  const target = renderer.getRenderTarget();
  const color = renderer.getClearColor(new THREE.Color());
  const alpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear;
  try {
    return run();
  } finally {
    renderer.setRenderTarget(target);
    renderer.setClearColor(color, alpha);
    renderer.autoClear = autoClear;
  }
}

function targetFor(size: PixelSize, samples: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(size.width, size.height, { samples, depthBuffer: true, stencilBuffer: false });
}

function* captureRaw(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Generator<PortraitWait, Uint8ClampedArray, void> {
  const bytes = new Uint8Array(target.width * target.height * 4);
  yield withRendererState(renderer, () => {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    return renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, bytes);
  });
  return new Uint8ClampedArray(bytes.buffer);
}

function* captureColor(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Generator<PortraitWait, Uint8ClampedArray, void> {
  const px = yield* captureRaw(renderer, target, scene, camera);
  unpremultiply(px);
  linearToSrgb(px);
  flipRows(px, target.width, target.height);
  return px;
}

function* captureIds(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Generator<PortraitWait, Uint16Array, void> {
  const ids = idsOf(yield* captureRaw(renderer, target, scene, camera));
  flipRows(ids, target.width, target.height);
  return ids;
}

function canvasOf(px: Uint8ClampedArray, size: PixelSize): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d canvas context for the truck portrait');
  ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, size.width, size.height), 0, 0);
  return canvas;
}

function idColor(id: number): THREE.Color {
  return new THREE.Color().setRGB((id & BYTE) / BYTE, (id >> 8) / BYTE, 0, THREE.LinearSRGBColorSpace);
}

function paintAsId(mesh: Drawn, id: number): void {
  const flat = new THREE.MeshBasicMaterial({ color: idColor(id), side: mesh.material.side });
  const cut: CutSpec | undefined = mesh.userData.cut;
  mesh.material = cut ? withCut(flat, cut) : flat;
}

function paintIds(meshes: Drawn[], idOfMesh: (mesh: Drawn) => number): void {
  for (const mesh of meshes) paintAsId(mesh, idOfMesh(mesh));
}

type Heights = { min: number; max: number };
type Column = { boxOf: (item: PartItem) => THREE.Box3; depthTest: boolean };

function widened(lo: number, hi: number, span: number): [number, number] {
  const pad = Math.max(0, span - (hi - lo)) / 2;
  return [lo - pad, hi + pad];
}

function cellBox(v: Vehicle, item: PartItem, span: number, height: Heights): THREE.Box3 {
  const rect = cellRect(v.chassisId, itemCells(item));
  const offset = unitsOf(v.chassisId)[rect.unit].offset;
  const [x0, x1] = widened(rect.x0, rect.x1, span);
  const [z0, z1] = widened(rect.z0, rect.z1, span);
  return new THREE.Box3(new THREE.Vector3(x0 + offset, height.min, z0), new THREE.Vector3(x1 + offset, height.max, z1));
}

function footprintColumn(item: PartItem, id: number, column: Column, trash: Disposable[]): THREE.Mesh {
  const box = column.boxOf(item);
  const size = box.getSize(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const material = new THREE.MeshBasicMaterial({ color: idColor(id), side: THREE.DoubleSide, depthTest: column.depthTest });
  trash.push(geometry, material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(box.getCenter(new THREE.Vector3()));
  return mesh;
}

function footprintScene(items: PartItem[], numberOf: Numbering, column: Column, trash: Disposable[]): THREE.Scene {
  const scene = new THREE.Scene();
  for (const item of items) scene.add(footprintColumn(item, numberOf(item.part.id), column, trash));
  return scene;
}

function isCab(def: PartDef): boolean {
  return def.kind === 'core' && def.role === 'cab';
}

function partKind(item: PartItem): 'wheel' | 'armor' | 'other' {
  const def = partDef(item.part.defId);
  if (isShield(def)) return 'armor';
  return def.kind === 'core' && def.role === 'wheel' ? 'wheel' : 'other';
}

function tintOf(kind: ReturnType<typeof partKind>, tier: Tier): TintName | null {
  if (tier !== 'ok') return tier;
  if (kind === 'wheel') return 'tire';
  return kind === 'armor' ? 'steel' : null;
}

function numbering(): Numbering {
  const numbers = new Map<string, number>();
  return (partId) => {
    const known = numbers.get(partId);
    if (known !== undefined) return known;
    const next = FIRST_PART_ID + numbers.size;
    numbers.set(partId, next);
    return next;
  };
}

function partOnly(v: Vehicle): (mesh: Drawn) => boolean {
  const cabs = new Set(v.items.flatMap((it) => (it.kind === 'part' && isCab(partDef(it.part.defId)) ? [it.part.id] : [])));
  return (mesh) => Boolean(mesh.userData.partId) && !cabs.has(mesh.userData.partId);
}

function checkCovered(v: Vehicle, items: PartItem[], index: IdIndex, numberOf: Numbering): void {
  for (const item of items) {
    if (!index.get(numberOf(item.part.id))?.lit) throw new Error(`Part ${item.part.id} (${item.part.defId}) on ${v.chassisId} has no pixels in the truck portrait`);
  }
}

function pixelIndex(size: PixelSize, x: number, y: number): number | null {
  const px = Math.floor(x * LOOK.supersample);
  const py = Math.floor(y * LOOK.supersample);
  const outside = px < 0 || py < 0 || px >= size.width || py >= size.height;
  return outside ? null : py * size.width + px;
}

function glowOf(mask: Uint8ClampedArray, from: PixelBox): Glow {
  const box = boundsOf(mask, from);
  const k = LOOK.supersample;
  return { canvas: canvasOf(cropOf(mask, from, box), box), x: (from.x + box.x) / k, y: (from.y + box.y) / k, width: box.width / k, height: box.height / k };
}

type Indexes = { ids: IdIndex; cells: IdIndex };

function revoked(masks: Map<HTMLCanvasElement, Promise<string>>): void {
  for (const url of masks.values()) void url.then((href) => URL.revokeObjectURL(href));
  masks.clear();
}

function portraitOver(v: Vehicle, items: PartItem[], maps: Maps, index: Indexes, numberOf: Numbering, canvases: Canvases): Portrait {
  const { size, lit, ids, cells } = maps;
  const itemOf = new Map(items.map((item) => [item.part.id, item]));
  const partOfNumber = new Map(items.map((item) => [numberOf(item.part.id), item.part.id]));
  const glows = new Map<string, { tier: Tier; glow: Glow }>();
  const footprints = new Map<string, Glow>();
  const centers = new Map<string, { x: number; y: number }>();
  const masks = new Map<HTMLCanvasElement, Promise<string>>();
  const known = (partId: string): PartItem => {
    const item = itemOf.get(partId);
    if (!item) throw new Error(`Portrait of ${v.id} has no readout part ${partId}`);
    return item;
  };
  const entryOf = (found: IdIndex, id: number) => {
    const entry = found.get(id);
    if (!entry) throw new Error('No lit pixels to bound');
    return entry;
  };
  return {
    width: size.width / LOOK.supersample,
    height: size.height / LOOK.supersample,
    ...canvases,
    masks,
    has: (partId) => itemOf.has(partId),
    partAt(x, y) {
      const at = pixelIndex(size, x, y);
      if (at === null) return null;
      return partOfNumber.get(ids[at]) ?? partOfNumber.get(cells[at]) ?? null;
    },
    footprint(partId) {
      const cached = footprints.get(partId);
      if (cached) return cached;
      const id = numberOf(known(partId).part.id);
      const solid = index.cells.get(id);
      const own = entryOf(index.ids, id).box;
      const footprint = solid ? glowOf(solidMaskOf(cells, size, id, solid.box), solid.box) : glowOf(partMaskOf(lit, ids, size, id, own), own);
      footprints.set(partId, footprint);
      return footprint;
    },
    centerOf(partId) {
      const cached = centers.get(partId);
      if (cached) return cached;
      const id = numberOf(known(partId).part.id);
      const c = centerOf(ids, size, id, index.ids.get(id));
      const center = { x: c.x / LOOK.supersample, y: c.y / LOOK.supersample };
      centers.set(partId, center);
      return center;
    },
    glow(partId, tier) {
      const cached = glows.get(partId);
      if (cached?.tier === tier) return cached.glow;
      const id = numberOf(known(partId).part.id);
      const box = entryOf(index.ids, id).box;
      const mask = partMaskOf(lit, ids, size, id, box);
      const tint = tintOf(partKind(known(partId)), tier);
      const glow = glowOf(tint ? tintMask(mask, TINTS[tint]) : mask, box);
      glows.set(partId, { tier, glow });
      return glow;
    },
    release: () => revoked(masks),
  };
}

type Pass = { renderer: THREE.WebGLRenderer; smooth: THREE.WebGLRenderTarget; flat: THREE.WebGLRenderTarget; camera: THREE.Camera };

function* captureParts(pass: Pass, view: VehicleView, meshes: Drawn[], isPart: (mesh: Drawn) => boolean, trash: Disposable[]): Generator<PortraitWait, Uint8ClampedArray, void> {
  const occluder = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending });
  trash.push(occluder);
  const originals = new Map(meshes.map((m) => [m, m.material]));
  hideOutlines(view.root);
  for (const mesh of meshes.filter((m) => !isPart(m))) {
    if (mesh.material.transparent) mesh.visible = false;
    else mesh.material = occluder;
  }
  const parts = yield* captureColor(pass.renderer, pass.smooth, litScene(view.root), pass.camera);
  for (const [mesh, material] of originals) mesh.material = material;
  return parts;
}

function* capturePartIds(pass: Pass, view: VehicleView, v: Vehicle, solid: Drawn[], isPart: (mesh: Drawn) => boolean, numberOf: Numbering, trash: Disposable[], cabs: CabSpan[]): Generator<PortraitWait, Uint16Array, void> {
  paintIds(solid, (m) => (isPart(m) ? numberOf(m.userData.partId) : BODY_ID));
  paintCabs(solid, cabs, numberOf);
  const scene = new THREE.Scene();
  scene.add(view.root);
  let ids = yield* captureIds(pass.renderer, pass.flat, scene, pass.camera);
  yield;
  for (const span of LOOK.hiddenSpansM) {
    const seen = new Set(ids);
    const hidden = conditionItems(v).filter((item) => !seen.has(numberOf(item.part.id)));
    if (hidden.length === 0) return ids;
    const heightOf = heightsOf(v, solid);
    const column = { boxOf: (item: PartItem) => cellBox(v, item, span, heightOf(item)), depthTest: false };
    ids = hiddenOver(ids, yield* captureIds(pass.renderer, pass.flat, footprintScene(hidden, numberOf, column, trash), pass.camera));
    yield;
  }
  return ids;
}

function* captureCellIds(pass: Pass, v: Vehicle, solid: Drawn[], numberOf: Numbering, trash: Disposable[]): Generator<PortraitWait, Uint16Array, void> {
  const column = { boxOf: deckBoxesOf(v, solid), depthTest: true };
  return yield* captureIds(pass.renderer, pass.flat, footprintScene(conditionItems(v), numberOf, column, trash), pass.camera);
}

const CAB_SPAN_VERTEX = 'vCabX = (modelMatrix * vec4(transformed, 1.0)).x;';
const CAB_SPAN_FRAGMENT = 'if (vCabX >= cabFrom && vCabX <= cabTo) diffuseColor.rgb = cabColor;';

function cabSpanMaterial(side: THREE.Side, cab: number, from: number, to: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: idColor(BODY_ID), side });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { cabFrom: { value: from }, cabTo: { value: to }, cabColor: { value: idColor(cab) } });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCabX;').replace('#include <project_vertex>', `#include <project_vertex>\n${CAB_SPAN_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCabX;\nuniform float cabFrom;\nuniform float cabTo;\nuniform vec3 cabColor;').replace('#include <color_fragment>', `#include <color_fragment>\n${CAB_SPAN_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'cab-span';
  return material;
}

type CabSpan = { partId: string; span: THREE.Box3 };

function cabSpans(v: Vehicle, glass: Drawn[]): CabSpan[] {
  return conditionItems(v).filter((item) => isCab(partDef(item.part.defId))).map((item) => {
    const span = cellBox(v, item, 0, { min: 0, max: 0 });
    for (const mesh of glass) if (mesh.userData.partId === item.part.id) span.union(new THREE.Box3().setFromObject(mesh));
    return { partId: item.part.id, span };
  });
}

function paintCabs(solid: Drawn[], cabs: CabSpan[], numberOf: Numbering): void {
  for (const { partId, span } of cabs) {
    for (const mesh of solid) if (mesh.userData.partId === partId) mesh.material = cabSpanMaterial(mesh.material.side, numberOf(partId), span.min.x, span.max.x);
  }
}

function deckBoxesOf(v: Vehicle, solid: Drawn[]): (item: PartItem) => THREE.Box3 {
  const heightOf = heightsOf(v, solid);
  return (item) => {
    const drawn = heightOf(item);
    const deck = highestUnder(v.chassisId, cellRect(v.chassisId, itemCells(item)));
    const floor = Number.isFinite(deck) ? deck : drawn.min;
    const box = cellBox(v, item, 0, { min: floor, max: Math.max(floor, drawn.max) });
    const own = partKind(item) === 'armor' ? ownBox(solid, item.part.id) : null;
    return own ? box.union(own) : box;
  };
}

function ownBox(solid: Drawn[], partId: string): THREE.Box3 | null {
  const own = solid.filter((mesh) => mesh.userData.partId === partId);
  if (own.length === 0) return null;
  const box = new THREE.Box3();
  for (const mesh of own) box.expandByObject(mesh);
  return box;
}

function heightsOf(v: Vehicle, solid: Drawn[]): (item: PartItem) => Heights {
  return (item) => {
    const own = ownBox(solid, item.part.id);
    if (own) return { min: own.min.y, max: own.max.y };
    const top = highestUnder(v.chassisId, cellRect(v.chassisId, itemCells(item)));
    if (!Number.isFinite(top)) throw new Error(`Hidden part ${item.part.id} on ${v.chassisId} has no body surface over its cells`);
    return { min: top, max: top };
  };
}

function* composePortrait(renderer: THREE.WebGLRenderer, view: VehicleView, v: Vehicle, trash: Disposable[]): Generator<PortraitWait, Portrait, void> {
  poseAtRest(view, v);
  const meshes = drawnMeshes(view.root);
  const cabs = cabSpans(v, glassMeshes(meshes));
  sheenGlass(meshes);
  neutralizeReds(meshes, trash);
  const { camera, size } = settledCamera(meshes);
  const pass = { renderer, camera, smooth: targetFor(size, LOOK.samples), flat: targetFor(size, 0) };
  trash.push(pass.smooth, pass.flat);
  yield;
  const lit = yield* captureColor(renderer, pass.smooth, litScene(view.root), camera);
  yield;
  const isPart = partOnly(v);
  const parts = yield* captureParts(pass, view, meshes, isPart, trash);
  yield;
  const numberOf = numbering();
  const items = conditionItems(v);
  for (const item of items) numberOf(item.part.id);
  const solid = meshes.filter((m) => m.visible);
  const ids = yield* capturePartIds(pass, view, v, solid, isPart, numberOf, trash, cabs);
  const cells = yield* captureCellIds(pass, v, solid, numberOf, trash);
  yield;
  const index = { ids: indexIds(ids, size, lit), cells: indexIds(cells, size) };
  checkCovered(v, items, index.ids, numberOf);
  return portraitOver(v, items, { size, lit, ids, cells }, index, numberOf, { body: canvasOf(lit, size), parts: canvasOf(parts, size) });
}

function oneStep(): RebuildBudget {
  let spent = false;
  return { take: () => !spent && (spent = true), ready: () => true };
}

function* portraitSteps(renderer: THREE.WebGLRenderer, view: VehicleView, pristine: Vehicle, playerPaint: TruckPaint, trash: Disposable[]): Generator<PortraitWait, Portrait, void> {
  while (!view.built) {
    view.update(pristine, false, playerPaint, oneStep());
    yield;
  }
  return yield* composePortrait(renderer, view, pristine, trash);
}

export function startPortrait(renderer: THREE.WebGLRenderer, pristine: Vehicle, playerPaint: TruckPaint): PortraitBuild {
  const view = new VehicleView(null, false, playerPaint, 'portrait');
  const trash: Disposable[] = [];
  return {
    steps: portraitSteps(renderer, view, pristine, playerPaint, trash),
    dispose() {
      view.dispose();
      for (const item of trash) if (!(item instanceof THREE.Material)) item.dispose();
    },
  };
}
