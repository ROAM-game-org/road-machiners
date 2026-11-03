import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../data/terrain';
import { playerVehicle } from './damage';
import { emptyWorld } from './testkit';
import { groundAt } from './terrain';
import { sightRadius, visibleTiles } from './vision';
import type { World } from './types';
import type { Vec } from './vec';

const VIEW = TERRAIN.vision;

function hillyWorld(): World {
  const w = emptyWorld({ x: 30, y: 30 });
  w.obstacles = [];
  const row = w.terrain.size + 1;
  const heights = w.terrain.heights.map((_, k) => 0.6 * Math.sin((k % row) / 3.1) * Math.cos(Math.floor(k / row) / 4.3) + 0.002 * (k % 7));
  w.terrain = { ...w.terrain, heights };
  return w;
}

function referenceVisible(w: World, from: Vec): Set<number> {
  const reach = sightRadius(w, playerVehicle(w));
  const eyeZ = groundAt(w.terrain, from.x, from.y) + VIEW.eyeHeight;
  const rays = Math.ceil(2 * Math.PI * reach * VIEW.raysPerRimTile);
  const steps = Math.ceil(reach * VIEW.samplesPerTile);
  const row = steps + 1;
  const slopes = new Float64Array(rays * row);
  for (let k = 0; k < rays; k++) {
    const angle = (2 * Math.PI * k) / rays;
    let top = -Infinity;
    slopes[k * row] = top;
    for (let j = 1; j < row; j++) {
      const d = j / VIEW.samplesPerTile;
      top = Math.max(top, (groundAt(w.terrain, from.x + Math.cos(angle) * d, from.y + Math.sin(angle) * d) - eyeZ) / d);
      slopes[k * row + j] = top;
    }
  }
  const wrap = (k: number) => ((k % rays) + rays) % rays;
  const out = new Set<number>();
  for (let x = 0; x < w.size; x++) {
    for (let y = 0; y < w.size; y++) {
      const tile = { x: x + 0.5, y: y + 0.5 };
      const d = Math.hypot(tile.x - from.x, tile.y - from.y);
      if (d > reach) continue;
      if (d > VIEW.closeRadius) {
        const to = groundAt(w.terrain, tile.x, tile.y) + VIEW.eyeHeight;
        const before = Math.min(Math.ceil(d * VIEW.samplesPerTile) - 1, steps);
        const at = (Math.atan2(tile.y - from.y, tile.x - from.x) * rays) / (2 * Math.PI);
        const low = Math.floor(at);
        const share = at - low;
        const slope = slopes[wrap(low) * row + before] * (1 - share) + slopes[wrap(low + 1) * row + before] * share;
        if (slope > (to - eyeZ) / d) continue;
      }
      out.add(y * w.size + x);
    }
  }
  return out;
}

describe('visibleTiles over hills', () => {
  it('gives the tiles the horizon definition gives, from many viewpoints', () => {
    const w = hillyWorld();
    const hidden: number[] = [];
    for (const from of [{ x: 30, y: 30 }, { x: 31.37, y: 29.62 }, { x: 40.05, y: 41.9 }, { x: 12.2, y: 55.3 }]) {
      w.vehicles[0].pos = from;
      const seen = visibleTiles(w, from);
      const expected = referenceVisible(w, from);
      expect([...seen].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
      hidden.push(Math.floor(Math.PI * sightRadius(w, playerVehicle(w)) ** 2) - seen.size);
    }
    expect(hidden.some((n) => n > 50)).toBe(true);
  });
});
