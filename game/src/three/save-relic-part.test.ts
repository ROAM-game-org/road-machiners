import { describe, expect, it } from 'vitest';
import { partWithId } from '../sim/factory';
import { spareParts, stowPart } from '../sim/inventory';
import { emptyWorld } from '../sim/testkit';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

describe('a relic on the truck across a save', () => {
  it('loads the carried relic as the same part, awarding nothing', () => {
    const w = emptyWorld();
    const relic = partWithId('relic-test-wreck', 'relicStatue', 0);
    expect(stowPart(w, w.vehicles[0], relic)).toBe(true);
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...JSON.parse(JSON.stringify(saveOf(w))), savedAt: 1000, runId: 'run-1' });

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(spareParts(loaded.vehicles[0])).toEqual([relic]);
    expect(loaded.vehicles[0].items).toEqual(w.vehicles[0].items);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.events).toEqual([]);
  });
});
