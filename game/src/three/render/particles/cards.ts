import * as THREE from 'three';
import { count } from '../../../perf';
import { uploadFirst } from '../uploads';
import { TUNING } from '../inkTuning';
import { ATLAS_CELLS, CARD_SHAPES, CARD_VERTEX, CLUMP_FIRST, CLUMP_SHAPES, DENSITY_FRAGMENT, DUST_RIM, GLOW_FRAGMENT, LIT_FRAGMENT } from './cardShaders';

export { CARD_SHAPES, CLUMP_FIRST, CLUMP_SHAPES, GLOW_IN_LIT, HAZE_SHAPE, PLUME_SHAPE, ROUND_SHAPE } from './cardShaders';

export type CardKind = 'lit' | 'glow' | 'density';

export const CARD_CLOCK = { value: 0 };

const ATLAS_CELL_PX = 128;
const ATLAS_PX = ATLAS_CELL_PX * ATLAS_CELLS;
const CLOUD_LUMPS: LumpLook = { min: 4, spread: 3, reachFrom: 0.1, reachSpread: 0.08, blurPx: 6 };
const CLUMP_LUMPS: LumpLook = { min: 4, spread: 3, reachFrom: 0.16, reachSpread: 0.1, blurPx: 7 };
const GRAIN = { strength: 1.1, cut: 0.25, soft: 0.6, rim: 0.5, rimWidth: 0.14, layers: [[5, 0.4], [10, 0.3], [20, 0.2], [40, 0.1]] as const };
export const CARD_ORDER = { lit: 904, glow: 906 };
const FILL_ALPHA_STEPS = 64;
export const OVERFILL_COUNTER = 'fx.cards.overfilled';

type LumpLook = { min: number; spread: number; reachFrom: number; reachSpread: number; blurPx: number };

export function clumpShape(pick: number): number {
  if (!(pick >= 0 && pick < 1)) throw new Error(`Clump pick must be in 0 to 1, got ${pick}`);
  return CLUMP_FIRST + Math.floor(pick * CLUMP_SHAPES);
}

export type CardLight = { sunDir: THREE.Vector3; sun: THREE.Color; sky: THREE.Color; ground: THREE.Color };

export type FxCards = { lit: CardBatch; glow: CardBatch; dust: CardBatch; bank: CardBatch; fire: CardBatch };

export function bankCardsOf(cards: FxCards): CardBatch {
  return TUNING.fxInk.value >= INK_DUST_LAYER ? cards.bank : cards.lit;
}

export function dustCardsOf(cards: FxCards): CardBatch {
  return TUNING.fxInk.value >= INK_DUST_LAYER ? cards.dust : cards.lit;
}

export function fireCardsOf(cards: FxCards, main: CardBatch): CardBatch {
  return TUNING.fxInk.value >= INK_DUST_LAYER ? cards.fire : main;
}

export const INK_DUST_LAYER = 0.5;

export type Card = {
  x: number;
  y: number;
  z: number;
  size: number;
  spin: number;
  shape: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  sx: number;
  sy: number;
  sz: number;
};

const DEPTH_BINS = 4096;

const emptyCard =(): Card => ({ x: 0, y: 0, z: 0, size: 0, spin: 0, shape: 0, r: 0, g: 0, b: 0, alpha: 0, sx: 0, sy: 0, sz: 0 });

