
import { NPC_UPKEEP } from '../data/npcs';
import { inCombat } from './combat';
import { isParkedForWork, startJob } from './jobs';
import type { BusinessDeal, Job, NpcActivity, Vehicle, World } from './types';
import { affordableBuyCount, buyFuel, sellAtCamp, sellVehicleCargo, tradeGoods } from './economy';
import { cargoRoom } from './inventory';
import { createSiteActivity, finishGoal, noteShop, payForLeg, reachSite, replaceBase } from './npc-activities';
import { npcProfile, tradeSpend } from './npc-decisions';
import { isBroke, pumpsOf } from './npc-service';
import { onEscortWanted, onHaulDelivered } from './escort-job';

type BusinessJob = Extract<Job, { kind: 'business' }>;

const DEALS: readonly string[] = ['resupply', 'sell', 'trade'] satisfies BusinessDeal[];

export function businessBelongs(job: BusinessJob, goal: NpcActivity | null): boolean {
  return goal?.kind === job.deal && goal.targetId === job.siteId;
}

type BusinessDoneEvent = { t: 'job'; vehicle: string; job: BusinessJob; outcome: 'done' };

function isBusinessDone(e: World['events'][number], vehicle: Vehicle): e is BusinessDoneEvent {
  return e.t === 'job' && e.vehicle === vehicle.id && e.outcome === 'done' && e.job.kind === 'business';
}

function businessDone(world: World, vehicle: Vehicle, activity: NpcActivity): boolean {
  const done = world.events.find((e): e is BusinessDoneEvent => isBusinessDone(e, vehicle));
  if (!done) return false;
  if (done.job.deal !== activity.kind || done.job.siteId !== activity.targetId) {
    throw new Error(`${vehicle.id} finished business for ${done.job.deal} at ${done.job.siteId}, not ${activity.kind} at ${activity.targetId}`);
  }
  return true;
}

function startBusiness(world: World, vehicle: Vehicle, activity: NpcActivity, siteId: string): void {
  if (!vehicle.brain) throw new Error(`${vehicle.id} has no brain for business`);
  if (!DEALS.includes(activity.kind)) throw new Error(`No business for a ${activity.kind} goal`);
  if (inCombat(world, vehicle) || !isParkedForWork(world, vehicle)) return;
  const turns = NPC_UPKEEP.businessTurns;
  startJob(world, vehicle, { kind: 'business', siteId, deal: activity.kind as BusinessDeal, turnsLeft: turns, total: turns });
}

export function dealDue(world: World, vehicle: Vehicle, activity: NpcActivity, site: { id: string } | null): site is { id: string } {
  if (!site || vehicle.job) return false;
  if (businessDone(world, vehicle, activity)) return true;
  startBusiness(world, vehicle, activity, site.id);
  return false;
}

function topUpAtPump(world: World, vehicle: Vehicle, siteId: string): void {
  noteShop(world, vehicle, siteId);
  if (pumpsOf(vehicle, npcProfile(vehicle), isBroke(world, vehicle)).includes(siteId)) buyFuel(world, vehicle, siteId);
}

export function resolveSell(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const site = reachSite(vehicle, activity);
  if (!dealDue(world, vehicle, activity, site)) return;
  if ('kind' in site && site.kind === 'camp') sellAtCamp(world, vehicle, site.id, NPC_UPKEEP.repairParts);
  else sellVehicleCargo(world, vehicle, site.id, NPC_UPKEEP.repairParts);
  payForLeg(world, vehicle, activity);
  topUpAtPump(world, vehicle, site.id);
  onHaulDelivered(world, vehicle, activity);
  finishGoal(world, vehicle, 'soldCargo');
}

export function resolveTrade(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const site = reachSite(vehicle, activity);
  if (!dealDue(world, vehicle, activity, site)) return;
  if (!activity.purchase) throw new Error('Trade activity missing purchase');
  noteShop(world, vehicle, site.id);
  const count = affordableBuyCount(world, vehicle, site.id, activity.purchase.good, cargoRoom(vehicle), tradeSpend(world, vehicle));
  payForLeg(world, vehicle, activity);
  if (count > 0) {
    tradeGoods(world, vehicle, site.id, activity.purchase.good, count, 'buy');
    topUpAtPump(world, vehicle, site.id);
    if (vehicle.brain!.goals[0] !== activity) throw new Error(`${vehicle.id} trades above its long-term goal`);
    const shipment = { good: activity.purchase.good, from: site.id, to: activity.purchase.sellShop };
    const trip = { ...createSiteActivity('sell', shipment.to, 'deliverCargo'), shipment };
    replaceBase(world, vehicle, trip);
    onEscortWanted(world, vehicle, trip, site.id);
    return;
  }
  topUpAtPump(world, vehicle, site.id);
  finishGoal(world, vehicle, 'cannotAffordCargo');
}
