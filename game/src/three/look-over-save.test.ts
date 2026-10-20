import { describe, expect, it } from 'vitest';
import { playerVehicle } from '../sim/damage';
import { addGoods } from '../sim/inventory';
import { lookOver } from '../sim/look-over';
import { addVehicle, emptyWorld } from '../sim/testkit';
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

describe('look-overs and basics in saves', () => {
  it('gives back a running look-over with no award', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.ranks.perception = 1;
    const target = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 35, y: 30 });
    addGoods(w, target, 'meds', 2);
    const looking = lookOver(w, target.id);

    const loaded = reload(looking);

    expect(loaded.states).toEqual(looking.states);
    expect(loaded.player.xp).toBe(looking.player.xp);
    expect(loaded.player.money).toBe(looking.player.money);
    expect(loaded.events).toEqual([]);
  });

  it('keeps a saved overdrive at Driving 0 as it was, for the next turn to cut', () => {
    const w = emptyWorld();
    w.player.overdrive = true;

    const loaded = reload(w);

    expect(loaded.player.overdrive).toBe(true);
    expect(loaded.player.ranks).toEqual(w.player.ranks);
    expect(playerVehicle(loaded).speed).toBe(playerVehicle(w).speed);
  });
});
