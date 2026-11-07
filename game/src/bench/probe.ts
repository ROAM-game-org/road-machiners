import { Light, Object3D, type InstancedMesh, type Mesh, type BufferGeometry, type Camera, type Material, type PointLight, type SpotLight, type WebGLRenderer } from 'three';
import { perfSnapshot, ranInWorker, type PerfStat } from '../perf';
import type { Game } from '../three/game';
import { drawTotals, emptyBySystem, SLOW_FRAME_MS, SYSTEMS, type BenchSystem, type DrawCount, type FrameRecord, type RenderPass, type SceneReport, type SceneState } from './report';
import { shadowRefreshOf } from '../three/render/shadowRefresh';

export const FRAME_STEP_MS = 16.67;
const GPU_WAIT_MS = 5000;
const COUNT_WAIT_MS = 5000;

export type SystemRoots = Record<BenchSystem, readonly Object3D[]>;
export type Attribution = { system: BenchSystem; other: string | null };
export type DrawReport = SceneReport['draws'];

export function topLevelOf(object: Object3D, scene: Object3D): Object3D | null {
  let node: Object3D | null = object;
  while (node !== null && node.parent !== scene) node = node.parent;
  return node;
}

export function systemMap(roots: SystemRoots): Map<Object3D, BenchSystem> {
  const map = new Map<Object3D, BenchSystem>();
  for (const system of SYSTEMS) for (const root of roots[system]) map.set(root, system);
  return map;
}

export function attribute(object: Object3D, scene: Object3D, map: ReadonlyMap<Object3D, BenchSystem>): Attribution {
  const top = topLevelOf(object, scene);
  const system = top === null ? undefined : map.get(top);
  if (system !== undefined) return { system, other: null };
  const named = top ?? object;
  return { system: 'other', other: `${named.type}:${named.name || 'unnamed'}` };
}

function isDomNode(value: object): boolean {
  return typeof Node !== 'undefined' && value instanceof Node;
}

function walkChildren(value: object, depth: number, seen: Set<object>, found: Set<Object3D>): void {
  if (value instanceof Map || value instanceof Set) walkValues(value.values(), depth, seen, found);
  else if (Array.isArray(value)) walkList(value, depth, seen, found);
  else walkFields(value as Record<string, unknown>, depth, seen, found);
}

function walkValues(values: Iterable<unknown>, depth: number, seen: Set<object>, found: Set<Object3D>): void {
  for (const child of values) collectObjects(child, depth, seen, found);
}

function walkList(list: readonly unknown[], depth: number, seen: Set<object>, found: Set<Object3D>): void {
  for (let i = 0; i < list.length; i++) collectObjects(list[i], depth, seen, found);
}

function walkFields(fields: Record<string, unknown>, depth: number, seen: Set<object>, found: Set<Object3D>): void {
  for (const key in fields) if (Object.hasOwn(fields, key)) collectObjects(fields[key], depth, seen, found);
}

function isNewObject(value: unknown, seen: Set<object>): value is object {
  return typeof value === 'object' && value !== null && !seen.has(value);
}

function holdsObjects(value: object): boolean {
  return !isDomNode(value) && !ArrayBuffer.isView(value);
}

function collectObjects(value: unknown, depth: number, seen: Set<object>, found: Set<Object3D>): void {
  if (!isNewObject(value, seen)) return;
  seen.add(value);
  if (value instanceof Object3D) found.add(value);
  else if (depth > 0 && holdsObjects(value)) walkChildren(value, depth - 1, seen, found);
}

export function reachableObjects(root: unknown, depth: number): Set<Object3D> {
  const found = new Set<Object3D>();
  collectObjects(root, depth, new Set(), found);
  return found;
}

function field(game: Game, name: string): unknown {
  const value = Reflect.get(game, name);
  if (value === undefined) throw new Error(`Game has no field ${name}, so the bench cannot map it to a system`);
  return value;
}

