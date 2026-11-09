import * as THREE from "three";
import type { GroundCacheUniforms } from "./groundShader";
import { tuningVersion } from "./inkTuning";

const HAZE_REACH_PX = 32;
const MOVING_LENS_DENSITY = 0.5;
const LENS_DIGITS = 7;

export type Span = { from: number; to: number };
export type Area = { x: Span; y: Span };

export function groundCacheUniforms(): GroundCacheUniforms {
  return {
    groundCacheColor: { value: null },
    groundCacheData: { value: null },
    groundCacheEdge: { value: null },
    groundCacheShift: { value: new THREE.Vector2() },
    groundCacheSize: { value: new THREE.Vector2(1, 1) },
    groundCacheDensity: { value: new THREE.Vector2(1, 1) },
    groundCacheReach: { value: HAZE_REACH_PX },
  };
}

export class GroundCache {
  private readonly targets = new Map<number, THREE.WebGLRenderTarget>();
  private density = 1;
  private lens = "";
  private readonly anchor = new THREE.Vector3();
  private readonly held = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly wide = new THREE.OrthographicCamera();
  private readonly drawSize = new THREE.Vector2();
  private shift = { x: 0, y: 0 };
  private view = "";
  private drawing = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly root: THREE.Object3D,
    private readonly reader: THREE.Material,
    private readonly writer: THREE.Material,
    private readonly writes: Record<string, THREE.IUniform>,
    private readonly uniforms: GroundCacheUniforms,
  ) {
    if (!renderer.extensions.has("EXT_color_buffer_float")) throw new Error("The ground cache needs EXT_color_buffer_float to keep height and color precise");
    reader.onBeforeRender = () => {
      if (!this.drawing) throw new Error("The cached ground was drawn outside GroundCache.draw, so its cache does not match this view");
    };
  }

  draw(camera: THREE.Camera, render: () => void): void {
    if (!(camera instanceof THREE.OrthographicCamera)) throw new Error("The ground cache shifts by whole pixels, which only holds for an orthographic camera");
    const into = this.renderer.getRenderTarget();
    if (into) this.drawSize.set(into.width, into.height);
    else this.renderer.getDrawingBufferSize(this.drawSize);
    this.held.copy(camera.position);
    try {
      this.snapAndFill(camera, into);
      this.drawing = true;
      render();
    } finally {
      this.drawing = false;
      camera.position.copy(this.held);
      camera.updateMatrixWorld();
    }
  }

  forget(): void {
    this.view = "";
    this.lens = "";
  }

  coarse(): boolean {
    return this.density < 1;
  }

  private snapAndFill(camera: THREE.OrthographicCamera, into: THREE.WebGLRenderTarget | null): void {
    camera.updateMatrixWorld();
    const p = camera.projectionMatrix.elements;
    const lens = `${this.drawSize.x}x${this.drawSize.y}|${p.map((v) => v.toPrecision(LENS_DIGITS)).join(",")}|${camera.quaternion.toArray().map((v) => v.toFixed(LENS_DIGITS)).join(",")}`;
    this.density = this.lens !== "" && lens !== this.lens ? MOVING_LENS_DENSITY : 1;
    this.lens = lens;
    const width = Math.ceil(this.drawSize.x * this.density);
    const height = Math.ceil(this.drawSize.y * this.density);
    this.uniforms.groundCacheDensity.value.set(width / this.drawSize.x, height / this.drawSize.y);
    const meterX = 2 / (p[0] * width);
    const meterY = 2 / (p[5] * height);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const view = `${lens}|${this.density}|${this.signature()}`;
    const fresh = view !== this.view;
    if (fresh) this.anchor.copy(camera.position);
    const offset = this.offset.copy(camera.position).sub(this.anchor);
    const x = Math.round(offset.dot(this.right) / meterX);
    const y = Math.round(offset.dot(this.up) / meterY);
    this.back.setFromMatrixColumn(camera.matrixWorld, 2);
    camera.position.copy(this.anchor).addScaledVector(this.right, x * meterX).addScaledVector(this.up, y * meterY).addScaledVector(this.back, offset.dot(this.back));
    camera.updateMatrixWorld();
    const target = this.targetFor(width + 2 * HAZE_REACH_PX, height + 2 * HAZE_REACH_PX);
    const now = visibleArea(x, y, width, height, HAZE_REACH_PX);
    const areas = fresh ? [now] : exposedAreas(visibleArea(this.shift.x, this.shift.y, width, height, HAZE_REACH_PX), now);
    this.view = view;
    this.shift = { x, y };
    this.uniforms.groundCacheShift.value.set(mod(x, target.width), mod(y, target.height));
    if (areas.length) this.fill(camera, target, areas, x, y, width, height);
    this.renderer.setRenderTarget(into);
  }

  private signature(): string {
    const chunks: number[] = [];
    this.root.traverseVisible((o) => {
      if ((o as THREE.Mesh).material === this.reader) chunks.push(o.id);
    });
    const map = (this.writer as THREE.MeshLambertMaterial).map;
    return `${tuningVersion()}|${map ? map.version : "none"}|${Object.values(this.writes).map((u) => valueKey(u.value)).join(";")}|${chunks.join(",")}`;
  }

  private targetFor(width: number, height: number): THREE.WebGLRenderTarget {
    const kept = this.targets.get(this.density);
    const target = kept && kept.width === width && kept.height === height ? kept : this.newTarget(width, height, kept);
    const [color, data, edge] = target.textures;
    this.uniforms.groundCacheColor.value = color;
    this.uniforms.groundCacheData.value = data;
    this.uniforms.groundCacheEdge.value = edge;
    this.uniforms.groundCacheSize.value.set(width, height);
    return target;
  }

  private newTarget(width: number, height: number, stale: THREE.WebGLRenderTarget | undefined): THREE.WebGLRenderTarget {
    stale?.dispose();
    const target = new THREE.WebGLRenderTarget(width, height, { count: 3, depthBuffer: true, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const [color, data, edge] = target.textures;
    color.type = THREE.HalfFloatType;
    data.type = THREE.FloatType;
    edge.type = THREE.UnsignedByteType;
    for (const shifted of [color, edge]) {
      shifted.minFilter = THREE.LinearFilter;
      shifted.magFilter = THREE.LinearFilter;
      shifted.wrapS = THREE.RepeatWrapping;
      shifted.wrapT = THREE.RepeatWrapping;
    }
    this.targets.set(this.density, target);
    return target;
  }

  private widened(camera: THREE.OrthographicCamera, width: number, height: number): THREE.OrthographicCamera {
    const wide = this.wide.copy(camera);
    wide.updateMatrixWorld();
    const across = width / (width + 2 * HAZE_REACH_PX);
    const down = height / (height + 2 * HAZE_REACH_PX);
    const p = wide.projectionMatrix.elements;
    p[0] *= across;
    p[12] *= across;
    p[5] *= down;
    p[13] *= down;
    wide.projectionMatrixInverse.copy(wide.projectionMatrix).invert();
    return wide;
  }

  private fill(camera: THREE.OrthographicCamera, target: THREE.WebGLRenderTarget, areas: Area[], x: number, y: number, width: number, height: number): void {
    const wide = this.widened(camera, width, height);
    const autoClear = this.renderer.autoClear;
    const swapped: THREE.Mesh[] = [];
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.material !== this.reader) return;
      mesh.material = this.writer;
      swapped.push(mesh);
    });
    this.renderer.autoClear = false;
    try {
      for (const area of areas)
        for (const across of wrapped(area.x, target.width))
          for (const down of wrapped(area.y, target.height)) {
            target.viewport.set(x - HAZE_REACH_PX - across.wrap * target.width, y - HAZE_REACH_PX - down.wrap * target.height, target.width, target.height);
            target.scissor.set(across.from - across.wrap * target.width, down.from - down.wrap * target.height, across.to - across.from, down.to - down.from);
            target.scissorTest = true;
            this.renderer.setRenderTarget(target);
            this.renderer.clear(true, true, false);
            this.renderer.render(this.root, wide);
          }
    } finally {
      this.renderer.autoClear = autoClear;
      for (const mesh of swapped) mesh.material = this.reader;
    }
  }
}

