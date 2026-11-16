import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from './damage';
import { claimReward, claimSpots, claimTargets } from './claims';
import { sellVehicleCargo, takeSellablePart } from './economy';
import { partWithId } from './factory';
import { spareParts, stowPart, tradedSpares } from './inventory';
import { shopState, siteOf } from './market';
import { placeRelics, relicDefFor, relicIdOf } from './relics';
import { canTakeAny, claimOnly, collectSalvage } from './salvage';
import { defaultSetup } from './settings';
import { sitePads } from './sites';
import { addVehicle, emptyWorld } from './testkit';
import type { PartInstance, SalvageStock, World } from './types';
import { cloneWorld, newWorld } from './world';
import { isRelic, partValue } from './wear';
import { fairM } from './money';

let real: World;

beforeAll(() => {
  real = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
});

function relicsIn(stock: SalvageStock): PartInstance[] {
  return [...stock.parts, ...stock.hidden.parts].filter(isRelic);
}

function allRelicsIn(world: World): PartInstance[] {
  return world.salvage.flatMap(relicsIn);
}

function takeRelic(world: World, stock: SalvageStock): PartInstance {
  const relic = relicsIn(stock)[0];
  stock.parts = stock.parts.filter((p) => p !== relic);
  stock.hidden.parts = stock.hidden.parts.filter((p) => p !== relic);
  return relic;
}

describe('relics in claim wrecks', () => {
  it('lays one relic chosen by the seed in every claim wreck from the start', () => {
    const spots = claimSpots(real);
    expect(spots.length).toBeGreaterThan(0);
    for (const stock of spots) {
      expect(relicsIn(stock).map((p) => [p.id, p.defId, p.wear])).toEqual([[relicIdOf(stock.id), relicDefFor(real.seed, stock.id), 0]]);
    }
    expect(allRelicsIn(real)).toHaveLength(spots.length);
  });

  it('picks the same relic for the same seed and spot, and all three kinds across spots', () => {
    const spots = claimSpots(real).map((stock) => stock.id);
    expect(spots.map((id) => relicDefFor(real.seed, id))).toEqual(spots.map((id) => relicDefFor(real.seed, id)));
    const kinds = new Set(spots.flatMap((id) => [1, 2, 3, 4, 5].map((seed) => relicDefFor(seed, id))));
    expect([...kinds].sort()).toEqual(['relicComputer', 'relicShipModule', 'relicStatue']);
  });

  it('lays no second relic while the first is in the wreck or on a truck', () => {
    const w = cloneWorld(real);
    const stock = claimSpots(w)[0];
    placeRelics(w);
    expect(allRelicsIn(w)).toHaveLength(claimSpots(w).length);
    const relic = takeRelic(w, stock);
    expect(stowPart(w, playerVehicle(w), relic)).toBe(true);
    placeRelics(w);
    expect(relicsIn(stock)).toEqual([]);
  });

  it('lays the relic again once it has left the world', () => {
    const w = cloneWorld(real);
    const stock = claimSpots(w)[0];
    const relic = takeRelic(w, stock);
    placeRelics(w);
    expect(stock.hidden.parts.filter(isRelic)).toEqual([relic]);
  });

  it('names only relics in claims, paid as travel share plus the relic sum', () => {
    const targets = Object.keys(real.shops).flatMap((shopId) => claimTargets(real, shopId));
    expect(targets.length).toBeGreaterThan(0);
    for (const { part } of targets) expect(isRelic(part)).toBe(true);
    const relic = targets[0].part;
    expect(claimReward(relic, 100)).toBe(fairM(partValue(relic) + 50));
  });
});

function relicWreck(): { w: World; stock: SalvageStock; relic: PartInstance } {
  const stock = structuredClone(claimSpots(real)[0]);
  const w = emptyWorld(sitePads(siteOf('bowl'))[0]);
  const relic = partWithId(relicIdOf(stock.id), 'relicComputer', 0);
  Object.assign(stock, { goods: {}, parts: [relic], fuel: 0, supplies: 0, hidden: { goods: {}, parts: [], fuel: 0, supplies: 0 } });
  w.salvage = [stock];
  return { w, stock, relic };
}

describe('who takes a relic', () => {
  it('leaves a relic in the wreck for a trader with no claim on it', () => {
    const { w, stock, relic } = relicWreck();
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: stock.pos.x + 1, y: stock.pos.y });
    expect(canTakeAny(w, npc, stock)).toBe(false);
    expect(claimOnly(w, npc, stock)).toBe(true);
    expect(collectSalvage(w, npc, stock.id, Infinity)).toBe(0);
    expect(stock.parts).toEqual([relic]);
  });

  it('lets the player pick the relic up', () => {
    const { w, stock, relic } = relicWreck();
    const me = playerVehicle(w);
    me.pos = { x: stock.pos.x + 1, y: stock.pos.y };
    expect(canTakeAny(w, me, stock)).toBe(true);
    expect(collectSalvage(w, me, stock.id, Infinity)).toBe(1);
    expect(spareParts(me)).toContainEqual(relic);
  });
});

describe('relics never trade', () => {
  it('keeps a relic out of every sale', () => {
    const { w, relic } = relicWreck();
    const me = playerVehicle(w);
    expect(stowPart(w, me, relic)).toBe(true);
    w.player.storage.push(partWithId('relic-stored', 'relicStatue', 0));
    expect(tradedSpares(me)).toEqual([]);
    expect(() => takeSellablePart(w, relic.id)).toThrow();
    expect(() => takeSellablePart(w, 'relic-stored')).toThrow();
  });

  it('leaves the relic aboard when a truck sells its cargo at a shop', () => {
    const { w, relic } = relicWreck();
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { ...sitePads(siteOf('bowl'))[1] });
    expect(stowPart(w, npc, relic)).toBe(true);
    const shelf = shopState(w, 'bowl').stock.length;
    sellVehicleCargo(w, npc, 'bowl', 0);
    expect(spareParts(npc)).toEqual([relic]);
    expect(shopState(w, 'bowl').stock).toHaveLength(shelf);
  });
});
