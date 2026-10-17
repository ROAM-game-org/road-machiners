import { describe, expect, it } from 'vitest';
import { FISHING } from '../data/fishing';
import { EFFORT } from '../data/market';
import { ECONOMY } from '../data/goods';
import { TIME } from '../data/time';
import { TEST_MAP } from '../test/map';
import { beginFishing, fishActions, fishLeft, fishLineAnchor, poolIndexOf, poolNear, pruneFishTaken, restockFish, startFishing, takeFish } from './fishing';
import { advanceJobs } from './jobs';
import { suppliesCap } from './stats';
import { editableTerrain, emptyWorld, practiceOf } from './testkit';
import type { World } from './types';
import { setMoveOrder } from './world';

function poolWorld(): World {
  const w = emptyWorld({ x: 30.5, y: 30.5 });
  const terrain = editableTerrain(w);
  for (let y = 40; y < 44; y++) for (let x = 40; x < 44; x++) terrain.types[y * terrain.size + x] = 'dirtyWater';
  for (let y = 50; y < 54; y++) for (let x = 40; x < 44; x++) terrain.types[y * terrain.size + x] = 'toxic';
  w.vehicles[0].speed = 0;
  w.player.supplies = 0;
  return w;
}

function park(w: World, x: number, y: number): void {
  w.vehicles[0].pos = { x, y };
  w.vehicles[0].speed = 0;
}

function fishSession(w: World): void {
  const pool = poolNear(w, w.vehicles[0].pos)!;
  beginFishing(w, w.vehicles[0], pool.id);
  for (let i = 0; i < FISHING.sessionTurns && w.vehicles[0].job; i++) {
    w.turn++;
    advanceJobs(w);
  }
}

describe('pool index', () => {
  it('finds the baked dirty-water pools and none on toxic ground', () => {
    const index = poolIndexOf(TEST_MAP.terrain);
    expect(index.pools).toHaveLength(92);
    for (const pool of index.pools) for (const tile of pool.tiles) expect(TEST_MAP.terrain.types[tile]).toBe('dirtyWater');
  });

  it('keeps one index per terrain', () => {
    expect(poolIndexOf(TEST_MAP.terrain)).toBe(poolIndexOf(TEST_MAP.terrain));
  });

  it('names a pool by its lowest tile and sizes its stock by its tiles', () => {
    const w = poolWorld();
    const pool = poolIndexOf(w.terrain).pools[0];
    expect(pool.id).toBe(`pool-${40 * w.terrain.size + 40}`);
    expect(pool.capacity).toBe(8);
  });
});

describe('fishing reach', () => {
  it('holds on the bank and in the pool', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    expect(fishActions(w)).toHaveLength(1);
    park(w, 41.5, 41.5);
    expect(fishActions(w)).toHaveLength(1);
  });

  it('fails three tiles out and beside toxic or dry ground', () => {
    const w = poolWorld();
    park(w, 36.5, 41.5);
    expect(fishActions(w)).toEqual([]);
    park(w, 41.5, 49.0);
    expect(fishActions(w)).toEqual([]);
    park(w, 41.5, 52.5);
    expect(fishActions(w)).toEqual([]);
  });

  it('is never ready while moving', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    w.vehicles[0].speed = 1;
    expect(fishActions(w)[0].ready).toBe(false);
  });

  it('offers nothing on a map without pools', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    expect(fishActions(w)).toEqual([]);
  });
});

describe('bite chance', () => {
  it('comes from half the tier 1 wage', () => {
    const perFish = FISHING.fishSupplies * ECONOMY.supplyPrice.supplies;
    expect(FISHING.biteChance * perFish).toBeCloseTo(FISHING.wageShare * EFFORT.wage[1]);
    expect(FISHING.biteChance).toBeCloseTo(0.148, 2);
    expect(FISHING.biteChance * perFish).toBeLessThan(EFFORT.wage[1]);
  });
});

