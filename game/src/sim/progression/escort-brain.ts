import { computeFightGoal, fightOrder, followDrive } from '../ai';
import { haulerOf } from '../damage';
import { isKnockedOut } from '../defeat';
import { backOutSpot } from '../free-spot';
import { isFree } from '../spawn';
import { visibleHostiles } from '../npc-decisions';
import { heldAway, recoveryOrder, startRecovery, tickRecovery, type StallMemory } from '../stall';
import { vehicleStats } from '../stats';
import { followSpot } from '../tow';
import type { MoveOrder, Vehicle, World } from '../types';
import type { Vec } from '../vec';
import { RULES } from '../../data/rules';
import { asFighter } from './fighter';

const FOLLOW_RANKS = [0, 1, 2, 3];
const BEHIND_RANK = 2;

export type Stall = StallMemory & { turn?: number };

export function clearFollowSpot(world: World, me: Vehicle, leader: Vehicle): Vec {
  const radius = vehicleStats(world, me).radius;
  const spots = FOLLOW_RANKS.map((rank) => followSpot(world, me, leader, rank));
  return spots.find((spot) => isFree(world, spot, radius, me.id)) ?? spots[BEHIND_RANK];
}

export function followMove(world: World, me: Vehicle, leader: Vehicle): MoveOrder {
  const spot = clearFollowSpot(world, me, leader);
  const order = followDrive(me, leader, spot);
  return order.kind === 'through' && order.pace !== undefined && order.pace <= RULES.parkedSpeed ? { kind: 'stopAt', dest: spot } : order;
}

export function escortFoe(world: World, me: Vehicle): Vehicle | null {
  const hauler = haulerOf(world).id;
  return visibleHostiles(world, asFighter(me)).find((v) => v.id !== hauler && !isKnockedOut(v)) ?? null;
}

export function fightMove(world: World, me: Vehicle, foe: Vehicle): MoveOrder {
  const fighter = asFighter(me);
  const post = clearFollowSpot(world, me, haulerOf(world));
  const goal = computeFightGoal(world, fighter, foe, foe, post);
  return goal ? fightOrder(world, fighter, foe, goal) : { kind: 'brake' };
}

export function escortMove(world: World, me: Vehicle, foe: Vehicle | null, stall: Stall): MoveOrder {
  return unlessStuck(world, me, stall, () => (foe ? fightMove(world, me, foe) : followMove(world, me, haulerOf(world))));
}

export function unlessStuck(world: World, me: Vehicle, stall: Stall, move: () => MoveOrder): MoveOrder {
  const fresh = stall.turn !== world.turn - 1;
  if (fresh) stall.recovery = 0;
  else tickRecovery(stall);
  stall.turn = world.turn;
  noteHeld(world, me, stall, fresh);
  return recoveryOrder(stall) ?? move();
}

function noteHeld(world: World, me: Vehicle, stall: Stall, fresh: boolean): void {
  stall.stalled = !fresh && heldAway(me, stall, orderDest(me)) ? (stall.stalled ?? 0) + 1 : 0;
  stall.lastPos = { ...me.pos };
  if (!stall.recovery && stall.stalled >= RULES.npcStuckTurns) startRecovery(me, stall, backOutSpot(world, me));
}

function orderDest(me: Vehicle): Vec | null {
  const order = me.order;
  return order?.kind === 'stopAt' || order?.kind === 'through' ? order.dest : null;
}
