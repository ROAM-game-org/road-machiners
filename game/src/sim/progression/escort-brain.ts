import { NPC_BEHAVIOR } from '../../data/npc-behavior';
import { RULES } from '../../data/rules';
import { afterTurn, exposure, leadOf } from '../ai';
import { ramValue } from '../crash-contact';
import { haulerOf, playerVehicle } from '../damage';
import { isKnockedOut } from '../defeat';
import { clearLines } from '../path';
import { vehicleStats } from '../stats';
import type { MoveOrder, Vehicle, World } from '../types';
import { dist, type Vec } from '../vec';
import { playerSees } from '../vision';
import { hostileToPlayer } from '../world';

const F = NPC_BEHAVIOR.fight;

export function hostilesSeen(world: World): Vehicle[] {
  const me = playerVehicle(world).id;
  const hauler = haulerOf(world).id;
  return world.vehicles.filter((v) => v.id !== me && v.id !== hauler && hostileToPlayer(world, v) && !isKnockedOut(v) && playerSees(world, v.pos));
}

export function nearestToHauler(world: World, foes: readonly Vehicle[]): Vehicle | null {
  const hauler = haulerOf(world).pos;
  return foes.reduce<Vehicle | null>((best, v) => (!best || dist(v.pos, hauler) < dist(best.pos, hauler) ? v : best), null);
}

function pointScore(world: World, me: Vehicle, foe: Vehicle, lead: Vec, p: Vec): number {
  const stats = vehicleStats(world, me);
  const there = { ...foe, pos: lead };
  const here = afterTurn(world, me, p);
  const travel = Math.max(0, dist(me.pos, p) - stats.maxSpeed) / Math.max(stats.maxSpeed, RULES.arriveRadius);
  return F.arcWeight * exposure(world, me, here, there) - F.threatWeight * exposure(world, foe, there, here) - F.travelWeight * travel - F.rammedWeight * ramValue(world, there, here);
}

function reach(world: World, me: Vehicle): number {
  return Math.max(...vehicleStats(world, me).weapons.map((w) => w.def.range)) - RULES.arriveRadius;
}

export function fightPoint(world: World, me: Vehicle, foe: Vehicle): Vec {
  const lead = leadOf(foe);
  const clearance = vehicleStats(world, me).radius + vehicleStats(world, foe).radius + RULES.yieldDistance;
  const clear = clearLines(world, vehicleStats(world, me).radius, []);
  let best: { p: Vec; score: number; open: boolean } | null = null;
  for (const share of F.rings) {
    const r = Math.max(clearance, share * reach(world, me));
    for (let i = 0; i < F.angles; i++) {
      const a = (2 * Math.PI * i) / F.angles;
      const p = { x: lead.x + Math.cos(a) * r, y: lead.y + Math.sin(a) * r };
      const candidate = { p, score: pointScore(world, me, foe, lead, p), open: clear(me.pos, p) };
      if (!best || (candidate.open !== best.open ? candidate.open : candidate.score > best.score)) best = candidate;
    }
  }
  return best!.p;
}

export function fightOrder(foe: Vehicle, me: Vehicle, dest: Vec): MoveOrder {
  if (foe.speed < RULES.parkedSpeed) return { kind: 'stopAt', dest };
  return { kind: 'through', dest, pace: foe.speed + dist(me.pos, dest) };
}
