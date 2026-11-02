import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { emptyHidden } from '../sim/salvage';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import { tileOf } from '../sim/vision';
import { resolve } from '../text/resolve';
import { mapSites, markName } from './map-view';

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

describe('map tips', () => {
  it('names a found town and an unfound place in both languages', () => {
    const world = blankWorld();
    world.player.discovered = ['nose'];
    world.player.explored[tileOf(world, sitePads(nose)[0])] = 1;
    world.player.explored[tileOf(world, sitePads(bowl)[0])] = 1;
    const sites = mapSites(world);
    const found = sites.find((s) => s.id === 'nose')!;
    const unfound = sites.find((s) => s.id === 'bowl')!;
    expect(resolve(markName(found), 'en')).toBe('Nose');
    expect(resolve(markName(found), 'ru')).not.toBe('???');
    expect(resolve(markName(unfound), 'en')).toBe('???');
  });
});

describe('rumored wrecks', () => {
  it('puts no mark on the map for a wreck the player was told of', () => {
    const world = blankWorld();
    world.salvage = [{ id: 'wreck7', pos: { x: 50, y: 30 }, radius: 0.6, goods: { scrap: 2 }, parts: [], hidden: emptyHidden() }];
    world.player.rumored = ['wreck7'];
    world.player.explored.fill(1);
    expect(mapSites(world).map((s) => s.id)).not.toContain('wreck7');
    expect(mapSites(world).every((s) => s.kind === 'town' || s.kind === 'site')).toBe(true);
  });
});
