import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from './damage';
import { claimReward, claimSpots, claimTargets } from './claims';
import { sellVehicleCargo, takeSellablePart } from './economy';
import { advanceJobs, isStrippable, startStrip } from './jobs';
import { partWithId } from './factory';
import { spareParts, stowPart, tradedSpares } from './inventory';
import { cargoValue, shopState, siteOf } from './market';
import { placeRelics, relicDefFor, relicIdOf } from './relics';
import { canTakeAny, claimOnly, clearPiles, collectSalvage, hasSalvageFor, lockedFrom, lootableProps, revealTurn, visibleParts, type ClaimContract } from './salvage';
import { takeLoot, needsSearch } from './locations';
import { beginSearch } from './search';
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

function claimOn(stock: SalvageStock, relic: PartInstance): ClaimContract {
  return { id: 'ct-claim', shop: 'bowl', kind: 'claim', stockId: stock.id, at: { ...stock.pos }, partId: relic.id, defId: relic.defId, reward: 9, deadline: 900, window: 900, tier: 1, rivalAt: 900, rival: null, leads: [] };
}

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

  it('keeps the relic from a player with no claim', () => {
    const { w, stock, relic } = relicWreck();
    const me = playerVehicle(w);
    me.pos = { x: stock.pos.x + 1, y: stock.pos.y };
    expect(canTakeAny(w, me, stock)).toBe(false);
    expect(hasSalvageFor(w, me, stock)).toBe(false);
    expect(visibleParts(w, me, stock)).toEqual([]);
    expect(collectSalvage(w, me, stock.id, Infinity)).toBe(0);
    expect(stock.parts).toEqual([relic]);
  });

  it('keeps the relic from a player whose claim is only on a shop board', () => {
    const { w, stock, relic } = relicWreck();
    const me = playerVehicle(w);
    me.pos = { x: stock.pos.x + 1, y: stock.pos.y };
    w.shops.bowl.contracts.push(claimOn(stock, relic));
    expect(visibleParts(w, me, stock)).toEqual([]);
    expect(collectSalvage(w, me, stock.id, Infinity)).toBe(0);
  });

  it('lets the player pick the relic up once the claim is held', () => {
    const { w, stock, relic } = relicWreck();
    const me = playerVehicle(w);
    me.pos = { x: stock.pos.x + 1, y: stock.pos.y };
    w.player.contracts.push(claimOn(stock, relic));
    expect(visibleParts(w, me, stock)).toEqual([relic]);
    expect(canTakeAny(w, me, stock)).toBe(true);
    expect(collectSalvage(w, me, stock.id, Infinity)).toBe(1);
    expect(spareParts(me)).toContainEqual(relic);
  });

  it('refuses a locked relic when the player asks for it by name', () => {
    const { w, stock, relic } = relicWreck();
    const me = playerVehicle(w);
    me.pos = { x: stock.pos.x + 1, y: stock.pos.y };
    expect(() => takeLoot(w, stock.id, { kind: 'part', partId: relic.id }, { x: 0, y: 0, rot: 0 })).toThrow();
  });
});

describe('searching a wreck with a relic', () => {
  function hiddenRelicWreck(): { w: World; stock: SalvageStock; relic: PartInstance } {
    const { w, stock, relic } = relicWreck();
    stock.parts = [];
    stock.hidden.parts = [relic];
    playerVehicle(w).pos = { x: stock.pos.x + 1, y: stock.pos.y };
    return { w, stock, relic };
  }

  function search(w: World, stock: SalvageStock): void {
    const me = playerVehicle(w);
    beginSearch(w, me, stock.id);
    for (let i = 0; i < 60 && me.job; i++) advanceJobs(w);
  }

  it('never turns the relic up for a player with no claim', () => {
    const { w, stock, relic } = hiddenRelicWreck();
    search(w, stock);
    expect(stock.hidden.parts).toEqual([relic]);
    expect(stock.parts).toEqual([]);
    expect(needsSearch(w, stock)).toBe(false);
    expect(hasSalvageFor(w, playerVehicle(w), stock)).toBe(false);
  });

  it('turns the relic up on the claim holder full search', () => {
    const { w, stock, relic } = hiddenRelicWreck();
    w.player.contracts.push(claimOn(stock, relic));
    search(w, stock);
    expect(stock.parts).toEqual([relic]);
  });

  it('draws the same search stream with the relic buried and with it claimed', () => {
    const buried = hiddenRelicWreck();
    const held = hiddenRelicWreck();
    held.w.player.contracts.push(claimOn(held.stock, held.relic));
    revealTurn(buried.w, buried.stock, 0.5, lockedFrom(buried.w, playerVehicle(buried.w), buried.stock));
    revealTurn(held.w, held.stock, 0.5, lockedFrom(held.w, playerVehicle(held.w), held.stock));
    expect(buried.w.searchRng.rngState).toBe(held.w.searchRng.rngState);
  });
});

describe('relic piles and regrowth', () => {
  it('clears a pile holding only a relic', () => {
    const { w, stock } = relicWreck();
    stock.pile = { until: w.turn + 1000, fromPlayer: true, basis: {} } as SalvageStock['pile'];
    clearPiles(w);
    expect(w.salvage).toEqual([]);
  });

  it('leaves a wreck holding only its relic out of the loot paint', () => {
    const { stock } = relicWreck();
    expect(lootableProps([stock]).size).toBe(0);
  });
});

describe('relics never trade', () => {
  it('keeps a relic out of every sale', () => {
    const { w, relic } = relicWreck();
    const me = playerVehicle(w);
    expect(stowPart(w, me, relic)).toBe(true);
    w.player.storage.push(partWithId('relic-stored', 'relicStatue', 0));
    expect(tradedSpares(me)).toEqual([]);
    expect(cargoValue(me)).toBe(cargoValue({ ...me, items: me.items.filter((it) => it.kind !== 'part' || it.part.id !== relic.id) }));
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

  it('cannot be stripped for parts', () => {
    const { w, relic } = relicWreck();
    const me = playerVehicle(w);
    expect(stowPart(w, me, relic)).toBe(true);
    expect(isStrippable(relic)).toBe(false);
    expect(() => startStrip(w, relic.id)).toThrow('cannot be stripped');
    expect(spareParts(playerVehicle(w))).toEqual([relic]);
  });
});