export class CardBatch {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly uniforms = {
    shapes: { value: null as THREE.Texture | null },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() },
    skyColor: { value: new THREE.Color() },
    groundColor: { value: new THREE.Color() },
    sceneDepth: { value: null as THREE.Texture | null },
    densitySize: { value: new THREE.Vector2(1, 1) },
    nearFar: { value: new THREE.Vector2(0, 1) },
    densityRim: { value: new THREE.Vector2(DUST_RIM.inner, DUST_RIM.outer) },
    sandTint: { value: 0 },
    playSeconds: CARD_CLOCK,
    fxInk: TUNING.fxInk,
    smokeLines: TUNING.smokeLines,
    shadeDark: TUNING.shadeDark,
    shadeShift: TUNING.shadeShift,
    castDark: TUNING.castDark,
  };
  private readonly offsets: THREE.InstancedBufferAttribute;
  private readonly stretches: THREE.InstancedBufferAttribute;
  private readonly sizeSpins: THREE.InstancedBufferAttribute;
  private readonly shapes: THREE.InstancedBufferAttribute;
  private readonly tints: THREE.InstancedBufferAttribute;
  private readonly cards: Card[] = [];
  private readonly pool: Card[] = [];
  private readonly ordered: Card[] = [];
  private readonly depths: Float32Array;
  private readonly binStarts = new Int32Array(DEPTH_BINS + 1);
  private readonly depth = new THREE.Vector3();

  constructor(private readonly capacity: number, private readonly kind: CardKind, shapes: THREE.Texture, private readonly fillScreens: number) {
    if (!(fillScreens > 0)) throw new Error(`CardBatch needs a positive fill ceiling, got ${fillScreens}`);
    this.depths = new Float32Array(capacity);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.offsets = this.attribute('offset', 3);
    this.stretches = this.attribute('stretch', 3);
    this.sizeSpins = this.attribute('sizeSpin', 2);
    this.shapes = this.attribute('shape', 1);
    this.tints = this.attribute('tint', 4);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, cardMaterial(kind, this.uniforms));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'glow' ? CARD_ORDER.glow : CARD_ORDER.lit;
    this.uniforms.shapes.value = shapes;
  }

  drawn(): number {
    return this.geo.instanceCount;
  }

  readDepth(depth: THREE.Texture, size: THREE.Vector2, camera: THREE.OrthographicCamera): void {
    const u = this.uniforms;
    u.sceneDepth.value = depth;
    u.densitySize.value.copy(size);
    u.nearFar.value.set(camera.near, camera.far);
  }

  tintTowardSand(share: { value: number }): void {
    this.uniforms.sandTint = share;
  }

  fadeDensityRim(rim: { inner: number; outer: number }): void {
    if (this.kind !== 'density') throw new Error(`Only density cards have a density rim, this batch draws ${this.kind}`);
    this.uniforms.densityRim.value.set(rim.inner, rim.outer);
  }

  light(l: CardLight): void {
    const u = this.uniforms;
    u.sunDir.value.copy(l.sunDir);
    u.sunColor.value.copy(l.sun);
    u.skyColor.value.copy(l.sky);
    u.groundColor.value.copy(l.ground);
  }

  push(card: Card): void {
    Object.assign(this.slot(), card);
  }

  slot(): Card {
    if (this.cards.length >= this.capacity) throw new Error(`CardBatch over its ${this.capacity} cards; the client pools must cap below it`);
    const card = (this.pool[this.cards.length] ??= emptyCard());
    this.cards.push(card);
    return card;
  }

  flush(camera: THREE.Camera): void {
    this.fitFill(camera);
    if (this.kind === 'lit') this.sortBackToFront(camera);
    this.cards.forEach((c, i) => {
      this.offsets.setXYZ(i, c.x, c.y, c.z);
      this.stretches.setXYZ(i, c.sx, c.sy, c.sz);
      this.sizeSpins.setXY(i, c.size, c.spin);
      this.shapes.setX(i, c.shape);
      this.tints.setXYZW(i, c.r, c.g, c.b, c.alpha);
    });
    this.geo.instanceCount = this.cards.length;
    for (const a of [this.offsets, this.stretches, this.sizeSpins, this.shapes, this.tints]) uploadFirst(a, this.cards.length);
    this.cards.length = 0;
  }

  private fitFill(camera: THREE.Camera): void {
    const e = camera.projectionMatrix.elements;
    if (e[15] !== 1) throw new Error('The card fill ceiling needs an orthographic camera');
    const screensOf = (c: Card) => c.size * e[0] * 0.5 * (c.size + Math.hypot(c.sx, c.sy, c.sz)) * e[5] * 0.5;
    let total = 0;
    for (const c of this.cards) total += screensOf(c);
    if (total <= this.fillScreens) return;
    const step = (c: Card) => Math.round(c.alpha * FILL_ALPHA_STEPS);
    this.cards.sort((a, b) => step(b) - step(a));
    let used = 0;
    let kept = 0;
    while (kept < this.cards.length && used + screensOf(this.cards[kept]) <= this.fillScreens) used += screensOf(this.cards[kept++]);
    count(OVERFILL_COUNTER, this.cards.length - kept);
    this.cards.length = kept;
  }

  private sortBackToFront(camera: THREE.Camera): void {
    const { nearest, farthest } = this.measureDepths(camera.getWorldDirection(this.depth));
    const span = farthest - nearest;
    if (!(span > 0)) return;
    const scale = (DEPTH_BINS - 1) / span;
    const n = this.cards.length;
    const binOf = (i: number) => this.binOf((farthest - this.depths[i]) * scale);
    this.binStarts.fill(0);
    for (let i = 0; i < n; i++) this.binStarts[binOf(i) + 1]++;
    for (let b = 1; b <= DEPTH_BINS; b++) this.binStarts[b] += this.binStarts[b - 1];
    for (let i = 0; i < n; i++) this.ordered[this.binStarts[binOf(i)]++] = this.cards[i];
    for (let i = 0; i < n; i++) this.cards[i] = this.ordered[i];
  }

  private binOf(position: number): number {
    const bin = Math.floor(position);
    return bin >= 0 && bin < DEPTH_BINS ? bin : 0;
  }

  private measureDepths(look: THREE.Vector3): { nearest: number; farthest: number } {
    let nearest = Infinity;
    let farthest = -Infinity;
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const depth = c.x * look.x + c.y * look.y + c.z * look.z;
      this.depths[i] = depth;
      if (!Number.isFinite(depth)) continue;
      nearest = Math.min(nearest, depth);
      farthest = Math.max(farthest, depth);
    }
    return { nearest, farthest };
  }

  private attribute(name: string, size: number): THREE.InstancedBufferAttribute {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute(name, a);
    return a;
  }
}

