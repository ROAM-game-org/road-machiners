import { describe, expect, it } from 'vitest';
import { HIGHWAY } from '../../data/modes';
import { PHYSICS } from '../../data/physics';
import { atlasOf, roadEdgeGap } from '../../sim/atlas';
import { highwayMap } from '../../sim/highway';
import { ROAD_MARGIN, SHOULDER_TILES, scatterPlacements, type ScatterChunk } from './scatter';

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

  describe('vegetation', () => {
    const band = ROAD_MARGIN + SHOULDER_TILES;
    const plants = chunks.flatMap((c) => [...c.scrub, ...c.desert_scrub, ...c.cactus]);
    const point = (p: { matrix: { elements: ArrayLike<number> } }) => ({ x: p.matrix.elements[12] / S, y: p.matrix.elements[14] / S });
    const typeAt = (p: { matrix: { elements: ArrayLike<number> } }) => map.terrain.types[Math.floor(point(p).y) * map.terrain.size + Math.floor(point(p).x)];

    it('is checked over a window with a bend and an outpost yard', () => {
      const pts = atlas.roads[0].points;
      const heading = (i: number) => Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
      const turn = (i: number) => Math.abs(heading(i + 10) - heading(i));
      const bends = pts.slice(0, -11).filter((_, i) => turn(i) > (10 * Math.PI) / 180 && turn(i) < Math.PI);
      expect(bends.length).toBeGreaterThan(0);
      expect(map.terrain.types.includes('concrete')).toBe(true);
    });

    it('keeps shrubs and cacti off the road, its shoulder and the yard', () => {
      const near = plants.filter((p) => roadEdgeGap(atlas, point(p), band) < band);
      const paved = plants.filter((p) => ['asphalt', 'concrete'].includes(typeAt(p)));
      expect(near).toHaveLength(0);
      expect(paved).toHaveLength(0);
    });

    it('leaves only pale stones on the asphalt', () => {
      const tufts = chunks.flatMap((c) => c.desert_scrub).filter((p) => across(p) <= HIGHWAY.road.asphalt);
      expect(tufts).toHaveLength(0);
    });

    it('keeps the shrubs on the verges', () => {
      expect(chunks.flatMap((c) => c.desert_scrub).filter((p) => roadEdgeGap(atlas, point(p), band) >= band).length).toBeGreaterThan(0);
    });
  });
});
