import type { Octant } from '../sim/types';

export const OCTANT_ORDER: readonly Octant[] = ['east', 'southEast', 'south', 'southWest', 'west', 'northWest', 'north', 'northEast'];

const COUNT = OCTANT_ORDER.length;
const STEP = (2 * Math.PI) / COUNT;

function wrap(index: number): number {
  return ((index % COUNT) + COUNT) % COUNT;
}

export function compassOctant(rad: number): Octant {
  return OCTANT_ORDER[wrap(Math.round(rad / STEP))];
}
