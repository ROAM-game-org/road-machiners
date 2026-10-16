import { afterAll, beforeAll, expect } from 'vitest';
import { CHASSIS } from '../data/chassis';
import type { GearLevel, NpcTemplate } from '../data/npcs';
import { PARTS } from '../data/parts';
import TRUCK_SHAPES from '../data/truck-shapes.json';
import { mountedParts } from './grid';
import { makeVehicle } from './factory';
import { generateNpcLoadout } from './npc-loadout';
import { emptyWorld } from './testkit';
import type { Vehicle, World } from './types';

const TINY = {
  ...CHASSIS.scout,
  id: 'tiny',
  layout: CHASSIS.scout.layout.map((row, y) => (y === 0 || y === CHASSIS.scout.layout.length - 1 ? row : row.replace(/D/g, (_m, at: number) => (y === 1 && at === 4 ? 'D' : 'X')))),
};
const SHAPES = TRUCK_SHAPES as Record<string, unknown>;

export let fixture: World;

export function useLoadoutFixture(): void {
  beforeAll(() => {
    fixture = emptyWorld();
    CHASSIS.tiny = TINY;
    SHAPES.base_tiny = TRUCK_SHAPES.base_scout;
  });
  afterAll(() => { delete CHASSIS.tiny; delete SHAPES.base_tiny; });
}

export function describeLoadout(v: Vehicle): string {
  return JSON.stringify({ chassis: v.chassisId, parts: mountedParts(v).map((p) => p.defId), goods: v.items.filter((i) => i.kind === 'good').map((i) => i.good) });
}

const loadouts = new Map<string, ReturnType<typeof generateNpcLoadout>>();

export function loadoutOf(world: World, template: NpcTemplate, chassisId: string | null = null, level: GearLevel | null = null) {
  const key = [template.id, JSON.stringify(template.loadout.priorities), chassisId, level, world.rngState, world.marketRng.rngState].join('|');
  let loadout = loadouts.get(key);
  if (!loadout) {
    const beforeId = world.nextId;
    loadout = generateNpcLoadout(world, template, chassisId, level);
    expect(world.nextId).toBe(beforeId);
    loadouts.set(key, loadout);
  }
  return structuredClone(loadout);
}

export const gearCost = (parts: { defId: string }[]) => parts.reduce((sum, p) => sum + PARTS[p.defId].value, 0);

export function rolled(template: NpcTemplate, level: GearLevel | null, seed: number): Vehicle {
  const world = { ...fixture, rngState: seed, marketRng: { rngState: seed * 104729 + 1 } };
  const loadout = loadoutOf(world, template, null, level);
  return makeVehicle(world, { ...loadout, faction: template.faction, brain: null, pos: { x: 50, y: 50 }, heading: 0 });
}
