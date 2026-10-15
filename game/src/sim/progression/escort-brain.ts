import { NPCS } from '../../data/npcs';
import { PERSONALITY_IDS } from '../../data/personalities';
import { RULES } from '../../data/rules';
import { fightOrder, fightPoint } from '../ai';
import { haulerOf, playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { vehicleStats } from '../stats';
import { followPace, followSpot } from '../tow';
import type { MoveOrder, Vehicle, World } from '../types';
import { dist } from '../vec';
import { playerSees } from '../vision';
import { hostileToPlayer } from '../world';

const FIGHTER = NPCS.merc;

export function hostilesSeen(world: World): Vehicle[] {
  const me = playerVehicle(world).id;
  const hauler = haulerOf(world).id;
  return world.vehicles.filter((v) => v.id !== me && v.id !== hauler && hostileToPlayer(world, v) && !isKnockedOut(v) && playerSees(world, v.pos));
}

export function nearestToHauler(world: World, foes: readonly Vehicle[]): Vehicle | null {
  const hauler = haulerOf(world).pos;
  return foes.reduce<Vehicle | null>((best, v) => (!best || dist(v.pos, hauler) < dist(best.pos, hauler) ? v : best), null);
}

export function asFighter(me: Vehicle): Vehicle {
  const brain = { templateId: FIGHTER.id, driver: '', traits: [...FIGHTER.traits], personality: PERSONALITY_IDS[0], goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { ...me.pos }, stepIndex: 0, memories: [] };
  return { ...me, brain };
}

export function leash(world: World, me: Vehicle): number {
  return Math.max(0, ...vehicleStats(world, me).weapons.map((w) => w.def.range));
}

export function fightMove(world: World, me: Vehicle, foe: Vehicle): MoveOrder {
  const fighter = asFighter(me);
  const clearance = vehicleStats(world, me).radius + vehicleStats(world, foe).radius + RULES.yieldDistance;
  return fightOrder(world, fighter, foe, fightPoint(world, fighter, foe, clearance));
}

export function followMove(world: World, me: Vehicle, leader: Vehicle): MoveOrder {
  const spot = followSpot(world, me, leader, 0);
  if (leader.speed <= RULES.parkedSpeed) return { kind: 'stopAt', dest: spot };
  return { kind: 'through', dest: spot, pace: followPace(me, leader, spot) };
}

export function escortMove(world: World, me: Vehicle): MoveOrder {
  const hauler = haulerOf(world);
  const foe = nearestToHauler(world, hostilesSeen(world));
  if (foe && dist(me.pos, hauler.pos) <= leash(world, me)) return fightMove(world, me, foe);
  return followMove(world, me, hauler);
}