function rootOf(part: unknown, name: string): Object3D {
  const holder = part as { root?: Object3D; mesh?: Object3D };
  const root = part instanceof Object3D ? part : (holder.root ?? holder.mesh);
  if (!root) throw new Error(`Game field ${name} has no root or mesh to map to a system`);
  return root;
}

export const OVERLAY_FIELDS = ['shade', 'zones', 'path', 'rescueAreas', 'weaponRange', 'hoverArcs', 'contacts', 'utilityAim', 'soundRing', 'beaconPulse', 'pickRing'];

type BeamLights = { shadowed: SpotLight[]; plain: SpotLight[]; glow: PointLight | null };
type SiteSlots = { slots: { spot: SpotLight }[] };
type TruckViewMap = { views: Map<string, { root: Object3D }> };

function lightKey(light: Light): string {
  const lit = light.visible && light.intensity > 0 && light.color.getHex() !== 0;
  return `${light.type}|${light.visible ? 'shown' : 'hidden'}|${lit ? 'lit' : 'dark'}|${light.castShadow ? 'shadow' : 'plain'}`;
}

export function gameState(game: Game): SceneState {
  const lights: Record<string, number> = {};
  const shadowMaps: number[] = [];
  let objects = 0;
  game.scene.traverse((object) => {
    objects++;
    if (!(object instanceof Light)) return;
    const key = lightKey(object);
    lights[key] = (lights[key] ?? 0) + 1;
    if (object.castShadow) shadowMaps.push((object as SpotLight).shadow.mapSize.x);
  });
  const { domElement, info } = game.renderer;
  return {
    lights,
    shadowMaps,
    programs: info.programs?.length ?? 0,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    objects,
    canvas: `${domElement.width}x${domElement.height}`,
    pixelRatio: game.renderer.getPixelRatio(),
    domNodes: document.getElementsByTagName('*').length,
    blurred: blurredElements().map(sizeLabel),
  };
}

type Sized = { version: number; array: ArrayLike<number> & { byteLength: number } };

function buffersOf(game: Game): Map<Sized, { name: string; version: number }> {
  const buffers = new Map<Sized, { name: string; version: number }>();
  game.scene.traverse((object) => {
    const { geometry, instanceMatrix, instanceColor } = object as Mesh & Partial<InstancedMesh>;
    const name = namedAncestor(object);
    const attributes = geometry ? Object.entries(geometry.attributes) : [];
    const all = [...attributes, ['index', geometry?.index], ['instanceMatrix', instanceMatrix], ['instanceColor', instanceColor]] as [string, Sized | null | undefined][];
    for (const [key, attribute] of all) if (attribute?.array) buffers.set(attribute, { name: `${name}.${key}`, version: attribute.version });
  });
  return buffers;
}

export function changedBuffersSince(game: Game, before: ReadonlyMap<Sized, { version: number }>): Record<string, number> {
  const changed: Record<string, number> = {};
  for (const [buffer, { name, version }] of buffersOf(game)) {
    if (before.get(buffer)?.version !== version) changed[name] = (changed[name] ?? 0) + buffer.array.byteLength;
  }
  return changed;
}

export const bufferVersions = buffersOf;

export function watchMixedMaterials(game: Game): () => string[] {
  const kinds = new Map<Material, Set<string>>();
  const { renderer } = game;
  const draw = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function watched(camera, scene, geometry, material, object, group) {
    const drawn = kinds.get(material) ?? new Set<string>();
    drawn.add(drawKind(object, geometry, material, renderer));
    kinds.set(material, drawn);
    draw.call(this, camera, scene, geometry, material, object, group);
  };
  return () => {
    renderer.renderBufferDirect = draw;
    return [...kinds].filter(([, drawn]) => drawn.size > 1).map(([material, drawn]) => `${material.type} ${material.name}: ${[...drawn].join(' ')}`);
  };
}

