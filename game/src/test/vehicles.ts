import type { PersonalityId } from '../data/personalities';
import type { TraitId } from '../data/npcs';
import { makeVehicle } from '../sim/factory';
import type { Faction, NpcBrain, Vehicle, World } from '../sim/types';
import type { Vec } from '../sim/vec';

export function addVehicle(w: World, faction: Faction, chassisId: string, parts: string[], pos: Vec, heading = 0): Vehicle {
  const v = makeVehicle(w, { faction, chassisId, parts: parts.map((defId) => ({ defId, wear: 0 })), spares: [], cargo: {}, pos, heading, brain: null });
  w.vehicles.push(v);
  return v;
}

export function npcBrain(templateId: string, home: Vec, traits: TraitId[], personality: PersonalityId = 'talkative'): NpcBrain {
  return { templateId, driver: 'Jed Cobb', traits, personality, goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { ...home }, stepIndex: 0, memories: [] };
}
