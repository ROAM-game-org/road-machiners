import { parseLineup, type Fight } from './combat-harness';

export const FIGHT: Fight = { a: parseLineup('stand'), b: parseLineup('buggy'), seed: 3, gap: 8, orbit: 6, maxTurns: 4, arena: null };
