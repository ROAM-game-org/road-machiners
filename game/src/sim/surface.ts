export const MESH_STEPS = 2;
const LAND_BLUR_TILES = 1.25;

export const FOLD = { smooth: 0, cliff: 1, cliffAlongRise: 2 } as const;

export type Fold = (typeof FOLD)[keyof typeof FOLD];

const UNKNOWN_FOLD = 255;
const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

export type SurfaceRules = {
  size: number;
  heights: ArrayLike<number>;
  foldOf: (tileX: number, tileY: number) => Fold;
};

export class GroundSurface {
  private readonly corners: Float64Array;
  private readonly folds: Uint8Array;
  private readonly weights = gaussWeights(LAND_BLUR_TILES);

  constructor(private readonly rules: SurfaceRules) {
    this.corners = new Float64Array((rules.size + 1) ** 2).fill(NaN);
    this.folds = new Uint8Array(rules.size ** 2).fill(UNKNOWN_FOLD);
  }

  foldAt(tileX: number, tileY: number): Fold {
    const n = this.rules.size;
    if (tileX < 0 || tileY < 0 || tileX >= n || tileY >= n) return FOLD.smooth;
    const k = tileY * n + tileX;
    if (this.folds[k] === UNKNOWN_FOLD) this.folds[k] = this.rules.foldOf(tileX, tileY);
    return this.folds[k] as Fold;
  }

  heightAt(x: number, y: number): number {
    const u = onMap(x, this.rules.size);
    const v = onMap(y, this.rules.size);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const cliff = this.cliffTouching(i, j, u === i, v === j);
    if (cliff) return this.faceted(cliff.x, cliff.y, u - cliff.x, v - cliff.y);
    const smooth = this.spline(i, j, u - i, v - j);
    const near = this.cliffNear(i, j, u - i, v - j);
    return near === 0 ? smooth : smooth + (this.bilinear(i, j, u - i, v - j) - smooth) * near;
  }

  slopeAt(x: number, y: number): { x: number; y: number } {
    const e = 0.5 / MESH_STEPS;
    return { x: (this.heightAt(x + e, y) - this.heightAt(x - e, y)) / (2 * e), y: (this.heightAt(x, y + e) - this.heightAt(x, y - e)) / (2 * e) };
  }

  private corner(i: number, j: number): number {
    const n = this.rules.size;
    if (offMap(i, j, n)) return pastEdge(i, j, n, (x, y) => this.corner(x, y));
    const k = j * (n + 1) + i;
    const known = this.corners[k];
    if (known === known) return known;
    this.corners[k] = this.touchesCliff(i, j) ? this.rules.heights[k] : blurredAt(this.raw, this.weights, i, j);
    return this.corners[k];
  }

  private readonly raw = (i: number, j: number): number => {
    const n = this.rules.size;
    if (offMap(i, j, n)) return pastEdge(i, j, n, this.raw);
    return this.rules.heights[j * (n + 1) + i];
  };

  private touchesCliff(i: number, j: number): boolean {
    return this.foldAt(i - 1, j - 1) !== FOLD.smooth || this.foldAt(i, j - 1) !== FOLD.smooth || this.foldAt(i - 1, j) !== FOLD.smooth || this.foldAt(i, j) !== FOLD.smooth;
  }

  private cliffTouching(i: number, j: number, onColumn: boolean, onRow: boolean): { x: number; y: number } | null {
    for (const dy of onRow ? [0, -1] : [0])
      for (const dx of onColumn ? [0, -1] : [0])
        if (this.foldAt(i + dx, j + dy) !== FOLD.smooth) return { x: i + dx, y: j + dy };
    return null;
  }

  private cliffNear(i: number, j: number, fx: number, fy: number): number {
    let near = 0;
    for (const [dx, dy] of NEIGHBOURS) if (this.foldAt(i + dx, j + dy) !== FOLD.smooth) near = Math.max(near, Math.min(towards(dx, fx), towards(dy, fy)));
    return near;
  }

  private bilinear(i: number, j: number, fx: number, fy: number): number {
    const a = this.corner(i, j);
    const d = this.corner(i + 1, j);
    const b = this.corner(i, j + 1);
    const c = this.corner(i + 1, j + 1);
    return a + (d - a) * fx + (b - a) * fy + (a - b - d + c) * fx * fy;
  }

