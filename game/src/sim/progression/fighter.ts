import { NPCS } from '../../data/npcs';
import { PERSONALITY_IDS } from '../../data/personalities';
import type { Vehicle } from '../types';

const FIGHTER = NPCS.merc;

export function asFighter(me: Vehicle): Vehicle {
  const brain = { templateId: FIGHTER.id, driver: '', traits: [...FIGHTER.traits], personality: PERSONALITY_IDS[0], goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { ...me.pos }, stepIndex: 0, memories: [] };
  return { ...me, brain };
}
