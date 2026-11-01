import type * as THREE from 'three';
import { count, timed } from '../../perf';
import type { Vec } from '../../sim/vec';
import type { Rect, RenderScope } from './scope';

export function wantedCells(scopes: readonly RenderScope[], center: Vec, radius: number): number[] {
  const near = new Map<number, number>();
  for (const scope of scopes)
    for (const cell of scope.waitingCells()) {
      const gap = rectGap(scope.claimOf(cell), center);
      if (gap > radius) continue;
      near.set(cell, Math.min(near.get(cell) ?? Infinity, gap));
    }
  return [...near].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([cell]) => cell);
}

function rectGap(r: Rect, p: Vec): number {
  return Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));
}

export class CellStreamer {
  constructor(
    private readonly scopes: readonly RenderScope[],
    private readonly prepare: (root: THREE.Object3D) => void,
    private readonly now: () => number,
    private readonly budgetMs: number,
  ) {
    const sides = new Set(scopes.map((s) => s.cellsPerSide));
    if (sides.size !== 1) throw new Error(`Streamed scopes must share one cell grid, got ${[...sides].join(', ')} cells a side`);
  }

  get pending(): number {
    return this.scopes.reduce((sum, s) => sum + s.pendingCount, 0);
  }

  boot(center: Vec, reach: number, lead: number): void {
    for (const cell of wantedCells(this.scopes, center, Math.max(reach, lead))) this.buildCell(cell, null);
  }

  frame(center: Vec, reach: number, lead: number): void {
    const touched = new Map<RenderScope, Set<number>>();
    const blocked = wantedCells(this.scopes, center, reach);
    if (blocked.length > 0) count('stream-block', blocked.length);
    for (const cell of blocked) this.buildCell(cell, touched);
    const ahead = wantedCells(this.scopes, center, lead);
    if (ahead.length > 0) timed('stream-build', () => this.buildAhead(ahead, touched));
    for (const [scope, cells] of touched) for (const cell of cells) this.prepare(scope.groupOf(cell));
  }

  buildAll(): void {
    for (const cell of wantedCells(this.scopes, { x: 0, y: 0 }, Infinity)) this.buildCell(cell, null);
  }

  private buildAhead(cells: readonly number[], touched: Touched): void {
    const start = this.now();
    for (const cell of cells)
      while (this.waits(cell)) {
        if (this.now() - start >= this.budgetMs) return;
        this.buildOne(cell, touched);
      }
  }

  private waits(cell: number): boolean {
    return this.scopes.some((s) => s.waitingCells().has(cell));
  }

  private buildCell(cell: number, touched: Touched | null): void {
    while (this.buildOne(cell, touched));
  }

  private buildOne(cell: number, touched: Touched | null): boolean {
    for (const scope of this.scopes) {
      if (!scope.buildNext(cell)) continue;
      if (touched) touched.set(scope, (touched.get(scope) ?? new Set()).add(cell));
      return true;
    }
    return false;
  }
}

type Touched = Map<RenderScope, Set<number>>;
