import { describe, expect, it } from 'vitest';
import { playerVehicle } from '../sim/damage';
import { beginFishing, poolIndexOf } from '../sim/fishing';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function fishingWorld(): World {
  const pool = poolIndexOf(TEST_MAP.terrain).pools[0];
  const size = TEST_MAP.terrain.size;
  const w = emptyWorld({ x: (pool.tiles[0] % size) + 0.5, y: Math.floor(pool.tiles[0] / size) + 0.5 });
  w.terrain = TEST_MAP.terrain;
  w.mapHash = TEST_MAP.hash;
  w.size = size;
  const me = playerVehicle(w);
  me.speed = 0;
  w.player.supplies = 0;
  w.fishTaken[pool.id] = 1;
  beginFishing(w, me, pool.id);
  return w;
}

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

describe('saving a fishing world', () => {
  it('gives back the same fish taken and job and awards nothing', () => {
    const w = fishingWorld();
    w.events = [];
    const loaded = roundTrip(w);
    expect(loaded.fishTaken).toEqual(w.fishTaken);
    expect(playerVehicle(loaded).job).toEqual(playerVehicle(w).job);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.supplies).toBe(w.player.supplies);
    expect(loaded.player.xpBySource).toEqual(w.player.xpBySource);
    expect(loaded.events).toEqual([]);
  });

  it('drops a pool the map does not hold', () => {
    const w = fishingWorld();
    w.fishTaken['pool-1'] = 2;
    const loaded = roundTrip(w);
    expect(Object.keys(loaded.fishTaken)).toEqual(Object.keys(w.fishTaken).filter((id) => id !== 'pool-1'));
  });
});