describe('a fishing session', () => {
  it('lowers the pool, adds supplies and teaches toughness', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    w.player.supplies = 0;
    w.seed = 1;
    let total = 0;
    for (let session = 0; session < 40; session++) {
      w.player.supplies = 0;
      fishSession(w);
      total = Object.values(w.fishTaken)[0] ?? 0;
      if (total >= 3) break;
    }
    const pool = poolNear(w, w.vehicles[0].pos)!;
    expect(total).toBeGreaterThan(0);
    expect(fishLeft(w, pool)).toBe(pool.capacity - total);
    expect(w.player.supplies).toBeGreaterThan(0);
    expect(w.player.supplies).toBeLessThanOrEqual(suppliesCap(w.vehicles[0]));
    expect(practiceOf(w, 'fish').length).toBeGreaterThan(0);
    expect(w.events.some((e) => e.t === 'fished')).toBe(true);
  });

  it('catches nothing from an empty pool and ends with no fish', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    const pool = poolNear(w, w.vehicles[0].pos)!;
    w.fishTaken[pool.id] = pool.capacity;
    w.player.supplies = 0;
    fishSession(w);
    expect(w.player.supplies).toBe(0);
    expect(w.fishTaken[pool.id]).toBe(pool.capacity);
    expect(w.events.filter((e) => e.t === 'fished')).toEqual([{ t: 'fished', vehicle: w.vehicles[0].id, pool: pool.id, fish: 0 }]);
    expect(w.vehicles[0].job).toBeNull();
  });

  it('refuses to take a fish from an empty pool', () => {
    const w = poolWorld();
    const pool = poolIndexOf(w.terrain).pools[0];
    w.fishTaken[pool.id] = pool.capacity;
    expect(() => takeFish(w, pool)).toThrow(/no fish/);
  });

  it('never fills supplies past the cap and refuses to start when full', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    const cap = suppliesCap(w.vehicles[0]);
    w.player.supplies = cap;
    expect(fishActions(w)[0].full).toBe(true);
    expect(() => startFishing(w, fishActions(w)[0].pool)).toThrow(/no room/);
    w.player.supplies = cap - 0.1;
    w.seed = 7;
    fishSession(w);
    expect(w.player.supplies).toBeLessThanOrEqual(cap);
  });

  it('is cancelled by moving', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    const next = startFishing(w, fishActions(w)[0].pool);
    expect(next.vehicles[0].job?.kind).toBe('fish');
    const moving = setMoveOrder(next, { kind: 'drive', dest: { x: 20, y: 20 }, speed: 1, heading: 0 } as never);
    moving.vehicles[0].speed = 1;
    advanceJobs(moving);
    expect(moving.vehicles[0].job).toBeNull();
  });

  it('gives the same catches for the same seed', () => {
    const run = (): number[] => {
      const w = poolWorld();
      park(w, 38.5, 41.5);
      w.seed = 99;
      const caught: number[] = [];
      for (let i = 0; i < 6; i++) {
        w.player.supplies = 0;
        fishSession(w);
        caught.push(w.fishTaken[poolNear(w, w.vehicles[0].pos)!.id] ?? 0);
      }
      return caught;
    };
    expect(run()).toEqual(run());
  });

  it('draws no random number from the world streams', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    const before = { rngState: w.rngState, marketRng: w.marketRng, nameRng: w.nameRng, searchRng: w.searchRng };
    fishSession(w);
    expect({ rngState: w.rngState, marketRng: w.marketRng, nameRng: w.nameRng, searchRng: w.searchRng }).toEqual(before);
  });

  it('pays less xp for a repeat at the same pool', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    w.seed = 3;
    for (let i = 0; i < 30; i++) {
      w.player.supplies = 0;
      fishSession(w);
    }
    const xp = practiceOf(w, 'fish').map((e) => e.xp);
    expect(xp.length).toBeGreaterThan(1);
    expect(xp[xp.length - 1]).toBeLessThan(xp[0]);
  });
});

describe('the line anchor', () => {
  it('is the nearest water tile of the pool while fishing', () => {
    const w = poolWorld();
    park(w, 38.5, 41.5);
    expect(fishLineAnchor(w, w.vehicles[0])).toBeNull();
    beginFishing(w, w.vehicles[0], fishActions(w)[0].pool);
    expect(fishLineAnchor(w, w.vehicles[0])).toEqual({ x: 40.5, y: 41.5 });
  });
});

describe('restock and pruning', () => {
  it('returns a share of the stock each day and deletes an entry that reaches zero', () => {
    const w = poolWorld();
    const pool = poolIndexOf(w.terrain).pools[0];
    w.fishTaken[pool.id] = pool.capacity;
    w.turn = TIME.turnsPerDay;
    restockFish(w);
    expect(w.fishTaken[pool.id]).toBe(pool.capacity - Math.ceil(pool.capacity * FISHING.restockShare));
    for (let i = 0; i < 10; i++) restockFish(w);
    expect(w.fishTaken[pool.id]).toBeUndefined();
  });

  it('does nothing off a day boundary', () => {
    const w = poolWorld();
    const pool = poolIndexOf(w.terrain).pools[0];
    w.fishTaken[pool.id] = 3;
    w.turn = 5;
    restockFish(w);
    expect(w.fishTaken[pool.id]).toBe(3);
  });

  it('drops a pool id the map lacks', () => {
    const w = poolWorld();
    w.fishTaken['pool-1'] = 2;
    pruneFishTaken(w);
    expect(w.fishTaken).toEqual({});
  });
});
