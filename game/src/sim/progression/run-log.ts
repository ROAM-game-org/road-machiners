import { CHAOS_HIGHWAY } from '../../data/modes';
import { isShield, partDef } from '../../data/parts';
import { haulerOf, playerVehicle } from '../damage';
import { outpostPartPrice, haulerTakes } from '../outposts';
import { dist } from '../vec';
import { isJunk } from '../wear';
import { repairCost } from '../economy';
import { gearPlans } from './gear';
import { stretchBudget } from '../chaos-highway-director';
import { milestoneAt } from '../highway';
import { bodyCondition } from '../npc-decisions';
import { mountedParts } from '../grid';
import type { GameEvent, Vehicle, WaveGroup, World } from '../types';

export type KitLine = { chassis: string; guns: string[]; armor: number; gear: number };
export type Enemy = { chassis: string; guns: string[]; armor: number };
export type StretchStats = {
  haulerDamage: number;
  haulerStart: number;
  haulerEnd: number;
  firstHit: number | null;
  turnsFromFirstHit: number | null;
  playerShots: number;
  fights: number;
  enemies: Enemy[];
};
export type PlanLine = { at: number; template: string; size: number; money: number; elite: boolean };
export type OutpostChoice = { useful: number; affordable: number; total: number; money: number };
export type RunLine =
  | { t: 'group'; turn: number; stretch: number; from: string; elite: boolean; money: number; trucks: (KitLine & { id: string; template: string })[] }
  | { t: 'stretch'; turn: number; stretch: number; stats: StretchStats; choice: OutpostChoice }
  | { t: 'outpost'; turn: number; stretch: number; pay: number; wrecks: number; condition: number; damageTaken: number; money: number; repairs: number; haulerRepairs: number }
  | { t: 'leave'; turn: number; stretch: number; money: number; condition: number; kit: KitLine; haulerKit: KitLine; paid: number; budget: number; plan: PlanLine[] }
  | { t: 'beaten'; turn: number; stretch: number; id: string; template: string }
  | { t: 'lost'; turn: number; stretch: number; cause: string; money: number; kit: KitLine; stretchDamageBy: { id: string; template: string; damage: number }[]; stats: StretchStats };

export function kitOf(v: Vehicle): KitLine {
  const parts = mountedParts(v).filter((p) => partDef(p.defId).kind !== 'core');
  return {
    chassis: v.chassisId,
    guns: parts.filter((p) => partDef(p.defId).kind === 'weapon').map((p) => p.defId),
    armor: parts.filter((p) => isShield(partDef(p.defId))).length,
    gear: Math.round(parts.reduce((sum, p) => sum + partDef(p.defId).value, 0) / 100),
  };
}

function conditionOf(world: World): number {
  return Math.round(bodyCondition(playerVehicle(world)) * 100) / 100;
}

const idleTally = () => ({ haulerDamage: 0, haulerStart: null as number | null, firstHit: null as number | null, playerShots: 0, engaged: new Set<string>(), enemies: [] as Enemy[] });

function haulerCondition(world: World): number {
  return Math.round(bodyCondition(haulerOf(world)) * 100) / 100;
}

function damageOn(events: readonly GameEvent[], id: string): number {
  let total = 0;
  for (const e of events) {
    if (e.t === 'shot' && e.target === id) total += e.rounds.reduce((sum, r) => sum + r.hits.reduce((s, h) => s + h.damage, 0), 0);
    if (e.t === 'collision' && e.a === id) total += e.hitsA.reduce((sum, h) => sum + h.damage, 0);
    if (e.t === 'collision' && e.b === id) total += e.hitsB.reduce((sum, h) => sum + h.damage, 0);
  }
  return total;
}

function choiceAt(world: World): OutpostChoice {
  const run = world.chaosHighway!;
  const post = run.outposts.find((o) => o.milestone === run.window + 1);
  const money = world.player.money;
  const stock = (post?.stock ?? []).filter((part) => !isJunk(part));
  const me = playerVehicle(world);
  const hauler = haulerOf(world);
  const mine = gearPlans(world, me, stock.map((part) => ({ part, price: outpostPartPrice(world, part) })), { job: 'fighter', skip: [], resale: () => 0 });
  const theirs = gearPlans(world, hauler, stock.filter(haulerTakes).map((part) => ({ part, price: outpostPartPrice(world, part, hauler.id) })), { job: 'hauler', skip: [], resale: () => 0 });
  const cheapest = new Map<string, number>();
  for (const plan of [...mine, ...theirs].filter((p) => p.jobGain > 0)) cheapest.set(plan.offer.part.id, Math.min(cheapest.get(plan.offer.part.id) ?? Infinity, plan.offer.price));
  const prices = [...cheapest.values()];
  return { useful: cheapest.size, affordable: prices.filter((price) => price <= money).length, total: Math.round(prices.reduce((sum, p) => sum + p, 0) / 100), money: Math.round(money / 100) };
}

export class RunLog {
  private damage = new Map<string, number>();
  private templates = new Map<string, string>();
  private tally = idleTally();
  private stretchStart = 0;

  note(before: World, world: World, events: readonly GameEvent[]): RunLine[] {
    const run = world.chaosHighway;
    if (!run || !before.chaosHighway) return [];
    const me = world.player.vehicleId;
    for (const v of world.vehicles) if (v.brain) this.templates.set(v.id, v.brain.templateId);
    this.tallyDamage(events, me);
    const stretch = run.window + 1;
    this.tallyHauler(before, world, events);
    return [
      ...this.spawned(before, world),
      ...this.beaten(before, world, stretch),
      ...events.flatMap((e): RunLine[] => (e.t === 'outpostReached' ? [this.outpost(world, e.milestone, e.pay, e.wrecks), this.stretchLine(world, e.milestone)] : [])),
      ...(events.some((e) => e.t === 'roadOpened') ? [this.leave(world, stretch)] : []),
      ...events.flatMap((e): RunLine[] => (e.t === 'runLost' ? [this.lost(world, e.stretch, e.cause)] : [])).slice(0, 1),
    ];
  }