const CARD_LOOKS: Record<CardKind, Pick<THREE.ShaderMaterialParameters, 'fragmentShader' | 'blending' | 'blendSrc' | 'blendDst' | 'depthTest'>> = {
  lit: { fragmentShader: LIT_FRAGMENT, blending: THREE.NormalBlending },
  glow: { fragmentShader: GLOW_FRAGMENT, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor },
  density: { fragmentShader: DENSITY_FRAGMENT, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false },
};

function cardMaterial(kind: CardKind, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: CARD_VERTEX, uniforms, transparent: true, depthWrite: false, ...CARD_LOOKS[kind] });
}

export function createCardShapes(random: () => number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the card shape atlas');
  ctx.fillStyle = '#fff';
  drawShapes(ctx, random, 0, CARD_SHAPES, CLOUD_LUMPS);
  drawShapes(ctx, random, CLUMP_FIRST, CLUMP_SHAPES, CLUMP_LUMPS);
  ctx.filter = 'none';
  for (let i = CLUMP_FIRST; i < CLUMP_FIRST + CLUMP_SHAPES; i++) grainCell(ctx, random, (i % ATLAS_CELLS) * ATLAS_CELL_PX, Math.floor(i / ATLAS_CELLS) * ATLAS_CELL_PX);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  return texture;
}

type GrainLayer = { cells: number; weight: number; heights: number[] };

function grainCell(ctx: CanvasRenderingContext2D, random: () => number, left: number, top: number): void {
  const cell = ATLAS_CELL_PX;
  const layers: GrainLayer[] = GRAIN.layers.map(([cells, weight]) => ({ cells, weight, heights: Array.from({ length: (cells + 1) * (cells + 1) }, random) }));
  const image = ctx.getImageData(left, top, cell, cell);
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const k = (y * cell + x) * 4;
      image.data.fill(255, k, k + 3);
      image.data[k + 3] = Math.round(grainedAlpha(image.data[k + 3] / 255, x / cell, y / cell, layers) * 255);
    }
  }
  ctx.putImageData(image, left, top);
}

function grainedAlpha(alpha: number, u: number, v: number, layers: readonly GrainLayer[]): number {
  const rim = THREE.MathUtils.clamp((GRAIN.rim - Math.hypot(u - 0.5, v - 0.5)) / GRAIN.rimWidth, 0, 1);
  const noise = layers.reduce((sum, layer) => sum + layerHeight(layer, u, v) * layer.weight, 0);
  return THREE.MathUtils.clamp((alpha * rim + (noise - 0.5) * GRAIN.strength - GRAIN.cut) / GRAIN.soft, 0, 1);
}

function layerHeight(layer: GrainLayer, u: number, v: number): number {
  const x = u * layer.cells;
  const y = v * layer.cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const at = (a: number, b: number) => layer.heights[b * (layer.cells + 1) + a];
  const near = THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), x - ix);
  const far = THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), x - ix);
  return THREE.MathUtils.lerp(near, far, y - iy);
}

function drawShapes(ctx: CanvasRenderingContext2D, random: () => number, first: number, shapes: number, look: LumpLook): void {
  const cell = ATLAS_CELL_PX;
  ctx.filter = `blur(${look.blurPx}px)`;
  for (let i = first; i < first + shapes; i++) {
    const cx = (i % ATLAS_CELLS) * cell + cell / 2;
    const cy = Math.floor(i / ATLAS_CELLS) * cell + cell / 2;
    for (const lump of lumpsOf(random, look)) {
      ctx.beginPath();
      ctx.arc(cx + lump.x * cell, cy + lump.y * cell, lump.r * cell, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function lumpsOf(random: () => number, look: LumpLook): { x: number; y: number; r: number }[] {
  const n = look.min + Math.floor(random() * look.spread);
  const lumps = [{ x: 0, y: 0, r: 0.24 }];
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random();
    const reach = look.reachFrom + random() * look.reachSpread;
    lumps.push({ x: Math.cos(a) * reach, y: Math.sin(a) * reach, r: 0.12 + random() * 0.08 });
  }
  return lumps;
}