function drawKind(object: Object3D, geometry: BufferGeometry, material: Material, renderer: WebGLRenderer): string {
  const instanced = object as Partial<InstancedMesh>;
  return [
    instanced.isInstancedMesh ? 'inst' : 'mesh',
    instanced.instanceColor ? 'icolor' : '',
    hasVertexAlpha(geometry, material) ? 'alpha' : '',
    renderer.getRenderTarget() ? 'target' : 'screen',
  ].join('');
}

function hasVertexAlpha(geometry: BufferGeometry, material: Material): boolean {
  return (material as Material & { vertexColors?: boolean }).vertexColors === true && geometry.attributes.color?.itemSize === 4;
}

export function blurredElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('body *')].filter((node) => getComputedStyle(node).backdropFilter !== 'none' && node.getClientRects().length > 0);
}

function sizeLabel(node: HTMLElement): string {
  const { width, height } = node.getBoundingClientRect();
  return `${node.className}:${Math.round(width)}x${Math.round(height)}`;
}

export function lampsOf(game: Game): Object3D[] {
  const beams = field(game, 'vehicleLights') as BeamLights;
  const sites = field(game, 'siteLights') as SiteSlots;
  const spots = [...beams.shadowed, ...beams.plain, ...sites.slots.map((slot) => slot.spot)];
  return [...spots, ...spots.map((spot) => spot.target), ...(beams.glow ? [beams.glow] : [])];
}

function effectRoots(game: Game): Object3D[] {
  const fromFx = [...reachableObjects(field(game, 'fx'), 4)].filter((o) => o.parent === game.scene);
  return [...fromFx, rootOf(field(game, 'weather'), 'weather'), rootOf(field(game, 'clouds'), 'clouds')];
}

export function systemRootsOf(game: Game): SystemRoots {
  const trucks = field(game, 'trucks') as TruckViewMap;
  const sun = field(game, 'sun') as Object3D & { target: Object3D };
  return {
    terrain: [rootOf(field(game, 'ground'), 'ground'), rootOf(field(game, 'craters'), 'craters')],
    props: [rootOf(field(game, 'props'), 'props')],
    vehicles: [...trucks.views.values()].map((view) => view.root),
    lights: [...lampsOf(game), sun, sun.target, rootOf(field(game, 'sky'), 'sky')],
    effects: effectRoots(game),
    overlays: OVERLAY_FIELDS.map((name) => rootOf(field(game, name), name)),
    other: [],
  };
}

type CountedRenderer = Pick<WebGLRenderer, 'info' | 'renderBufferDirect'>;
type DirectArgs = Parameters<WebGLRenderer['renderBufferDirect']>;
const HEAVIEST_ROWS = 60;

function namedAncestor(object: Object3D): string {
  for (let node: Object3D | null = object; node !== null; node = node.parent) {
    if (node.name && !node.name.startsWith('scope-chunk')) return node.name;
  }
  return `${object.type}:unnamed`;
}

export class DrawCounter {
  readonly shadowCameras = new Map<Camera, number>();
  private bySystem = emptyBySystem();
  private other: Record<string, number> = {};
  private readonly byName = new Map<string, DrawCount>();
  private readonly materials: Record<RenderPass, Set<Material>> = { main: new Set(), shadow: new Set() };
  private readonly materialKinds: Record<string, number> = {};
  private rendererCalls = 0;
  private original: WebGLRenderer['renderBufferDirect'] | null = null;
  private finished = false;

  constructor(private readonly renderer: CountedRenderer, private readonly scene: Object3D, private readonly camera: Camera) {}

  get done(): boolean {
    return this.finished;
  }

  start(map: ReadonlyMap<Object3D, BenchSystem>): void {
    const original = this.renderer.renderBufferDirect;
    this.original = original;
    this.renderer.renderBufferDirect = (...args: DirectArgs) => {
      if (this.finished) return original.apply(this.renderer, args);
      const { render } = this.renderer.info;
      const [calls, triangles] = [render.calls, render.triangles];
      original.apply(this.renderer, args);
      this.add(map, args, render.calls - calls, render.triangles - triangles);
    };
  }

