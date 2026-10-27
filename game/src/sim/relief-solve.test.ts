import { describe, expect, it } from 'vitest';
import { RELIEF_SOLVE } from '../data/terrain';
import { heldHeight, sampleGrid, smoothRoadBeds, solveRelief, type ReliefGrid, type SolveInput, type SolveRules } from './relief-solve';

const RULES: SolveRules = { ...RELIEF_SOLVE, steps: 120 };

function strip(n: number, upliftAt: (i: number, j: number) => number): SolveInput {
  const uplift = new Float32Array(n * n);
  const base = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    uplift[j * n + i] = upliftAt(i, j);
    if (j === n - 1) base[j * n + i] = 1;
  }
  return { n, uplift, base };
}

describe('relief solve', () => {
  it('keeps the outlet row at base level and raises land away from it', () => {
    const n = 24;
    const h = solveRelief(strip(n, () => 0.1), RULES);
    expect(h[(n - 1) * n + 5]).toBe(RULES.baseLevel);
    expect(h[2 * n + 12]).toBeGreaterThan(h[(n - 4) * n + 12]);
  });

  it('stands taller where uplift is faster', () => {
    const n = 24;
    const h = solveRelief(strip(n, (i) => (i < n / 2 ? 0.05 : 0.2)), RULES);
    expect(h[3 * n + 18]).toBeGreaterThan(h[3 * n + 5]);
  });

  it('cuts valleys, so a crest stands above the cells beside its valley floor', () => {
    const n = 32;
    const h = solveRelief(strip(n, () => 0.2), RULES);
    const row = Array.from({ length: n }, (_, i) => h[8 * n + i]);
    expect(Math.max(...row) - Math.min(...row)).toBeGreaterThan(0.5);
  });

  it('refuses a diffusion step that would flip a checkerboard instead of damping it', () => {
    expect(() => solveRelief(strip(8, () => 0.1), { ...RULES, diffusion: 0.2 })).toThrow(/stable/);
  });

  it('holds a town flat at the macro height of its centre and leaves land past its margin alone', () => {
    const n = 40;
    const g: ReliefGrid = { n, cell: 4, heights: Float32Array.from({ length: n * n }, (_, k) => (k % n) * 0.5) };
    const town = { pos: { x: 80, y: 80 }, radius: 20 };
    const far = { x: 80 + town.radius + RELIEF_SOLVE.hold.margin + 4, y: 80 };
    expect(heldHeight(g, [town], town.pos.x + town.radius * 0.9, town.pos.y)).toBeCloseTo(heldHeight(g, [town], town.pos.x, town.pos.y), 5);
    expect(heldHeight(g, [town], far.x, far.y)).toBeCloseTo(sampleGrid(g, far.x, far.y), 5);
  });

  it('lays a road over the mean level of cut land beside it and smooths its bed, not in a trough', () => {
    const n = 64;
    const cell = 4;
    const g: ReliefGrid = { n, cell, heights: solveRelief(strip(n, () => 0.2), RULES) };
    const road = n * cell / 2;
    const column = (x: number) => Array.from({ length: n - 8 }, (_, j) => sampleGrid(g, x, (j + 4) * cell));
    const bumpiness = (line: number[]) => line.slice(1).reduce((s, h, k) => s + Math.abs(h - line[k]), 0);
    const rough = bumpiness(column(road));
    g.heights = smoothRoadBeds(g, (x) => Math.abs(x - road));
    const mean = (line: number[]) => line.reduce((s, h) => s + h, 0) / line.length;
    const beside = (mean(column(road - 70)) + mean(column(road + 70))) / 2;
    expect(Math.abs(mean(column(road)) - beside)).toBeLessThan(1);
    expect(bumpiness(column(road))).toBeLessThan(rough / 2);
  });
});
