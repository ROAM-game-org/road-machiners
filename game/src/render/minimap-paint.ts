import { TERRAIN, TERRAIN_TYPES } from '../data/terrain';
import type { Terrain } from '../sim/terrain';
import { shade } from './palette';

const ROAD_SHADE = 0.55;
const SLOPE_GAIN = 0.12;
const SLOPE_LIMIT = 0.35;
const UNKNOWN = 2;
const FOG = { r: 0x1c, g: 0x1a, b: 0x18 };

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
      out[i * 4] = ((base >> 16) & 0xff) * k;
      out[i * 4 + 1] = ((base >> 8) & 0xff) * k;
      out[i * 4 + 2] = (base & 0xff) * k;
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
    into[i * 4] = FOG.r;
    into[i * 4 + 1] = FOG.g;
    into[i * 4 + 2] = FOG.b;
    into[i * 4 + 3] = now === 1 ? 0 : 255;
    changed++;
  }
  return changed;
}
