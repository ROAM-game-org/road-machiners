import { HIGHWAY } from '../data/modes';
import { hashRandom } from '../sim/rng';
import type { Vec } from '../sim/vec';
import type { PaintCanvas } from './groundPaint';

const ROAD = HIGHWAY.road;
const SALT = 0x77656172;
const STEP = 0.25;
const SLOT = 28;
const TONGUE_SLOT = 50;
const CENTER_LINE_SALT = 12;
const FADE_SCALE = 18;
const FADE_FROM = 0.3;
const FADE_TO = 0.75;
const DRIFT_SCALE = 9;
const DRIFT_BASE = 0.4;
const DRIFT_GAIN = 2.6;
const DRIFT_POWER = 2.5;
const SAND_SOFT = 1.2;
const SAND_SLANT = 0.45;
const TONGUE_CHANCE = 0.55;
const PATCH_CHANCE = 0.55;
const PATCH_LIGHT_SHARE = 0.3;
const FULL = 255;

export const HALF = ROAD.asphalt + ROAD.paint.bandSpread;
export const LINE_HALF = 0.12;
export const CENTER_GAP = 0.32;
export const PATCH_SOFT = 0.8;
export const WEAR_NEUTRAL = 128;
const PATCH_REACH = WEAR_NEUTRAL - 1;

type WearField = Pick<PaintCanvas, 'size' | 'res' | 'from'>;
type Patch = { s0: number; s1: number; t0: number; t1: number; light: boolean };
type Tongue = { s: number; width: number; depth: number; side: 1 | -1 };
type Profile = { seed: number; reach: [Float32Array, Float32Array]; patches: Patch[][] };
type Segment = { a: Vec; dx: number; dy: number; length: number; from: number };
type Spot = { s: number; t: number; dist: number };

export function paintHighwayWear(field: WearField, line: readonly Vec[], seed: number): Uint8Array {
  const out = new Uint8Array(field.size * field.size * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i + 2] = WEAR_NEUTRAL;
    out[i + 3] = WEAR_NEUTRAL;
  }
  const nearest = new Float32Array(field.size * field.size).fill(Infinity);
  const segments = segmentsOf(line);
  const last = segments[segments.length - 1];
  const profile = profileOf(seed, last.from + last.length);
  for (const segment of segments) stampSegment(out, nearest, field, segment, profile);
  return out;
}

function segmentsOf(line: readonly Vec[]): Segment[] {
  const out: Segment[] = [];
  let from = 0;
  for (let i = 1; i < line.length; i++) {
    const length = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
    if (length === 0) continue;
    out.push({ a: line[i - 1], dx: (line[i].x - line[i - 1].x) / length, dy: (line[i].y - line[i - 1].y) / length, length, from });
    from += length;
  }
  if (out.length === 0) throw new Error('A highway line needs two distinct points');
  return out;
}

function stampSegment(out: Uint8Array, nearest: Float32Array, field: WearField, segment: Segment, profile: Profile): void {
  const { a, dx, dy, length } = segment;
  const b = { x: a.x + dx * length, y: a.y + dy * length };
  const reach = HALF + 1 / field.res;
  const lo = pixelOf(field, Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach);
  const hi = pixelOf(field, Math.max(a.x, b.x) + reach, Math.max(a.y, b.y) + reach);
  for (let py = Math.max(0, lo.y); py <= Math.min(field.size - 1, hi.y); py++)
    for (let px = Math.max(0, lo.x); px <= Math.min(field.size - 1, hi.x); px++) {
      const spot = spotOf(segment, field.from + (px + 0.5) / field.res, field.from + (py + 0.5) / field.res, reach);
      const k = py * field.size + px;
      if (spot && spot.dist < nearest[k]) {
        nearest[k] = spot.dist;
        stampPixel(out, k * 4, spot, profile);
      }
    }
}

function pixelOf(field: WearField, x: number, y: number): { x: number; y: number } {
  return { x: Math.floor((x - field.from) * field.res), y: Math.floor((y - field.from) * field.res) };
}

function spotOf(segment: Segment, x: number, y: number, reach: number): Spot | null {
  const { a, dx, dy, length, from } = segment;
  const rx = x - a.x;
  const ry = y - a.y;
  const along = Math.min(Math.max(rx * dx + ry * dy, 0), length);
  const across = ry * dx - rx * dy;
  const dist = Math.hypot(rx - dx * along, ry - dy * along);
  if (dist > reach) return null;
  const t = Math.min(dist, HALF);
  return { s: from + along, t: across < 0 ? -t : t, dist };
}

