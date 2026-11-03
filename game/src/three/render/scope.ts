
import * as THREE from 'three';
import { PHYSICS } from '../../data/physics';
import { TERRAIN } from '../../data/terrain';
import type { Vec } from '../../sim/vec';
import type { V3 } from '../../phys/frames';
import { TERRAIN_CHUNK } from './terrain';
import { outlineProps } from './models';
import { CLOUD_SHADOWS } from './cloudShadows';
import { MODEL_FILL } from './modelFill';
import { PAL } from '../../render/palette';

const S = PHYSICS.metersPerTile;
const MARGIN = 8 * S;
const IDENTITY = new THREE.Matrix4();

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Placement = { readonly pos: Vec; readonly radius: number; readonly cell: number; built: THREE.Object3D | null };
type Pending = { placement: Placement; build: () => THREE.Object3D };
type Chunk = { group: THREE.Group; cell: number; box: THREE.Box3; shown: boolean; pending: Pending[]; claim: Rect | null };
type CellRange = { x0: number; y0: number; x1: number; y1: number };
const CHUNK_METERS = TERRAIN_CHUNK * S;
const LEVEL_EPSILON = 1e-6;

function prepareModel(obj: THREE.Object3D): void {
  outlineProps(obj);
  MODEL_FILL.shadeTree(obj);
}

export class RenderScope {
  private readonly perSide: number;
  private readonly chunks: (Chunk | null)[];
  private readonly owner = new Map<THREE.Object3D, Chunk>();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly test = new THREE.Box3();
  private readonly prepare: (obj: THREE.Object3D) => void;
  private readonly frameHooks: (() => void)[] = [];
  private readonly waiting = new Set<number>();
  private readonly placed = new WeakSet<Placement>();
  private readonly attached = new Set<Chunk>();
  private readonly corner = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private lowest = Number.POSITIVE_INFINITY;
  private highest = Number.NEGATIVE_INFINITY;
  private overhang = 0;
  private span = 0;
  private claimOverhang = 0;
  private pendingTotal = 0;

  constructor(private readonly root: THREE.Object3D, private readonly mapSize: number, private readonly limit: SightLimit, private readonly grey: boolean, models: boolean) {
    this.prepare = models ? prepareModel : () => {};
    this.perSide = Math.ceil(mapSize / TERRAIN_CHUNK);
    this.chunks = new Array<Chunk | null>(this.perSide * this.perSide).fill(null);
  }

  pin(...objs: THREE.Object3D[]): void {
    this.root.add(...objs);
  }

  get cellsPerSide(): number {
    return this.perSide;
  }

  get pendingCount(): number {
    return this.pendingTotal;
  }

  waitingCells(): ReadonlySet<number> {
    return this.waiting;
  }

