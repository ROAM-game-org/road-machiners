import { CONTRACTS, EFFORT } from '../data/market';
import { ECONOMY } from '../data/goods';
import { RULES } from '../data/rules';
import { REGION } from '../data/region';
import type { OldPlaceType } from '../data/salvage';
import SURVEY_SITES_FILE from '../data/survey-sites.json';
import { atlasOf, type AtlasKey } from './atlas';
import { directionsFromSite } from './directions';
import { estimateTurns, haulWindow, siteOf, type Contract } from './market';
import { playerVehicle } from './damage';
import { startJob } from './jobs';
import { mapObstacles, propReach } from './mapgen';
import { navLayer } from './nav/layer';
import { hasSalvage, MAX_RADIUS, nearestRoadPoint, offRoad, oldPlaces, propHash, reachable, type OldPlace } from './salvage';
import { randInt } from './rng';
import { playerCommand } from './world';
import { siteGap, type Site } from './sites';
import { tileOf } from './vision';
import { heightAt, type BakedMap, type Terrain } from './terrain';
import type { DirectionStep, Job, Vehicle, World } from './types';
import { bearing, dist, type Vec } from './vec';

export type SurveyProp = { pos: Vec; reach: number };
export type SurveyLay = 'rise' | 'hollow' | 'flat';
export type SurveyClueSource = { landmark: string; tiles: number };
export type SurveySite = { id: string; type: OldPlaceType; pos: Vec; props: SurveyProp[]; lay: SurveyLay; clues: SurveyClueSource[] };

const SURVEY_SITES = SURVEY_SITES_FILE as { mapHash: string; sites: SurveySite[] };
const COMPASS_SECTORS = 8;

export function surveySites(map: { hash: string; terrain: { atlas: AtlasKey } }): SurveySite[] {
  if (!atlasOf(map.terrain).oldSpots) return [];
  if (SURVEY_SITES.mapHash !== map.hash) throw new Error(`Survey sites were picked for map ${SURVEY_SITES.mapHash}, not ${map.hash}. Run npm run old-spots.`);
  return SURVEY_SITES.sites;
}

export function landmarks(): Site[] {
  return [...REGION.towns, ...REGION.locations];
}

export function compassSector(rad: number): number {
  const step = (2 * Math.PI) / COMPASS_SECTORS;
  return (((Math.round(rad / step) % COMPASS_SECTORS) + COMPASS_SECTORS) % COMPASS_SECTORS);
}

export function sectorBearing(sector: number): number {
  return (sector * 2 * Math.PI) / COMPASS_SECTORS;
}

export function statedTiles(tiles: number): number {
  const round = CONTRACTS.survey.clue.roundTiles;
  return Math.max(round, Math.round(tiles / round) * round);
}

function inClueRegion(from: Vec, sector: number, tiles: number, p: Vec): boolean {
  return compassSector(bearing(from, p)) === sector && Math.abs(dist(from, p) - tiles) <= CONTRACTS.survey.clue.band;
}

export function isFairClue(site: { type: OldPlaceType; pos: Vec }, landmark: Site, places: readonly OldPlace[]): boolean {
  const clue = CONTRACTS.survey.clue;
  const far = dist(landmark.pos, site.pos);
  if (far > clue.range) return false;
  const sector = compassSector(bearing(landmark.pos, site.pos));
  const tiles = statedTiles(far);
  return places.every((q) => q.type !== site.type || dist(q.centroid, site.pos) <= clue.nearby || !inClueRegion(landmark.pos, sector, tiles, q.centroid));
}

export function fairClues(site: { type: OldPlaceType; pos: Vec }, places: readonly OldPlace[]): SurveyClueSource[] {
  return landmarks()
    .filter((l) => isFairClue(site, l, places))
    .sort((a, b) => dist(a.pos, site.pos) - dist(b.pos, site.pos))
    .map((l) => ({ landmark: l.id, tiles: statedTiles(dist(l.pos, site.pos)) }));
}

