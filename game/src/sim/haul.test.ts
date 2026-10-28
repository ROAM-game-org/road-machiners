import { describe, expect, it } from 'vitest';
import { cargoHaul, haulVar, showsHaul, strippable } from './haul';
import { CRATE_MASS } from '../data/goods';
import { budget } from '../test/budget';
import HOLD_UP from './haul-fixtures/hold-up-bus.json';
import HOLD_UP_HAUL from './haul-fixtures/hold-up-bus-haul.json';
import { addGoods, cargoMassRoom, cargoRoom, stowPart, stowPlace } from './inventory';
import { looseCargo } from './salvage';
import { partSellPrice } from './economy';
import { GOODS } from '../data/goods';
import { findSpot, freeCells, goodsCount, gridOf } from './grid';
import { collectSalvage, dropHaul } from './salvage';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { GridItem, Vehicle, World } from './types';

function robber(w: World, parts = ['mg', 'stockEngine']): Vehicle {
  const v = addVehicle(w, 'scrapjaw', 'scout', parts, { x: 10, y: 10 });
  v.brain = npcBrain('buggy', v.pos, ['scumbag']);
  return v;
}

function victim(w: World, goods: Record<string, number>, spares: string[] = []): Vehicle {
  const v = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 14, y: 10 });
  for (const [good, n] of Object.entries(goods)) addGoods(w, v, good, n);
  for (const defId of spares) stowPart(w, v, { id: `${defId}-spare`, defId, hp: 10, wear: 0 } as never);
  return v;
}

const count = (items: { kind: string }[]) => items.length;

describe('the haul', () => {
  it('is empty for a winner with no room and a loser with no cargo', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const r = robber(w);
    const empty = victim(w, {});
    expect(cargoHaul(r, empty)).toEqual([]);
  });

  it('is limited by the winner mass room, taking the most valuable goods first', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const r = robber(w);
    const v = victim(w, { scrap: 2, electronics: 3 });
    const haul = cargoHaul(r, v);
    const room = cargoMassRoom(r);
    const mass = haul.reduce((sum, item) => sum + (item.kind === 'good' ? { scrap: 100, electronics: 15 }[item.good]! : 0), 0);
    expect(mass).toBeLessThanOrEqual(room);
    expect(count(haul)).toBeLessThanOrEqual(5);
  });

  it('leaves what does not fit with the loser, and nothing when the winner is full', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const r = robber(w);
    const v = victim(w, { scrap: 3, tools: 2 });
    while (cargoRoom(r) > 1) addGoods(w, r, 'scrap', 1);
    const haul = cargoHaul(r, v);
    const kinds = haul.map((item) => (item.kind === 'good' ? item.good : 'part'));
    expect(kinds).toHaveLength(1);
    expect(CRATE_MASS).toBeLessThanOrEqual(cargoMassRoom(r));
    expect(v.items.filter((item) => item.kind === 'good')).toHaveLength(5);
    addGoods(w, r, 'scrap', 1);
    expect(cargoHaul(r, v)).toEqual([]);
  });

  it('draws no random numbers and changes no world state', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const r = robber(w);
    const v = victim(w, { scrap: 2, electronics: 3 });
    const rng = w.rngState;
    const items = structuredClone([r.items, v.items]);
    cargoHaul(r, v);
    strippable(r, v);
    expect(w.rngState).toBe(rng);
    expect([r.items, v.items]).toEqual(items);
  });

  it('is the whole cargo for a player winner without mass limits', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const v = victim(w, { scrap: 2, electronics: 3 });
    const me = w.vehicles[0];
    expect(count(cargoHaul(me, v))).toBe(count(v.items.filter((i) => i.kind === 'good')));
  });

  it('is collected whole from a pile that holds exactly it', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const r = robber(w);
    r.pos = { x: 14, y: 10 };
    const v = victim(w, { scrap: 4, electronics: 6 });
    const haul = cargoHaul(r, v);
    const before = { ...goodsCount(r) };
    const pile = dropHaul(w, v, haul);
    collectSalvage(w, r, pile.id, Infinity);
    expect(Object.values(pile.goods).reduce((a, b) => a + b, 0) + pile.parts.length).toBe(0);
    const after = goodsCount(r);
    for (const item of haul) if (item.kind === 'good') before[item.good] = (before[item.good] ?? 0) + 1;
    expect(after).toEqual(before);
  });

  it('names its goods and parts for the radio and matches only itself', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const r = robber(w);
    const v = victim(w, { electronics: 2 });
    const haul = cargoHaul(r, v);
    expect(showsHaul(haulVar(haul), haul)).toBe(true);
    expect(showsHaul(haulVar(haul), haul.slice(1))).toBe(false);
    expect(showsHaul(undefined, haul)).toBe(false);
  });

  it('is strippable when the victim carries a part the robber has room for', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const r = robber(w);
    const v = addVehicle(w, 'independent', 'wagon', ['mg', 'stockEngine', 'heavyMg', 'mg'], { x: 14, y: 10 });
    expect(strippable(r, v)).toBe(true);
  });
});


