import { NPCS } from '../data/npcs';
import { directStretch, truckMoney } from './chaos-highway-director';
import { planStretch, waveGear } from './chaos-highway';
import { generateNpcLoadout } from './npc-loadout';
import { allegianceFor, makeNpc } from './spawn';
import type { Vehicle, World } from './types';

export type RolledTruck = { elite: boolean; vehicle: Vehicle };
export type RolledStretch = { stretch: number; groups: RolledTruck[][] };

export function rollStretch(world: World, j: number, roll: number): RolledStretch {
  const probe: World = { ...world, rngState: roll * 7919 + j, marketRng: { rngState: roll * 104729 + j } };
  const groups = planStretch(world.seed, j, directStretch(world, j)).map((group) =>
    group.templates.map((id, i) => {
      const loadout = generateNpcLoadout(probe, NPCS[id], null, group.level, waveGear(id, j, truckMoney(group, i)));
      const vehicle = makeNpc(probe, NPCS[id], { ...loadout, cargo: {} }, { x: 0, y: 0 }, allegianceFor(probe, NPCS[id], null, null));
      return { elite: i < group.elites, vehicle };
    }),
  );
  return { stretch: j, groups };
}
