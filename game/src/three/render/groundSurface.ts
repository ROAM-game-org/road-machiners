export const MESH_STEPS = 2;
export const REACH_TILES = 2;

export const FOLD = { smooth: 0, cliff: 1, cliffAlongRise: 2 } as const;

export type Fold = (typeof FOLD)[keyof typeof FOLD];

export class SurfacePatch {
  constructor(
    private readonly fromX: number,
    private readonly fromY: number,
    private readonly cols: number,
    private readonly corners: Float64Array,
    private readonly folds: Uint8Array,
  ) {}

  foldAt(tileX: number, tileY: number): Fold {
    return this.folds[(tileY - this.fromY) * this.cols + (tileX - this.fromX)] as Fold;
  }

  heightAt(u: number, v: number): number {
    const i = Math.floor(u);
    const j = Math.floor(v);
    const cliff = this.cliffTouching(i, j, u === i, v === j);
    if (cliff) return this.faceted(cliff.x, cliff.y, u - cliff.x, v - cliff.y);
    return this.spline(i, j, u - i, v - j);
  }

  slopeAt(u: number, v: number): { x: number; y: number } {
    const e = 0.5 / MESH_STEPS;
    return { x: (this.heightAt(u + e, v) - this.heightAt(u - e, v)) / (2 * e), y: (this.heightAt(u, v + e) - this.heightAt(u, v - e)) / (2 * e) };
  }

  private corner(i: number, j: number): number {
    return this.corners[(j - this.fromY) * (this.cols + 1) + (i - this.fromX)];
  }

  private cliffTouching(i: number, j: number, onColumn: boolean, onRow: boolean): { x: number; y: number } | null {
    for (const dy of onRow ? [0, -1] : [0])
      for (const dx of onColumn ? [0, -1] : [0])
        if (this.foldAt(i + dx, j + dy) !== FOLD.smooth) return { x: i + dx, y: j + dy };
    return null;
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

function splineWeights(f: number): [number, number, number, number] {
  const g = 1 - f;
  return [(g * g * g) / 6, (4 + f * f * (3 * f - 6)) / 6, (1 + 3 * f + 3 * f * f - 3 * f * f * f) / 6, (f * f * f) / 6];
}

export function surfaceTriangles(patch: SurfacePatch, x: number, y: number, width: number, depth: number): number[] {
  const index: number[] = [];
  const cols = width * MESH_STEPS;
  const row = cols + 1;
  for (let j = 0; j < depth * MESH_STEPS; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * row + i;
      const b = a + row;
      const c = b + 1;
      const d = a + 1;
      if (patch.foldAt(x + Math.floor(i / MESH_STEPS), y + Math.floor(j / MESH_STEPS)) === FOLD.cliffAlongRise) index.push(a, b, c, a, c, d);
      else index.push(a, b, d, b, c, d);
    }
  return index;
}