  stop(): void {
    if (this.original) this.renderer.renderBufferDirect = this.original;
    this.original = null;
  }

  private add(map: ReadonlyMap<Object3D, BenchSystem>, args: DirectArgs, draws: number, triangles: number): void {
    if (draws === 0) return;
    const pass: RenderPass = args[0] === this.camera ? 'main' : 'shadow';
    if (pass === 'shadow') this.addShadow(args[0], draws);
    const { system, other } = attribute(args[4], this.scene, map);
    const count = this.bySystem[system][pass];
    count.draws += draws;
    count.triangles += triangles;
    if (other !== null) this.other[other] = (this.other[other] ?? 0) + draws;
    this.addByName(pass, args[4], draws, triangles);
    this.addMaterial(pass, args[3], system);
  }

  private addMaterial(pass: RenderPass, material: Material, system: BenchSystem): void {
    const seen = this.materials[pass];
    if (seen.has(material)) return;
    seen.add(material);
    const key = `${pass}|${system}|${material.name || material.type}`;
    this.materialKinds[key] = (this.materialKinds[key] ?? 0) + 1;
  }

  private addByName(pass: RenderPass, object: Object3D, draws: number, triangles: number): void {
    const key = `${pass}|${namedAncestor(object)}`;
    const count = this.byName.get(key) ?? { draws: 0, triangles: 0 };
    count.draws += draws;
    count.triangles += triangles;
    this.byName.set(key, count);
  }

  private heaviest(): NonNullable<DrawReport['heaviest']> {
    const rows = [...this.byName].map(([key, count]) => {
      const [pass, name] = key.split('|');
      return { name, pass: pass as RenderPass, ...count };
    });
    return rows.sort((a, b) => b.triangles - a.triangles).slice(0, HEAVIEST_ROWS);
  }

  private addShadow(camera: Camera, draws: number): void {
    this.shadowCameras.set(camera, (this.shadowCameras.get(camera) ?? 0) + draws);
  }

  afterRender(): void {
    if (this.original === null || this.finished) return;
    this.rendererCalls = this.renderer.info.render.calls;
    this.finished = true;
  }

  report(): DrawReport {
    const { total, byPass } = drawTotals(this.bySystem);
    if (total !== this.rendererCalls) throw new Error(`IV7: the bench counted ${total} draws but renderer.info.render.calls says ${this.rendererCalls}`);
    return { total, rendererCalls: this.rendererCalls, byPass, bySystem: this.bySystem, other: this.other, heaviest: this.heaviest(), materials: this.materialKinds };
  }
}

const UPLOAD_CALLS = ['texImage2D', 'texSubImage2D', 'bufferData', 'bufferSubData'] as const;
type ImageLike = { width: number; height: number };

function isImageLike(value: unknown): value is ImageLike {
  return typeof value === 'object' && value !== null && 'width' in value && 'height' in value;
}

function bufferDataBytes(args: readonly unknown[]): number {
  const data = args[1];
  if (data instanceof ArrayBuffer) return data.byteLength;
  return typeof data === 'number' ? data : 0;
}

