import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { remember } from '../sim/memory';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { Contract } from '../sim/market';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function search(id: string, target: string, found: boolean): Contract {
  return {
    id, shop: 'bowl', kind: 'search', target, driver: 'Jed Cobb', template: 'trader',
    lead: { at: { x: 40, y: 52 }, turn: 20 }, reward: 3700, deadline: 900, window: 600, tier: 1, found,
  };
}

describe('a search in a save', () => {
  it('loads back with its lead, its found flag and the sightings, and raises no events or pay', () => {
    const w: World = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    const witness = addVehicle(w, 'traders', 'scout', [], { x: 60, y: 60 });
    witness.brain = npcBrain('trader', witness.pos, ['trader']);
    w.turn = 30;
    remember(w, witness, { kind: 'sighting', vehicle: 'v77', at: { x: 41, y: 50 }, heading: 1.25 });
    w.player.contracts = [search('ct-open', 'v77', false), search('ct-met', 'v78', true)];
    w.events = [];

    const slots = new SaveSlots(memoryBackend(), new Map());
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');

    expect(loaded.player.contracts).toEqual(w.player.contracts);
    expect(loaded.vehicles.find((v) => v.id === witness.id)!.brain!.memories).toEqual(witness.brain!.memories);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
