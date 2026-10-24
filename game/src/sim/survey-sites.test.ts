import { describe, expect, it } from 'vitest';
import { CONTRACTS, SHOPS } from '../data/market';
import { REGION } from '../data/region';
import { ECONOMY } from '../data/goods';
import { TEST_MAP } from '../test/map';
import { mapObstacles } from './mapgen';
import { navLayer } from './nav/layer';
import { MAX_RADIUS, nearestRoadPoint, oldPlaces, reachable } from './salvage';
import { siteGap } from './sites';
import { makeSurveySites, surveyArea, surveyClue, surveySites, type SurveyContract } from './survey';
import { siteOf } from './market';
import { dist, type Vec } from './vec';

const baked = mapObstacles(TEST_MAP);
const layer = navLayer(TEST_MAP.terrain, baked, MAX_RADIUS);
const sites = surveySites(TEST_MAP);
const rules = CONTRACTS.survey;

describe('boat survey sites', () => {
  it('names at least one boat group of the committed map, and not every boat group', () => {
    const boats = sites.filter((site) => site.type === 'boats');
    expect(boats.length).toBeGreaterThan(0);
    expect(boats.length).toBeLessThan(sites.length);
  });
});

describe('survey sites', () => {
  it('are the sites the bake would pick now', () => {
    expect(sites).toEqual(JSON.parse(JSON.stringify(makeSurveySites(TEST_MAP))));
  });

  it('are refused for another map', () => {
    expect(() => surveySites({ hash: 'another-map', terrain: TEST_MAP.terrain })).toThrow(/npm run old-spots/);
  });

  it('lie far from every road and every town and site, every prop and its stand point too', () => {
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) {
      expect(s.props[0].pos).toEqual(s.pos);
      for (const prop of s.props) {
        const roadGap = dist(prop.pos, nearestRoadPoint(prop.pos));
        expect(roadGap).toBeGreaterThanOrEqual(rules.roadGap);
        expect(roadGap - (prop.reach + ECONOMY.useRange) * ECONOMY.interactionScale).toBeGreaterThan(REGION.roadWidth);
        for (const site of [...REGION.towns, ...REGION.locations]) expect(siteGap(site, prop.pos)).toBeGreaterThanOrEqual(rules.siteGap);
      }
    }
  });

  it('can be reached by the largest chassis from the roads', () => {
    const prop = (id: string) => baked.find((o) => `survey-${o.id}` === id)!;
    for (const s of sites) expect(reachable(layer, prop(s.id))).toBe(true);
  });

  it('each have a clue from a named place, with its distance rounded to the nearest hundred meters', () => {
    for (const s of sites) {
      expect(s.clues.length).toBeGreaterThan(0);
      for (const clue of s.clues) {
        const far = dist(siteOf(clue.landmark).pos, s.pos);
        expect(far).toBeLessThanOrEqual(rules.clue.range);
        expect(clue.tiles % rules.clue.roundTiles).toBe(0);
        expect(Math.abs(clue.tiles - far)).toBeLessThanOrEqual(rules.clue.roundTiles / 2);
      }
    }
  });

  it('only give clues that no other old place of the same kind farther off could also answer', () => {
    const places = oldPlaces(baked);
    const eighth = Math.PI / 4;
    const sector = (from: Vec, to: Vec) => (Math.round(Math.atan2(to.y - from.y, to.x - from.x) / eighth) + 8) % 8;
    for (const s of sites)
      for (const clue of s.clues) {
        const from = siteOf(clue.landmark).pos;
        const lookAlikes = places.filter(
          (q) =>
            q.type === s.type &&
            dist(q.centroid, s.pos) > rules.clue.nearby &&
            sector(from, q.centroid) === sector(from, s.pos) &&
            Math.abs(dist(from, q.centroid) - clue.tiles) <= rules.clue.band,
        );
        expect(lookAlikes, `${s.id} from ${clue.landmark}`).toEqual([]);
      }
  });

  it('drop the old places that lie among look-alikes', () => {
    const ids = sites.map((s) => s.id);
    for (const dropped of ['survey-ruin-69', 'survey-house-80', 'survey-tank-200']) expect(ids).not.toContain(dropped);
  });

  it('read the lay of the ground against the ring around them', () => {
    const lays = new Set(sites.map((s) => s.lay));
    expect([...lays].sort()).toEqual(['flat', 'hollow', 'rise']);
    for (const s of sites) if (s.type === 'lookout') expect(s.lay).toBe('rise');
  });

  it('give every shop at least one site in range', () => {
    for (const shop of Object.keys(SHOPS)) expect(sites.some((s) => dist(s.pos, siteOf(shop).pos) <= rules.range)).toBe(true);
  });
});

describe('survey clue areas', () => {
  const contractFor = (landmark: string, site: string): SurveyContract => ({ id: 'ct', shop: landmark, kind: 'survey', points: [{ site, found: false, done: false }], reward: 0, deadline: 0, window: 0, tier: 1 });

  it('hold the site of every fair clue, around the stated point and not the site', () => {
    for (const s of sites)
      for (const told of s.clues) {
        const clue = surveyClue(contractFor(told.landmark, s.id), { site: s.id, found: false, done: false });
        const area = surveyArea(clue);
        expect(dist(area.center, s.pos), `${s.id} from ${told.landmark}`).toBeLessThanOrEqual(area.radius);
        const from = siteOf(told.landmark).pos;
        expect(dist(from, area.center)).toBeCloseTo(told.tiles, 6);
      }
  });

  it('have a radius that reads only the told clue', () => {
    const [s] = sites;
    const clue = surveyClue(contractFor(s.clues[0].landmark, s.id), { site: s.id, found: false, done: false });
    expect(surveyArea(clue).radius).toBeCloseTo(rules.clue.areaShare * clue.tiles + rules.clue.roundTiles / 2, 9);
  });
});
