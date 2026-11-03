import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { fileReports, stepPosse } from '../sim/crime';
import { playerVehicle } from '../sim/damage';
import { planMarshal } from '../sim/marshals';
import { remember } from '../sim/memory';
import { getKnownSite } from '../sim/npc-decisions';
import { defaultSetup } from '../sim/settings';
import { nearestPad } from '../sim/sites';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import type { Vec } from '../sim/vec';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

function idleMarshal(w: World, pos: Vec): Vehicle {
  const m = addVehicle(w, 'marshals', 'scout', ['mg', 'stockEngine'], pos);
  m.brain = npcBrain('marshal', pos, ['marshal', 'brave']);
  m.brain.goals = [{ kind: 'wait', targetId: 'marshal-post', destination: { ...pos }, phase: 'act', reason: 'atPost', until: w.turn + 500 }];
  return m;
}

describe('a pair hunt across a save', () => {
  it('loads the marked cases, the pair escort and both goals the same, and awards nothing (IV8)', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
    const me = playerVehicle(w);
    const witness = addVehicle(w, 'bowl', 'scout', ['mg', 'stockEngine'], { ...nearestPad(getKnownSite('bowl'), me.pos) });
    witness.brain = npcBrain('trader', witness.pos, ['trader']);
    witness.speed = 0;
    remember(w, witness, { kind: 'witnessed', crime: `${w.turn}:${me.id}:${witness.id}:robbed`, by: me.id, victim: witness.id, offense: 'robbed', at: { ...me.pos }, heading: 0, restitution: 0 });
    fileReports(w, witness);
    stepPosse(w.crimes);
    expect(w.crimes.map((c) => c.posse)).toEqual(['pair']);
    const pad = nearestPad(getKnownSite('marshal-post'), getKnownSite('marshal-post').pos);
    const leader = idleMarshal(w, pad);
    const partner = idleMarshal(w, { x: pad.x + 4, y: pad.y });
    planMarshal(w, leader, [partner]);
    expect(w.states.some((s) => s.kind === 'escort' && s.holder === partner.id)).toBe(true);
    w.events = [];
    const loaded = reload(w);
    expect(loaded.crimes).toEqual(w.crimes);
    expect(loaded.states).toEqual(w.states);
    for (const id of [leader.id, partner.id]) expect(loaded.vehicles.find((v) => v.id === id)!.brain!.goals).toEqual(w.vehicles.find((v) => v.id === id)!.brain!.goals);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
