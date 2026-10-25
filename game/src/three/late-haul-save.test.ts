import { describe, expect, it } from 'vitest';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from '../sim/damage';
import { addGoods } from '../sim/inventory';
import { advanceContracts, isLate, lateBy, siteOf, type Contract } from '../sim/market';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { update } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

const haul: Contract = { id: 'ct-haul', shop: 'granary', kind: 'haul', good: 'salt', units: 3, to: 'nose', reward: 10000, deadline: 500, window: 400, rush: false, tier: 1 };

function held(): World {
  const w = emptyWorld(sitePads(siteOf('granary'))[0]);
  w.turn = 300;
  w.player.contracts = [{ ...haul }];
  addGoods(w, playerVehicle(w), 'salt', 3);
  return w;
}

describe('late hauls across a save', () => {
  it('loads a late haul as late and awards nothing', () => {
    const late = update(held(), (d) => { d.turn = 700; advanceContracts(d); });
    const loaded = reload(late);

    expect(loaded.player.contracts).toEqual(late.player.contracts);
    expect(isLate(loaded, loaded.player.contracts[0])).toBe(true);
    expect(loaded.player.money).toBe(late.player.money);
    expect(loaded.player.xp).toBe(late.player.xp);
    expect(loaded.events).toEqual([]);
  });

  it('loads an open embezzlement case with a shop issuer the same and awards nothing', () => {
    const filed = update(held(), (d) => { d.turn = lateBy(haul as Extract<Contract, { kind: 'haul' }>) + 1; advanceContracts(d); });
    expect(filed.crimes[0].issuer).toEqual({ kind: 'shop', shop: 'granary' });
    const loaded = reload(filed);

    expect(loaded.crimes).toEqual(filed.crimes);
    expect(loaded.player.money).toBe(filed.player.money);
    expect(loaded.player.xp).toBe(filed.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
