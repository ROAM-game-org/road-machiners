export const MESH_STEPS = 2;
const LAND_BLUR_TILES = 1.25;
const RAW_REACH = 2;
export const CLIFF_SHARPNESS = 0.5;
export const FOLD = { smooth: 0, cliff: 1, cliffAlongRise: 2 } as const;

export type Fold = (typeof FOLD)[keyof typeof FOLD];

const UNKNOWN_FOLD = 255;
const WARM_BLOCK = 16;
const UNKNOWN = 0;
const CALM = 1;
const ROUGH = 2;
const PATCH_BITS = 6;
const PATCH_MASK = (1 << PATCH_BITS) - 1;
const PATCH_SLOTS = 1 << (2 * PATCH_BITS);
const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

export type SurfaceRules = {
  size: number;
  heights: ArrayLike<number>;
  foldOf: (tileX: number, tileY: number) => Fold;
};

export class GroundSurface {
  private readonly corners: Float64Array;
  private readonly folds: Uint8Array;
  private readonly calm: Uint8Array;
  private readonly shares: Float32Array;
  private readonly weights = gaussWeights(LAND_BLUR_TILES);
  private readonly wx = new Float64Array(4);
  private readonly wy = new Float64Array(4);
  private readonly patches = new Float64Array(PATCH_SLOTS * 16);
  private readonly patchTiles = new Int32Array(PATCH_SLOTS).fill(-1);

  constructor(private readonly rules: SurfaceRules) {
    this.corners = new Float64Array((rules.size + 1) ** 2).fill(NaN);
    this.folds = new Uint8Array(rules.size ** 2).fill(UNKNOWN_FOLD);
    this.calm = new Uint8Array(rules.size ** 2);
    this.shares = new Float32Array((rules.size + 1) ** 2).fill(NaN);
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
    if (this.calmAt(i, j)) return this.calmSpline(i, j, u - i, v - j);
    const fx = u - i;
    const fy = v - j;
    const smooth = this.spline(i, j, fx, fy);
    const sharp = this.sharpShareAt(i, j, fx, fy);
    return sharp === 0 ? smooth : smooth + (this.throughCorners(i, j, fx, fy) - smooth) * sharp;
  }

  private sharpShareAt(i: number, j: number, fx: number, fy: number): number {
    const a = this.rawShare(i, j);
    const b = this.rawShare(i + 1, j);
    const c = this.rawShare(i, j + 1);
    const d = this.rawShare(i + 1, j + 1);
    return CLIFF_SHARPNESS * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
  }

  private throughCorners(i: number, j: number, fx: number, fy: number): number {
    throughWeights(fx, this.wx);
    throughWeights(fy, this.wy);
    const at = this.patchOf(i, j);
    let h = 0;
    for (let n = 0; n < 4; n++) {
      let row = 0;
      for (let m = 0; m < 4; m++) row += this.patches[at + n * 4 + m] * this.wx[m];
      h += row * this.wy[n];
    }
    return h;
  }

  grid(x0: number, y0: number, width: number, depth: number): Float64Array {
    const cols = width * MESH_STEPS + 1;
    const rows = depth * MESH_STEPS + 1;
    const across = this.splineRows(x0, y0, width, depth);
    const out = new Float64Array(rows * cols);
    for (let q = 0; q < rows; q++) {
      const step = gridStep(y0, q);
      splineWeights(step.f, this.wy);
      const from = (step.tile - y0) * cols;
      for (let p = 0; p < cols; p++) {
        let h = 0;
        for (let n = 0; n < 4; n++) h += across[from + n * cols + p] * this.wy[n];
        out[q * cols + p] = h;
      }
    }
    this.fixRough(out, x0, y0, width, depth);
    return out;
  }

  private splineRows(x0: number, y0: number, width: number, depth: number): Float64Array {
    const cols = width * MESH_STEPS + 1;
    const block = this.cornerBlock(x0 - 1, y0 - 1, width + 4, depth + 4);
    const across = new Float64Array((depth + 4) * cols);
    for (let p = 0; p < cols; p++) {
      const step = gridStep(x0, p);
      splineWeights(step.f, this.wx);
      const at = step.tile - x0;
      for (let r = 0; r < depth + 4; r++) {
        let row = 0;
        for (let m = 0; m < 4; m++) row += block[r * (width + 4) + at + m] * this.wx[m];
        across[r * cols + p] = row;
      }
    }
    return across;
  }

