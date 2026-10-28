import * as THREE from 'three';
import type { TruckPaint } from '../../data/chassis';
import { partDef } from '../../data/parts';
import { paintOf } from '../../render/palette';
import { wearLookStep } from '../../render/partLooks';
import { cellSteps, spanOf, unitOfCells } from '../../sim/body';
import { baseGrid, isMounted, itemCells, layerOf, mountCellsOf, mountSpots, type Spot } from '../../sim/grid';
import type { GridItem, PartInstance, Vehicle } from '../../sim/types';
import { OPAQUE_ALPHA, flipRows, linearToSrgb, unpremultiply } from './portraitPixels';
import { canvasOf, captureColor, glassMeshes, hideOutlines, litScene, neutralizeReds, poseAtRest, sheenGlass, withRendererState, type PortraitWait } from './truckPortrait';
import { restGunOf, VehicleView, type RebuildBudget } from './vehicle';
import { gunStack } from './gunStack';
import { baseModel } from '../../render/partLooks';
import { model } from './models';

export const GARAGE_PX_PER_METER = 128;
export const GARAGE_MAX_SIDE = 2048;
export const GARAGE_STEP_MS = 4;
const SAMPLES = 4;
export const BODY_PAD_M = 0.05;
const SPRITE_PAD_M = 0.06;
const CAMERA_HEIGHT = 40;
const KEEP_SPRITES = 4000;
const KEEP_LAYOUTS = 200;
const NO_LEVELS: ReadonlyMap<string, number> = new Map();

export type GarageSprite = { url: string; left: number; top: number; width: number; height: number };

const NOTHING_DRAWN: GarageSprite = { url: '', left: 0, top: 0, width: 0, height: 0 };
export type GarageBody = { image: GarageSprite; cores: ReadonlyMap<string, GarageSprite> };
export type GaragePart = { part: PartInstance; spots: readonly Spot[] };
export type GarageNeed = { truck: Vehicle; paint: TruckPaint; parts: readonly GaragePart[] };

type PartItem = Extract<GridItem, { kind: 'part' }>;
type Drawn = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
type Placement = { item: PartItem; key: string; loose: string };
type BodyJob = { kind: 'body'; key: string; chassisId: string; truck: Vehicle; paint: TruckPaint };
type BatchJob = { kind: 'batch'; chassisId: string; truck: Vehicle; paint: TruckPaint; placements: Placement[] };
export type GarageJob = BodyJob | BatchJob;
type Running = { job: GarageJob; steps: Generator<PortraitWait, void, void>; waiting: Promise<unknown> | null; failure: { error: unknown } | null; dispose: () => void };
export type Frame = { left: number; right: number; top: number; bottom: number };

export function isCore(part: PartInstance): boolean {
  return partDef(part.defId).kind === 'core';
}

function isCab(part: PartInstance): boolean {
  const def = partDef(part.defId);
  return def.kind === 'core' && def.role === 'cab';
}

function paintKey(truck: Vehicle, paint: TruckPaint): string {
  const colors = paintOf(truck, paint);
  return `${colors.body}|${colors.cab}|${colors.gear}`;
}

function partLook(part: PartInstance): string {
  return `${part.defId}#${part.id}:${wearLookStep(part)}`;
}

export function coreItems(truck: Vehicle): PartItem[] {
  return truck.items.filter((it): it is PartItem => it.kind === 'part' && isCore(it.part) && itemCells(it).every((c) => c.y < baseGrid(truck.chassisId).h));
}

export function bodyKey(truck: Vehicle, paint: TruckPaint): string {
  const cores = coreItems(truck).map((it) => `${partLook(it.part)}@${it.x},${it.y},${it.rot}`);
  return `${truck.chassisId}|${paintKey(truck, paint)}|${cores.join(',')}`;
}

export function spriteKey(truck: Vehicle, paint: TruckPaint, part: PartInstance, spot: Spot): string {
  return `${truck.chassisId}|${paintKey(truck, paint)}|${partLook(part)}@${spot.x},${spot.y},${spot.rot}`;
}

