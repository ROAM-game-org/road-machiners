import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import { tileOf } from '../sim/vision';
import { clueAreas } from '../sim/clue-areas';
import { surveySites, type SurveyContract } from '../sim/survey';
import { TEST_MAP } from '../test/map';
import { areaText } from './format';
import { areaHolding } from './map-geometry';
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

describe('clue area tips', () => {
  function heldSurvey() {
    const world = blankWorld();
    const sites = surveySites(TEST_MAP).slice(0, 2);
    const survey: SurveyContract = { id: 'ct-s', shop: sites[0].clues[0].landmark, kind: 'survey', points: sites.map((s) => ({ site: s.id, found: false, done: false })), reward: 1, deadline: 9, window: 9, tier: 1 };
    world.player.contracts = [survey];
    return { world, survey };
  }

  it('refuses an area of a contract the player does not hold', () => {
    const { world } = heldSurvey();
    const [first] = clueAreas(world);
    expect(() => areaText(blankWorld(), first)).toThrow(/does not hold/);
  });

  it('drops a surveyed place from the list', () => {
    const { world, survey } = heldSurvey();
    survey.points[0].done = true;
    expect(clueAreas(world).map((a) => a.site)).toEqual([survey.points[1].site]);
  });

  it('gives the smallest area holding the pointer', () => {
    const big = { center: { x: 10, y: 10 }, radius: 50, contractId: 'a', site: null };
    const small = { center: { x: 12, y: 10 }, radius: 5, contractId: 'b', site: null };
    expect(areaHolding([big, small], { x: 11, y: 10 })?.contractId).toBe('b');
    expect(areaHolding([big, small], { x: 40, y: 10 })?.contractId).toBe('a');
    expect(areaHolding([big, small], { x: 200, y: 10 })).toBeNull();
  });
});
