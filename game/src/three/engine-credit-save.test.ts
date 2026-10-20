import { describe, expect, it } from 'vitest';
import { partDef } from '../data/parts';
import { REGION } from '../data/region';
import { playerVehicle } from '../sim/damage';
import { mountedParts } from '../sim/grid';
import { scrapPatch } from '../sim/economy';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

describe('engine on credit and saves', () => {
  it('saves and loads after the credit fit with the same world and no award', () => {
    const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
    const w = emptyWorld(sitePads(bowl)[0]);
    const me = playerVehicle(w);
    me.items = me.items.filter((it) => it.kind === 'part' && partDef(it.part.defId).kind === 'core');
    w.player.money = 0;
    scrapPatch(w);
    expect(w.player.money).toBeLessThan(0);

    const slots = new SaveSlots(memoryBackend(), new Map());
    writeSave(slots, 'auto', w, 'run', 1);
    const loaded = loadWorld(slots, 'auto', TEST_MAP);
    if (!loaded) throw new Error('The save did not load');

    expect(loaded.player.money).toBe(w.player.money);
    expect(mountedParts(playerVehicle(loaded), 'engine')).toHaveLength(1);
    expect(loaded.events).toEqual([]);
    expect(loaded.shops.bowl.stock).toEqual(w.shops.bowl.stock);
  });
});
