import { NPCS } from '../data/npcs';
import { PARTS, type PartKind } from '../data/parts';
import { directStretch, stretchBudget } from './chaos-highway-director';
import { planStretch, waveGear } from './chaos-highway';
import type { PartSpec } from './factory';
import { stretchLength } from './highway';
import { generateNpcLoadout, type NpcLoadout } from './npc-loadout';
import { allegianceFor, makeNpc } from './spawn';
import type { GroupSide, Vehicle, World } from './types';

export type RolledTruck = { vehicle: Vehicle; chassisId: string; gear: Record<Exclude<PartKind, 'core'>, string[]>; gearValue: number };
export type RolledGroup = { id: string; template: string; from: GroupSide; at: number; elite: boolean; money: number; trucks: RolledTruck[] };
export type RolledStretch = { stretch: number; length: number; budget: number; groups: RolledGroup[] };

const GEAR_KINDS = ['weapon', 'armor', 'engine', 'utility', 'accessory', 'cargo', 'scanner', 'store'] as const satisfies readonly Exclude<PartKind, 'core'>[];

export function rollStretch(world: World, j: number, roll: number): RolledStretch {
  const probe: World = { ...world, rngState: roll * 7919 + j, marketRng: { rngState: roll * 104729 + j } };
  const groups = planStretch(world.seed, j, directStretch(world, j)).map((group) => ({
    id: group.id,
    template: group.templates[0],
    from: group.from,
    at: Math.round(group.at),
    elite: group.elite,
    money: group.money,
    trucks: group.templates.map((id) => rolledTruck(probe, id, generateNpcLoadout(probe, NPCS[id], null, group.level, waveGear(id, j, group.money)))),
  }));
  return { stretch: j, length: stretchLength(world.seed, j), budget: stretchBudget(world, j).budget, groups };
}

function rolledTruck(probe: World, template: string, loadout: NpcLoadout): RolledTruck {
  const vehicle = makeNpc(probe, NPCS[template], { ...loadout, cargo: {} }, { x: 0, y: 0 }, allegianceFor(probe, NPCS[template], null, null));
  const specs: PartSpec[] = [...loadout.parts, ...loadout.spares];
  const gearParts = specs.map((spec) => PARTS[spec.defId]).filter((def) => def.kind !== 'core');
  const gear = Object.fromEntries(GEAR_KINDS.map((kind) => [kind, gearParts.filter((def) => def.kind === kind).map((def) => def.id)])) as RolledTruck['gear'];
  return { vehicle, chassisId: loadout.chassisId, gear, gearValue: Math.round(gearParts.reduce((sum, def) => sum + def.value, 0)) };
}
