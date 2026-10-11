import { partDef } from '../../data/parts';
import { playerVehicle } from '../damage';
import { enemyTrucks, expectedGear, gearMoneyOf } from '../fury-road-danger';
import { bodyCondition } from '../npc-decisions';
import { mountedParts } from '../grid';
import type { GameEvent, Vehicle, WaveGroup, World } from '../types';
import { partValue } from '../wear';

export type KitLine = { chassis: string; guns: string[]; armor: number; gear: number };
export type RunLine =
  | { t: 'group'; turn: number; stretch: number; from: string; trucks: (KitLine & { id: string; template: string })[] }
  | { t: 'outpost'; turn: number; stretch: number; pay: number; wrecks: number; condition: number; damageTaken: number }
  | { t: 'leave'; turn: number; stretch: number; money: number; condition: number; kit: KitLine; expectedGear: number; enemyGear: number; enemyTrucks: number }
  | { t: 'beaten'; turn: number; stretch: number; id: string; template: string }
  | { t: 'lost'; turn: number; stretch: number; cause: string; money: number; kit: KitLine; stretchDamageBy: { id: string; template: string; damage: number }[] };

export function kitOf(v: Vehicle): KitLine {
  const parts = mountedParts(v).filter((p) => partDef(p.defId).kind !== 'core');
  return {
    chassis: v.chassisId,
    guns: parts.filter((p) => partDef(p.defId).kind === 'weapon').map((p) => p.defId),
    armor: parts.filter((p) => partDef(p.defId).kind === 'armor').length,
    gear: Math.round(parts.reduce((sum, p) => sum + partValue(p), 0) / 100),
  };
}

function conditionOf(world: World): number {
  return Math.round(bodyCondition(playerVehicle(world)) * 100) / 100;
}

export class RunLog {
  private damage = new Map<string, number>();
  private templates = new Map<string, string>();

  note(before: World, world: World, events: readonly GameEvent[]): RunLine[] {
    const run = world.furyRoad;
    if (!run || !before.furyRoad) return [];
    const me = world.player.vehicleId;
    for (const v of world.vehicles) if (v.brain) this.templates.set(v.id, v.brain.templateId);
    this.tallyDamage(events, me);
    const stretch = run.window + 1;
    return [
      ...this.spawned(before, world),
      ...this.beaten(before, world, stretch),
      ...events.flatMap((e): RunLine[] => (e.t === 'outpostReached' ? [this.outpost(world, e.milestone, e.pay, e.wrecks)] : [])),
      ...(run.window > before.furyRoad.window ? [this.leave(world, stretch)] : []),
      ...events.flatMap((e): RunLine[] => (e.t === 'runLost' ? [this.lost(world, e.stretch, e.cause)] : [])),
    ];
  }

  private tallyDamage(events: readonly GameEvent[], me: string): void {
    for (const e of events) {
      if (e.t !== 'shot' || e.target !== me) continue;
      const dealt = e.rounds.reduce((sum, r) => sum + r.hits.reduce((s, h) => s + h.damage, 0), 0);
      this.damage.set(e.shooter, (this.damage.get(e.shooter) ?? 0) + dealt);
    }
  }

  private spawned(before: World, world: World): RunLine[] {
    const was = new Set(before.furyRoad!.groups.filter((g) => g.spawned).map((g) => g.id));
    return world.furyRoad!.groups.filter((g) => g.spawned && !was.has(g.id)).map((g) => this.groupLine(world, g));
  }

  private groupLine(world: World, g: WaveGroup): RunLine {
    const trucks = g.vehicles.map((id) => {
      const v = world.vehicles.find((x) => x.id === id);
      if (!v?.brain) throw new Error(`Group ${g.id} truck ${id} is missing at spawn`);
      return { id, template: v.brain.templateId, ...kitOf(v) };
    });
    return { t: 'group', turn: world.turn, stretch: g.stretch, from: g.from, trucks };
  }

  private beaten(before: World, world: World, stretch: number): RunLine[] {
    const was = new Set(before.furyRoad!.groups.flatMap((g) => g.counted));
    return world.furyRoad!.groups.flatMap((g) => g.counted.filter((id) => !was.has(id)))
      .map((id) => ({ t: 'beaten', turn: world.turn, stretch, id, template: this.templates.get(id) ?? 'unknown' }));
  }

  private outpost(world: World, stretch: number, pay: number, wrecks: number): RunLine {
    const damageTaken = Math.round([...this.damage.values()].reduce((sum, d) => sum + d, 0));
    return { t: 'outpost', turn: world.turn, stretch, pay: Math.round(pay / 100), wrecks, condition: conditionOf(world), damageTaken };
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
      expectedGear: Math.round(expectedGear(world, stretch) / 100),
      enemyGear: Math.round(gearMoneyOf(world, stretch) / 100),
      enemyTrucks: enemyTrucks(world, stretch),
    };
  }

  private lost(world: World, stretch: number, cause: string): RunLine {
    const stretchDamageBy = [...this.damage.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, damage]) => ({ id, template: this.templates.get(id) ?? 'unknown', damage: Math.round(damage) }));
    return { t: 'lost', turn: world.turn, stretch, cause, money: Math.round(world.player.money / 100), kit: kitOf(playerVehicle(world)), stretchDamageBy };
  }
}
