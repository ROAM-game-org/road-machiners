export const MESH_STEPS = 2;
const LAND_BLUR_TILES = 1.25;

export const FOLD = { smooth: 0, cliff: 1, cliffAlongRise: 2 } as const;

export type Fold = (typeof FOLD)[keyof typeof FOLD];

const UNKNOWN_FOLD = 255;
const WARM_BLOCK = 16;
const UNKNOWN = 0;
const CALM = 1;
const ROUGH = 2;
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
  private readonly weights = gaussWeights(LAND_BLUR_TILES);
  private readonly wx = new Float64Array(4);
  private readonly wy = new Float64Array(4);

  constructor(private readonly rules: SurfaceRules) {
    this.corners = new Float64Array((rules.size + 1) ** 2).fill(NaN);
    this.folds = new Uint8Array(rules.size ** 2).fill(UNKNOWN_FOLD);
    this.calm = new Uint8Array(rules.size ** 2);
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
    const cliff = this.cliffTouching(i, j, u === i, v === j);
    if (cliff) return this.faceted(cliff.x, cliff.y, u - cliff.x, v - cliff.y);
    const smooth = this.spline(i, j, u - i, v - j);
    const near = this.cliffNear(i, j, u - i, v - j);
    return near === 0 ? smooth : smooth + (this.bilinear(i, j, u - i, v - j) - smooth) * near;
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
    this.corners[k] = sum;
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

  private calmSpline(i: number, j: number, fx: number, fy: number): number {
    splineWeights(fx, this.wx);
    splineWeights(fy, this.wy);
    const side = this.rules.size + 1;
    let h = 0;
    for (let n = 0; n < 4; n++) {
      const k = (j - 1 + n) * side + i - 1;
      let row = 0;
      for (let m = 0; m < 4; m++) {
        const known = this.corners[k + m];
        row += (known === known ? known : this.corner(i - 1 + m, j - 1 + n)) * this.wx[m];
      }
      h += row * this.wy[n];
    }
    return h;
  }

  private spline(i: number, j: number, fx: number, fy: number): number {
    splineWeights(fx, this.wx);
    splineWeights(fy, this.wy);
    let h = 0;
    for (let n = 0; n < 4; n++) {
      let row = 0;
      for (let m = 0; m < 4; m++) row += this.corner(i - 1 + m, j - 1 + n) * this.wx[m];
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
