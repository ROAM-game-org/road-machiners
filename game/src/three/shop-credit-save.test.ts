import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { buyGood } from '../sim/economy';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import FORMAT_2_124 from './save-fixtures/format-2-124.json';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

function onAccount(): World {
  const w = emptyWorld(sitePads(bowl)[0]);
  w.player.perks = ['shopCredit'];
  w.player.money = 0;
  return buyGood(w, 'scrap', 2);
}

describe('a shop account across a save', () => {
  it('loads with the same account and goods, and the load awards nothing', () => {
    const w = onAccount();

    const loaded = reload(w);

    expect(w.player.account).not.toBeNull();
    expect(loaded.player.account).toEqual(w.player.account);
    expect(loaded.vehicles[0].items).toEqual(w.vehicles[0].items);
    expect({ money: loaded.player.money, xp: loaded.player.xp, crimes: loaded.crimes, events: loaded.events }).toEqual({ money: w.player.money, xp: w.player.xp, crimes: w.crimes, events: [] });
  });
});

describe('a shop account at a shop the game no longer has', () => {
  it('is dropped on load and the goods stay aboard', () => {
    const w = onAccount();
    w.player.account = { ...w.player.account!, shop: 'gone-market' };

    const loaded = reload(w);

    expect(loaded.player.account).toBeNull();
    expect(loaded.vehicles[0].items).toEqual(w.vehicles[0].items);
  });
});

describe('save migration 135 to 136, the player may hold a shop account', () => {
  it('sits after the road watch step and opens no account', () => {
    const step = TINY_STEPS.find((s) => s.name === 'withShopAccount')!;
    expect(TINY_STEPS[135 - TINY_FROM]).toBe(step);
    const old = structuredClone(FORMAT_2_124) as SavedJson;

    const migrated = step.step(structuredClone(old));

    expect(migrated.player).toEqual({ ...(old.player as SavedJson), account: null });
    expect({ ...migrated, player: old.player }).toEqual(old);
  });
});
