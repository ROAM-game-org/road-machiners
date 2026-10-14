import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { stowParcel } from '../sim/inventory';
import { remember } from '../sim/memory';
import { addState } from '../sim/states';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { Contract } from '../sim/market';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function search(id: string, target: string, delivered: boolean): Contract {
  return {
    id, shop: 'bowl', kind: 'search', target, driver: 'Jed Cobb', template: 'trader',
    lead: { at: { x: 40, y: 52 }, turn: 20 }, reward: 9200, deadline: 900, window: 600, tier: 1, delivered,
  };
}

describe('a search in a save', () => {
  it('loads back with its lead, its parcel, its delivered flag, the handover and the sightings, and raises no events or pay', () => {
    const w: World = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    const witness = addVehicle(w, 'traders', 'scout', [], { x: 60, y: 60 });
    witness.brain = npcBrain('trader', witness.pos, ['trader']);
    w.turn = 30;
    remember(w, witness, { kind: 'sighting', vehicle: 'v77', at: { x: 41, y: 50 }, heading: 1.25 });
    const target = addVehicle(w, 'traders', 'scout', [], { x: 64, y: 60 });
    target.brain = npcBrain('trader', target.pos, ['trader']);
    w.player.contracts = [search('ct-open', target.id, false), search('ct-met', 'v78', true)];
    if (!stowParcel(playerVehicle(w), { id: 'i-parcel', x: 0, y: 0, rot: 0, kind: 'parcel', contract: 'ct-open' })) throw new Error('No room for the parcel');
    addState(w, 'handover', target.id, w.player.vehicleId, { kind: 'none' });
    w.events = [];

    const slots = new SaveSlots(memoryBackend(), new Map());
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');

    expect(loaded.player.contracts).toEqual(w.player.contracts);
    expect(playerVehicle(loaded).items).toEqual(playerVehicle(w).items);
    expect(loaded.states).toEqual(w.states);
    expect(loaded.vehicles.find((v) => v.id === witness.id)!.brain!.memories).toEqual(witness.brain!.memories);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
