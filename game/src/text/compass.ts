import { VIEW } from '../data/view';
import type { Cardinal, Octant } from '../sim/types';

export const OCTANT_ORDER: readonly Octant[] = ['east', 'southEast', 'south', 'southWest', 'west', 'northWest', 'north', 'northEast'];

const COUNT = OCTANT_ORDER.length;
const STEP = (2 * Math.PI) / COUNT;
const MAP_NORTH = OCTANT_ORDER.indexOf('north');

function turnSteps(): number {
  const steps = Math.atan2(VIEW.screenUp.y, VIEW.screenUp.x) / STEP;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) throw new Error('The view must turn the compass by whole octants');
  return MAP_NORTH - Math.round(steps);
}

const TURN = turnSteps();

function wrap(index: number): number {
  return ((index % COUNT) + COUNT) % COUNT;
}

export function compassOctant(rad: number): Octant {
  return OCTANT_ORDER[wrap(Math.round(rad / STEP) + TURN)];
}

export function compassOfMap(octant: Octant): Octant {
  const index = OCTANT_ORDER.indexOf(octant);
  if (index < 0) throw new Error(`Unknown octant ${octant}`);
  return OCTANT_ORDER[wrap(index + TURN)];
}

export type Diagonal = 'northEast' | 'southEast' | 'southWest' | 'northWest';

const DIAGONALS: readonly Octant[] = ['northEast', 'southEast', 'southWest', 'northWest'];

export function compassOfCardinal(cardinal: Cardinal): Diagonal {
  const octant = compassOfMap(cardinal);
  if (!DIAGONALS.includes(octant)) throw new Error(`The map ${cardinal} reads as ${octant}, which has no gate or lean words`);
  return octant as Diagonal;
}
