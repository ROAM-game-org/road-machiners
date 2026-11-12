import { NPC_UTILITY } from '../data/npc-behavior';
import { partDef } from '../data/parts';
import { inCombat, isHostile } from './combat';
import { haulerOf } from './damage';
import { corePart } from './grid';
import { situationOfHauler } from './hauler';
import { topGoal } from './npc-activities';
import { visibleHostiles } from './npc-decisions';
import { sunAt } from './sun';
import type { NpcBrain, PartInstance, UtilityOrder, Vehicle, World } from './types';
import { chargedParts, useKindOf, utilityOrderError, type UseKind } from './utility';
import { dist, isAhead, type Vec } from './vec';
import { canVehicleSee } from './vision';
import { maxHp } from './wear';

type Npc = Vehicle & { brain: NpcBrain };

export type UseSituation = { fleeing: boolean; attackers: Vehicle[]; ramming: boolean; flareSpot: Vec | null; holdDrops: boolean };

type Rule = (world: World, v: Vehicle, part: PartInstance, s: UseSituation) => UtilityOrder | null;

const self = (wanted: boolean): UtilityOrder | null => (wanted ? { kind: 'self' } : null);

const RULES: Record<UseKind, Rule> = {
  sprout: (world, v, _part, s) => self(wantsSmoke(world, v, s)),
  caltrops: (world, v, _part, s) => self(chased(world, v, s)),
  oil: (world, v, _part, s) => self(chased(world, v, s)),
  mortar: (_world, v, _part, s) => mortarOrder(v, s),
  flare: (_world, _v, _part, s) => flareOrder(s),
  emitter: (world, v, part) => emitterOrder(world, v, part),
  claymore: (world, v, part, s) => claymoreOrder(world, v, part, s),
  crane: () => null,
  scraper: () => null,
};

export function assignUtilityOrders(world: World): void {
  for (const v of world.vehicles) if (isNpc(world, v)) planUses(world, v, () => situationOfNpc(world, v));
  if (world.chaosHighway && world.player.state === 'active') {
    const hauler = haulerOf(world);
    planUses(world, hauler, () => situationOfHauler(world, hauler));
  }
}

function isNpc(world: World, v: Vehicle): v is Npc {
  return v.brain !== null && v.id !== world.player.vehicleId;
}

function planUses(world: World, v: Vehicle, situationNow: () => UseSituation): void {
  const parts = chargedParts(v).filter((part) => !(part.id in v.utilityOrders));
  if (parts.length === 0) return;
  const s = situationNow();
  for (const part of parts) {
    const order = RULES[useKindOf(partDef(part.defId))](world, v, part, s);
    if (order && utilityOrderError(world, v, part.id, order) === null) v.utilityOrders[part.id] = order;
  }
}

export function situationOfNpc(world: World, v: Npc): UseSituation {
  return { fleeing: topGoal(v)?.kind === 'flee', attackers: seenAttackers(world, v), ramming: v.brain.ramChoice !== undefined, flareSpot: investigatedSpot(world, v), holdDrops: false };
}

function seenAttackers(world: World, v: Npc): Vehicle[] {
  const seen = world.vehicles.filter((x) => x.id in v.brain.attackers && canVehicleSee(world, v, x.pos));
  return seen.sort((a, b) => dist(v.pos, a.pos) - dist(v.pos, b.pos));
}

function investigatedSpot(world: World, v: Npc): Vec | null {
  const goal = topGoal(v);
  if (sunAt(world.turn) || goal?.kind !== 'investigate' || !goal.destination) return null;
  return { ...goal.destination };
}

function claymoreOrder(world: World, v: Vehicle, part: PartInstance, s: UseSituation): UtilityOrder | null {
  if (!part.charge?.armed) return self(s.ramming);
  return !s.ramming && !inCombat(world, v) ? { kind: 'disarm' } : null;
}

function wantsSmoke(world: World, v: Vehicle, s: UseSituation): boolean {
  if (s.attackers.length === 0) return false;
  const cab = corePart(v, 'cab');
  return (s.fleeing && inCombat(world, v)) || cab.hp < maxHp(cab) * NPC_UTILITY.sproutCab;
}

function chased(world: World, v: Vehicle, s: UseSituation): boolean {
  return s.fleeing && !s.holdDrops && visibleHostiles(world, v).some((h) => dist(v.pos, h.pos) <= NPC_UTILITY.dropReach && !isAhead(v.pos, v.heading, h.pos));
}

function mortarOrder(v: Vehicle, s: UseSituation): UtilityOrder | null {
  const attacker = s.fleeing ? s.attackers[0] : undefined;
  if (!attacker) return null;
  return { kind: 'point', pos: { x: (v.pos.x + attacker.pos.x) / 2, y: (v.pos.y + attacker.pos.y) / 2 } };
}

function flareOrder(s: UseSituation): UtilityOrder | null {
  return s.flareSpot ? { kind: 'point', pos: { ...s.flareSpot } } : null;
}

function emitterOrder(world: World, v: Vehicle, part: PartInstance): UtilityOrder | null {
  const def = partDef(part.defId);
  if (def.kind !== 'utility' || def.effect.type !== 'emitter') throw new Error(`${def.id} is not an emitter`);
  const radius = def.effect.radius;
  const near = world.vehicles.filter((x) => x.id !== v.id && dist(x.pos, v.pos) <= radius && canVehicleSee(world, v, x.pos));
  return self(near.length > 0 && inCombat(world, v) && near.every((x) => isHostile(world, v, x)));
}
