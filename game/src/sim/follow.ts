import { followDrive } from './ai';
import { isHostile } from './combat';
import { playerVehicle, vehicleById } from './damage';
import { isKnockedOut } from './defeat';
import { isFree } from './spawn';
import { switchSetSpeed } from './steering';
import { vehicleStats } from './stats';
import { followSpot } from './tow';
import type { MoveOrder, Refusal, Vehicle, World } from './types';
import type { Vec } from './vec';
import { playerSees } from './vision';
import { gatesShut } from './outpost-gates';
import { playerCommand, Refused } from './world';
import { RULES } from '../data/rules';

const FOLLOW_RANKS = [0, 1, 2, 3];
const BEHIND_RANK = 2;

type EndReason = 'gone' | 'lost' | 'downed' | 'hostile';

export function clearFollowSpot(world: World, me: Vehicle, leader: Vehicle): Vec {
  const radius = vehicleStats(world, me).radius;
  const spots = FOLLOW_RANKS.map((rank) => followSpot(world, me, leader, rank));
  return spots.find((spot) => isFree(world, spot, radius, me.id)) ?? spots[BEHIND_RANK];
}

export function trailOrder(world: World, me: Vehicle, leader: Vehicle): MoveOrder {
  const spot = clearFollowSpot(world, me, leader);
  const order = followDrive(me, leader, spot);
  return order.kind === 'through' && order.pace !== undefined && order.pace <= RULES.parkedSpeed ? { kind: 'stopAt', dest: spot } : order;
}

export function followedId(world: World): string | null {
  const order = playerVehicle(world).order;
  return order && order.kind !== 'brake' ? order.follow ?? null : null;
}

export function followError(world: World, id: string): Refusal | null {
  const me = playerVehicle(world);
  const target = vehicleById(world, id);
  if (target.id === me.id) throw new Error('The player cannot follow their own truck');
  if (gatesShut(world)) return { id: 'gatesShut' };
  if (isKnockedOut(target)) return { id: 'followDowned' };
  if (isHostile(world, target, me)) return { id: 'followHostile' };
  if (!playerSees(world, target.pos)) return { id: 'followLost' };
  return null;
}

export function followTruck(world: World, id: string): World {
  return playerCommand(world, (w) => {
    const error = followError(w, id);
    if (error) throw new Refused(error);
    const me = playerVehicle(w);
    me.direct = false;
    switchSetSpeed(me, false);
    me.order = followed(trailOrder(w, me, vehicleById(w, id)), id);
  });
}

export function stopFollowing(world: World): World {
  return playerCommand(world, (w) => {
    plainStop(playerVehicle(w));
  });
}

function followed(order: MoveOrder, id: string): MoveOrder {
  return order.kind === 'brake' ? order : { ...order, follow: id };
}

function plainStop(me: Vehicle): void {
  const order = me.order;
  if (order && order.kind !== 'brake') me.order = { kind: 'stopAt', dest: order.dest };
}

export function planPlayerFollow(w: World): void {
  const me = playerVehicle(w);
  const order = me.order;
  if (!order || order.kind === 'brake' || order.follow === undefined) return;
  if (order.follow === me.id) throw new Error('The player cannot follow their own truck');
  const target = w.vehicles.find((v) => v.id === order.follow);
  const why = target ? endOf(w, me, target) : 'gone';
  if (target && !why) {
    me.order = followed(trailOrder(w, me, target), target.id);
    return;
  }
  plainStop(me);
  w.events.push({ t: 'followEnded', vehicle: order.follow, why: why! });
}

function endOf(w: World, me: Vehicle, target: Vehicle): EndReason | null {
  if (isKnockedOut(target)) return 'downed';
  if (isHostile(w, target, me)) return 'hostile';
  if (!playerSees(w, target.pos)) return 'lost';
  return null;
}