function viewBytes(call: string, args: readonly unknown[], view: ArrayBufferView): number {
  const length = call === 'bufferSubData' ? args[4] : undefined;
  if (typeof length !== 'number' || length === 0) return view.byteLength;
  const element = (view as ArrayBufferView & { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
  return length * element;
}

export function uploadBytes(call: string, args: readonly unknown[]): number {
  const view = args.find((arg): arg is ArrayBufferView => ArrayBuffer.isView(arg));
  if (view) return viewBytes(call, args, view);
  const image = args.find(isImageLike);
  if (image) return image.width * image.height * 4;
  return call === 'bufferData' ? bufferDataBytes(args) : 0;
}

class UploadCounter {
  bytes = 0;
  private readonly originals = new Map<string, unknown>();

  install(): void {
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const call of UPLOAD_CALLS) {
      const original = proto[call];
      this.originals.set(call, original);
      proto[call] = (function (this: unknown, ...args: unknown[]) {
        UPLOADS.bytes += uploadBytes(call, args);
        return original.apply(this, args);
      }) as (...args: unknown[]) => unknown;
    }
  }

  uninstall(): void {
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, unknown>;
    for (const [call, original] of this.originals) proto[call] = original;
    this.originals.clear();
  }
}

const UPLOADS = new UploadCounter();

type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

export class GpuTimer {
  private readonly ext: TimerExtension | null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  }

  get available(): boolean {
    return this.ext !== null;
  }

  begin(): WebGLQuery | null {
    if (this.ext === null) return null;
    const query = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    return query;
  }

  end(): void {
    if (this.ext !== null) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
  }

  ready(query: WebGLQuery): boolean {
    return this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE) === true;
  }

  read(query: WebGLQuery): number {
    if (this.ext === null) throw new Error('The GPU timer is not available');
    if (this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)) throw new Error('The GPU timer reported a disjoint, so its results are void. Run the bench again');
    const ms = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT)) / 1e6;
    this.gl.deleteQuery(query);
    return ms;
  }
}

class LongTasks {
  private starts: number[] = [];
  private observer: PerformanceObserver | null = null;

  start(): void {
    this.observer = new PerformanceObserver((list) => this.starts.push(...list.getEntries().map((e) => e.startTime)));
    this.observer.observe({ type: 'longtask' });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  countBetween(from: number, to: number): number {
    if (this.observer) this.starts.push(...this.observer.takeRecords().map((e) => e.startTime));
    return this.starts.filter((start) => start >= from && start < to).length;
  }
}

type LoopHooks = { closed: (realMs: number, tickMs: number, startMs: number) => void; callbackDone: () => void };

class FrameLoop {
  private readonly native = window.requestAnimationFrame.bind(window);
  private clock: number | null = null;
  private round: number | null = null;
  private roundStart = 0;
  private tickMs = 0;

  constructor(private readonly hooks: LoopHooks) {}

  install(): void {
    window.requestAnimationFrame = (callback) => this.native((stamp) => this.run(callback, stamp));
  }

  private run(callback: FrameRequestCallback, stamp: number): void {
    const arrived = performance.now();
    if (stamp !== this.round) this.open(stamp, arrived);
    const start = performance.now();
    callback(this.clock as number);
    this.tickMs += performance.now() - start;
    this.hooks.callbackDone();
  }

  private open(stamp: number, arrived: number): void {
    if (this.round !== null) this.hooks.closed(arrived - this.roundStart, this.tickMs, this.roundStart);
    this.round = stamp;
    this.roundStart = arrived;
    this.tickMs = 0;
    this.clock = (this.clock ?? stamp) + FRAME_STEP_MS;
  }
}

type Pending = { record: FrameRecord; queries: WebGLQuery[] };
type Watcher = { done: () => boolean; resolve: () => void; reject: (error: Error) => void; deadline: number; what: string };
type Collecting = { records: FrameRecord[]; gate: () => boolean };
type BuildingStreamer = { buildOne: (...args: unknown[]) => boolean };

export class Probe {
  readonly gpu: GpuTimer;
  readonly longTasks = new LongTasks();
  pace: (() => void) | null = null;
  rounds = 0;
  shadowDraws: ReadonlyMap<Camera, number> = new Map();
  private readonly renderer: WebGLRenderer;
  private readonly loop = new FrameLoop({ closed: (real, tick, start) => this.onClosed(real, tick, start), callbackDone: () => this.onCallbackDone() });
  private failure: Error | null = null;
  private collecting: Collecting | null = null;
  private gated = false;
  private watchers: Watcher[] = [];
  private pending: Pending[] = [];
  private readonly drew = new WeakMap<FrameRecord, boolean>();
  private readonly startedAt = new WeakMap<FrameRecord, number>();
  private originalRender: WebGLRenderer['render'] | null = null;
  private originalBuild: BuildingStreamer['buildOne'] | null = null;
  private counter: DrawCounter | null = null;
  private renderMs = 0;
  private renders = 0;
  private calls = 0;
  private queries: WebGLQuery[] = [];
  private builds = 0;
  private uploadMark = 0;
  private buildMark = 0;
  private readonly seenPrograms = new WeakSet<object>();
  private perfMark: Record<string, PerfStat> = {};