  private tallyHauler(before: World, world: World, events: readonly GameEvent[]): void {
    const hauler = haulerOf(world);
    if (this.tally.haulerStart === null) {
      this.tally.haulerStart = haulerCondition(before);
      this.stretchStart = before.turn;
    }
    const dealt = damageOn(events, hauler.id);
    this.tally.haulerDamage += dealt;
    if (dealt > 0 && this.tally.firstHit === null) this.tally.firstHit = world.turn;
    this.tally.playerShots += events.filter((e) => e.t === 'shot' && e.shooter === world.player.vehicleId).length;
    for (const g of world.chaosHighway!.groups) {
      if (g.vehicles.some((id) => { const v = world.vehicles.find((x) => x.id === id); return v !== undefined && dist(v.pos, hauler.pos) <= CHAOS_HIGHWAY.pacing.near; })) this.tally.engaged.add(g.id);
    }
  }

  private statsAt(world: World): StretchStats {
    const t = this.tally;
    const lostAt = world.turn;
    return {
      haulerDamage: Math.round(t.haulerDamage),
      haulerStart: t.haulerStart ?? haulerCondition(world),
      haulerEnd: haulerCondition(world),
      firstHit: t.firstHit,
      turnsFromFirstHit: t.firstHit === null ? null : lostAt - t.firstHit,
      playerShots: t.playerShots,
      fights: t.engaged.size,
      enemies: t.enemies,
    };
  }

  private stretchLine(world: World, stretch: number): RunLine {
    const line: RunLine = { t: 'stretch', turn: world.turn, stretch, stats: this.statsAt(world), choice: choiceAt(world) };
    this.tally = idleTally();
    this.tally.haulerStart = haulerCondition(world);
    return line;
  }

  private tallyDamage(events: readonly GameEvent[], me: string): void {
    for (const e of events) {
      if (e.t !== 'shot' || e.target !== me) continue;
      const dealt = e.rounds.reduce((sum, r) => sum + r.hits.reduce((s, h) => s + h.damage, 0), 0);
      this.damage.set(e.shooter, (this.damage.get(e.shooter) ?? 0) + dealt);
    }
  }

  private spawned(before: World, world: World): RunLine[] {
    const was = new Set(before.chaosHighway!.groups.filter((g) => g.spawned).map((g) => g.id));
    return world.chaosHighway!.groups.filter((g) => g.spawned && !was.has(g.id)).map((g) => this.groupLine(world, g));
  }

  private groupLine(world: World, g: WaveGroup): RunLine {
    const trucks = g.vehicles.map((id) => {
      const v = world.vehicles.find((x) => x.id === id);
      if (!v?.brain) throw new Error(`Group ${g.id} truck ${id} is missing at spawn`);
      return { id, template: v.brain.templateId, ...kitOf(v) };
    });
    for (const truck of trucks) this.tally.enemies.push({ chassis: truck.chassis, guns: truck.guns, armor: truck.armor });
    return { t: 'group', turn: world.turn, stretch: g.stretch, from: g.from, elite: g.elite, money: Math.round(g.money / 100), trucks };
  }

  private beaten(before: World, world: World, stretch: number): RunLine[] {
    const was = new Set(before.chaosHighway!.groups.flatMap((g) => g.counted));
    return world.chaosHighway!.groups.flatMap((g) => g.counted.filter((id) => !was.has(id)))
      .map((id) => ({ t: 'beaten', turn: world.turn, stretch, id, template: this.templates.get(id) ?? 'unknown' }));
  }

  private outpost(world: World, stretch: number, pay: number, wrecks: number): RunLine {
    const damageTaken = Math.round([...this.damage.values()].reduce((sum, d) => sum + d, 0));
    const repairs = Math.round(repairCost(world, playerVehicle(world)) / 100);
    const haulerRepairs = Math.round(repairCost(world, haulerOf(world)) / 100);
    return { t: 'outpost', turn: world.turn, stretch, pay: Math.round(pay / 100), wrecks, condition: conditionOf(world), damageTaken, money: Math.round(world.player.money / 100), repairs, haulerRepairs };
  }

  private leave(world: World, stretch: number): RunLine {
    this.damage.clear();
    return {
      t: 'leave',
      turn: world.turn,
      stretch,
      money: Math.round(world.player.money / 100),
      condition: conditionOf(world),
      kit: kitOf(playerVehicle(world)),
      haulerKit: kitOf(haulerOf(world)),
      paid: Math.round(world.chaosHighway!.earned / 100),
      budget: stretchBudget(world, stretch).budget,
      plan: world.chaosHighway!.groups.map((g) => ({ at: Math.round(g.at - milestoneAt(world.seed, stretch - 1)), template: g.templates[0], size: g.templates.length, money: Math.round(g.money / 100), elite: g.elite })),
    };
  }

  private lost(world: World, stretch: number, cause: string): RunLine {
    const stretchDamageBy = [...this.damage.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, damage]) => ({ id, template: this.templates.get(id) ?? 'unknown', damage: Math.round(damage) }));
    return { t: 'lost', turn: world.turn, stretch, cause, money: Math.round(world.player.money / 100), kit: kitOf(playerVehicle(world)), stretchDamageBy, stats: this.statsAt(world) };
  }
}