export function visibleArea(x: number, y: number, width: number, height: number, margin: number): Area {
  return { x: { from: x - margin, to: x + width + margin }, y: { from: y - margin, to: y + height + margin } };
}

export function exposedAreas(was: Area, now: Area): Area[] {
  if (!overlaps(was.x, now.x) || !overlaps(was.y, now.y)) return [now];
  const kept = { from: Math.max(now.x.from, was.x.from), to: Math.min(now.x.to, was.x.to) };
  return [...beyond(was.x, now.x).map((x) => ({ x, y: now.y })), ...beyond(was.y, now.y).map((y) => ({ x: kept, y }))];
}

function overlaps(a: Span, b: Span): boolean {
  return a.from < b.to && b.from < a.to;
}

function beyond(was: Span, now: Span): Span[] {
  const out: Span[] = [];
  if (now.to > was.to) out.push({ from: was.to, to: now.to });
  if (now.from < was.from) out.push({ from: now.from, to: was.from });
  return out;
}

export function wrapped(span: Span, size: number): (Span & { wrap: number })[] {
  const pieces: (Span & { wrap: number })[] = [];
  for (let from = span.from; from < span.to; ) {
    const wrap = Math.floor(from / size);
    const to = Math.min(span.to, (wrap + 1) * size);
    pieces.push({ from, to, wrap });
    from = to;
  }
  return pieces;
}

const LISTED = [THREE.Color, THREE.Vector2, THREE.Vector3, THREE.Vector4];

function valueKey(value: unknown): string {
  if (value instanceof THREE.Texture) return `t${value.version}`;
  if (Array.isArray(value)) return value.map(valueKey).join(",");
  if (LISTED.some((kind) => value instanceof kind)) return (value as THREE.Vector4).toArray().join(",");
  if (value === null || ["number", "boolean"].includes(typeof value)) return String(value);
  throw new Error(`The ground cache cannot tell when a ground uniform of type ${Object.prototype.toString.call(value)} changes`);
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}