  constructor(private readonly game: Game) {
    this.renderer = game.renderer;
    this.gpu = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
  }

  install(): void {
    this.perfMark = perfSnapshot();
    this.uploadMark = UPLOADS.bytes;
    this.buildMark = this.builds;
    this.unseenPrograms();
    this.loop.install();
    this.wrapRender();
    this.wrapStreamer();
    UPLOADS.install();
    this.longTasks.start();
  }

  uninstall(): void {
    if (this.originalRender) this.renderer.render = this.originalRender;
    if (this.originalBuild) (this.game.streamer as unknown as BuildingStreamer).buildOne = this.originalBuild;
    UPLOADS.uninstall();
    this.longTasks.stop();
  }

  get chunkBuilds(): number {
    return this.builds;
  }

  programCount(): number {
    const programs = this.renderer.info.programs;
    if (!programs) throw new Error('renderer.info.programs is missing, so shader compiles cannot be watched');
    return programs.length;
  }

  until(done: () => boolean, maxMs: number, what: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      this.watchers.push({ done, resolve, reject, deadline: performance.now() + maxMs, what });
    });
  }

  frames(count: number, maxMs: number): Promise<void> {
    const target = this.rounds + count;
    return this.until(() => this.rounds >= target, maxMs, `${count} frames`);
  }

  async record(stop: (recorded: number) => boolean, gate: () => boolean, maxMs: number, what: string): Promise<FrameRecord[]> {
    const records: FrameRecord[] = [];
    this.collecting = { records, gate };
    try {
      await this.until(() => stop(records.length), maxMs, what);
    } finally {
      this.collecting = null;
    }
    await this.settleGpu(records);
    return records;
  }

  async countDraws(): Promise<DrawReport> {
    const counter = new DrawCounter(this.renderer, this.game.scene, this.game.rig.camera);
    shadowRefreshOf(this.game.scene).forget();
    this.counter = counter;
    counter.start(systemMap(systemRootsOf(this.game)));
    try {
      await this.until(() => counter.done, COUNT_WAIT_MS, 'a render while counting draws');
    } finally {
      counter.stop();
      this.counter = null;
    }
    this.shadowDraws = counter.shadowCameras;
    return counter.report();
  }

  markSlowFrames(scene: string, records: readonly FrameRecord[]): void {
    for (const record of records) {
      const start = this.startedAt.get(record);
      if (start === undefined) throw new Error('A frame record has no start time, so its slow frame cannot be marked');
      if (record.real > SLOW_FRAME_MS) performance.measure(`bench:slow-frame:${scene}`, { start, end: start + record.real });
    }
  }

  onClosed(realMs: number, tickMs: number, startMs: number): void {
    try {
      this.close(realMs, tickMs, startMs);
    } catch (error) {
      this.failure = error as Error;
      this.checkWatchers();
    }
  }

  private close(realMs: number, tickMs: number, startMs: number): void {
    const record: FrameRecord = {
      real: realMs,
      tick: tickMs,
      render: this.renderMs,
      gpu: null,
      uploadBytes: UPLOADS.bytes - this.uploadMark,
      chunkBuilds: this.builds - this.buildMark,
      newPrograms: this.unseenPrograms(),
      calls: this.calls,
      timers: this.timerDelta(),
    };
    this.drew.set(record, this.renders > 0);
    this.startedAt.set(record, startMs);
    if (this.queries.length > 0) this.pending.push({ record, queries: this.queries });
    this.resetMarks();
    this.rounds++;
    this.settleReady();
    if (this.collecting && this.gated) this.collecting.records.push(record);
    this.checkWatchers();
    this.pace?.();
  }

  onCallbackDone(): void {
    this.gated = this.collecting !== null && this.collecting.gate();
  }

  private resetMarks(): void {
    this.renderMs = 0;
    this.renders = 0;
    this.calls = 0;
    this.queries = [];
    this.uploadMark = UPLOADS.bytes;
    this.buildMark = this.builds;
  }

  private unseenPrograms(): number {
    const programs = this.renderer.info.programs ?? [];
    const unseen = programs.filter((program) => !this.seenPrograms.has(program));
    for (const program of unseen) this.seenPrograms.add(program);
    return unseen.length;
  }

  private timerDelta(): Record<string, number> {
    const now = perfSnapshot();
    const delta: Record<string, number> = {};
    for (const [name, stat] of Object.entries(now)) {
      const ms = stat.total - (this.perfMark[name]?.total ?? 0);
      if (ms > 0 && !ranInWorker(name)) delta[name] = ms;
    }
    this.perfMark = now;
    return delta;
  }

  private settleReady(): void {
    while (this.pending.length > 0 && this.pending[0].queries.every((q) => this.gpu.ready(q))) {
      const { record, queries } = this.pending.shift() as Pending;
      record.gpu = queries.reduce<number>((sum, q) => sum + this.gpu.read(q), 0);
    }
  }

  private async settleGpu(records: readonly FrameRecord[]): Promise<void> {
    if (records.some((r) => !this.drew.get(r))) throw new Error('A timed frame drew nothing, so it has no render cost and no GPU time');
    if (!this.gpu.available) return;
    const gl = this.renderer.getContext();
    const settled = () => {
      gl.flush();
      return records.every((r) => r.gpu !== null);
    };
    await this.until(settled, GPU_WAIT_MS, 'GPU timer results').catch((error: Error) => {
      const open = records.filter((r) => r.gpu === null).length;
      throw new Error(`${error.message}: ${open} of ${records.length} frames open, ${this.pending.length} waiting, ${this.rounds} rounds, context lost ${gl.isContextLost()}`, { cause: error });
    });
  }

  private checkWatchers(): void {
    const now = performance.now();
    this.watchers = this.watchers.filter((watcher) => !this.finish(watcher, now));
  }

  private finish(watcher: Watcher, now: number): boolean {
    try {
      if (this.failure) watcher.reject(this.failure);
      else if (watcher.done()) watcher.resolve();
      else if (now > watcher.deadline) watcher.reject(new Error(`Timed out waiting for ${watcher.what}`));
      else return false;
    } catch (error) {
      watcher.reject(error as Error);
    }
    return true;
  }

  private wrapRender(): void {
    const original = this.renderer.render;
    this.originalRender = original;
    this.renderer.render = (scene, camera) => {
      const query = this.gpu.begin();
      const { info } = this.renderer;
      const before = info.autoReset ? 0 : info.render.calls;
      const start = performance.now();
      original.call(this.renderer, scene, camera);
      this.renderMs += performance.now() - start;
      this.calls += info.render.calls - before;
      this.gpu.end();
      this.renders++;
      if (query) this.queries.push(query);
      this.counter?.afterRender();
    };
  }

  private wrapStreamer(): void {
    const streamer = this.game.streamer as unknown as BuildingStreamer;
    const original = streamer.buildOne;
    this.originalBuild = original;
    streamer.buildOne = (...args) => {
      const built = original.apply(streamer, args);
      if (built) this.builds++;
      return built;
    };
  }
}
