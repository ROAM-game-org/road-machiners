import { CONTRACTS } from '../../data/market';
import { RULES } from '../../data/rules';
import { TERRAIN } from '../../data/terrain';
import type { OldPlaceType } from '../../data/salvage';
import { acceptContract, deliverContract, shopAt, shopState, siteOf } from '../market';
import { compassSector, openSurveyPoint, startSurvey, surveyActions, surveyClue, isSurveyMet, surveySite, type SurveyClue, type SurveyContract, type SurveyPoint } from '../survey';
import type { Site } from '../sites';
import type { LandmarkLook, Obstacle, World } from '../types';
import { playerExplored } from '../vision';
import { bearing, dist, type Vec } from '../vec';
import type { Orders } from './orders';

export type SurveyorMoves = {
  driveToSite: (o: Orders, site: Site) => void;
  driveBeside: (o: Orders, center: Vec, radius: number) => void;
  fuelReaches: (o: Orders, site: Vec) => boolean;
  drivable: (o: Orders, to: Vec) => boolean;
};

const LOOKS: Record<OldPlaceType, readonly LandmarkLook[]> = {
  homestead: ['silo', 'waterTower'],
  hamlet: ['house', 'ruin', 'gasStation'],
  lookout: ['house', 'ruin', 'gasStation'],
  hulks: ['tank'],
  boats: ['fishingBoat', 'riverBarge', 'skiff'],
  wreckage: ['shipCache'],
};
const SWEEP_RADIUS = 40;
const SWEEP_STOPS = 8;
const ARRIVED = 8;
const GRAY_RANGE = TERRAIN.vision.radius * TERRAIN.vision.grayFactor;

function held(o: Orders): SurveyContract | null {
  return o.world.player.contracts.find((c): c is SurveyContract => c.kind === 'survey') ?? null;
}

export function surveyorGoal(o: Orders, moves: SurveyorMoves): boolean {
  const c = held(o);
  if (c) {
    followSurvey(o, c, moves);
    return true;
  }
  return takeSurvey(o, moves);
}

export function cluePoint(world: World, clue: SurveyClue): Vec {
  const from = siteOf(clue.landmark).pos;
  const clamp = (v: number) => Math.min(world.size - 1, Math.max(1, v));
  return { x: clamp(from.x + Math.cos(clue.rad) * clue.tiles), y: clamp(from.y + Math.sin(clue.rad) * clue.tiles) };
}

function followSurvey(o: Orders, c: SurveyContract, moves: SurveyorMoves): void {
  if (isSurveyMet(c)) {
    if (shopAt(o.world) === c.shop) o.run((w) => deliverContract(w, c.id), 'contracts');
    else moves.driveToSite(o, siteOf(c.shop));
    return;
  }
  const here = surveyActions(o.world).find((a) => a.contractId === c.id && a.ready);
  if (here) {
    o.run((w) => startSurvey(w, here.contractId, here.site));
    return;
  }
  const found = c.points.find((p) => p.found && !p.done);
  if (found) return approachFound(o, found, moves);
  searchFor(o, c, openSurveyPoint(c)!, moves);
}

function approachFound(o: Orders, point: SurveyPoint, moves: SurveyorMoves): void {
  const props = surveySite(o.world, point.site).props;
  const near = nearest(o.me.pos, props, posOf)!;
  if (idle(o)) moves.driveBeside(o, near.pos, near.reach);
}

function searchFor(o: Orders, c: SurveyContract, point: SurveyPoint, moves: SurveyorMoves): void {
  const clue = surveyClue(c, point);
  const lookAlike = nearest(o.me.pos, sightings(o, clue), posOf);
  if (lookAlike) return checkSighting(o, lookAlike, moves);
  if (idle(o)) moves.driveBeside(o, nextStop(o, cluePoint(o.world, clue), moves), 0);
}

function checkSighting(o: Orders, prop: Obstacle, moves: SurveyorMoves): void {
  const heading = o.me.order && o.me.order.kind !== 'brake' ? o.me.order.dest : null;
  if (idle(o) || !heading || dist(heading, prop.pos) > ARRIVED) moves.driveBeside(o, prop.pos, prop.r);
}

function nextStop(o: Orders, center: Vec, moves: SurveyorMoves): Vec {
  const stops = sweep(center).filter((p) => moves.drivable(o, p));
  if (stops.length === 0 || dist(o.me.pos, center) > SWEEP_RADIUS + ARRIVED) return stops[0] ?? center;
  const at = stops.findIndex((p) => dist(p, o.me.pos) <= ARRIVED);
  return at < 0 ? nearest(o.me.pos, stops, (p) => p)! : stops[(at + 1) % stops.length];
}

function nearest<T>(from: Vec, items: T[], at: (item: T) => Vec): T | undefined {
  return [...items].sort((a, b) => dist(from, at(a)) - dist(from, at(b)))[0];
}

const posOf = (item: { pos: Vec }): Vec => item.pos;

function sightings(o: Orders, clue: SurveyClue): Obstacle[] {
  const from = siteOf(clue.landmark).pos;
  const sector = compassSector(clue.rad);
  const looks = LOOKS[clue.type];
  return o.world.obstacles.filter(
    (p) =>
      p.kind === 'landmark' &&
      looks.includes(p.look) &&
      dist(p.pos, o.me.pos) <= GRAY_RANGE &&
      compassSector(bearing(from, p.pos)) === sector &&
      Math.abs(dist(from, p.pos) - clue.tiles) <= CONTRACTS.survey.clue.band &&
      !playerExplored(o.world, p.pos),
  );
}

function sweep(center: Vec): Vec[] {
  const ring = Array.from({ length: SWEEP_STOPS }, (_, k) => {
    const angle = (k / SWEEP_STOPS) * 2 * Math.PI;
    return { x: center.x + Math.cos(angle) * SWEEP_RADIUS, y: center.y + Math.sin(angle) * SWEEP_RADIUS };
  });
  return [center, ...ring];
}

function idle(o: Orders): boolean {
  return o.me.speed <= RULES.parkedSpeed || o.me.order === null;
}

function takeSurvey(o: Orders, moves: SurveyorMoves): boolean {
  const shop = shopAt(o.world);
  if (!shop || o.world.player.money < 0) return false;
  const reaches = (c: SurveyContract) => c.points.every((p) => moves.fuelReaches(o, cluePoint(o.world, surveyClue(c, p))));
  const offers = shopState(o.world, shop).contracts.filter((c): c is SurveyContract => c.kind === 'survey' && c.deadline > o.world.turn && reaches(c));
  const pay = (c: SurveyContract) => c.reward / c.window;
  const best = offers.sort((a, b) => pay(b) - pay(a))[0];
  if (!best) return false;
  o.run((w) => acceptContract(w, best.id));
  return true;
}
