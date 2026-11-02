import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { getTradePrice } from '../sim/economy';
import { defaultSetup } from '../sim/settings';
import { comparableWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function freshWorld(): World {
  return structuredClone(reusedWorld('standard', () => newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'))));
}

function reload(world: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', world, 'run-1', 1000);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('Nothing loaded');
  return loaded;
}

describe('a saved world with ship relics', () => {
  it('keeps a relic in a stock and awards nothing on load', () => {
    const w = freshWorld();
    const stock = w.salvage[0];
    stock.hidden.goods.relics = 1;

    const loaded = reload(w);

    expect(comparableWorld(loaded)).toEqual(comparableWorld(w));
    expect(loaded.salvage.find((s) => s.id === stock.id)!.hidden.goods.relics).toBe(1);
    expect(loaded.events).toEqual([]);
  });

  it('pays for relics at Nose and the Yard after a reload', () => {
    const loaded = reload(freshWorld());

    for (const shop of ['nose', 'salvage-yard']) expect(getTradePrice(loaded, playerVehicle(loaded), shop, 'relics', 'sell')).toBeGreaterThan(0);
  });
});
