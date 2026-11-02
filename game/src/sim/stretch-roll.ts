import { NPCS } from '../data/npcs';
import { directStretch } from './chaos-highway-director';
import { planStretch, waveGear } from './chaos-highway';
import { generateNpcLoadout } from './npc-loadout';
import { allegianceFor, makeNpc } from './spawn';
import type { Vehicle, World } from './types';

export type RolledGroup = { elite: boolean; trucks: Vehicle[] };
export type RolledStretch = { stretch: number; groups: RolledGroup[] };

export function rollStretch(world: World, j: number, roll: number): RolledStretch {
  const probe: World = { ...world, rngState: roll * 7919 + j, marketRng: { rngState: roll * 104729 + j } };
  const groups = planStretch(world.seed, j, directStretch(world, j)).map((group) => ({
    elite: group.elite,
    trucks: group.templates.map((id) => {
      const loadout = generateNpcLoadout(probe, NPCS[id], null, group.level, waveGear(id, j, group.money));
      return makeNpc(probe, NPCS[id], { ...loadout, cargo: {} }, { x: 0, y: 0 }, allegianceFor(probe, NPCS[id], null, null));
    }),
  }));
  return { stretch: j, groups };
}
