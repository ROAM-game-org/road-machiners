import { NPC_BEHAVIOR } from '../../data/npcs';
import { RULES } from '../../data/rules';
import { afterTurn } from '../ai';
import { inArc } from '../combat';
import { dist, type Vec } from '../vec';
import { partLane, passShare, planLane, SIDES, sideToward, type Round } from '../armor';
import { playerVehicle } from '../damage';
import { corePart, mountedParts } from '../grid';
import { vehicleStats, type MountedWeapon } from '../stats';
import type { Aim, PartInstance, Vehicle, World } from '../types';
import { setWeaponOrder } from '../world';
import type { Orders } from './orders';

function criticalParts(foe: Vehicle): PartInstance[] {
  return [...mountedParts(foe, 'core'), ...mountedParts(foe, 'engine')].filter((p) => p.hp > 0);
}

function bite(foe: Vehicle, part: PartInstance, side: ReturnType<typeof sideToward>, round: Round): number {
  const hit = planLane(foe, side, partLane(foe, part.id, side), round).find((h) => h.part.id === part.id);
  return hit ? hit.amount / part.hp : 0;
}

function refusedToYield(world: World, foe: Vehicle): boolean {
  return world.player.talked[foe.id]?.yieldDemand === 'refused';
}

export function aimFor(world: World, foe: Vehicle, weapon: MountedWeapon): Aim {
  const me = playerVehicle(world);
  const side = sideToward(foe, me.pos);
  const round = weapon.def.round;
  const scored = criticalParts(foe).map((part) => ({ part, bite: bite(foe, part, side, round) })).filter((s) => s.bite > 0);
  const cab = scored.find((s) => s.part.id === corePart(foe, 'cab').id);
  if (cab && refusedToYield(world, foe)) return cab.part.id;
  const best = scored.reduce<{ part: PartInstance; bite: number } | null>((top, s) => (!top || s.bite > top.bite ? s : top), null);
  return best ? best.part.id : 'body';
}

const MIN_PASS = 0.5;

export function isSoftTarget(world: World, foe: Vehicle): boolean {
  const weapons = vehicleStats(world, playerVehicle(world)).weapons;
  if (weapons.length === 0) return false;
  const heaviest = weapons.reduce((top, w) => (w.def.round.damage > top.def.round.damage ? w : top));
  return SIDES.some((side) => passShare(foe, side, heaviest.def.round) >= MIN_PASS);
}

export function aimGuns(o: Orders, foe: Vehicle): void {
  for (const weapon of vehicleStats(o.world, o.me).weapons) {
    const aim = aimFor(o.world, foe, weapon);
    const current = o.me.weaponOrders[weapon.part.id];
    if (current?.targetId === foe.id && current.aim === aim) continue;
    o.run((w) => setWeaponOrder(w, weapon.part.id, { targetId: foe.id, aim }));
  }
}

type Stand = { p: Vec; cabBite: number; ring: number; gap: number };

function nearer(a: Stand, b: Stand): boolean {
  if (a.cabBite !== b.cabBite) return a.cabBite > b.cabBite;
  return a.ring === b.ring ? a.gap < b.gap : a.ring < b.ring;
}

function ringPoints(o: Orders, foe: Vehicle, weapons: MountedWeapon[]): { p: Vec; ring: number }[] {
  const { angles, rings } = NPC_BEHAVIOR.fight;
  const clearance = vehicleStats(o.world, o.me).radius + vehicleStats(o.world, foe).radius + RULES.yieldDistance;
  const reach = Math.max(...weapons.map((mw) => mw.def.range)) - RULES.arriveRadius;
  return [...rings.entries()].flatMap(([ring, share]) => {
    const r = Math.max(clearance, share * reach);
    return Array.from({ length: angles }, (_, i) => {
      const a = (2 * Math.PI * i) / angles;
      return { p: { x: foe.pos.x + Math.cos(a) * r, y: foe.pos.y + Math.sin(a) * r }, ring };
    });
  });
}

function standAt(o: Orders, foe: Vehicle, weapons: MountedWeapon[], at: { p: Vec; ring: number }): Stand | null {
  const me = afterTurn(o.world, o.me, at.p);
  const firing = weapons.filter((mw) => dist(at.p, foe.pos) <= mw.def.range && inArc(me, mw, foe));
  if (firing.length === 0) return null;
  const cab = corePart(foe, 'cab');
  const cabBite = refusedToYield(o.world, foe) ? Math.max(...firing.map((mw) => bite(foe, cab, sideToward(foe, at.p), mw.def.round))) : 0;
  return { p: at.p, cabBite, ring: at.ring, gap: dist(o.me.pos, at.p) };
}

function bearingPoint(o: Orders, foe: Vehicle): Vec | null {
  const weapons = vehicleStats(o.world, o.me).weapons.filter((mw) => mw.part.hp > 0);
  if (weapons.length === 0) return null;
  const stands = ringPoints(o, foe, weapons).flatMap((at) => standAt(o, foe, weapons, at) ?? []);
  return stands.reduce<Stand | null>((best, s) => (!best || nearer(s, best) ? s : best), null)?.p ?? null;
}

export function gunStand(o: Orders, foe: Vehicle): Vec {
  return bearingPoint(o, foe) ?? foe.pos;
}