function oracleHaul(winner: Vehicle, loser: Vehicle) {
  const value = (item: GridItem) => (item.kind === 'part' ? partSellPrice(item.part) : GOODS[(item as Extract<GridItem, { kind: 'good' }>).good].value);
  const sorted = looseCargo(loser).map((item, i) => ({ item, i })).sort((a, b) => value(b.item) - value(a.item) || a.i - b.i).map((e) => e.item);
  const order = (items: GridItem[]) => {
    const parts = items.filter((item) => item.kind === 'part');
    const goods = items.filter((item): item is Extract<GridItem, { kind: 'good' }> => item.kind === 'good');
    const kinds = [...new Set(goods.map((item) => item.good))];
    return [...parts, ...kinds.flatMap((kind) => goods.filter((item) => item.good === kind))];
  };
  const fits = (items: GridItem[]) => {
    const probe: Vehicle = { ...winner, items: [...winner.items] };
    for (const item of order(items)) {
      if (item.kind !== 'part' && cargoRoom(probe) < 1) return false;
      const spot = item.kind === 'part' ? stowPlace(probe, item) : findSpot(gridOf(probe), probe.items, item, null, null);
      if (!spot) return false;
      probe.items.push({ ...item, ...spot });
    }
    return true;
  };
  const picked: GridItem[] = [];
  const cells = freeCells(winner);
  for (const item of sorted) {
    if (picked.length >= cells) break;
    if (fits([...picked, item])) picked.push(item);
  }
  return order(picked);
}

describe('the haul search keeps its placements', () => {
  it('hauls the report pair as the old search did, quickly', () => {
    const haul = cargoHaul(HOLD_UP.robber as unknown as Vehicle, HOLD_UP.bus as unknown as Vehicle);
    expect(haul.length).toBeGreaterThan(0);
    expect(haul.map((item) => item.id)).toEqual(HOLD_UP_HAUL);
    expect(haul.map((item) => item.id)).toEqual(oracleHaul(HOLD_UP.robber as unknown as Vehicle, HOLD_UP.bus as unknown as Vehicle).map((item) => item.id));
  }, budget(5000));

  it('leaves the winner untouched', () => {
    const robberVehicle = HOLD_UP.robber as unknown as Vehicle;
    const before = JSON.stringify(robberVehicle.items);
    cargoHaul(robberVehicle, HOLD_UP.bus as unknown as Vehicle);
    expect(JSON.stringify(robberVehicle.items)).toBe(before);
  });

  it('matches the from-scratch search on mixed piles', () => {
    const cases: [string[], Record<string, number>, string[]][] = [
      [['mg', 'stockEngine'], { scrap: 3, electronics: 5, fuel: 4 }, ['mg', 'stockEngine']],
      [['stockEngine'], { electronics: 30, scrap: 2 }, []],
      [['mg', 'stockEngine'], { scrap: 40 }, ['stockEngine', 'mg']],
      [['stockEngine'], {}, ['mg', 'stockEngine']],
    ];
    for (const [robberParts, goods, spares] of cases) {
      const w = emptyWorld({ x: 200, y: 200 });
      const r = robber(w, robberParts);
      const v = victim(w, Object.fromEntries(Object.entries(goods).filter(([g]) => g in GOODS)), spares);
      expect(cargoHaul(r, v).map((item) => item.id)).toEqual(oracleHaul(r, v).map((item) => item.id));
    }
  });

  it('matches the from-scratch search on the report pair with the winner nearly full', () => {
    const r = HOLD_UP.robber as unknown as Vehicle;
    const bus = HOLD_UP.bus as unknown as Vehicle;
    const crowded = { ...r, items: [...r.items] };
    for (let i = 0; i < 20; i++) {
      const crate = bus.items.find((item) => item.kind === 'good' && !crowded.items.some((o) => o.id === `${item.id}-x${i}`));
      const spot = crate && findSpot(gridOf(crowded), crowded.items, crate, null, null);
      if (crate && spot) crowded.items.push({ ...crate, id: `${crate.id}-x${i}`, ...spot });
    }
    const small = { ...bus, items: bus.items.slice(0, 30) };
    expect(cargoHaul(crowded, small).map((item) => item.id)).toEqual(oracleHaul(crowded, small).map((item) => item.id));
  });
});