  private cornerBlock(x0: number, y0: number, cols: number, rows: number): Float64Array {
    this.warm(x0, y0, cols, rows);
    const block = new Float64Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) block[r * cols + c] = this.corner(x0 + c, y0 + r);
    return block;
  }

  private warm(x0: number, y0: number, cols: number, rows: number): void {
    const n = this.rules.size;
    const [xs, ys] = [Math.max(0, x0), Math.max(0, y0)];
    const [xe, ye] = [Math.min(n, x0 + cols - 1), Math.min(n, y0 + rows - 1)];
    if (xe < xs || ye < ys) return;
    const width = xe - xs + 1;
    const lines = this.blurredLines(xs, ys, xe, ye);
    for (let y = ys; y <= ye; y++) for (let x = xs; x <= xe; x++) this.settle(x, y, lines, (y - ys) * width + x - xs, width);
  }

  private blurredLines(xs: number, ys: number, xe: number, ye: number): Float64Array {
    const radius = (this.weights.length - 1) / 2;
    const width = xe - xs + 1;
    const lines = new Float64Array((ye - ys + 1 + 2 * radius) * width);
    for (let y = ys - radius; y <= ye + radius; y++)
      for (let x = xs; x <= xe; x++) {
        let line = 0;
        for (let a = -radius; a <= radius; a++) line += this.weights[a + radius] * this.raw(x + a, y);
        lines[(y - ys + radius) * width + x - xs] = line;
      }
    return lines;
  }

  private settle(x: number, y: number, lines: Float64Array, from: number, width: number): void {
    const k = y * (this.rules.size + 1) + x;
    if (this.corners[k] === this.corners[k]) return;
    if (this.touchesCliff(x, y)) {
      this.corners[k] = this.rules.heights[k];
      return;
    }
    let sum = 0;
    for (let b = 0; b < this.weights.length; b++) sum += this.weights[b] * lines[from + b * width];
    const raw = this.rawShare(x, y);
    this.corners[k] = raw === 0 ? sum : sum + (this.rules.heights[k] - sum) * raw;
  }

  private rawShare(x: number, y: number): number {
    const n = this.rules.size;
    const at = Math.min(n, Math.max(0, x));
    const k = Math.min(n, Math.max(0, y)) * (n + 1) + at;
    if (this.shares[k] !== this.shares[k]) this.shares[k] = this.touchesCliff(at, Math.min(n, Math.max(0, y))) ? 1 : this.shareNear(at, Math.min(n, Math.max(0, y)));
    return this.shares[k];
  }

  private shareNear(x: number, y: number): number {
    let nearest = Infinity;
    for (let dy = -RAW_REACH; dy <= RAW_REACH; dy++)
      for (let dx = -RAW_REACH; dx <= RAW_REACH; dx++) if ((dx !== 0 || dy !== 0) && this.touchesCliff(x + dx, y + dy)) nearest = Math.min(nearest, Math.hypot(dx, dy));
    return Math.max(0, 1 - nearest / RAW_REACH);
  }

  private fixRough(out: Float64Array, x0: number, y0: number, width: number, depth: number): void {
    const cols = width * MESH_STEPS + 1;
    for (let j = y0; j <= y0 + depth; j++)
      for (let i = x0; i <= x0 + width; i++) {
        if (this.calmAt(i, j)) continue;
        for (let q = (j - y0) * MESH_STEPS; q < Math.min((j - y0 + 1) * MESH_STEPS, depth * MESH_STEPS + 1); q++)
          for (let p = (i - x0) * MESH_STEPS; p < Math.min((i - x0 + 1) * MESH_STEPS, cols); p++) out[q * cols + p] = this.heightAt(x0 + p / MESH_STEPS, y0 + q / MESH_STEPS);
      }
  }

  slopeAt(x: number, y: number): { x: number; y: number } {
    const e = 0.5 / MESH_STEPS;
    return { x: (this.heightAt(x + e, y) - this.heightAt(x - e, y)) / (2 * e), y: (this.heightAt(x, y + e) - this.heightAt(x, y - e)) / (2 * e) };
  }

  private calmAt(i: number, j: number): boolean {
    const n = this.rules.size;
    if (Math.min(i, j) < 1 || Math.max(i, j) > n - 3) return false;
    const k = j * n + i;
    if (this.calm[k] === UNKNOWN) this.calm[k] = this.roughAround(i, j) ? ROUGH : CALM;
    return this.calm[k] === CALM;
  }

  private roughAround(i: number, j: number): boolean {
    if (this.rawShare(i, j) > 0 || this.rawShare(i + 1, j) > 0 || this.rawShare(i, j + 1) > 0 || this.rawShare(i + 1, j + 1) > 0) return true;
    return this.foldAt(i, j) !== FOLD.smooth || NEIGHBOURS.some(([dx, dy]) => this.foldAt(i + dx, j + dy) !== FOLD.smooth);
  }

  private corner(i: number, j: number): number {
    const n = this.rules.size;
    if (offMap(i, j, n)) return pastEdge(i, j, n, (x, y) => this.corner(x, y));
    const k = j * (n + 1) + i;
    if (this.corners[k] !== this.corners[k]) this.warm(i - (i % WARM_BLOCK), j - (j % WARM_BLOCK), WARM_BLOCK, WARM_BLOCK);
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

  private calmSpline(i: number, j: number, fx: number, fy: number): number {
    const at = this.patchOf(i, j);
    const c = this.patches;
    const gx = 1 - fx;
    const x0 = (gx * gx * gx) / 6;
    const x1 = (4 + fx * fx * (3 * fx - 6)) / 6;
    const x2 = (1 + 3 * fx + 3 * fx * fx - 3 * fx * fx * fx) / 6;
    const x3 = (fx * fx * fx) / 6;
    const gy = 1 - fy;
    const y0 = (gy * gy * gy) / 6;
    const y1 = (4 + fy * fy * (3 * fy - 6)) / 6;
    const y2 = (1 + 3 * fy + 3 * fy * fy - 3 * fy * fy * fy) / 6;
    const y3 = (fy * fy * fy) / 6;
    let h = 0;
    h += (c[at] * x0 + c[at + 1] * x1 + c[at + 2] * x2 + c[at + 3] * x3) * y0;
    h += (c[at + 4] * x0 + c[at + 5] * x1 + c[at + 6] * x2 + c[at + 7] * x3) * y1;
    h += (c[at + 8] * x0 + c[at + 9] * x1 + c[at + 10] * x2 + c[at + 11] * x3) * y2;
    h += (c[at + 12] * x0 + c[at + 13] * x1 + c[at + 14] * x2 + c[at + 15] * x3) * y3;
    return h;
  }

  private patchOf(i: number, j: number): number {
    const slot = ((j & PATCH_MASK) << PATCH_BITS) | (i & PATCH_MASK);
    const tile = j * (this.rules.size + 1) + i;
    if (this.patchTiles[slot] !== tile) {
      this.fillPatch(slot, i, j);
      this.patchTiles[slot] = tile;
    }
    return slot * 16;
  }

  private fillPatch(slot: number, i: number, j: number): void {
    const inside = this.patchInside(i, j);
    for (let n = 0; n < 4; n++)
      for (let m = 0; m < 4; m++) this.patches[slot * 16 + n * 4 + m] = this.patchCorner(i - 1 + m, j - 1 + n, inside);
  }

  private patchInside(i: number, j: number): boolean {
    const n = this.rules.size;
    return i >= 1 && j >= 1 && i + 2 <= n && j + 2 <= n;
  }

  private patchCorner(x: number, y: number, inside: boolean): number {
    const known = inside ? this.corners[y * (this.rules.size + 1) + x] : NaN;
    return known === known ? known : this.corner(x, y);
  }

  private spline(i: number, j: number, fx: number, fy: number): number {
    splineWeights(fx, this.wx);
    splineWeights(fy, this.wy);
    const at = this.patchOf(i, j);
    let h = 0;
    for (let n = 0; n < 4; n++) {
      let row = 0;
      for (let m = 0; m < 4; m++) row += this.patches[at + n * 4 + m] * this.wx[m];
      h += row * this.wy[n];
    }
    return h;
  }
}

function gridStep(origin: number, k: number): { tile: number; f: number } {
  const u = origin + k / MESH_STEPS;
  const tile = Math.floor(u);
  return { tile, f: u - tile };
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

function throughWeights(f: number, into: Float64Array): void {
  const f2 = f * f;
  const f3 = f2 * f;
  into[0] = (-f + 2 * f2 - f3) / 2;
  into[1] = (2 - 5 * f2 + 3 * f3) / 2;
  into[2] = (f + 4 * f2 - 3 * f3) / 2;
  into[3] = (f3 - f2) / 2;
}

function splineWeights(f: number, into: Float64Array): void {
  const g = 1 - f;
  into[0] = (g * g * g) / 6;
  into[1] = (4 + f * f * (3 * f - 6)) / 6;
  into[2] = (1 + 3 * f + 3 * f * f - 3 * f * f * f) / 6;
  into[3] = (f * f * f) / 6;
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

function gaussWeights(spreadTiles: number): Float64Array {
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
