import { FACTIONS } from '../data/npc-behavior';
import type { Faction, Vehicle } from './types';

export function isOutlaw(faction: Faction): boolean {
  return faction !== 'player' && factionDef(faction).outlaw;
}

export function isOrganized(faction: Faction): boolean {
  return faction !== 'player' && factionDef(faction).organized;
}

function factionDef(faction: Exclude<Faction, 'player'>) {
  const def = FACTIONS[faction];
  if (!def) throw new Error(`Unknown faction ${faction}`);
  return def;
}

export function isRaider(v: Vehicle): boolean {
  return v.brain?.traits.includes('raider') === true;
}
