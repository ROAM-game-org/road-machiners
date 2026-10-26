import { describe, expect, it } from 'vitest';
import { TEST_MAP } from '../test/map';
import { NPCS } from '../data/npcs';
import { playerVehicle } from '../sim/damage';
import { generateNpcLoadout } from '../sim/npc-loadout';
import { spawnAt } from '../sim/spawn';
import { duskTurn, sunwardFacts, vigilGrounds } from '../sim/sunward';
import { giveWord, offeringOf } from '../sim/sunward-crater';
import { standardWorld } from '../test/world-cache';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

describe('a word given at the Fallen Sun across a save', () => {
  it('loads back as the same word and awards nothing', () => {
    const w = standardWorld(5);
    w.vehicles = [playerVehicle(w)];
    w.turn = duskTurn(1) + 80;
    sunwardFacts(w).night = { dusk: duskTurn(1), roster: [], beaten: [], calls: {}, hunt: null, shouted: [], offered: [] };
    const me = playerVehicle(w);
    me.pos = { ...vigilGrounds()[0] };
    const caller = spawnAt(w, NPCS.trader, generateNpcLoadout(w, NPCS.trader), { x: me.pos.x + 8, y: me.pos.y }, 'independent');
    giveWord(w, me, caller);
    w.events = [];

    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(offeringOf(loaded, me.id)).toEqual(offeringOf(w, me.id));
    expect(loaded.events).toEqual([]);
    expect(loaded.player.money).toBe(w.player.money);
  });
});
