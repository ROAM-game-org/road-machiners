import { playerVehicle } from './damage';
import { fuelLimit } from './far';
import { isStranded, plainFuelPerTile } from './stats';
import type { SimNote, World } from './types';
import { stormShare } from './weather';

export type Trouble = { fuelLow: boolean; stranded: boolean; inStorm: boolean };

const NEWS: readonly (readonly [keyof Trouble, SimNote['id']])[] = [
  ['fuelLow', 'fuelLow'],
  ['stranded', 'stranded'],
  ['inStorm', 'stormEntered'],
];

export function troubleOf(world: World): Trouble {
  const me = playerVehicle(world);
  const stranded = isStranded(world, me);
  return {
    fuelLow: !stranded && fuelLimit(world, me, plainFuelPerTile(world, me) > 0) === 'low',
    stranded,
    inStorm: stormShare(me) > 0,
  };
}

export function noteTrouble(world: World, before: Trouble): void {
  const after = troubleOf(world);
  for (const [key, id] of NEWS) if (after[key] && !before[key]) world.events.push({ t: 'info', note: { id } as SimNote });
}
