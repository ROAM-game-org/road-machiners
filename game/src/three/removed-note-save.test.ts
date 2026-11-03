import { describe, expect, it } from 'vitest';
import { TEST_MAP } from '../test/map';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('a journal note whose id was removed', () => {
  it('drops the roadhouseRaiders note on load, keeps the others and awards nothing', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const note = (id: string) => ({ id, turn: 1 }) as unknown as World['player']['notes'][number];
    w.player.notes = [note('roadhouseBook'), note('roadhouseRaiders')];
    const loaded = reload(w);
    expect(loaded.player.notes.map((n) => n.id)).toEqual(['roadhouseBook']);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.events).toEqual(w.events);
  });
});
