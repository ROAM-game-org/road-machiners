import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import { tileOf } from '../sim/vision';
import { mapSites } from './map-view';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const nose = REGION.towns.find((t) => t.id === 'nose')!;

function blankWorld() {
  const world = emptyWorld(sitePads(bowl)[0]);
  world.player.explored.fill(0);
  world.player.discovered = [];
  return world;
}

describe('map site marks', () => {
  it('leaves a told town off the map until its ground is explored', () => {
    const world = blankWorld();
    world.player.discovered = ['nose'];
    expect(mapSites(world).some((s) => s.id === 'nose')).toBe(false);
    world.player.explored[tileOf(world, sitePads(nose)[0])] = 1;
    expect(mapSites(world).find((s) => s.id === 'nose')).toMatchObject({ kind: 'town', known: true });
  });

  it('marks an explored but unfound site as unknown', () => {
    const world = blankWorld();
    world.player.explored[tileOf(world, sitePads(bowl)[0])] = 1;
    expect(mapSites(world).find((s) => s.id === 'bowl')).toMatchObject({ known: false });
  });
});
