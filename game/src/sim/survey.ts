import { CONTRACTS } from '../data/market';
import { REGION } from '../data/region';
import type { OldPlaceType } from '../data/salvage';
import SURVEY_SITES_FILE from '../data/survey-sites.json';
import { atlasOf, type AtlasKey } from './atlas';
import { mapObstacles, propReach } from './mapgen';
import { navLayer } from './nav/layer';
import { MAX_RADIUS, nearestRoadPoint, offRoad, oldPlaces, propHash, reachable } from './salvage';
import { siteGap } from './sites';
import type { BakedMap } from './terrain';
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
