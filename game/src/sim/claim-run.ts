import { carriesPart, claimPartHeld, findClaim } from './claims';
import { inCombat } from './combat';
import { heldByLooter } from './loot-warning';
import { handInClaimBy } from './market';
import { finishGoal, reachSite } from './npc-activities';
import { warnedOff } from './parley';
import { canReachSalvage, collectSalvage, type ClaimContract } from './salvage';
import { beginSearch } from './search';
import { getKnownSite } from './npc-decisions';
import type { GoalReason, NpcActivity, SalvageStock, Vehicle, World } from './types';

const OVER: GoalReason = 'claimOver';

function claimIdOf(goal: NpcActivity): string {
  if (goal.claim === undefined) throw new Error('A claim run names no claim');
  return goal.claim;
}

function goalLeft(goal: NpcActivity): string[] {
  if (!goal.left) throw new Error(`Claim run ${goal.claim} has no candidate list`);
  return goal.left;
}

function stillSearching(goal: NpcActivity, claim: ClaimContract): boolean {
  if (goal.targetId === claim.shop) return false;
  return goal.targetId === claim.stockId || goalLeft(goal).includes(claim.stockId);
}

export function onContestLeg(vehicle: Vehicle, goal: NpcActivity, claim: ClaimContract): boolean {
  return goal.targetId === claim.shop && !carriesPart(vehicle, claim.partId);
}

export function claimInvalid(world: World, vehicle: Vehicle, goal: NpcActivity): GoalReason | null {
  const claim = findClaim(world, claimIdOf(goal));
  if (!claim || claim.rival !== vehicle.id) return OVER;
  const where = claimPartHeld(world, claim);
  if (where === 'rival') return null;
  if (where === 'gone') return OVER;
  if (where === 'stock') return stillSearching(goal, claim) ? null : OVER;
  return stillSearching(goal, claim) || onContestLeg(vehicle, goal, claim) ? null : OVER;
}

export function endRun(world: World, vehicle: Vehicle, claim: ClaimContract | null, handedIn = false): void {
  finishGoal(world, vehicle, OVER);
  if (claim && !handedIn && claimPartHeld(world, claim) !== 'gone') world.events.push({ t: 'claimRivalQuit', contract: claim.id, vehicle: vehicle.id });
}

function liveRun(world: World, vehicle: Vehicle, activity: NpcActivity): ClaimContract | null {
  const ended = claimInvalid(world, vehicle, activity);
  if (ended) endRun(world, vehicle, findClaim(world, claimIdOf(activity)));
  return ended ? null : findClaim(world, claimIdOf(activity));
}

function runWreck(world: World, vehicle: Vehicle, activity: NpcActivity): SalvageStock {
  const stock = world.salvage.find((s) => s.id === activity.targetId);
  if (!stock) throw new Error(`${vehicle.id} runs a claim to a missing wreck ${activity.targetId}`);
  return stock;
}

export function resolveClaim(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const claim = liveRun(world, vehicle, activity);
  if (!claim) return;
  if (carriesPart(vehicle, claim.partId)) return bringClaim(world, vehicle, activity, claim);
  if (onContestLeg(vehicle, activity, claim)) return reachSite(vehicle, activity) ? endRun(world, vehicle, claim) : undefined;
  const stock = runWreck(world, vehicle, activity);
  if (!canReachSalvage(vehicle, stock)) return;
  activity.phase = 'act';
  if (!heldByLooter(world, vehicle, activity) && !vehicle.job) workWreck(world, vehicle, activity, stock, claim);
}

function workWreck(world: World, vehicle: Vehicle, activity: NpcActivity, stock: SalvageStock, claim: ClaimContract): void {
  if (stock.parts.some((p) => p.id === claim.partId)) return takeClaimed(world, vehicle, stock, claim);
  if (searchedEmpty(stock, activity, claim)) return headHome(activity, claim);
  if (!goalLeft(activity).includes(stock.id)) return nextCandidate(world, vehicle, activity);
  if (inCombat(world, vehicle) || warnedOff(world, vehicle, stock)) return;
  if (!stock.hidden.parts.some((p) => p.id === claim.partId)) activity.left = goalLeft(activity).filter((id) => id !== stock.id);
  beginSearch(world, vehicle, stock.id);
}

function searchedEmpty(stock: SalvageStock, activity: NpcActivity, claim: ClaimContract): boolean {
  return stock.id === claim.stockId && !goalLeft(activity).includes(stock.id) && !stock.hidden.parts.some((p) => p.id === claim.partId);
}

function takeClaimed(world: World, vehicle: Vehicle, stock: SalvageStock, claim: ClaimContract): void {
  collectSalvage(world, vehicle, stock.id, Infinity);
  if (!carriesPart(vehicle, claim.partId)) endRun(world, vehicle, claim);
}

function nextCandidate(world: World, vehicle: Vehicle, activity: NpcActivity): void {
  const next = world.salvage.find((s) => s.id === goalLeft(activity)[0]);
  if (!next) return endRun(world, vehicle, findClaim(world, claimIdOf(activity)));
  activity.targetId = next.id;
  activity.destination = { ...next.pos };
  activity.phase = 'travel';
}

function headHome(activity: NpcActivity, claim: ClaimContract): void {
  activity.targetId = claim.shop;
  activity.destination = { ...getKnownSite(claim.shop).pos };
  activity.phase = 'travel';
  activity.left = [];
}

function bringClaim(world: World, vehicle: Vehicle, activity: NpcActivity, claim: ClaimContract): void {
  if (activity.targetId !== claim.shop) headHome(activity, claim);
  if (!reachSite(vehicle, activity)) return;
  handInClaimBy(world, vehicle, claim);
  endRun(world, vehicle, claim, true);
}
