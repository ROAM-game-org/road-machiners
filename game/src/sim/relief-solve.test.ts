import { describe, expect, it } from 'vitest';
import { RELIEF_SOLVE } from '../data/terrain';
import { REGION } from '../data/region';
import { macroHeight, solveRelief, type SolveInput, type SolveRules } from './relief-solve';

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

  it('holds a town flat at the macro height of its centre', () => {
    const town = REGION.towns[0];
    const centre = macroHeight(1337, town.pos.x, town.pos.y);
    expect(macroHeight(1337, town.pos.x + town.radius * 0.9, town.pos.y)).toBeCloseTo(centre, 5);
  }, 120_000);

  it('lays the roads level with the land 70 tiles to either side, not in a trough that drains it', () => {
    const rises = REGION.roads.flatMap((road) => road.slice(1).map((b, i) => {
      const a = road[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const side = { x: ((a.y - b.y) / length) * 70, y: ((b.x - a.x) / length) * 70 };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const beside = (macroHeight(1337, mid.x + side.x, mid.y + side.y) + macroHeight(1337, mid.x - side.x, mid.y - side.y)) / 2;
      return beside - macroHeight(1337, mid.x, mid.y);
    }));
    expect(Math.abs(rises.reduce((s, r) => s + r, 0) / rises.length)).toBeLessThan(1);
  }, 120_000);
});