export function groundRise(terrain: Terrain, pos: Vec): number {
  const ring = CONTRACTS.survey.clue.layRing;
  const samples = 16;
  let sum = 0;
  for (let k = 0; k < samples; k++) {
    const angle = (k / samples) * 2 * Math.PI;
    sum += heightAt(terrain, pos.x + Math.cos(angle) * ring, pos.y + Math.sin(angle) * ring);
  }
  return heightAt(terrain, pos.x, pos.y) - sum / samples;
}

export function layOf(terrain: Terrain, pos: Vec): SurveyLay {
  const rise = groundRise(terrain, pos);
  if (rise >= CONTRACTS.survey.clue.rise) return 'rise';
  return rise <= CONTRACTS.survey.clue.hollow ? 'hollow' : 'flat';
}

export function makeSurveySites(map: BakedMap): SurveySite[] {
  const baked = mapObstacles(map);
  const layer = navLayer(map.terrain, baked, MAX_RADIUS);
  const places = oldPlaces(baked);
  const remote = (p: Vec) => dist(p, nearestRoadPoint(p)) >= CONTRACTS.survey.roadGap && landmarks().every((s) => siteGap(s, p) >= CONTRACTS.survey.siteGap);
  return places.flatMap((place) => {
    if (!remote(place.centroid)) return [];
    const order = [...place.props].sort((a, b) => propHash(map, a) - propHash(map, b));
    const spot = order.find((o) => remote(o.pos) && offRoad(o) && reachable(layer, o, REGION.navigation.reachClimb));
    if (!spot) return [];
    const clues = fairClues({ type: place.type, pos: spot.pos }, places);
    if (clues.length === 0) return [];
    const others = order.filter((o) => o !== spot && remote(o.pos) && offRoad(o));
    const props = [spot, ...others].map((o) => ({ pos: { ...o.pos }, reach: propReach(o) }));
    return [{ id: `survey-${spot.id}`, type: place.type, pos: { ...spot.pos }, props, lay: layOf(map.terrain, spot.pos), clues }];
  });
}

export type SurveyPoint = { site: string; found: boolean; done: boolean };
export type SurveyContract = Extract<Contract, { kind: 'survey' }>;

export function surveyPlaceType(id: string): OldPlaceType {
  const site = SURVEY_SITES.sites.find((s) => s.id === id);
  if (!site) throw new Error(`No survey site ${id}`);
  return site.type;
}

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
  let turns = sites.length * (CONTRACTS.survey.surveyTurns + CONTRACTS.survey.searchTurns);
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

export function rollSurvey(world: World, shop: { id: string; pos: Vec }, free: SurveySite[], id: string): Contract {
  if (free.length === 0) throw new Error('A survey needs a free site');
  const sites = pickSites(world, free);
  const points = sites.map((s) => ({ site: s.id, found: false, done: false }));
  const turns = surveyLoopTurns(shop.pos, sites.map((s) => s.pos));
  const window = haulWindow(turns, false);
  return { id, shop: shop.id, kind: 'survey', points, reward: surveyReward(turns), deadline: world.turn + window, window, tier: 1 };
}

export type SurveyClue = { type: OldPlaceType; landmark: string; rad: number; tiles: number; lay: SurveyLay };

export function surveyClue(c: SurveyContract, point: SurveyPoint): SurveyClue {
  const site = SURVEY_SITES.sites.find((s) => s.id === point.site);
  if (!site) throw new Error(`No survey site ${point.site}`);
  const told = site.clues.find((k) => k.landmark === c.shop) ?? site.clues[0];
  if (!told) throw new Error(`Survey site ${site.id} has no fair clue`);
  const rad = sectorBearing(compassSector(bearing(siteOf(told.landmark).pos, site.pos)));
  return { type: site.type, landmark: told.landmark, rad, tiles: told.tiles, lay: site.lay };
}

