import * as THREE from 'three';
import { partDef, type PartDef } from '../../data/parts';
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
  linearToSrgb,
  partMaskOf,
  snapIds,
  tintMask,
  unpremultiply,
  type PixelSize,
  type Tier,
  type TintName,
} from './portraitPixels';
import { bodyOf, cellRect, highestUnder } from '../../sim/body';
import { itemCells } from '../../sim/grid';
import type { Vehicle } from '../../sim/types';
import { maxHp } from '../../sim/wear';
import { signatureOf, VehicleView } from './vehicle';

const LOOK = {
  pxPerMeter: PX_PER_METER,
  supersample: SUPERSAMPLE,
  tiltDeg: 25,
  cameraDistance: 40,
  depthMargin: 1,
  samples: 4,
  glassModel: 0x2a3438,
  glassMatch: 0.02,
  glassSheen: 0x8aa4b0,
  neutralRed: 0x4a4642,
  redMaxHue: 0.025,
  redMinSaturation: 0.5,
  snapRadiusPx: 12,
  minHiddenSpanM: 0.2,
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
type Maps = { size: PixelSize; lit: Uint8ClampedArray; ids: Uint16Array };

export type Glow = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };

export type Portrait = {
  width: number;
  height: number;
  body: HTMLCanvasElement;
  parts: HTMLCanvasElement;
  partAt(x: number, y: number): string | null;
  centerOf(partId: string): { x: number; y: number };
  glow(partId: string, tier: Tier): Glow;
};

export type BuildPortrait = (renderer: THREE.WebGLRenderer, pristine: Vehicle) => Portrait;

export function pristineOf(v: Vehicle): Vehicle {
  const copy = structuredClone(v);
  for (const item of copy.items) {
    if (item.kind !== 'part') continue;
    item.part.wear = 0;
    item.part.hp = maxHp(item.part);
  }
  return copy;
}

export class TruckPortraits {
  private readonly built = new Map<string, { vehicleId: string; portrait: Portrait }>();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly build: BuildPortrait = buildPortrait,
  ) {}

  portraitOf(v: Vehicle): Portrait {
    const pristine = pristineOf(v);
    const key = `${v.id}|${signatureOf(pristine)}`;
    const known = this.built.get(key);
    if (known) return known.portrait;
    for (const [other, entry] of this.built) if (entry.vehicleId === v.id) this.built.delete(other);
    const portrait = this.build(this.renderer, pristine);
    this.built.set(key, { vehicleId: v.id, portrait });
    return portrait;
  }

  forget(keep: ReadonlySet<string>): void {
    for (const [key, entry] of this.built) if (!keep.has(entry.vehicleId)) this.built.delete(key);
  }
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
  const rest = { steer: 0, spin: 0, suspension: PHYSICS.truck.suspensionRest, ground: true };
  const wheels = wheelMounts(bodyOf(v.chassisId)).map(() => ({ ...rest }));
  view.pose({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: { x: 0, y: 0, z: 0 }, wheels }, 0);
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