  waitingNear(center: Vec, radius: number): number[] {
    const reach = radius + this.claimOverhang + MARGIN / S;
    const x0 = Math.max(Math.floor((center.x - reach) / TERRAIN_CHUNK), 0);
    const y0 = Math.max(Math.floor((center.y - reach) / TERRAIN_CHUNK), 0);
    const x1 = Math.min(Math.floor((center.x + reach) / TERRAIN_CHUNK), this.perSide - 1);
    const y1 = Math.min(Math.floor((center.y + reach) / TERRAIN_CHUNK), this.perSide - 1);
    if (Math.max(x1 - x0 + 1, 0) * Math.max(y1 - y0 + 1, 0) >= this.waiting.size) return [...this.waiting];
    const near: number[] = [];
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) if (this.waiting.has(cy * this.perSide + cx)) near.push(cy * this.perSide + cx);
    return near;
  }

  private claimOverhangOf(cell: number, pos: Vec, radius: number): number {
    const cx = cell % this.perSide;
    const cy = Math.floor(cell / this.perSide);
    return Math.max(cx * TERRAIN_CHUNK - (pos.x - radius), pos.x + radius - (cx + 1) * TERRAIN_CHUNK, cy * TERRAIN_CHUNK - (pos.y - radius), pos.y + radius - (cy + 1) * TERRAIN_CHUNK, 0);
  }

  claimOf(cell: number): Rect {
    const claim = this.chunks[cell]?.claim;
    if (!claim) throw new Error(`Render scope cell ${cell} has no placements`);
    const margin = MARGIN / S;
    return { x0: claim.x0 - margin, y0: claim.y0 - margin, x1: claim.x1 + margin, y1: claim.y1 + margin };
  }

  place(pos: Vec, radius: number, build: () => THREE.Object3D): Placement {
    this.checkAnchor(pos, radius);
    const cell = this.cellAt(pos);
    const chunk = this.chunkAt(pos);
    const placement: Placement = { pos, radius, cell, built: null };
    chunk.pending.push({ placement, build });
    chunk.claim = widen(chunk.claim, pos, radius);
    this.claimOverhang = Math.max(this.claimOverhang, this.claimOverhangOf(cell, pos, radius));
    this.placed.add(placement);
    this.waiting.add(cell);
    this.pendingTotal++;
    return placement;
  }

  groupOf(cell: number): THREE.Group {
    const chunk = this.chunks[cell];
    if (!chunk) throw new Error(`Render scope cell ${cell} holds nothing`);
    return chunk.group;
  }

  buildNext(cell: number): THREE.Object3D | null {
    const chunk = this.chunks[cell];
    const next = chunk?.pending.shift();
    if (!chunk || !next) return null;
    this.settle(chunk, cell);
    const obj = next.build();
    this.add(obj, next.placement.pos, next.placement.radius);
    next.placement.built = obj;
    return obj;
  }

  add(obj: THREE.Object3D, pos: Vec, radius: number): void {
    if (this.owner.has(obj)) throw new Error(`Object ${obj.name || obj.id} is already in the render scope`);
    this.checkAnchor(pos, radius);
    const chunk = this.chunkAt(pos);
    obj.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(obj);
    this.checkClaim(obj, bounds, pos, radius);
    const low = bounds.isEmpty() ? obj.position.y : bounds.min.y;
    const high = bounds.isEmpty() ? obj.position.y : bounds.max.y;
    bounds.expandByPoint(new THREE.Vector3((pos.x - radius) * S, low, (pos.y - radius) * S));
    bounds.expandByPoint(new THREE.Vector3((pos.x + radius) * S, high, (pos.y + radius) * S));
    chunk.box.union(bounds);
    this.noteExtent(chunk, bounds);
    this.prepare(obj);
    chunk.group.add(obj);
    this.owner.set(obj, chunk);
    this.limit.patch(obj, this.grey);
    CLOUD_SHADOWS.shadeTree(obj);
  }

  private checkClaim(obj: THREE.Object3D, bounds: THREE.Box3, pos: Vec, radius: number): void {
    if (bounds.isEmpty()) return;
    const low = (pos.x - radius) * S - MARGIN;
    const high = (pos.x + radius) * S + MARGIN;
    const near = (pos.y - radius) * S - MARGIN;
    const far = (pos.y + radius) * S + MARGIN;
    if (bounds.min.x >= low && bounds.max.x <= high && bounds.min.z >= near && bounds.max.z <= far) return;
    throw new Error(`Render scope object ${obj.name || obj.id} reaches x ${bounds.min.x}..${bounds.max.x} m, z ${bounds.min.z}..${bounds.max.z} m, outside its ${radius}-tile circle at ${pos.x},${pos.y}`);
  }

  remove(target: THREE.Object3D | Placement): void {
    if (target instanceof THREE.Object3D) return this.removeObject(target);
    if (!this.placed.has(target)) throw new Error(`Placement at ${target.pos.x},${target.pos.y} is not in the render scope`);
    this.placed.delete(target);
    if (target.built) return this.removeObject(target.built);
    const chunk = this.chunks[target.cell]!;
    chunk.pending.splice(chunk.pending.findIndex((p) => p.placement === target), 1);
    this.settle(chunk, target.cell);
  }

  private settle(chunk: Chunk, cell: number): void {
    this.pendingTotal--;
    if (chunk.pending.length === 0) this.waiting.delete(cell);
  }

  private checkAnchor(pos: Vec, radius: number): void {
    if (!this.onMap(pos)) throw new Error(`Render scope object at ${pos.x},${pos.y} is outside the ${this.mapSize}-tile map`);
    if (!(radius >= 0 && Number.isFinite(radius))) throw new Error(`Render scope radius must be a finite non-negative number, got ${radius}`);
  }

  private onMap(pos: Vec): boolean {
    return pos.x >= 0 && pos.y >= 0 && pos.x <= this.mapSize && pos.y <= this.mapSize;
  }

  private removeObject(obj: THREE.Object3D): void {
    const chunk = this.owner.get(obj);
    if (!chunk) throw new Error(`Object ${obj.name || obj.id} is not in the render scope`);
    chunk.group.remove(obj);
    this.owner.delete(obj);
  }

  onFrame(fn: () => void): void {
    this.frameHooks.push(fn);
  }

  update(camera: THREE.OrthographicCamera): void {
    this.root.updateWorldMatrix(true, false);
    if (!this.root.matrixWorld.equals(IDENTITY)) throw new Error('Render scope root moved away from the world origin');
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    const range = this.cellRange(camera);
    for (const chunk of this.attached) if (!inRange(chunk.cell, range, this.perSide)) this.setShown(chunk, false);
    this.showChunksIn(range);
    this.frameHooks.forEach((hook) => hook());
  }

  private setShown(chunk: Chunk, show: boolean): void {
    if (show === chunk.shown) return;
    if (show) {
      this.root.add(chunk.group);
      this.attached.add(chunk);
    } else {
      this.root.remove(chunk.group);
      this.attached.delete(chunk);
    }
    chunk.shown = show;
  }

  private noteExtent(chunk: Chunk, bounds: THREE.Box3): void {
    if (bounds.isEmpty()) return;
    const cx = chunk.cell % this.perSide;
    const cy = Math.floor(chunk.cell / this.perSide);
    this.lowest = Math.min(this.lowest, bounds.min.y);
    this.highest = Math.max(this.highest, bounds.max.y);
    const over = Math.max(cx * CHUNK_METERS - bounds.min.x, bounds.max.x - (cx + 1) * CHUNK_METERS, cy * CHUNK_METERS - bounds.min.z, bounds.max.z - (cy + 1) * CHUNK_METERS);
    this.overhang = Math.max(this.overhang, over);
    this.span = Math.max(this.span, chunk.box.getSize(this.size).length());
  }

  private showChunksIn(range: CellRange): void {
    for (let cy = range.y0; cy <= range.y1; cy++)
      for (let cx = range.x0; cx <= range.x1; cx++) {
        const chunk = this.chunks[cy * this.perSide + cx];
        if (chunk) this.setShown(chunk, this.shows(chunk));
      }
  }

  private cellRange(camera: THREE.OrthographicCamera): CellRange {
    const whole = { x0: 0, y0: 0, x1: this.perSide - 1, y1: this.perSide - 1 };
    if (this.highest < this.lowest) return { x0: 1, y0: 1, x1: 0, y1: 0 };
    this.forward.set(0, 0, -1).transformDirection(camera.matrixWorld);
    if (this.forward.y > -LEVEL_EPSILON) return whole;
    const reach = MARGIN + this.overhang;
    const slack = this.span + 2 * Math.sqrt(3) * MARGIN;
    const wide = 1 + (slack * camera.zoom * 2) / (camera.right - camera.left);
    const tall = 1 + (slack * camera.zoom * 2) / (camera.top - camera.bottom);
    const box = REACH_BOX.makeEmpty();
    for (const level of [this.lowest, this.highest])
      for (const [nx, ny] of CORNERS) {
        this.corner.set(nx * wide, ny * tall, -1).unproject(camera);
        const along = (level - this.corner.y) / this.forward.y;
        box.expandByPoint(REACH_POINT.set(this.corner.x + this.forward.x * along, this.corner.z + this.forward.z * along));
      }
    const last = this.perSide - 1;
    const cell = (meters: number) => Math.floor(meters / CHUNK_METERS);
    return {
      x0: Math.max(cell(box.min.x - reach), 0),
      y0: Math.max(cell(box.min.y - reach), 0),
      x1: Math.min(cell(box.max.x + reach), last),
      y1: Math.min(cell(box.max.y + reach), last),
    };
  }

  private shows(chunk: Chunk): boolean {
    return this.limit.meets(chunk.box, MARGIN) && this.frustum.intersectsBox(this.test.copy(chunk.box).expandByScalar(MARGIN));
  }

  private cellAt(pos: Vec): number {
    const cx = Math.min(Math.floor(pos.x / TERRAIN_CHUNK), this.perSide - 1);
    const cy = Math.min(Math.floor(pos.y / TERRAIN_CHUNK), this.perSide - 1);
    return cy * this.perSide + cx;
  }

  private chunkAt(pos: Vec): Chunk {
    const index = this.cellAt(pos);
    let chunk = this.chunks[index];
    if (!chunk) {
      const group = new THREE.Group();
      group.name = `scope-chunk-${index % this.perSide}-${Math.floor(index / this.perSide)}`;
      group.matrixAutoUpdate = false;
      chunk = { group, cell: index, box: new THREE.Box3(), shown: true, pending: [], claim: null };
      this.chunks[index] = chunk;
      this.attached.add(chunk);
      this.root.add(group);
    }
    return chunk;
  }
}