  private faceted(i: number, j: number, fx: number, fy: number): number {
    const a = this.corner(i, j);
    const d = this.corner(i + 1, j);
    const b = this.corner(i, j + 1);
    const c = this.corner(i + 1, j + 1);
    if (this.foldAt(i, j) === FOLD.cliffAlongRise) return fx >= fy ? a + (d - a) * fx + (c - d) * fy : a + (c - b) * fx + (b - a) * fy;
    return fx + fy <= 1 ? a + (d - a) * fx + (b - a) * fy : c + (b - c) * (1 - fx) + (d - c) * (1 - fy);
  }

  private spline(i: number, j: number, fx: number, fy: number): number {
    const wx = splineWeights(fx);
    const wy = splineWeights(fy);
    let h = 0;
    for (let n = 0; n < 4; n++) for (let m = 0; m < 4; m++) h += this.corner(i - 1 + m, j - 1 + n) * wx[m] * wy[n];
    return h;
  }
}

function towards(step: number, f: number): number {
  if (step === 0) return 1;
  return step < 0 ? 1 - f : f;
}

function onMap(v: number, n: number): number {
  return Math.min(n, Math.max(0, v));
}

function offMap(i: number, j: number, n: number): boolean {
  return Math.min(i, j) < 0 || Math.max(i, j) > n;
}

function pastEdge(i: number, j: number, n: number, at: (x: number, y: number) => number): number {
  if (i < 0) return 2 * at(0, j) - at(-i, j);
  if (i > n) return 2 * at(n, j) - at(2 * n - i, j);
  if (j < 0) return 2 * at(i, 0) - at(i, -j);
  return 2 * at(i, n) - at(i, 2 * n - j);
}

function splineWeights(f: number): [number, number, number, number] {
  const g = 1 - f;
  return [(g * g * g) / 6, (4 + f * f * (3 * f - 6)) / 6, (1 + 3 * f + 3 * f * f - 3 * f * f * f) / 6, (f * f * f) / 6];
}

export function surfaceTriangles(surface: GroundSurface, x: number, y: number, width: number, depth: number): number[] {
  const index: number[] = [];
  const cols = width * MESH_STEPS;
  const row = cols + 1;
  for (let j = 0; j < depth * MESH_STEPS; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * row + i;
      const b = a + row;
      const c = b + 1;
      const d = a + 1;
      if (surface.foldAt(x + Math.floor(i / MESH_STEPS), y + Math.floor(j / MESH_STEPS)) === FOLD.cliffAlongRise) index.push(a, b, c, a, c, d);
      else index.push(a, b, d, b, c, d);
    }
  return index;
}

const GAUSS_REACH = 3;

export function blurredHeights(heights: ArrayLike<number>, side: number, spreadTiles: number): Float32Array {
  const from = Float32Array.from(heights);
  if (spreadTiles <= 0) return from;
  const weights = gaussWeights(spreadTiles);
  const across = new Float32Array(side * side);
  blurLine(from, across, side, weights, 1, side);
  blurLine(across, from, side, weights, side, 1);
  return from;
}

export function blurredAt(heightAt: (x: number, y: number) => number, weights: Float64Array, x: number, y: number): number {
  const radius = (weights.length - 1) / 2;
  let sum = 0;
  for (let b = -radius; b <= radius; b++) {
    let line = 0;
    for (let a = -radius; a <= radius; a++) line += weights[a + radius] * heightAt(x + a, y + b);
    sum += weights[b + radius] * line;
  }
  return sum;
}

export function gaussWeights(spreadTiles: number): Float64Array {
  const radius = Math.ceil(GAUSS_REACH * spreadTiles);
  const weights = Float64Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * spreadTiles * spreadTiles)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => w / total);
}

function blurLine(from: Float32Array, to: Float32Array, side: number, weights: Float64Array, along: number, across: number): void {
  const radius = (weights.length - 1) / 2;
  for (let line = 0; line < side; line++)
    for (let i = 0; i < side; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += weights[k + radius] * from[line * across + Math.min(side - 1, Math.max(0, i + k)) * along];
      to[line * across + i * along] = sum;
    }
}
