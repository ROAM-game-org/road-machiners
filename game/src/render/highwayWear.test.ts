import { describe, expect, it } from 'vitest';
import { highwayLine } from '../sim/highway';
import { CENTER_GAP, HALF, paintHighwayWear, PATCH_SOFT, WEAR_NEUTRAL } from './highwayWear';

const RES = 4;
const FROM = -8;
const TEXEL = 1 / RES;
const SIZE = (800 + 16) * RES;
const field = { size: SIZE, res: RES, from: FROM };
const line = highwayLine(4, 1);
const wear = paintHighwayWear(field, line, 4);

const R = 0;
const G = 1;
const B = 2;
const A = 3;
const FADE_SLOPE = (255 * 1.5 * 1.5) / (0.45 * 18);
const ACROSS_SLOPE = 127.5 / HALF;
const PATCH_SLOPE = (WEAR_NEUTRAL - 1) / PATCH_SOFT;
const BEND_SKEW = 0.1;
const bound = (slope: number, skew = 0) => slope * (TEXEL + skew) + 1;
const BIG_JUMP = 128;
const BIG_JUMP_SHARE = 0.01;

function pointOf(k: number): { x: number; y: number } {
  return { x: FROM + ((k % SIZE) + 0.5) / RES, y: FROM + (Math.floor(k / SIZE) + 0.5) / RES };
}

const CELL = 8;
const cells = new Map<string, { x: number; y: number }[]>();
for (const p of line) {
  const key = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
  cells.set(key, [...(cells.get(key) ?? []), p]);
}
function nearLine(x: number, y: number): number {
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const p of cells.get(`${Math.floor(x / CELL) + dx},${Math.floor(y / CELL) + dy}`) ?? []) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}
const inside = (k: number, within: number) => {
  const p = pointOf(k);
  return nearLine(p.x, p.y) <= within;
};
const END_MARGIN = 20;
const alongRoad = (k: number) => {
  const { y } = pointOf(k);
  return y > END_MARGIN && y < 800 - END_MARGIN;
};

const bandTexels: number[] = [];
for (let k = 0; k < SIZE * SIZE; k += 3) if (wear[k * 4 + B] !== WEAR_NEUTRAL || wear[k * 4 + A] !== WEAR_NEUTRAL || wear[k * 4] > 0 || wear[k * 4 + G] > 0) bandTexels.push(k);

function neighbourSteps(channel: number, within: number): number[] {
  const steps: number[] = [];
  for (const k of bandTexels) {
    if (k % SIZE === SIZE - 1 || !alongRoad(k) || !inside(k, within) || !inside(k + 1, within)) continue;
    steps.push(Math.abs(wear[k * 4 + channel] - wear[(k + 1) * 4 + channel]), Math.abs(wear[k * 4 + channel] - wear[(k + SIZE) * 4 + channel]));
  }
  return steps;
}

describe('highway wear', () => {
  it('paints the same bytes for the same seed and other bytes for another seed', () => {
    expect(Buffer.compare(paintHighwayWear(field, line, 4), wear)).toBe(0);
    expect(Buffer.compare(paintHighwayWear(field, line, 5), wear)).not.toBe(0);
  });

  it('writes only inside the painted band and leaves the rest neutral', () => {
    expect(bandTexels.length).toBeGreaterThan(1000);
    for (const k of bandTexels.filter((_, n) => n % 97 === 0)) expect(inside(k, HALF + 2 * TEXEL)).toBe(true);
    for (let k = 0; k < SIZE * SIZE; k += 211) {
      if (inside(k, HALF + 2 * TEXEL)) continue;
      expect([wear[k * 4], wear[k * 4 + G], wear[k * 4 + B], wear[k * 4 + A]]).toEqual([0, 0, WEAR_NEUTRAL, WEAR_NEUTRAL]);
    }
  });

  it('writes every texel the filter can read inside the band', () => {
    const near = [];
    for (let k = 0; k < SIZE * SIZE; k += 7) if (inside(k, HALF)) near.push(k);
    expect(near.length).toBeGreaterThan(1000);
    const bare = near.filter((k) => wear[k * 4 + B] === WEAR_NEUTRAL && wear[k * 4 + G] === 0 && wear[k * 4 + A] === WEAR_NEUTRAL && wear[k * 4] === 0);
    expect(bare.length / near.length).toBeLessThan(0.7);
    const edge = near.filter((k) => !inside(k, HALF - TEXEL));
    for (const k of edge.slice(0, 200)) expect(Math.abs(wear[k * 4 + B] - WEAR_NEUTRAL)).toBeGreaterThan(100);
  });

  it('keeps neighbouring texels close in the paint, across and patch fields', () => {
    const within = HALF - 2 * TEXEL;
    expect(Math.max(...neighbourSteps(R, CENTER_GAP + 1))).toBeLessThanOrEqual(bound(FADE_SLOPE));
    expect(Math.max(...neighbourSteps(B, within))).toBeLessThanOrEqual(bound(ACROSS_SLOPE));
    expect(Math.max(...neighbourSteps(A, within))).toBeLessThanOrEqual(bound(PATCH_SLOPE, BEND_SKEW));
  });

  it('ramps the sand cover instead of switching it', () => {
    const steps = neighbourSteps(G, HALF - 2 * TEXEL);
    expect(steps.length).toBeGreaterThan(1000);
    expect(steps.filter((d) => d >= BIG_JUMP).length / steps.length).toBeLessThan(BIG_JUMP_SHARE);
  });

  it('signs the across distance and crosses 128 at the line', () => {
    const left = bandTexels.filter((k) => inside(k, CENTER_GAP / 2) && wear[k * 4 + B] < WEAR_NEUTRAL - 1);
    const right = bandTexels.filter((k) => inside(k, CENTER_GAP / 2) && wear[k * 4 + B] > WEAR_NEUTRAL);
    expect(left.length).toBeGreaterThan(10);
    expect(right.length).toBeGreaterThan(10);
    for (const k of bandTexels.filter((n) => inside(n, 0.05))) expect(Math.abs(wear[k * 4 + B] - 127.5)).toBeLessThan(4);
  });

  it('draws dark and light patches, sand over the edge and a faded broken line', () => {
    const dark = bandTexels.filter((k) => wear[k * 4 + A] < 100).length;
    const light = bandTexels.filter((k) => wear[k * 4 + A] > 156).length;
    const sand = bandTexels.filter((k) => wear[k * 4 + G] > 0).length;
    const strengths = bandTexels.map((k) => wear[k * 4]);
    expect(dark).toBeGreaterThan(0);
    expect(light).toBeGreaterThan(0);
    expect(sand).toBeGreaterThan(0);
    expect(sand).toBeLessThan(bandTexels.length * 0.6);
    expect(strengths.filter((v) => v === 0).length).toBeGreaterThan(bandTexels.length * 0.1);
    expect(strengths.filter((v) => v > 128).length).toBeGreaterThan(bandTexels.length * 0.05);
  });
});
