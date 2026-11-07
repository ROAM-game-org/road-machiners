import { describe, expect, it } from 'vitest';
import { FORTRESS_SITES } from '../data/fortress';
import { PHYSICS } from '../data/physics';
import { REGION } from '../data/region';
import { CAR_WRECK_SINK } from '../data/rules';
import { CAR_WRECK_LOOKS } from '../data/terrain';
import { flatTerrain } from '../test/empty-world';
import { TEST_MAP } from '../test/map';
import { boxCorners } from './bridge';
import { fortressProps } from './fortress';
import { propBase, propBoxes, propObstacle, propPose, type PosedBox } from './mapgen';
import { groundAt, heightAt, type Terrain } from './terrain';
import type { Obstacle } from './types';

const S = PHYSICS.metersPerTile;
const SLACK = 0.001;
const SIZE = 40;
const LEVEL_SITES = ['dustwell', 'granary', 'green-pit', 'pump-station', 'salvage-yard', 'scrapjaw', 'kiln', 'roadhouse'];

function stepped(drop: number): Terrain {
  const t = flatTerrain(SIZE);
  for (let y = 0; y <= SIZE; y++) for (let x = 21; x <= SIZE; x++) t.heights[y * (SIZE + 1) + x] = -drop;
  return t;
}

function fort(look: 'fortShipWall' | 'fortShipTower' | 'fortShipGate'): Obstacle {
  return { id: `${look}-1`, kind: 'landmark', look, pos: { x: 20, y: 20 }, r: 4 / S, yaw: 0 };
}

const footings = (o: Obstacle): PosedBox[] => propBoxes(o).filter((b) => b.z0 <= 0);
const lowestCorner = (t: Terrain, b: PosedBox): number => Math.min(...boxCorners(b).map((c) => groundAt(t, c.x, c.y)));
const gapUnder = (t: Terrain, o: Obstacle, b: PosedBox): number => propBase(t, o) * S + b.z0 - lowestCorner(t, b) * S;

describe('the seat of a fortress piece', () => {
  it('keeps the ground under the centre on level ground', () => {
    const t = flatTerrain(SIZE);
    for (const look of ['fortShipWall', 'fortShipTower', 'fortShipGate'] as const) {
      const o = fort(look);
      expect(propBase(t, o), look).toBe(groundAt(t, o.pos.x, o.pos.y));
    }
  });

  it('sinks a wall until every ground box reaches the lowest ground under it', () => {
    const t = stepped(3);
    const wall = fort('fortShipWall');
    for (const b of footings(wall)) expect(gapUnder(t, wall, b)).toBeLessThanOrEqual(SLACK);
    expect(footings(wall).some((b) => Math.abs(gapUnder(t, wall, b)) <= SLACK)).toBe(true);
    expect(propBase(t, wall)).toBeLessThan(groundAt(t, wall.pos.x, wall.pos.y) - 2);
  });

  it('keeps wrecks on the deck height and other props on the ground under their centre', () => {
    const t = stepped(3);
    const rock: Obstacle = { id: 'rock1', kind: 'rock', pos: { x: 20, y: 20 }, r: 3 };
    expect(propBase(t, rock)).toBe(groundAt(t, 20, 20));
  });
});

describe('the seat of a wreck', () => {
  const flat = flatTerrain(SIZE);
  const spot = { x: 20, y: 20 };
  const carWreckWithLook = (model: string): Obstacle => {
    for (let k = 0; ; k++) {
      const o: Obstacle = { id: `carWreck-${k}`, kind: 'landmark', look: 'carWreck', pos: spot, r: 0.7, yaw: 0 };
      if (propPose(o).model === model) return o;
    }
  };
  const tallest = (o: Obstacle): number => Math.max(...propBoxes(o).map((b) => b.z1));

  it('sinks a lootless car wreck by its share of the height of every look', () => {
    for (const { model } of CAR_WRECK_LOOKS) {
      const o = carWreckWithLook(model);
      expect(propBase(flat, o) * S, model).toBeCloseTo(-tallest(o) * CAR_WRECK_SINK);
    }
  });

  it('keeps lootable road wrecks and rocks on the ground', () => {
    const road: Obstacle = { id: 'wreck3', kind: 'wreck', pos: spot, r: 0.7 };
    const rock: Obstacle = { id: 'rock3', kind: 'rock', pos: spot, r: 0.7 };
    expect(propBase(flat, road)).toBe(heightAt(flat, spot.x, spot.y));
    expect(propBase(flat, rock)).toBe(groundAt(flat, spot.x, spot.y));
  });

  it('keeps Chaos Highway car wrecks on the asphalt', () => {
    const highway: Terrain = { ...flat, atlas: { kind: 'highway', seed: 1, window: 0 } };
    expect(propBase(highway, carWreckWithLook('wreck'))).toBe(groundAt(highway, spot.x, spot.y));
  });
});

describe('the seat of every fortress piece on the Icarus map', () => {
  const terrain = TEST_MAP.terrain;
  const sites = [...REGION.towns, ...REGION.locations].filter((s) => s.id in FORTRESS_SITES);
  const pieces = sites.flatMap((s) => fortressProps(s).map((p, k) => ({ site: s.id, o: propObstacle(p, k) })));

  it('puts every ground box at or below the ground under all its corners', () => {
    expect(pieces.length).toBeGreaterThan(0);
    for (const { site, o } of pieces) for (const b of footings(o)) {
      expect(gapUnder(terrain, o, b), `${site} ${o.id}`).toBeLessThanOrEqual(SLACK);
    }
  });

  it('keeps the centre seat of every piece at the level sites', () => {
    const level = pieces.filter((p) => LEVEL_SITES.includes(p.site));
    expect(level.length).toBeGreaterThan(0);
    for (const { site, o } of level) expect(propBase(terrain, o), `${site} ${o.id}`).toBe(groundAt(terrain, o.pos.x, o.pos.y));
  });

  it('stands the two Nose walls at the rock ends in the yard', () => {
    const nose = pieces.filter((p) => p.site === 'nose');
    const sunk = nose.filter(({ o }) => (groundAt(terrain, o.pos.x, o.pos.y) - propBase(terrain, o)) * S > 10);
    expect(sunk.length).toBe(2);
    for (const { o } of sunk) expect(propBase(terrain, o) * S).toBeLessThan(92);
  });
});
