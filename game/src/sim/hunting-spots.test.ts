import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { makeHuntingSpots, preyFamilies, traceTrips, trafficOf, type Family, type Leg, type Trip } from './hunting-spots-bake';
import { huntingSpots } from './hunting-spots';
import { defaultSetup } from './settings';
import { newWorld } from './world';
import type { World } from './types';

const CHUNK_TRIPS = 80;

let world: World;
let families: Family[];
let chunks: { family: number; trips: Trip[] }[];
const traced = new Map<number, Leg[]>();

beforeAll(() => {
  world = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
  families = preyFamilies(world);
  chunks = families.flatMap((family, index) => {
    const parts = Math.ceil(family.trips.length / CHUNK_TRIPS);
    return Array.from({ length: parts }, (_, k) => ({ family: index, trips: family.trips.slice(k * CHUNK_TRIPS, (k + 1) * CHUNK_TRIPS) }));
  });
});

describe('hunting spots', () => {
  for (let k = 0; k < 9; k++)
    it(`trace prey trips, part ${k + 1}`, () => {
      const chunk = chunks[k];
      if (!chunk) return;
      traced.set(k, traceTrips(world, chunk.trips));
    });

  it('are the spots the bake would pick now', () => {
    expect(traced.size, 'the test has too few trace parts for the prey trips, or a part was skipped').toBe(chunks.length);
    const legsOf = families.map((_, index) => chunks.flatMap((chunk, k) => (chunk.family === index ? traced.get(k)! : [])));
    const bake = makeHuntingSpots(world, trafficOf(world.size, families, legsOf, () => {}));
    const { spots, samples } = huntingSpots(TEST_MAP);
    expect({ spots, samples }).toEqual(JSON.parse(JSON.stringify(bake)));
  });

  it('refuse a map they were not baked for', () => {
    expect(() => huntingSpots({ hash: 'other', terrain: TEST_MAP.terrain })).toThrow(/Run npm run old-spots/);
  });
});
