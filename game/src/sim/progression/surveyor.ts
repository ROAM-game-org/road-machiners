import { RULES } from '../../data/rules';
import { acceptContract, deliverContract, shopAt, shopState, siteOf } from '../market';
import { startSurvey, surveyActions, isSurveyMet, surveySite, type SurveyContract } from '../survey';
import type { Site } from '../sites';
import { dist, type Vec } from '../vec';
import type { Orders } from './orders';

export type SurveyorMoves = {
  driveToSite: (o: Orders, site: Site) => void;
  driveBeside: (o: Orders, center: Vec, radius: number) => void;
  fuelReaches: (o: Orders, site: Vec) => boolean;
};

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
  const open = c.points.filter((p) => !p.done).map((p) => surveySite(o.world, p.site));
  const next = open.sort((a, b) => dist(o.me.pos, a.pos) - dist(o.me.pos, b.pos))[0];
  if (o.me.speed <= RULES.parkedSpeed || o.me.order === null) moves.driveBeside(o, next.pos, next.reach);
}

function takeSurvey(o: Orders, moves: SurveyorMoves): boolean {
  const shop = shopAt(o.world);
  if (!shop || o.world.player.money < 0) return false;
  const reaches = (c: SurveyContract) => c.points.every((p) => moves.fuelReaches(o, surveySite(o.world, p.site).pos));
  const offers = shopState(o.world, shop).contracts.filter((c): c is SurveyContract => c.kind === 'survey' && c.deadline > o.world.turn && reaches(c));
  const pay = (c: SurveyContract) => c.reward / c.window;
  const best = offers.sort((a, b) => pay(b) - pay(a))[0];
  if (!best) return false;
  o.run((w) => acceptContract(w, best.id));
  return true;
}
