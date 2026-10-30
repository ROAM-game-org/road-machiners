import { describe, expect, it } from 'vitest';
import { TEST_MAP } from '../test/map';
import { stockForSale, siteOf, type Contract } from '../sim/market';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

const order: Contract = { id: 'ct-procure', shop: 'bowl', kind: 'procure', good: 'salt', units: 5, cratePay: 9, reward: 90, deadline: 800, window: 700, tier: 1 };

describe('supply orders across a save', () => {
  it('loads a held order and its withheld good the same, and awards nothing', () => {
    const w = emptyWorld(sitePads(siteOf('bowl'))[0]);
    w.player.contracts = [{ ...order }];
    w.shops.nose.contracts = [{ ...order, id: 'ct-board', shop: 'nose', good: 'water' }];
    const loaded = reload(w);
    expect(loaded.player.contracts).toEqual(w.player.contracts);
    expect(loaded.shops.nose.contracts).toEqual(w.shops.nose.contracts);
    expect(stockForSale(loaded, 'bowl', 'salt')).toBe(0);
    expect(stockForSale(loaded, 'nose', 'water')).toBe(0);
    expect(loaded.shops.bowl.goods).toEqual(w.shops.bowl.goods);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