export function surveyWay(world: World, c: SurveyContract, point: SurveyPoint): DirectionStep[] | null {
  const site = surveySite(world, point.site);
  const steps = directionsFromSite(world, c.shop, { kind: 'spot', pos: site.pos, clue: 'place' });
  return steps.some((s) => s.do === 'noRoad' || s.do === 'askAgain') ? null : steps;
}

export function openSurveyPoint(c: SurveyContract): SurveyPoint | null {
  return c.points.find((p) => !p.done) ?? null;
}

function seesTile(world: World, p: Vec): boolean {
  const tile = tileOf(world, p);
  const seen = world.player.visible;
  let lo = 0;
  let hi = seen.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (seen[mid] === tile) return true;
    if (seen[mid] < tile) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

export function findSurveySites(world: World): void {
  for (const c of heldSurveys(world))
    for (const point of c.points) {
      if (point.found || !surveySite(world, point.site).props.some((p) => seesTile(world, p.pos))) continue;
      point.found = true;
      world.events.push({ t: 'contract', contract: { ...c, points: c.points.map((p) => ({ ...p })) }, outcome: 'found', site: point.site });
    }
}

export type SurveyAction = { contractId: string; site: string; ready: boolean };

type SurveyJob = Extract<Job, { kind: 'survey' }>;

function inSurveyReach(v: Vehicle, site: SurveySite): boolean {
  return site.props.some((p) => dist(v.pos, p.pos) <= (p.reach + ECONOMY.useRange) * ECONOMY.interactionScale);
}

function heldSurveys(world: World): SurveyContract[] {
  return world.player.contracts.filter((c): c is SurveyContract => c.kind === 'survey');
}

export function surveyActions(world: World): SurveyAction[] {
  const me = playerVehicle(world);
  return heldSurveys(world).flatMap((c) =>
    c.points.flatMap((p) => (p.found && !p.done && inSurveyReach(me, surveySite(world, p.site)) ? [{ contractId: c.id, site: p.site, ready: me.speed <= RULES.parkedSpeed }] : [])),
  );
}

export function startSurvey(world: World, contractId: string, site: string): World {
  return playerCommand(world, (w) => {
    const me = playerVehicle(w);
    const action = surveyActions(w).find((a) => a.contractId === contractId && a.site === site);
    if (!action) throw new Error(`Not in reach of an open survey site ${site} of ${contractId}`);
    const turns = CONTRACTS.survey.surveyTurns;
    startJob(w, me, { kind: 'survey', contractId, site, turnsLeft: turns, total: turns });
  });
}

function jobPoint(world: World, job: SurveyJob): { contract: SurveyContract; point: SurveyPoint } | null {
  const contract = heldSurveys(world).find((c) => c.id === job.contractId);
  const point = contract?.points.find((p) => p.site === job.site);
  return contract && point && !point.done ? { contract, point } : null;
}

export function isSurveyStalled(world: World, job: SurveyJob): boolean {
  return jobPoint(world, job) === null;
}

export function surveyTurn(world: World, job: SurveyJob): boolean {
  const open = jobPoint(world, job);
  if (!open) throw new Error(`Survey ${job.contractId} no longer holds open site ${job.site}`);
  job.turnsLeft = Math.max(0, job.turnsLeft - 1);
  if (job.turnsLeft > 0) return false;
  open.point.done = true;
  world.events.push({ t: 'contract', contract: { ...open.contract }, outcome: 'surveyed', site: job.site });
  if (isSurveyMet(open.contract)) world.events.push({ t: 'contract', contract: { ...open.contract }, outcome: 'fulfilled' });
  rumorAround(world, surveySite(world, job.site));
  return true;
}

function rumorAround(world: World, site: SurveySite): void {
  const { scavenged, rumored } = world.player;
  for (const stock of world.salvage)
    if (dist(stock.pos, site.pos) <= CONTRACTS.survey.knowledgeRange && hasSalvage(stock) && !scavenged.includes(stock.id) && !rumored.includes(stock.id)) rumored.push(stock.id);
}
