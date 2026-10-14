import { CONTRACTS, EFFORT } from '../data/market';
import { REGION } from '../data/region';
import type { OldPlaceType } from '../data/salvage';
import SURVEY_SITES_FILE from '../data/survey-sites.json';
import { atlasOf, type AtlasKey } from './atlas';
import { estimateTurns, haulWindow, type Contract } from './market';
import { mapObstacles, propReach } from './mapgen';
import { navLayer } from './nav/layer';
import { MAX_RADIUS, nearestRoadPoint, offRoad, oldPlaces, propHash, reachable } from './salvage';
import { randInt, randRange } from './rng';
import { siteGap } from './sites';
import type { BakedMap } from './terrain';
import type { World } from './types';
import { dist, type Vec } from './vec';

export type SurveySite = { id: string; type: OldPlaceType; pos: Vec; reach: number };

const SURVEY_SITES = SURVEY_SITES_FILE as { mapHash: string; sites: SurveySite[] };

export function surveySites(map: { hash: string; terrain: { atlas: AtlasKey } }): SurveySite[] {
  if (!atlasOf(map.terrain).oldSpots) return [];
  if (SURVEY_SITES.mapHash !== map.hash) throw new Error(`Survey sites were picked for map ${SURVEY_SITES.mapHash}, not ${map.hash}. Run npm run old-spots.`);
  return SURVEY_SITES.sites;
}

export function makeSurveySites(map: BakedMap): SurveySite[] {
  const baked = mapObstacles(map);
  const layer = navLayer(map.terrain, baked, MAX_RADIUS);
  const sites = [...REGION.towns, ...REGION.locations];
  const remote = (p: Vec) => dist(p, nearestRoadPoint(p)) >= CONTRACTS.survey.roadGap && sites.every((s) => siteGap(s, p) >= CONTRACTS.survey.siteGap);
  return oldPlaces(baked).flatMap((place) => {
    if (!remote(place.centroid)) return [];
    const order = [...place.props].sort((a, b) => propHash(map, a) - propHash(map, b));
    const spot = order.find((o) => remote(o.pos) && offRoad(o) && reachable(layer, o));
    return spot ? [{ id: `survey-${spot.id}`, type: place.type, pos: { ...spot.pos }, reach: propReach(spot) }] : [];
  });
}

export type SurveyPoint = { site: string; area: Vec; done: boolean };
export type SurveyContract = Extract<Contract, { kind: 'survey' }>;

export function surveySite(world: World, id: string): SurveySite {
  const site = surveySites({ hash: world.mapHash, terrain: world.terrain }).find((s) => s.id === id);
  if (!site) throw new Error(`No survey site ${id}`);
  return site;
}

export function isSurveyMet(c: SurveyContract): boolean {
  return c.points.every((p) => p.done);
}

export function liveSurveySites(world: World): Set<string> {
  const contracts = [...Object.values(world.shops).flatMap((s) => s.contracts), ...world.player.contracts];
  return new Set(contracts.flatMap((c) => (c.kind === 'survey' ? c.points.map((p) => p.site) : [])));
}

export function freeSurveySites(world: World, shopPos: Vec): SurveySite[] {
  const live = liveSurveySites(world);
  return surveySites({ hash: world.mapHash, terrain: world.terrain }).filter((s) => !live.has(s.id) && dist(s.pos, shopPos) <= CONTRACTS.survey.range);
}

export function surveyLoopTurns(shopPos: Vec, sites: Vec[]): number {
  let at = shopPos;
  let turns = sites.length * CONTRACTS.survey.surveyTurns;
  const left = [...sites];
  while (left.length > 0) {
    left.sort((a, b) => dist(at, a) - dist(at, b));
    const next = left.shift()!;
    turns += estimateTurns(at, next);
    at = next;
  }
  return turns + estimateTurns(at, shopPos);
}

export function surveyReward(turns: number): number {
  return Math.round(turns * EFFORT.wage[1] * CONTRACTS.survey.rewardFactor);
}

function pickSites(world: World, free: SurveySite[]): SurveySite[] {
  const rules = CONTRACTS.survey;
  const first = free[randInt(world.marketRng, 0, free.length - 1)];
  const near = free.filter((s) => s.id !== first.id && dist(s.pos, first.pos) <= rules.spread);
  const wanted = Math.min(randInt(world.marketRng, rules.count[0], rules.count[1]), 1 + near.length);
  const chosen = [first];
  while (chosen.length < wanted) chosen.push(near.splice(randInt(world.marketRng, 0, near.length - 1), 1)[0]);
  return chosen;
}

function areaAround(world: World, site: SurveySite): Vec {
  const angle = randRange(world.marketRng, 0, 2 * Math.PI);
  const offset = randRange(world.marketRng, 0, CONTRACTS.survey.areaOffset);
  return { x: site.pos.x + Math.cos(angle) * offset, y: site.pos.y + Math.sin(angle) * offset };
}

export function rollSurvey(world: World, shop: { id: string; pos: Vec }, free: SurveySite[], id: string): Contract {
  if (free.length === 0) throw new Error('A survey needs a free site');
  const sites = pickSites(world, free);
  const points = sites.map((s) => ({ site: s.id, area: areaAround(world, s), done: false }));
  const turns = surveyLoopTurns(shop.pos, sites.map((s) => s.pos));
  const window = haulWindow(turns, false);
  return { id, shop: shop.id, kind: 'survey', points, reward: surveyReward(turns), deadline: world.turn + window, window, tier: 1 };
}
