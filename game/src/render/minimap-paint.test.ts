import { describe, expect, it } from 'vitest';
import { TERRAIN_TYPES, type TerrainTypeId } from '../data/terrain';
import type { Terrain } from '../sim/terrain';
import { newFogImage, paintBase, paintFog } from './minimap-paint';
import { TEST_MAP } from '../test/map';

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
});
