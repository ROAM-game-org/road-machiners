import { TERRAIN, TERRAIN_TYPES } from '../data/terrain';
import type { Terrain } from '../sim/terrain';
import { shade } from './palette';

const ROAD_SHADE = 0.55;
const SLOPE_GAIN = 0.12;
const SLOPE_LIMIT = 0.35;
const UNKNOWN = 2;
export const QUEST_ART_RAMP = {
  ramp: [0x1a1410, 0x3a2418, 0x5e3420, 0x8a5e44, 0xb47f5d, 0xd9a878, 0xf0d2a8, 0xf4e8d4],
  steps: 12,
  colorKeep: 0.6,
  originalMix: 0.5,
  grain: 6,
};
const { ramp: RAMP, steps: RAMP_STEPS, colorKeep: COLOR_KEEP, originalMix: ORIGINAL_MIX, grain: GRAIN } = QUEST_ART_RAMP;
const PAPER_SHADE = 0.62;
const LUMA_LOW = 0.12;
const LUMA_HIGH = 0.85;

function paperOf(light: number): [number, number, number] {
  return [((light >> 16) & 0xff) * PAPER_SHADE, ((light >> 8) & 0xff) * PAPER_SHADE, (light & 0xff) * PAPER_SHADE];
}

export const PAPER = paperOf(RAMP[RAMP.length - 2]);

function colorOf(type: string): number {
  const def = (TERRAIN_TYPES as Record<string, { color: number } | undefined>)[type];
  if (!def) throw new Error(`Terrain type ${type} has no map colour`);
  return type === 'road' ? shade(def.color, ROAD_SHADE) : def.color;
}

function hillshade(t: Terrain, x: number, y: number): number {
  const row = t.size + 1;
  const k = y * row + x;
  const rise = (t.heights[k + row + 1] - t.heights[k]) * TERRAIN.light.x + (t.heights[k + row] - t.heights[k + 1]) * TERRAIN.light.y;
  return 1 + Math.max(-SLOPE_LIMIT, Math.min(SLOPE_LIMIT, rise * SLOPE_GAIN));
}

function rampColor(luma: number): [number, number, number] {
  const unit = Math.max(0, Math.min(1, (luma - LUMA_LOW) / (LUMA_HIGH - LUMA_LOW)));
  const stepped = Math.round(unit * RAMP_STEPS) / RAMP_STEPS;
  const at = stepped * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(at));
  const f = at - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  const mix = (shift: number) => ((a >> shift) & 0xff) * (1 - f) + ((b >> shift) & 0xff) * f;
  return [mix(16), mix(8), mix(0)];
}

function grain(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h & 0xffff) / 0xffff - 0.5) * 2 * GRAIN;
}

function parchment(r: number, g: number, b: number, noise: number): [number, number, number] {
  const luma = (r * 0.3 + g * 0.6 + b * 0.1) / 255;
  const mapped = rampColor(luma);
  const grey = (r + g + b) / 3;
  const original = [r, g, b];
  return mapped.map((m, c) => (m + (original[c] - grey) * COLOR_KEEP) * (1 - ORIGINAL_MIX) + original[c] * ORIGINAL_MIX + noise) as [number, number, number];
}

export function paintBase(t: Terrain): Uint8ClampedArray {
  const out = new Uint8ClampedArray(t.size * t.size * 4);
  const colors = new Map<string, number>();
  for (let y = 0; y < t.size; y++) {
    for (let x = 0; x < t.size; x++) {
      const i = y * t.size + x;
      const type = t.types[i];
      let base = colors.get(type);
      if (base === undefined) {
        base = colorOf(type);
        colors.set(type, base);
      }
      const k = hillshade(t, x, y);
      const [r, g, b] = parchment(((base >> 16) & 0xff) * k, ((base >> 8) & 0xff) * k, (base & 0xff) * k, grain(i));
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

export function newFogImage(size: number): { image: Uint8ClampedArray; previous: Uint8Array } {
  return { image: new Uint8ClampedArray(size * size * 4), previous: new Uint8Array(size * size).fill(UNKNOWN) };
}

export function paintFog(explored: Uint8Array, into: Uint8ClampedArray, previous: Uint8Array): number {
  let changed = 0;
  for (let i = 0; i < explored.length; i++) {
    const now = explored[i];
    if (now === previous[i]) continue;
    previous[i] = now;
    const noise = grain(i);
    into[i * 4] = PAPER[0] + noise;
    into[i * 4 + 1] = PAPER[1] + noise;
    into[i * 4 + 2] = PAPER[2] + noise;
    into[i * 4 + 3] = now === 1 ? 0 : 255;
    changed++;
  }
  return changed;
}
