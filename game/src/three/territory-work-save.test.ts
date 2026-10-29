import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { addGoods } from '../sim/inventory';
import { planNpcOrders } from '../sim/ai';
import { topGoal } from '../sim/npc-activities';
import { addVehicle, emptyWorld, forceOption, npcBrain } from '../sim/testkit';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

describe('spot work and saves', () => {
  it('loads a driver on its way to the next Orchard spot with the same goal and no award', () => {
    const orchard = REGION.locations.find((l) => l.id === 'orchard')!;
    const w = emptyWorld({ x: 50, y: 50 });
    const npc = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { ...orchard.pos });
    npc.brain = npcBrain('scavenger', npc.pos, ['scavenger']);
    addGoods(w, npc, 'scrap', 1);
    forceOption('spotWork', 'work');
    planNpcOrders(w);
    expect(topGoal(npc)?.reason).toBe('searchSpot');

    const slots = new SaveSlots(memoryBackend(), new Map());
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');

    const again = loaded.vehicles.find((v) => v.id === npc.id)!;
    expect(again.brain!.goals).toEqual(npc.brain.goals);
    expect(again.brain!.memories).toEqual(npc.brain.memories);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.events).toEqual([]);
  });
});
