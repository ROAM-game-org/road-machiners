import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TERRAIN_TYPES, type TerrainTypeId } from '../data/terrain';
import type { Terrain } from '../sim/terrain';
import { newFogImage, paintBase, paintFog, PAPER, QUEST_ART_RAMP } from './minimap-paint';
import { TEST_MAP } from '../test/map';

function pythonConstant(source: string, name: string): string {
  const line = source.split('\n').find((l) => l.startsWith(`${name} = `));
  if (!line) throw new Error(`post.py has no ${name}`);
  return line.slice(name.length + 3).trim();
}

function brightness(img: Uint8ClampedArray, at: number): number {
  return img[at * 4] + img[at * 4 + 1] + img[at * 4 + 2];
}

function flat(types: string[], size: number): Terrain {
  return { size, heights: new Array((size + 1) * (size + 1)).fill(0), types: types as TerrainTypeId[], atlas: { kind: 'icarus' } };
}

describe('minimap paint', () => {
  it('paints every ground type with an opaque colour', () => {
    const ids = Object.keys(TERRAIN_TYPES);
    const side = 5;
    const types = Array.from({ length: side * side }, (_, i) => ids[i % ids.length]);
    const img = paintBase(flat(types, side));
    for (let i = 0; i < side * side; i++) expect(img[i * 4 + 3]).toBe(255);
  });

  it('throws on a ground type with no colour', () => {
    expect(() => paintBase(flat(['lava', 'lava', 'lava', 'lava'], 2))).toThrow(/lava/);
  });

  it('draws a road tile unlike the ground beside it', () => {
    const img = paintBase(flat(['road', 'hardpan', 'hardpan', 'hardpan'], 2));
    expect([img[0], img[1], img[2]]).not.toEqual([img[4], img[5], img[6]]);
  });

  it('paints the real map without a missing colour', () => {
    expect(paintBase(TEST_MAP.terrain).length).toBe(TEST_MAP.terrain.size ** 2 * 4);
  });

  it('clears explored tiles, covers the rest, and repaints nothing when unchanged', () => {
    const explored = new Uint8Array(4);
    explored[1] = 1;
    const { image, previous } = newFogImage(2);
    expect(paintFog(explored, image, previous)).toBe(4);
    expect(image[3]).toBe(255);
    expect(image[7]).toBe(0);
    expect(paintFog(explored, image, previous)).toBe(0);
    explored[0] = 1;
    expect(paintFog(explored, image, previous)).toBe(1);
    expect(image[3]).toBe(0);
  });

  it('leaves unknown land as bare paper, darker than the brightest known ground', () => {
    const { image, previous } = newFogImage(2);
    paintFog(new Uint8Array(4), image, previous);
    for (let i = 0; i < 4; i++) {
      for (let c = 0; c < 3; c++) expect(Math.abs(image[i * 4 + c] - PAPER[c])).toBeLessThanOrEqual(QUEST_ART_RAMP.grain + 1);
    }
    const ground = paintBase(TEST_MAP.terrain);
    let brightest = 0;
    for (let i = 0; i < TEST_MAP.terrain.size ** 2; i++) brightest = Math.max(brightest, brightness(ground, i));
    expect(brightness(image, 0)).toBeLessThan(brightest);
    expect(PAPER[0]).toBeGreaterThan(PAPER[2]);
  });

  it('keeps the quest-art ramp equal to the picture post-process', () => {
    const post = readFileSync(new URL('../../tools/quest-art/post.py', import.meta.url), 'utf8');
    const ramp = pythonConstant(post, 'RAMP').replace(/[[\]\s]/g, '').split(',').map((hex) => Number(hex));
    expect(QUEST_ART_RAMP.ramp).toEqual(ramp);
    expect(QUEST_ART_RAMP.steps).toBe(Number(pythonConstant(post, 'RAMP_STEPS')));
    expect(QUEST_ART_RAMP.colorKeep).toBe(Number(pythonConstant(post, 'COLOR_KEEP')));
    expect(QUEST_ART_RAMP.originalMix).toBe(Number(pythonConstant(post, 'ORIGINAL_MIX')));
    expect(QUEST_ART_RAMP.grain).toBe(Number(pythonConstant(post, 'GRAIN')));
  });
});
