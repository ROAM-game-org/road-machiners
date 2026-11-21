import { describe, expect, it } from 'vitest';
import { emptyWorld } from '../sim/testkit';
import { setAutoRepair } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import type { World } from '../sim/types';

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

describe('auto patch in saves', () => {
  it.each([true, false])('gives back auto patch %s as it was set, with no award', (on) => {
    const start = emptyWorld();
    start.player.autoRepair = !on;
    const set = setAutoRepair(start, on);

    const loaded = reload(set);

    expect(loaded.player.autoRepair).toBe(on);
    expect(loaded.player.xp).toBe(set.player.xp);
    expect(loaded.player.money).toBe(set.player.money);
    expect(loaded.events).toEqual([]);
  });
});
