import { describe, expect, it } from 'vitest';
import { HIGHWAY } from '../../data/modes';
import { PHYSICS } from '../../data/physics';
import { atlasOf } from '../../sim/atlas';
import { highwayMap } from '../../sim/highway';
import { scatterPlacements, type ScatterChunk } from './scatter';

const S = PHYSICS.metersPerTile;
const map = highwayMap(7, 0);
const atlas = atlasOf(map.terrain);
const all = (c: ScatterChunk) => [...c.pebbles, ...c.scrub, ...c.desert_stones, ...c.desert_scrub, ...c.cactus];
const across = (p: { matrix: { elements: ArrayLike<number> } }) => atlas.roadIndex.nearestWithin(p.matrix.elements[12] / S, p.matrix.elements[14] / S, HIGHWAY.road.asphalt);

describe('highway debris', () => {
  const chunks = scatterPlacements(map.terrain, []);
  const onAsphalt = chunks.flatMap(all).filter((p) => across(p) <= HIGHWAY.road.asphalt);

  it('lies on the asphalt, thicker toward the edges than in the middle lanes', () => {
    const middle = onAsphalt.filter((p) => across(p) < HIGHWAY.road.asphalt / 2).length;
    expect(onAsphalt.length - middle).toBeGreaterThan(middle * 3);
    expect(middle).toBeGreaterThan(0);
  });

  it('uses the pale desert models so it shows on the dark asphalt', () => {
    const plain = chunks.flatMap((c) => [...c.pebbles, ...c.scrub]).filter((p) => across(p) <= HIGHWAY.road.asphalt);
    expect(plain).toHaveLength(0);
  });

  it('places the same debris for the same seed', () => {
    const again = scatterPlacements(highwayMap(7, 0).terrain, []).flatMap(all).filter((p) => across(p) <= HIGHWAY.road.asphalt);
    expect(again.map((p) => p.matrix.elements[12])).toEqual(onAsphalt.map((p) => p.matrix.elements[12]));
  });
});