function looseKey(chassisId: string, part: PartInstance, spot: Spot): string {
  return `${chassisId}|${part.id}@${spot.x},${spot.y},${spot.rot}`;
}

function placedItem(part: PartInstance, spot: Spot): PartItem {
  return { id: `garage-${part.id}`, kind: 'part', part, x: spot.x, y: spot.y, rot: spot.rot };
}

export function mountSpotsOf(chassisId: string, part: PartInstance, cores: readonly GridItem[] = []): Spot[] {
  const def = partDef(part.defId);
  if (def.kind === 'core') return [];
  return mountSpots(baseGrid(chassisId), [...cores], placedItem(part, { x: 0, y: 0, rot: 0 }), mountCellsOf(def.id));
}

function cellsTaken(chassisId: string, items: readonly PartItem[], item: PartItem): boolean {
  const g = baseGrid(chassisId);
  const layer = layerOf(g, item);
  const mine = new Set(itemCells(item).map((c) => `${c.x},${c.y}`));
  return items.some((other) => layerOf(g, other) === layer && itemCells(other).some((c) => mine.has(`${c.x},${c.y}`)));
}

export function packPlacements(chassisId: string, placements: readonly Placement[]): Placement[][] {
  const batches: Placement[][] = [];
  for (const placement of placements) {
    const fits = (batch: Placement[]) => batch.every((p) => p.item.part.id !== placement.item.part.id) && !cellsTaken(chassisId, batch.map((p) => p.item), placement.item);
    const batch = batches.find(fits);
    if (batch) batch.push(placement);
    else batches.push([placement]);
  }
  return batches;
}

export function gridOrigin(chassisId: string): { x: number; z: number } {
  const { center, half } = spanOf(chassisId);
  return { x: center + half.x, z: -half.z - cellSteps(chassisId).col };
}

function drawnMeshes(root: THREE.Object3D): Drawn[] {
  const out: Drawn[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible && !o.userData.outline) out.push(o as Drawn);
  });
  return out;
}

function frameOf(meshes: readonly Drawn[], pad: number): Frame | null {
  const box = new THREE.Box3();
  for (const mesh of meshes) box.expandByObject(mesh);
  if (box.isEmpty()) return null;
  return { left: box.min.z - pad, right: box.max.z + pad, top: box.max.x + pad, bottom: box.min.x - pad };
}

function snapped(frame: Frame, origin: { x: number; z: number }): Frame {
  const px = (m: number) => m * GARAGE_PX_PER_METER;
  const m = (p: number) => p / GARAGE_PX_PER_METER;
  return {
    left: origin.z + m(Math.floor(px(frame.left - origin.z))),
    right: origin.z + m(Math.ceil(px(frame.right - origin.z))),
    top: origin.x - m(Math.floor(px(origin.x - frame.top))),
    bottom: origin.x - m(Math.ceil(px(origin.x - frame.bottom))),
  };
}

function topCamera(frame: Frame): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(frame.left, frame.right, frame.top, frame.bottom, 0.1, CAMERA_HEIGHT * 2);
  camera.position.set(0, CAMERA_HEIGHT, 0);
  camera.up.set(1, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function encoded(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('A garage render could not be encoded')))));
}

type Pass = { renderer: THREE.WebGLRenderer; occluder: THREE.Material; now: boolean };

