import { bidWith, offerClaimBid } from './claim-bid';
import { endRun, onContestLeg } from './claim-run';
import { claimOfRelic } from './claims';
import { playerVehicle } from './damage';
import { canVehicleSee } from './vision';
import { inCombat, isHostile } from './combat';
import { startRobbery } from './look-over';
import { react, topGoal } from './npc-activities';
import type { Vehicle, World } from './types';

function contestedClaim(world: World, rival: Vehicle) {
  const goal = topGoal(rival);
  const me = playerVehicle(world);
  if (goal?.kind !== 'claim') return null;
  const claim = claimOfRelic(world, rival, me);
  return claim && claim.id === goal.claim && onContestLeg(rival, goal, claim) ? claim : null;
}

function meetsOnSight(world: World, rival: Vehicle): boolean {
  const me = playerVehicle(world);
  return canVehicleSee(world, rival, me.pos) && !isHostile(world, rival, me) && !inCombat(world, rival) && bidWith(world, rival, me) === null;
}

export function onRelicSeen(world: World, rival: Vehicle): void {
  const claim = contestedClaim(world, rival);
  if (!claim || !meetsOnSight(world, rival)) return;
  const me = playerVehicle(world);
  const option = react(world, rival, 'claimContest', me.id);
  if (option === 'buy') offerClaimBid(world, rival, me);
  else if (option === 'takeIt') startRobbery(world, rival, me);
  else if (option === 'giveUp') endRun(world, rival, claim);
}
