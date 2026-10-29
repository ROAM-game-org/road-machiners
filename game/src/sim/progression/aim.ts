import { NPC_BEHAVIOR } from '../../data/npcs';
import { RULES } from '../../data/rules';
import { inArc } from '../combat';
import { angleDiff, bearing, DEG, dist, type Vec } from '../vec';
import { partLane, passShare, planLane, SIDES, sideToward, type Round } from '../armor';
import { playerVehicle } from '../damage';
import { corePart, mountedParts } from '../grid';
import { vehicleStats, type MountedWeapon } from '../stats';
import type { Aim, PartInstance, Vehicle, World } from '../types';
import { setAutoFire, setWeaponOrder } from '../world';
import type { Orders } from './orders';

function criticalParts(foe: Vehicle): PartInstance[] {
  return [...mountedParts(foe, 'core'), ...mountedParts(foe, 'engine')].filter((p) => p.hp > 0);
}

function bite(foe: Vehicle, part: PartInstance, side: ReturnType<typeof sideToward>, round: Round): number {
  const hit = planLane(foe, side, partLane(foe, part.id, side), round).find((h) => h.part.id === part.id);
  return hit ? hit.amount / part.hp : 0;
}

export function refusedToYield(world: World, foe: Vehicle): boolean {
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

export function setFire(o: Orders, on: boolean): void {
  if (o.world.player.autoFire !== on) o.run((w) => setAutoFire(w, on));
  if (!on) for (const id of Object.keys(o.me.weaponOrders)) o.run((w) => setWeaponOrder(w, id, null));
}

function inCloseRange(o: Orders, foe: Vehicle): boolean {
  const gun = leadGun(o);
  return gun !== null && dist(o.me.pos, foe.pos) <= gun.def.range * NPC_BEHAVIOR.fight.rings[0];
}

export function engageGuns(o: Orders, foe: Vehicle): void {
  const close = inCloseRange(o, foe);
  if (!close || o.world.player.autoFire) setFire(o, false);
  if (close) aimGuns(o, foe);
}

export function aimGuns(o: Orders, foe: Vehicle): void {
  for (const weapon of vehicleStats(o.world, o.me).weapons) {
    const aim = aimFor(o.world, foe, weapon);
    const current = o.me.weaponOrders[weapon.part.id];
    if (current?.targetId === foe.id && current.aim === aim) continue;
    o.run((w) => setWeaponOrder(w, weapon.part.id, { targetId: foe.id, aim }));
  }
}

type Stand = { p: Vec; runUp: Vec; heading: number; cabBite: number; ring: number; gap: number };
type Ring = { p: Vec; ring: number };


function nearer(a: Stand, b: Stand): boolean {
  if (a.cabBite !== b.cabBite) return a.cabBite > b.cabBite;
  return a.ring === b.ring ? a.gap < b.gap : a.ring < b.ring;
}

function ringPoints(o: Orders, foe: Vehicle, gun: MountedWeapon): Ring[] {
  const { angles, rings } = NPC_BEHAVIOR.fight;
  const reach = gun.def.range - RULES.arriveRadius;
  const radii = [alongside(o, foe), ...rings.map((share) => Math.max(clearanceTo(o, foe), share * reach))];
  return radii.flatMap((r, ring) =>
    Array.from({ length: angles }, (_, i) => {
      const a = (2 * Math.PI * i) / angles;
      return { p: { x: foe.pos.x + Math.cos(a) * r, y: foe.pos.y + Math.sin(a) * r }, ring };
    }),
  );
}

function alongside(o: Orders, foe: Vehicle): number {
  return vehicleStats(o.world, o.me).radius + vehicleStats(o.world, foe).radius + RULES.arriveRadius;
}

function clearanceTo(o: Orders, foe: Vehicle): number {
  return vehicleStats(o.world, o.me).radius + vehicleStats(o.world, foe).radius + RULES.yieldDistance;
}

function centerOf(gun: MountedWeapon): number {
  const half = Math.min(gun.def.arc, 360) / 2;
  const open = gun.spans.map((span) => ({ from: Math.max(span.from, gun.facing - half), to: Math.min(span.to, gun.facing + half) }));
  const widest = open.reduce((top, span) => (span.to - span.from > top.to - top.from ? span : top));
  return (widest.from + widest.to) / 2;
}

function cabBiteFrom(o: Orders, foe: Vehicle, gun: MountedWeapon, from: Vec): number {
  return refusedToYield(o.world, foe) ? bite(foe, corePart(foe, 'cab'), sideToward(foe, from), gun.def.round) : 0;
}

function standAt(o: Orders, foe: Vehicle, gun: MountedWeapon, at: Ring): Stand {
  const heading = bearing(at.p, foe.pos) - centerOf(gun) * DEG;
  const run = clearanceTo(o, foe);
  const runUp = { x: at.p.x - Math.cos(heading) * run, y: at.p.y - Math.sin(heading) * run };
  const gap = onApproach(o, at.p, heading) ? dist(o.me.pos, at.p) : dist(o.me.pos, runUp) + run;
  return { p: at.p, runUp, heading, cabBite: cabBiteFrom(o, foe, gun, at.p), ring: at.ring, gap };
}

function leadGun(o: Orders): MountedWeapon | null {
  const working = vehicleStats(o.world, o.me).weapons.filter((mw) => mw.part.hp > 0 && mw.spans.length > 0);
  return working.reduce<MountedWeapon | null>((top, mw) => (!top || mw.def.round.damage > top.def.round.damage ? mw : top), null);
}

function heldHere(o: Orders, foe: Vehicle, gun: MountedWeapon, best: Stand): boolean {
  const bears = dist(o.me.pos, foe.pos) <= gun.def.range && inArc(o.me, gun, foe);
  return o.me.speed <= RULES.parkedSpeed && bears && cabBiteFrom(o, foe, gun, o.me.pos) >= best.cabBite;
}

function onApproach(o: Orders, p: Vec, heading: number): boolean {
  return Math.abs(angleDiff(bearing(o.me.pos, p), heading)) <= Math.PI / NPC_BEHAVIOR.fight.angles;
}

function bearingPoint(o: Orders, foe: Vehicle): Vec | null {
  const gun = leadGun(o);
  if (!gun) return null;
  const stands = ringPoints(o, foe, gun).map((at) => standAt(o, foe, gun, at));
  const best = stands.reduce((top, s) => (nearer(s, top) ? s : top));
  if (heldHere(o, foe, gun, best)) return o.me.pos;
  return onApproach(o, best.p, best.heading) ? best.p : best.runUp;
}

export function gunStand(o: Orders, foe: Vehicle): Vec {
  return bearingPoint(o, foe) ?? foe.pos;
}