function readNow(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Uint8ClampedArray {
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

function hasPixels(px: Uint8ClampedArray): boolean {
  for (let i = 3; i < px.length; i += 4) if (px[i] > OPAQUE_ALPHA) return true;
  return false;
}

export function shotSize(frame: Frame): { width: number; height: number } {
  const widthM = frame.right - frame.left;
  const heightM = frame.top - frame.bottom;
  const pxPerMeter = Math.min(GARAGE_PX_PER_METER, GARAGE_MAX_SIDE / Math.max(widthM, heightM));
  return { width: Math.round(widthM * pxPerMeter), height: Math.round(heightM * pxPerMeter) };
}

function* shoot(pass: Pass, root: THREE.Object3D, frame: Frame, origin: { x: number; z: number }): Generator<PortraitWait, GarageSprite, void> {
  const size = shotSize(frame);
  const target = new THREE.WebGLRenderTarget(size.width, size.height, { samples: SAMPLES, depthBuffer: true, stencilBuffer: false });
  const box = { left: frame.left - origin.z, top: origin.x - frame.top, width: frame.right - frame.left, height: frame.top - frame.bottom };
  const scene = litScene(root);
  try {
    const px = pass.now ? readNow(pass.renderer, target, scene, topCamera(frame)) : yield* captureColor(pass.renderer, target, scene, topCamera(frame));
    if (!hasPixels(px)) return { url: '', ...box };
    if (pass.now) return { url: canvasOf(px, size).toDataURL(), ...box };
    let url = '';
    yield encoded(canvasOf(px, size)).then((made) => (url = made));
    return { url, ...box };
  } finally {
    scene.remove(root);
    target.dispose();
  }
}

function* alone(pass: Pass, view: VehicleView, meshes: readonly Drawn[], partId: string, origin: { x: number; z: number }, mates: ReadonlySet<string> = new Set()): Generator<PortraitWait, GarageSprite | null, void> {
  const own = meshes.filter((m) => m.userData.partId === partId);
  const frame = frameOf(own, SPRITE_PAD_M);
  if (!frame) return null;
  const originals = meshes.map((m) => [m, m.material, m.visible] as const);
  for (const mesh of meshes) {
    if (mesh.userData.partId === partId) continue;
    if (mesh.material.transparent || mates.has(mesh.userData.partId)) mesh.visible = false;
    else mesh.material = pass.occluder;
  }
  try {
    return yield* shoot(pass, view.root, snapped(frame, origin), origin);
  } finally {
    for (const [mesh, material, visible] of originals) {
      mesh.material = material;
      mesh.visible = visible;
    }
  }
}

const ONE_STEP = (): RebuildBudget => {
  let spent = false;
  return { take: () => !spent && (spent = true), ready: () => true };
};

function* builtView(truck: Vehicle, paint: TruckPaint, trash: { dispose(): void }[]): Generator<PortraitWait, { view: VehicleView; meshes: Drawn[] }, void> {
  const view = new VehicleView(null, false, paint, 'portrait');
  trash.push(view);
  while (!view.built) {
    view.update(truck, false, paint, ONE_STEP());
    yield;
  }
  poseAtRest(view, truck);
  hideOutlines(view.root);
  const meshes = drawnMeshes(view.root);
  if (glassMeshes(meshes).length > 0) sheenGlass(meshes);
  const materials: THREE.Material[] = [];
  neutralizeReds(meshes, materials);
  trash.push(...materials);
  return { view, meshes };
}

export type GarageStore = {
  putBody(key: string, chassisId: string, body: GarageBody): void;
  putSprite(key: string, loose: string, sprite: GarageSprite): void;
};

function* bodySteps(pass: Pass, job: BodyJob, store: GarageStore, trash: { dispose(): void }[]): Generator<PortraitWait, void, void> {
  const bare: Vehicle = { ...job.truck, items: coreItems(job.truck) };
  const { view, meshes } = yield* builtView(bare, job.paint, trash);
  const origin = gridOrigin(job.chassisId);
  const frame = frameOf(meshes, BODY_PAD_M);
  if (!frame) throw new Error(`The bare ${job.chassisId} drew no meshes`);
  const image = yield* shoot(pass, view.root, snapped(frame, origin), origin);
  const cores = yield* coreSprites(pass, view, meshes, bare, origin);
  store.putBody(job.key, job.chassisId, { image, cores });
}

function* coreSprites(pass: Pass, view: VehicleView, meshes: readonly Drawn[], bare: Vehicle, origin: { x: number; z: number }): Generator<PortraitWait, Map<string, GarageSprite>, void> {
  const cores = new Map<string, GarageSprite>();
  for (const item of bare.items) {
    if (item.kind !== 'part' || isCab(item.part)) continue;
    const sprite = yield* alone(pass, view, meshes, item.part.id, origin);
    if (sprite?.url) cores.set(item.part.id, sprite);
  }
  return cores;
}

function* batchSteps(pass: Pass, job: BatchJob, store: GarageStore, trash: { dispose(): void }[]): Generator<PortraitWait, void, void> {
  const truck: Vehicle = { ...job.truck, items: [...coreItems(job.truck), ...job.placements.map((p) => p.item)] };
  const { view, meshes } = yield* builtView(truck, job.paint, trash);
  const origin = gridOrigin(job.chassisId);
  const mates = new Set(job.placements.map((p) => p.item.part.id));
  for (const placement of job.placements) {
    const sprite = yield* alone(pass, view, meshes, placement.item.part.id, origin, mates);
    store.putSprite(placement.key, placement.loose, sprite ?? NOTHING_DRAWN);
  }
}

export type BuildGarageJob = (renderer: THREE.WebGLRenderer, job: GarageJob, store: GarageStore, now: boolean) => { steps: Generator<PortraitWait, void, void>; dispose(): void };

export const buildGarageJob: BuildGarageJob = (renderer, job, store, now) => {
  const trash: { dispose(): void }[] = [];
  const occluder = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending });
  trash.push(occluder);
  const pass = { renderer, occluder, now };
  const steps = job.kind === 'body' ? bodySteps(pass, job, store, trash) : batchSteps(pass, job, store, trash);
  return { steps, dispose: () => trash.forEach((t) => t.dispose()) };
};

