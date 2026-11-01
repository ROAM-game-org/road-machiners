import type { TraitId } from '../data/npcs';
import type { PersonalityId } from '../data/personalities';
import { makeVehicle } from '../sim/factory';
import type { Faction, NpcBrain, Vehicle, World } from '../sim/types';
import type { Vec } from '../sim/vec';

export function addVehicle(w: World, faction: Faction, chassisId: string, parts: string[], pos: Vec, heading = 0): Vehicle {
  const v = makeVehicle(w, { faction, chassisId, parts: parts.map((defId) => ({ defId, wear: 0 })), spares: [], cargo: {}, pos, heading, brain: null });
  w.vehicles.push(v);
  return v;
}

export function gunAcrossMiddle(v: Vehicle): void {
  if (v.chassisId !== 'buggy') throw new Error(`gunAcrossMiddle sets a buggy gun, not a ${v.chassisId} one`);
  const gun = v.items.find((it) => it.kind === 'part' && it.part.defId === 'mg');
  if (!gun) throw new Error('The buggy has no mg');
  Object.assign(gun, { x: 2, y: 5, rot: 3 });
}

export function npcBrain(templateId: string, home: Vec, traits: TraitId[], personality: PersonalityId = 'talkative'): NpcBrain {
  return { templateId, driver: 'Jed Cobb', traits, personality, goals: [], noticed: {}, tracks: {}, hurt: 0, attackers: {}, goal: null, home: { ...home }, stepIndex: 0, memories: [] };
}