function stampPixel(out: Uint8Array, i: number, spot: Spot, profile: Profile): void {
  out[i] = Math.round(paintStrength(profile.seed, spot.s) * FULL);
  out[i + 1] = sandAt(spot, profile);
  out[i + 2] = Math.round(Math.min(Math.max(FULL / 2 + (spot.t / HALF) * (FULL / 2), 0), FULL));
  out[i + 3] = Math.round(WEAR_NEUTRAL + patchField(spot, profile) * PATCH_REACH);
}

function sampleAt(profile: Profile, s: number): number {
  return Math.min(Math.max(Math.round(s / STEP), 0), profile.reach[0].length - 1);
}

function sandAt(spot: Spot, profile: Profile): number {
  return Math.round(Math.max(sandFrom(spot, profile, 1), sandFrom(spot, profile, -1)) * 255);
}

function sandFrom(spot: Spot, profile: Profile, side: 1 | -1): number {
  const depth = HALF - side * spot.t;
  const reach = profile.reach[side === 1 ? 0 : 1][sampleAt(profile, spot.s + SAND_SLANT * depth)];
  return Math.min(Math.max((reach - depth) / SAND_SOFT, 0), 1);
}

function patchField(spot: Spot, profile: Profile): number {
  const slot = Math.floor(spot.s / SLOT);
  let best = 0;
  for (const patch of [...(profile.patches[slot] ?? []), ...(profile.patches[slot - 1] ?? [])]) {
    const depth = Math.min(spot.s - patch.s0, patch.s1 - spot.s, spot.t - patch.t0, patch.t1 - spot.t);
    const share = Math.min(Math.max((depth + PATCH_SOFT / 2) / PATCH_SOFT, 0), 1);
    if (share > Math.abs(best)) best = patch.light ? share : -share;
  }
  return best;
}

function profileOf(seed: number, length: number): Profile {
  const count = Math.ceil(length / STEP) + 1;
  const tongues = tonguesOf(seed, length);
  return {
    seed,
    reach: [1, -1].map((side) => Float32Array.from({ length: count }, (_, i) => reachAt(seed, side as 1 | -1, i * STEP, tongues))) as [Float32Array, Float32Array],
    patches: slots(length, SLOT).map((slot) => patchesOf(seed, slot)),
  };
}

function slots(length: number, size: number): number[] {
  return Array.from({ length: Math.ceil(length / size) + 1 }, (_, i) => i);
}

function smoothNoise(seed: number, key: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const k = f * f * (3 - 2 * f);
  const a = hashRandom(seed, SALT, key, i);
  return a + (hashRandom(seed, SALT, key, i + 1) - a) * k;
}

function paintStrength(seed: number, s: number): number {
  const n = smoothNoise(seed, CENTER_LINE_SALT, s / FADE_SCALE);
  const k = Math.min(Math.max((n - FADE_FROM) / (FADE_TO - FADE_FROM), 0), 1);
  return k * k * (3 - 2 * k);
}

function reachAt(seed: number, side: 1 | -1, s: number, tongues: Tongue[]): number {
  const drift = DRIFT_BASE + DRIFT_GAIN * smoothNoise(seed, 20 + side, s / DRIFT_SCALE) ** DRIFT_POWER;
  return tongues.reduce((reach, t) => (t.side === side ? Math.max(reach, tongueDepth(t, s)) : reach), drift);
}

function tongueDepth(t: Tongue, s: number): number {
  const k = Math.abs(s - t.s) / t.width;
  return k >= 1 ? 0 : t.depth * (1 - k * k);
}

function tonguesOf(seed: number, length: number): Tongue[] {
  const out: Tongue[] = [];
  for (const slot of slots(length, TONGUE_SLOT)) {
    if (hashRandom(seed, SALT, 30, slot, 0) >= TONGUE_CHANCE) continue;
    out.push({
      s: (slot + hashRandom(seed, SALT, 30, slot, 1)) * TONGUE_SLOT,
      width: 3 + 5 * hashRandom(seed, SALT, 30, slot, 2),
      depth: 4 + 6 * hashRandom(seed, SALT, 30, slot, 3),
      side: hashRandom(seed, SALT, 30, slot, 4) < 0.5 ? -1 : 1,
    });
  }
  return out;
}

function patchesOf(seed: number, slot: number): Patch[] {
  if (hashRandom(seed, SALT, 40, slot, 0) >= PATCH_CHANCE) return [];
  const s0 = (slot + 0.7 * hashRandom(seed, SALT, 40, slot, 1)) * SLOT;
  const t0 = -4.4 + 6.2 * hashRandom(seed, SALT, 40, slot, 2);
  return [
    {
      s0,
      s1: s0 + 2.5 + 4.5 * hashRandom(seed, SALT, 40, slot, 3),
      t0,
      t1: t0 + 1.4 + 2.2 * hashRandom(seed, SALT, 40, slot, 4),
      light: hashRandom(seed, SALT, 40, slot, 5) < PATCH_LIGHT_SHARE,
    },
  ];
}