export function planJobs(need: GarageNeed, has: (key: string) => boolean): GarageJob[] {
  const { truck, paint } = need;
  const chassisId = truck.chassisId;
  const jobs: GarageJob[] = [];
  const body = bodyKey(truck, paint);
  if (!has(body)) jobs.push({ kind: 'body', key: body, chassisId, truck, paint });
  const missing: Placement[] = [];
  for (const { part, spots } of need.parts)
    for (const spot of spots) {
      const key = spriteKey(truck, paint, part, spot);
      if (!has(key)) missing.push({ item: placedItem(part, spot), key, loose: looseKey(chassisId, part, spot) });
    }
  for (const placements of packPlacements(chassisId, missing)) jobs.push({ kind: 'batch', chassisId, truck, paint, placements });
  return jobs;
}

function jobKeys(job: GarageJob): string[] {
  return job.kind === 'body' ? [job.key] : job.placements.map((p) => p.key);
}

export class GarageRenders {
  private readonly bodies = new Map<string, GarageBody>();
  private readonly latestBody = new Map<string, GarageBody>();
  private readonly sprites = new Map<string, GarageSprite>();
  private readonly latestSprite = new Map<string, GarageSprite>();
  private readonly failed = new Set<string>();
  private readonly levels = new Map<string, ReadonlyMap<string, number>>();
  private readonly listeners: (() => void)[] = [];
  private queue: GarageJob[] = [];
  private wanted: readonly GarageNeed[] = [];
  private running: Running | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly build: BuildGarageJob = buildGarageJob,
    private readonly now: () => number = () => performance.now(),
  ) {}

  onReady(listener: () => void): void {
    this.listeners.push(listener);
  }

  body(truck: Vehicle, paint: TruckPaint): GarageBody | null {
    return this.bodies.get(bodyKey(truck, paint)) ?? this.latestBody.get(truck.chassisId) ?? null;
  }

  sprite(truck: Vehicle, paint: TruckPaint, part: PartInstance, spot: Spot): GarageSprite | null {
    return this.sprites.get(spriteKey(truck, paint, part, spot)) ?? this.latestSprite.get(looseKey(truck.chassisId, part, spot)) ?? null;
  }

  gunLevels(truck: Vehicle): ReadonlyMap<string, number> {
    const guns = truck.items.filter((it): it is PartItem => it.kind === 'part' && partDef(it.part.defId).kind === 'weapon' && isMounted(truck.chassisId, it));
    if (guns.length < 2) return NO_LEVELS;
    const key = `${truck.chassisId}|${guns.map((g) => `${g.id}:${g.part.id}:${g.part.defId}@${g.x},${g.y},${g.rot}`).join(',')}`;
    const known = this.levels.get(key);
    if (known) return known;
    const rests = guns.map((g) => restGunOf(truck, g, model(baseModel(truck.chassisId, unitOfCells(truck.chassisId, itemCells(g)).index))));
    if (this.levels.size >= KEEP_LAYOUTS) this.levels.clear();
    const levels = gunStack(rests).levels;
    this.levels.set(key, levels);
    return levels;
  }

  want(needs: readonly GarageNeed[]): void {
    this.wanted = needs;
    this.queue = needs.flatMap((need) => planJobs(need, this.has));
  }

  pending(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  step(budgetMs: number): void {
    const start = this.now();
    for (;;) {
      if (!this.advance()) return;
      if (this.now() - start >= budgetMs) return;
    }
  }

  ensureNow(needs: readonly GarageNeed[]): void {
    const jobs = needs.flatMap((need) => planJobs(need, this.has));
    if (jobs.length === 0) return;
    this.dropRunning();
    for (const job of jobs) this.runNow(job);
    this.want(this.wanted);
    for (const listener of this.listeners) listener();
  }

  private readonly has = (key: string): boolean => this.bodies.has(key) || this.sprites.has(key) || this.failed.has(key);

  private dropRunning(): void {
    if (!this.running) return;
    this.running.dispose();
    this.running = null;
  }

  private runNow(job: GarageJob): void {
    const built = this.build(this.renderer, job, this, true);
    try {
      for (let step = built.steps.next(); !step.done; step = built.steps.next()) if (step.value) throw new Error('A garage render waited on the GPU while the screen needed it at once');
    } catch (error) {
      for (const key of jobKeys(job)) this.failed.add(key);
      throw error;
    } finally {
      built.dispose();
    }
  }

  private advance(): boolean {
    const run = this.free();
    if (!run) return false;
    const result = this.next(run);
    if (result.done) return this.finish(run);
    if (result.value) this.wait(run, result.value);
    return true;
  }

  private free(): Running | null {
    const run = this.running ?? this.start();
    return run && !run.waiting ? run : null;
  }

  private next(run: Running): IteratorResult<PortraitWait, void> {
    if (run.failure) return this.fail(run, run.failure.error);
    try {
      return run.steps.next();
    } catch (error) {
      return this.fail(run, error);
    }
  }

  private start(): Running | null {
    const job = this.queue.shift();
    if (!job) return null;
    const built = this.build(this.renderer, job, this, false);
    this.running = { job, steps: built.steps, waiting: null, failure: null, dispose: built.dispose };
    return this.running;
  }

  private wait(run: Running, pending: Promise<unknown>): void {
    run.waiting = pending.then(
      () => {
        run.waiting = null;
      },
      (error: unknown) => {
        run.failure = { error };
        run.waiting = null;
      },
    );
  }

  private fail(run: Running, error: unknown): never {
    for (const key of jobKeys(run.job)) this.failed.add(key);
    this.running = null;
    run.dispose();
    throw error;
  }

  private finish(run: Running): boolean {
    this.running = null;
    run.dispose();
    for (const listener of this.listeners) listener();
    return true;
  }

  putBody(key: string, chassisId: string, body: GarageBody): void {
    this.bodies.set(key, body);
    this.latestBody.set(chassisId, body);
  }

  putSprite(key: string, loose: string, sprite: GarageSprite): void {
    this.sprites.set(key, sprite);
    this.latestSprite.set(loose, sprite);
    this.forgetOldest();
  }

  private forgetOldest(): void {
    for (const [key, sprite] of this.sprites) {
      if (this.sprites.size <= KEEP_SPRITES) return;
      this.sprites.delete(key);
      if (sprite.url.startsWith('blob:') && ![...this.latestSprite.values()].includes(sprite)) URL.revokeObjectURL(sprite.url);
    }
  }
}