function renderRaw(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Uint8ClampedArray {
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  const bytes = new Uint8Array(target.width * target.height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, bytes);
  return new Uint8ClampedArray(bytes.buffer);
}

function renderColor(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Uint8ClampedArray {
  const px = renderRaw(renderer, target, scene, camera);
  unpremultiply(px);
  linearToSrgb(px);
  flipRows(px, target.width, target.height);
  return px;
}

function renderIds(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.Camera): Uint16Array {
  const ids = idsOf(renderRaw(renderer, target, scene, camera));
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

function paintAsId(mesh: Drawn, id: number, shared: ReadonlySet<THREE.Material>, trash: Disposable[]): void {
  let material = mesh.material;
  if (shared.has(material)) {
    material = material.clone();
    trash.push(material);
    mesh.material = material;
  }
  if (material instanceof THREE.MeshLambertMaterial) {
    material.color.setRGB(0, 0, 0);
    material.emissive.copy(idColor(id));
    material.emissiveIntensity = 1;
  } else if (material instanceof THREE.MeshBasicMaterial) material.color.copy(idColor(id));
  else throw new Error(`Truck mesh ${mesh.name} has material ${material.type}, expected Lambert or Basic`);
}

function paintIds(meshes: Drawn[], idOfMesh: (mesh: Drawn) => number, trash: Disposable[]): void {
  const wanted = new Map<THREE.Material, Set<number>>();
  for (const mesh of meshes) wanted.set(mesh.material, (wanted.get(mesh.material) ?? new Set<number>()).add(idOfMesh(mesh)));
  const shared = new Set([...wanted].filter(([, ids]) => ids.size > 1).map(([material]) => material));
  for (const mesh of meshes) paintAsId(mesh, idOfMesh(mesh), shared, trash);
}

function widened(lo: number, hi: number): [number, number] {
  const pad = Math.max(0, LOOK.minHiddenSpanM - (hi - lo)) / 2;
  return [lo - pad, hi + pad];
}

function footprintColumn(v: Vehicle, item: PartItem, id: number, height: { min: number; max: number }, trash: Disposable[]): THREE.Mesh {
  const rect = cellRect(v.chassisId, itemCells(item));
  const [x0, x1] = widened(rect.x0, rect.x1);
  const [z0, z1] = widened(rect.z0, rect.z1);
  const geometry = new THREE.BoxGeometry(x1 - x0, height.max - height.min, z1 - z0);
  const material = new THREE.MeshBasicMaterial({ color: idColor(id), side: THREE.DoubleSide, depthTest: false });
  trash.push(geometry, material);
  const column = new THREE.Mesh(geometry, material);
  column.position.set((x0 + x1) / 2, (height.min + height.max) / 2, (z0 + z1) / 2);
  return column;
}

function footprintScene(v: Vehicle, items: PartItem[], numberOf: Numbering, heightOf: (item: PartItem) => { min: number; max: number }, trash: Disposable[]): THREE.Scene {
  const scene = new THREE.Scene();
  for (const item of items) scene.add(footprintColumn(v, item, numberOf(item.part.id), heightOf(item), trash));
  return scene;
}

function isCab(def: PartDef): boolean {
  return def.kind === 'core' && def.role === 'cab';
}

function partKind(item: PartItem): 'wheel' | 'armor' | 'other' {
  const def = partDef(item.part.defId);
  if (def.kind === 'armor') return 'armor';
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

function checkCovered(v: Vehicle, items: PartItem[], maps: Maps, numberOf: Numbering): void {
  const lit = new Map<number, number>();
  for (let p = 0; p < maps.ids.length; p++) if (maps.lit[p * 4 + 3] > OPAQUE_ALPHA) lit.set(maps.ids[p], (lit.get(maps.ids[p]) ?? 0) + 1);
  for (const item of items) {
    if (!lit.get(numberOf(item.part.id))) throw new Error(`Part ${item.part.id} (${item.part.defId}) on ${v.chassisId} has no pixels in the truck portrait`);
  }
}

function pixelIndex(size: PixelSize, x: number, y: number): number | null {
  const px = Math.floor(x * LOOK.supersample);
  const py = Math.floor(y * LOOK.supersample);
  const outside = px < 0 || py < 0 || px >= size.width || py >= size.height;
  return outside ? null : py * size.width + px;
}

function portraitOver(v: Vehicle, items: PartItem[], maps: Maps, numberOf: Numbering, canvases: Canvases): Portrait {
  const { size, lit, ids } = maps;
  const itemOf = new Map(items.map((item) => [item.part.id, item]));
  const partOfNumber = new Map(items.map((item) => [numberOf(item.part.id), item.part.id]));
  const snapped = snapIds(ids, size, new Set(partOfNumber.keys()), LOOK.snapRadiusPx * LOOK.supersample);
  const glows = new Map<string, { tier: Tier; glow: Glow }>();
  const centers = new Map<string, { x: number; y: number }>();
  const known = (partId: string): PartItem => {
    const item = itemOf.get(partId);
    if (!item) throw new Error(`Portrait of ${v.id} has no readout part ${partId}`);
    return item;
  };
  return {
    width: size.width / LOOK.supersample,
    height: size.height / LOOK.supersample,
    ...canvases,
    partAt(x, y) {
      const at = pixelIndex(size, x, y);
      return at === null ? null : (partOfNumber.get(snapped[at]) ?? null);
    },
    centerOf(partId) {
      const cached = centers.get(partId);
      if (cached) return cached;
      const c = centerOf(ids, size, numberOf(known(partId).part.id));
      const center = { x: c.x / LOOK.supersample, y: c.y / LOOK.supersample };
      centers.set(partId, center);
      return center;
    },
    glow(partId, tier) {
      const cached = glows.get(partId);
      if (cached?.tier === tier) return cached.glow;
      const mask = partMaskOf(lit, ids, numberOf(known(partId).part.id));
      const tint = tintOf(partKind(known(partId)), tier);
      const box = boundsOf(mask, size);
      const canvas = canvasOf(cropOf(tint ? tintMask(mask, TINTS[tint]) : mask, size, box), box);
      const k = LOOK.supersample;
      const glow = { canvas, x: box.x / k, y: box.y / k, width: box.width / k, height: box.height / k };
      glows.set(partId, { tier, glow });
      return glow;
    },
  };
}

type Pass = { renderer: THREE.WebGLRenderer; smooth: THREE.WebGLRenderTarget; flat: THREE.WebGLRenderTarget; camera: THREE.Camera };

function renderParts(pass: Pass, view: VehicleView, meshes: Drawn[], isPart: (mesh: Drawn) => boolean, trash: Disposable[]): Uint8ClampedArray {
  const occluder = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending });
  trash.push(occluder);
  const originals = new Map(meshes.map((m) => [m, m.material]));
  hideOutlines(view.root);
  for (const mesh of meshes.filter((m) => !isPart(m))) {
    if (mesh.material.transparent) mesh.visible = false;
    else mesh.material = occluder;
  }
  const parts = renderColor(pass.renderer, pass.smooth, litScene(view.root), pass.camera);
  for (const [mesh, material] of originals) mesh.material = material;
  return parts;
}

function renderPartIds(pass: Pass, view: VehicleView, v: Vehicle, solid: Drawn[], isPart: (mesh: Drawn) => boolean, numberOf: Numbering, trash: Disposable[]): Uint16Array {
  paintIds(solid, (m) => (isPart(m) ? numberOf(m.userData.partId) : BODY_ID), trash);
  const scene = new THREE.Scene();
  scene.add(view.root);
  const placed = renderIds(pass.renderer, pass.flat, scene, pass.camera);
  const seen = new Set(placed);
  const hidden = conditionItems(v).filter((item) => !seen.has(numberOf(item.part.id)));
  if (hidden.length === 0) return placed;
  return hiddenOver(placed, renderIds(pass.renderer, pass.flat, footprintScene(v, hidden, numberOf, heightsOf(v, solid), trash), pass.camera));
}

function heightsOf(v: Vehicle, solid: Drawn[]): (item: PartItem) => { min: number; max: number } {
  return (item) => {
    const own = solid.filter((mesh) => mesh.userData.partId === item.part.id);
    if (own.length === 0) {
      const top = highestUnder(v.chassisId, cellRect(v.chassisId, itemCells(item)));
      if (!Number.isFinite(top)) throw new Error(`Hidden part ${item.part.id} on ${v.chassisId} has no body surface over its cells`);
      return { min: top, max: top };
    }
    const box = new THREE.Box3();
    for (const mesh of own) box.expandByObject(mesh);
    return { min: box.min.y, max: box.max.y };
  };
}

function composePortrait(renderer: THREE.WebGLRenderer, view: VehicleView, v: Vehicle, trash: Disposable[]): Portrait {
  poseAtRest(view, v);
  const meshes = drawnMeshes(view.root);
  sheenGlass(meshes);
  neutralizeReds(meshes, trash);
  const { camera, size } = settledCamera(meshes);
  const pass = { renderer, camera, smooth: targetFor(size, LOOK.samples), flat: targetFor(size, 0) };
  trash.push(pass.smooth, pass.flat);
  const lit = renderColor(renderer, pass.smooth, litScene(view.root), camera);
  const isPart = partOnly(v);
  const parts = renderParts(pass, view, meshes, isPart, trash);
  const numberOf = numbering();
  const items = conditionItems(v);
  for (const item of items) numberOf(item.part.id);
  const ids = renderPartIds(pass, view, v, meshes.filter((m) => m.visible), isPart, numberOf, trash);
  checkCovered(v, items, { size, lit, ids }, numberOf);
  return portraitOver(v, items, { size, lit, ids }, numberOf, { body: canvasOf(lit, size), parts: canvasOf(parts, size) });
}

export function buildPortrait(renderer: THREE.WebGLRenderer, pristine: Vehicle): Portrait {
  const view = new VehicleView(pristine, false, 'portrait');
  const trash: Disposable[] = [];
  try {
    return withRendererState(renderer, () => composePortrait(renderer, view, pristine, trash));
  } finally {
    view.dispose();
    for (const item of trash) item.dispose();
  }
}
