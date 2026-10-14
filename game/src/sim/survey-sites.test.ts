import { describe, expect, it } from 'vitest';
import { CONTRACTS, SHOPS } from '../data/market';
import { REGION } from '../data/region';
import { ECONOMY } from '../data/goods';
import { TEST_MAP } from '../test/map';
import { mapObstacles } from './mapgen';
import { navLayer } from './nav/layer';
import { MAX_RADIUS, nearestRoadPoint, reachable } from './salvage';
import { siteGap } from './sites';
import { makeSurveySites, surveySites } from './survey';
import { siteOf } from './market';
import { dist } from './vec';

const baked = mapObstacles(TEST_MAP);
const layer = navLayer(TEST_MAP.terrain, baked, MAX_RADIUS);
const sites = surveySites(TEST_MAP);
const rules = CONTRACTS.survey;

describe('survey sites', () => {
  it('are the sites the bake would pick now', () => {
    expect(sites).toEqual(JSON.parse(JSON.stringify(makeSurveySites(TEST_MAP))));
  });

  it('are refused for another map', () => {
    expect(() => surveySites({ hash: 'another-map', terrain: TEST_MAP.terrain })).toThrow(/npm run old-spots/);
  });

  it('lie far from every road and every town and site, with the stand point off the road too', () => {
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) {
      const roadGap = dist(s.pos, nearestRoadPoint(s.pos));
      expect(roadGap).toBeGreaterThanOrEqual(rules.roadGap);
      expect(roadGap - (s.reach + ECONOMY.useRange) * ECONOMY.interactionScale).toBeGreaterThan(REGION.roadWidth);
      for (const site of [...REGION.towns, ...REGION.locations]) expect(siteGap(site, s.pos)).toBeGreaterThanOrEqual(rules.siteGap);
    }
  });

  it('can be reached by the largest chassis from the roads', () => {
    const prop = (id: string) => baked.find((o) => `survey-${o.id}` === id)!;
    for (const s of sites) expect(reachable(layer, prop(s.id))).toBe(true);
  });

  it('give every shop at least one site in range', () => {
    for (const shop of Object.keys(SHOPS)) expect(sites.some((s) => dist(s.pos, siteOf(shop).pos) <= rules.range)).toBe(true);
  });
});