const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
const REACH_BOX = new THREE.Box2();
const REACH_POINT = new THREE.Vector2();

function inRange(cell: number, range: CellRange, perSide: number): boolean {
  const cx = cell % perSide;
  const cy = Math.floor(cell / perSide);
  return cx >= range.x0 && cx <= range.x1 && cy >= range.y0 && cy <= range.y1;
}

function widen(claim: Rect | null, pos: Vec, radius: number): Rect {
  const r = { x0: pos.x - radius, y0: pos.y - radius, x1: pos.x + radius, y1: pos.y + radius };
  if (!claim) return r;
  return { x0: Math.min(claim.x0, r.x0), y0: Math.min(claim.y0, r.y0), x1: Math.max(claim.x1, r.x1), y1: Math.max(claim.y1, r.y1) };
}

type Clipped = THREE.Material & { onBeforeCompile: THREE.Material['onBeforeCompile'] };

const WINDOW_STEP = 32;

type VisibleWindow = { texture: THREE.DataTexture; side: number; x: number; y: number };

function visibleWindow(side: number, x: number, y: number): VisibleWindow {
  const texture = new THREE.DataTexture(new Uint8Array(side * side), side, side, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return { texture, side, x, y };
}

function tileBounds(tiles: readonly number[], mapSize: number): { x0: number; y0: number; x1: number; y1: number } | null {
  if (tiles.length === 0) return null;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const t of tiles) {
    if (!(t >= 0 && t < mapSize * mapSize)) throw new Error(`Visible tile ${t} is outside the ${mapSize}-tile map`);
    const x = t % mapSize;
    const y = (t - x) / mapSize;
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}

export class SightLimit {
  private visible = visibleWindow(WINDOW_STEP, 0, 0);
  private readonly uniforms;
  private readonly patched = new WeakMap<THREE.Material, boolean>();

  constructor(private readonly mapSize: number) {
    this.uniforms = {
      sightCenter: { value: new THREE.Vector2() },
      sightRadius: { value: Number.POSITIVE_INFINITY },
      sightVisible: { value: this.visible.texture },
      sightWindow: { value: new THREE.Vector3(0, 0, WINDOW_STEP * S) },
      sightGrey: { value: new THREE.Vector2(TERRAIN.fog.seen.grey, TERRAIN.fog.seen.bright) },
      sightFog: { value: new THREE.Color(PAL.bg) },
      sightFogBand: { value: TERRAIN.vision.edgeFog },
    };
  }

  set(center: V3, radius: number): void {
    if (!(radius > 0 && Number.isFinite(radius))) throw new Error(`Sight limit radius must be a finite positive number, got ${radius}`);
    this.uniforms.sightCenter.value.set(center.x, center.z);
    this.uniforms.sightRadius.value = radius;
  }

  fadeTo(backdrop: THREE.Color): THREE.Color {
    return this.uniforms.sightFog.value.copy(backdrop);
  }

  reaches(at: V3): boolean {
    const c = this.uniforms.sightCenter.value;
    return Math.hypot(at.x - c.x, at.z - c.y) <= this.uniforms.sightRadius.value;
  }

  showVisible(tiles: Iterable<number>): void {
    const list = [...tiles];
    const box = tileBounds(list, this.mapSize);
    if (box) this.fitWindow(Math.max(box.x1 - box.x0, box.y1 - box.y0) + 3, box.x0 - 1, box.y0 - 1);
    const w = this.visible;
    const data = w.texture.image.data as Uint8Array;
    data.fill(0);
    for (const t of list) {
      const x = t % this.mapSize;
      data[((t - x) / this.mapSize - w.y) * w.side + x - w.x] = 255;
    }
    w.texture.needsUpdate = true;
    this.uniforms.sightWindow.value.set(w.x * S, w.y * S, w.side * S);
  }

  private fitWindow(needed: number, x: number, y: number): void {
    const side = Math.max(this.visible.side, Math.ceil(needed / WINDOW_STEP) * WINDOW_STEP);
    if (side > this.visible.side) {
      this.visible.texture.dispose();
      this.visible = visibleWindow(side, x, y);
      this.uniforms.sightVisible.value = this.visible.texture;
    }
    this.visible.x = x;
    this.visible.y = y;
  }

  covers(p: V3): boolean {
    const c = this.uniforms.sightCenter.value;
    return Math.hypot(p.x - c.x, p.z - c.y) <= this.uniforms.sightRadius.value;
  }

  meets(box: THREE.Box3, margin: number): boolean {
    const c = this.uniforms.sightCenter.value;
    const dx = Math.max(box.min.x - c.x, 0, c.x - box.max.x);
    const dz = Math.max(box.min.z - c.y, 0, c.y - box.max.z);
    return Math.hypot(dx, dz) <= this.uniforms.sightRadius.value + margin;
  }

  patch(obj: THREE.Object3D, grey: boolean): void {
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const sampled = hasSightAt(o);
      const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) this.patchMaterial(m, grey, sampled);
    });
  }

  private patchMaterial(mat: Clipped, grey: boolean, sampled: boolean): void {
    const was = this.patched.get(mat);
    if (was !== undefined) {
      if (was !== sampled) throw new Error(`Material ${mat.name || mat.uuid} is on meshes with and without sightAt points`);
      return;
    }
    this.patched.set(mat, sampled);
    const greyAt = sampled ? 'vSightAt' : 'vSightXZ';
    const before = mat.onBeforeCompile.bind(mat);
    const key = mat.customProgramCacheKey.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = inject(shader.vertexShader, '#include <common>', 'varying vec2 vSightXZ;');
      if (sampled) {
        shader.vertexShader = inject(shader.vertexShader, '#include <common>', 'attribute vec2 sightAt;\nvarying vec2 vSightAt;');
        shader.vertexShader = inject(shader.vertexShader, '#include <project_vertex>', 'vSightAt = sightAt;');
        shader.fragmentShader = inject(shader.fragmentShader, '#include <common>', 'varying vec2 vSightAt;');
      }
      shader.vertexShader = inject(
        shader.vertexShader,
        '#include <project_vertex>',
        `vec4 sightWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        sightWorld = instanceMatrix * sightWorld;
        #endif
        vSightXZ = (modelMatrix * sightWorld).xz;`,
      );
      shader.fragmentShader = inject(
        shader.fragmentShader,
        '#include <common>',
        'varying vec2 vSightXZ;\nuniform vec2 sightCenter;\nuniform float sightRadius;\nuniform sampler2D sightVisible;\nuniform vec3 sightWindow;\nuniform vec2 sightGrey;\nuniform vec3 sightFog;\nuniform float sightFogBand;',
      );
      shader.fragmentShader = inject(shader.fragmentShader, '#include <clipping_planes_fragment>', 'if (distance(vSightXZ, sightCenter) > sightRadius) discard;');
      if (grey) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `float sightSeen = texture2D(sightVisible, (${greyAt} - sightWindow.xy) / sightWindow.z).r;
        float sightLuma = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        outgoingLight = mix(mix(outgoingLight, vec3(sightLuma), sightGrey.x) * sightGrey.y, outgoingLight, sightSeen);
        #include <opaque_fragment>`);
      if (grey && !shader.fragmentShader.includes('sightSeen')) throw new Error('Sight limit cannot grey a shader without #include <opaque_fragment>');
      shader.fragmentShader = inject(shader.fragmentShader, '#include <colorspace_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(sightFog, 1.0)).rgb, smoothstep(sightRadius * (1.0 - sightFogBand), sightRadius, distance(vSightXZ, sightCenter)));');
    };
    mat.customProgramCacheKey = () => `${key()}|sight${grey ? '-grey' : ''}${sampled ? '-at' : ''}`;
    mat.needsUpdate = true;
  }
}

function hasSightAt(mesh: THREE.Mesh): boolean {
  const sightAt = (mesh.geometry as THREE.BufferGeometry).getAttribute('sightAt');
  if (sightAt === undefined) return false;
  if (sightAt.itemSize !== 2) throw new Error(`Mesh ${mesh.name || mesh.id} has sightAt points of size ${sightAt.itemSize}, not 2`);
  return true;
}

function inject(source: string, chunk: string, code: string): string {
  if (!source.includes(chunk)) throw new Error(`Sight limit cannot patch a shader without ${chunk}`);
  return source.replace(chunk, `${chunk}\n${code}`);
}
