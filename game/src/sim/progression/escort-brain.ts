import { NPCS } from '../../data/npcs';
import { sustainedDamage } from '../../data/parts';
import { PERSONALITY_IDS } from '../../data/personalities';
import { RULES } from '../../data/rules';
import { fightOrder, fightPoint } from '../ai';
import { haulerOf, playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { corePart } from '../grid';
import { alongOf, toRoad } from '../highway';
import { inArc } from '../combat';
import { backOutSpot } from '../back-out';
import { vehicleStats, type MountedWeapon } from '../stats';
import { followPace, followSpot } from '../tow';
import type { MoveOrder, Vehicle, World } from '../types';
import { bearing, dist, type Vec } from '../vec';
import { hasLineOfFire, playerSees } from '../vision';
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
  const clearance = Math.max(vehicleStats(world, me).radius + vehicleStats(world, foe).radius + RULES.yieldDistance, standoff(world, me, foe));
  return fightOrder(world, fighter, foe, clearOf(foe, fightPoint(world, fighter, foe, clearance), me.pos, clearance));
}

export function standoff(world: World, me: Vehicle, foe: Vehicle): number {
  const reach = leash(world, me);
  const guns = vehicleStats(world, foe).weapons.filter((mw) => mw.part.hp > 0);
  if (!guns.length) return STANDOFF * reach;
  const deadliest = guns.reduce((a, c) => (sustainedDamage(c.def) > sustainedDamage(a.def) ? c : a));
  const outside = deadliest.def.range + OUTSIDE;
  return outside < reach ? outside : STANDOFF * reach;
}

const STANDOFF = 0.6;
const OUTSIDE = 1.5;

function clearOf(foe: Vehicle, spot: Vec, from: Vec, clearance: number): Vec {
  if (dist(spot, foe.pos) >= clearance) return spot;
  const away = bearing(foe.pos, dist(spot, foe.pos) > 0 ? spot : from);
  return { x: foe.pos.x + Math.cos(away) * clearance, y: foe.pos.y + Math.sin(away) * clearance };
}

export function followMove(world: World, me: Vehicle, leader: Vehicle): MoveOrder {
  const spot = followSpot(world, me, leader, 0);
  if (leader.speed <= RULES.parkedSpeed) return { kind: 'stopAt', dest: spot };
  return { kind: 'through', dest: spot, pace: followPace(me, leader, spot) };
}

export function lagBehind(world: World, me: Vehicle, hauler: Vehicle): number {
  const along = (v: Vehicle) => alongOf(world.seed, toRoad(world.seed, world.furyRoad!.window, v.pos));
  return along(hauler) - along(me);
}

export function escortFoe(world: World, me: Vehicle): Vehicle | null {
  if (lagBehind(world, me, haulerOf(world)) > leash(world, me)) return null;
  return deadliest(world, me, hostilesSeen(world));
}

export function deadliest(world: World, me: Vehicle, foes: readonly Vehicle[]): Vehicle | null {
  const focusId = Object.values(me.weaponOrders)[0]?.targetId;
  const focus = foes.find((v) => v.id === focusId) ?? null;
  const top = foes.reduce<Vehicle | null>((best, v) => (!best || killPriority(world, me, v) > killPriority(world, me, best) ? v : best), null);
  if (!focus || !top) return top;
  return killPriority(world, me, top) > SWITCH_GAIN * killPriority(world, me, focus) ? top : focus;
}
const SWITCH_GAIN = 1.5;

export function killPriority(world: World, me: Vehicle, foe: Vehicle): number {
  const guns = vehicleStats(world, foe).weapons.filter((mw) => mw.part.hp > 0);
  const reach = Math.max(1, ...guns.map((mw) => mw.def.range));
  const near = Math.min(dist(foe.pos, me.pos), dist(foe.pos, haulerOf(world).pos));
  const damage = guns.reduce((sum, mw) => sum + sustainedDamage(mw.def), 0);
  return (damage * Math.min(1, reach / Math.max(near, 1))) / Math.max(1, corePart(foe, 'cab').hp);
}

export type Stall = { turn: number; at: Vec; stalled: number; recovery: number; goal: Vec | null };

export function escortMove(world: World, me: Vehicle, foe: Vehicle | null, stall: Stall): MoveOrder {
  return unlessStuck(world, me, stall, () => (foe ? fightMove(world, me, foe) : followMove(world, me, haulerOf(world))));
}

export function unlessStuck(world: World, me: Vehicle, stall: Stall, move: () => MoveOrder): MoveOrder {
  noteStall(world, me, stall);
  if (stall.recovery > 0 && stall.goal) return { kind: 'stopAt', dest: stall.goal };
  return move();
}

function noteStall(world: World, me: Vehicle, stall: Stall): void {
  const fresh = stall.turn !== world.turn - 1;
  stall.recovery = fresh ? 0 : Math.max(0, stall.recovery - 1);
  stall.stalled = countsStall(fresh, me, stall) ? stall.stalled + 1 : 0;
  stall.turn = world.turn;
  stall.at = { ...me.pos };
  if (stall.recovery === 0 && stall.stalled >= RULES.npcStuckTurns) startBackOut(world, me, stall);
}

function countsStall(fresh: boolean, me: Vehicle, stall: Stall): boolean {
  return !fresh && stall.recovery === 0 && heldAway(me, stall.at);
}

function heldAway(me: Vehicle, last: Vec): boolean {
  const order = me.order;
  if (!order || order.kind === 'brake') return false;
  return dist(me.pos, last) < RULES.arriveRadius / 2 && dist(me.pos, order.dest) > RULES.arriveRadius * 2;
}

function startBackOut(world: World, me: Vehicle, stall: Stall): void {
  stall.goal = backOutSpot(world, me);
  stall.recovery = RULES.npcRecoveryTurns;
  stall.stalled = 0;
}

export function gunTarget(world: World, me: Vehicle, weapon: MountedWeapon, focus: Vehicle, foes: readonly Vehicle[]): Vehicle | null {
  const reaches = (foe: Vehicle) => dist(me.pos, foe.pos) <= weapon.def.range && inArc(me, weapon, foe) && hasLineOfFire(world, me.pos, foe.pos);
  if (reaches(focus)) return focus;
  return [...foes].sort((a, b) => dist(me.pos, a.pos) - dist(me.pos, b.pos)).find(reaches) ?? null;
}
