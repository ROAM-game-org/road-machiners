import { beforeAll, describe, expect, it } from 'vitest';
import { PARTS } from '../data/parts';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from './damage';
import { makePart } from './factory';
import { spareParts, stowPart } from './inventory';
import { acceptContract, advanceContracts, advanceShops, deliverContract, estimateTurns, rollContract, shopState, siteOf, type Contract } from './market';
import { sellPart, partTradePrice } from './economy';
import { claimPartHeld, claimReward, claimSpots, claimTargets, claimWindow } from './claims';
import { resolveNpcActivities, pushGoal, topGoal } from './npc-activities';
import { claimOnly, canTakeAny, claimedPartIn, collectSalvage, hasSalvage, type ClaimContract } from './salvage';
import { defaultSetup } from './settings';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain, practiceOf } from './testkit';
import type { PartInstance, SalvageStock, World } from './types';
import { dumpItem } from './inventory';
import { cloneWorld, endTurn, newWorld, update } from './world';
import { advanceFar } from './far';
import { mapObstacles } from './mapgen';
import { navLayer } from './nav/layer';
import { MAX_RADIUS, oldSpotOf, reachable } from './salvage';
import { TIME } from '../data/time';

let real: World;

beforeAll(() => {
  real = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
});

function claimFor(stock: SalvageStock, part: PartInstance, over: Partial<ClaimContract> = {}): ClaimContract {
  return { id: 'ct-claim', shop: 'bowl', kind: 'claim', stockId: stock.id, at: { ...stock.pos }, partId: part.id, defId: part.defId, reward: 900, deadline: 900, window: 900, tier: PARTS[part.defId].tier, ...over };
}

function claimWorld(posted: 'board' | 'held' = 'board'): { w: World; stock: SalvageStock; part: PartInstance; claim: ClaimContract } {
  const target = claimTargets(real)[0];
  const w = emptyWorld(sitePads(siteOf('bowl'))[0]);
  const stock: SalvageStock = structuredClone(target.stock);
  const part = makePart(w, 'mg', 0);
  stock.parts = stock.parts.filter((p) => p.id !== target.part.id);
  stock.hidden.parts = stock.hidden.parts.filter((p) => p.id !== target.part.id);
  stock.hidden.parts.push(part);
  for (const shop of Object.values(w.shops)) Object.assign(shop, { contracts: [], restockAt: Infinity });
  stock.goods = { ...stock.goods, scrap: 3 };
  w.salvage = [stock];
  const claim = claimFor(stock, part);
  if (posted === 'board') shopState(w, 'bowl').contracts = [claim];
  else w.player.contracts = [claim];
  return { w, stock, part, claim };
}

function reveal(stock: SalvageStock): void {
  stock.parts.push(...stock.hidden.parts);
  stock.hidden.parts = [];
}

function claimOnlyStock(stock: SalvageStock, part: PartInstance, where: 'hidden' | 'revealed'): void {
  stock.goods = {};
  stock.fuel = 0;
  stock.supplies = 0;
  stock.parts = where === 'revealed' ? [part] : [];
  stock.hidden = { goods: {}, parts: where === 'hidden' ? [part] : [], fuel: 0, supplies: 0 };
}

function npcAt(w: World, stock: SalvageStock) {
  const npc = addVehicle(w, 'scavengers', 'hauler', ['mg', 'stockEngine'], { x: stock.pos.x + 1, y: stock.pos.y });
  npc.brain = npcBrain('scavenger', npc.pos, ['scavenger']);
  return npc;
}

describe('claim spots', () => {
  it('only offers real spare parts that lie in the world', () => {
    const targets = claimTargets(real);
    expect(targets.length).toBeGreaterThan(0);
    for (const { stock, part } of targets) {
      expect([...stock.parts, ...stock.hidden.parts]).toContain(part);
      expect(claimSpots(real)).toContain(stock);
    }
  });

  it('rolls a claim that names a present part, and never two claims on one stock', () => {
    const w = cloneWorld(real);
    const shop = { id: 'bowl', pos: siteOf('bowl').pos };
    const first = rollContract(w, shop, [], [], [], [], claimTargets(w).slice(0, 1));
    expect(first).toMatchObject({ kind: 'claim' });
    shopState(w, 'bowl').contracts = [first!];
    expect(claimTargets(w).some((t) => t.stock.id === (first as ClaimContract).stockId)).toBe(false);
  });

  it('refuses a claim roll with no part', () => {
    const shop = { id: 'bowl', pos: siteOf('bowl').pos };
    expect(rollContract(cloneWorld(real), shop, [], [], [], [], [])).toBeNull();
  });

  it('pays more than any shop would for the part', () => {
    for (const { part } of claimTargets(real)) {
      const w = emptyWorld();
      const turns = estimateTurns(siteOf('bowl').pos, { x: 0, y: 0 });
      expect(claimReward(part, turns)).toBeGreaterThan(partTradePrice(w, playerVehicle(w), part, 'sell'));
    }
  });

  it('throws on a bad trip length', () => {
    const part = claimTargets(real)[0].part;
    expect(() => claimReward(part, -1)).toThrow();
    expect(() => claimWindow(NaN)).toThrow();
  });
});

describe('reservation', () => {
  it('lets a scavenger take everything but the claimed part', () => {
    const { w, stock, part } = claimWorld();
    reveal(stock);
    const npc = npcAt(w, stock);
    collectSalvage(w, npc, stock.id, Infinity);
    expect(stock.parts.map((p) => p.id)).toEqual([part.id]);
    expect(stock.goods.scrap ?? 0).toBe(0);
    expect(claimedPartIn(w, stock)).toBe(part.id);
  });

  it('keeps the part from a scavenger while it is still hidden', () => {
    const { w, stock, part } = claimWorld();
    claimOnlyStock(stock, part, 'hidden');
    const npc = npcAt(w, stock);
    expect(canTakeAny(w, npc, stock)).toBe(false);
    expect(claimOnly(w, npc, stock)).toBe(true);
  });

  it('lets the player take the claimed part', () => {
    const { w, stock, part } = claimWorld();
    reveal(stock);
    const me = playerVehicle(w);
    me.pos = { x: stock.pos.x + 1, y: stock.pos.y };
    collectSalvage(w, me, stock.id, Infinity);
    expect(stock.parts.map((p) => p.id)).not.toContain(part.id);
    expect(claimPartHeld(w, claimFor(stock, part))).toBe('player');
  });

  it('ends a scavenger goal on a claim-only stock with the claimed reason', () => {
    const { w, stock, part } = claimWorld();
    claimOnlyStock(stock, part, 'revealed');
    const npc = npcAt(w, stock);
    pushGoal(w, npc, { kind: 'scavenge', targetId: stock.id, destination: { ...stock.pos }, phase: 'act', reason: 'searchSite' });
    resolveNpcActivities(w);
    expect(topGoal(npc)?.targetId).not.toBe(stock.id);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'activity', previous: 'scavenge', reason: 'claimedWreck' }));
    expect(hasSalvage(stock)).toBe(true);
  });

  it('releases the part when the offer expires or the claim is dropped from the board', () => {
    const { w, stock, claim } = claimWorld();
    expect(claimedPartIn(w, stock)).toBe(claim.partId);
    w.turn = claim.deadline + 1;
    advanceShops(w);
    expect(claimedPartIn(w, stock)).toBeNull();
  });

  it('releases the part when a held claim fails on its deadline, with no penalty', () => {
    const { w, stock } = claimWorld('held');
    const money = w.player.money;
    w.turn = 901;
    advanceContracts(w);
    expect(w.player.contracts).toEqual([]);
    expect(w.player.money).toBe(money);
    expect(claimedPartIn(w, stock)).toBeNull();
  });
});

describe('delivery', () => {
  function carrying(w: World, part: PartInstance, stock: SalvageStock): World {
    return update(w, (d) => {
      const s = d.salvage.find((x) => x.id === stock.id)!;
      s.parts = s.parts.filter((p) => p.id !== part.id);
      s.hidden.parts = s.hidden.parts.filter((p) => p.id !== part.id);
      if (!stowPart(d, playerVehicle(d), part)) d.player.storage.push(part);
    });
  }

  it('lets the player accept while already carrying the part, and deliver at once', () => {
    const { w: base, stock, part } = claimWorld();
    const money = base.player.money;
    let w = carrying(base, part, stock);
    w = acceptContract(w, 'ct-claim');
    expect(w.player.contracts).toHaveLength(1);
    w = deliverContract(w, 'ct-claim');
    expect(w.player.money).toBe(money + 900);
    expect(w.player.contracts).toEqual([]);
    expect(practiceOf(w, 'contract')).toHaveLength(1);
    expect(spareParts(playerVehicle(w)).some((p) => p.id === part.id)).toBe(false);
    expect(shopState(w, 'bowl').stock.filter((p) => p.id === part.id)).toHaveLength(1);
    expect(claimedPartIn(w, w.salvage[0])).toBeNull();
  });

  it('refuses delivery without the part', () => {
    const { w } = claimWorld('held');
    expect(() => deliverContract(w, 'ct-claim')).toThrow(/Needs the claimed/);
  });

  it('lapses a held claim with no money change when the part is sold', () => {
    const { w: base, stock, part } = claimWorld('held');
    let w = carrying(base, part, stock);
    const money = w.player.money;
    w = sellPart(w, part.id);
    const paid = w.player.money - money;
    w = update(w, (d) => { advanceContracts(d); });
    expect(w.player.contracts).toEqual([]);
    expect(w.player.money).toBe(money + paid);
    expect(w.events.some((e) => e.t === 'contract' && e.outcome === 'lapsed')).toBe(true);
  });

  it('lapses a held claim when the part is dumped', () => {
    const { w: base, stock, part } = claimWorld('held');
    let w = carrying(base, part, stock);
    const item = playerVehicle(w).items.find((it) => it.kind === 'part' && it.part.id === part.id);
    if (!item) return;
    w = dumpItem(w, item.id);
    w = update(w, (d) => { advanceContracts(d); });
    expect(w.player.contracts).toEqual([]);
  });

  it('withdraws a posted offer whose part is gone, the same turn', () => {
    const { w, stock, claim } = claimWorld();
    stock.parts = [];
    stock.hidden.parts = [];
    advanceShops(w);
    expect(shopState(w, 'bowl').contracts.some((c) => c.id === claim.id)).toBe(false);
  });
});

describe('reachability', () => {
  it('only offers spots a truck can reach from the road', () => {
    const baked = mapObstacles(TEST_MAP);
    const layer = navLayer(TEST_MAP.terrain, baked, MAX_RADIUS);
    const spots = claimSpots(real);
    expect(spots.length).toBeGreaterThan(20);
    for (const stock of spots) {
      const prop = baked.find((o) => o.id === (oldSpotOf(stock)?.propId ?? stock.id));
      expect(prop && reachable(layer, prop), stock.id).toBe(true);
    }
  });
});

describe('claim days', () => {
  function waitInTown(w: World): void {
    const me = w.player.vehicleId;
    for (const v of w.vehicles) if (v.id !== me) advanceFar(w, v);
  }

  it('keeps the claimed part in its wreck for a day while every NPC plays and the player waits in town', () => {
    let w = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), true);
    const { stock, part } = claimTargets(w)[0];
    const claim = rollContract(w, { id: 'bowl', pos: siteOf('bowl').pos }, [], [], [], [], [{ stock, part }]) as ClaimContract;
    shopState(w, 'bowl').contracts.push(claim);
    const scavenger = w.vehicles.find((v) => v.brain?.templateId === 'scavenger') ?? w.vehicles.find((v) => v.faction === 'scavengers')!;
    w = update(w, (d) => {
      const npc = d.vehicles.find((v) => v.id === scavenger.id)!;
      pushGoal(d, npc, { kind: 'scavenge', targetId: stock.id, destination: { ...stock.pos }, phase: 'travel', reason: 'searchSite' });
    });
    const visited = new Set<string>();
    for (let turn = 0; turn < TIME.turnsPerDay; turn++) {
      w = endTurn(w, waitInTown);
      for (const e of w.events) if (e.t === 'activity' && e.reason === 'claimedWreck') visited.add(e.vehicle);
      if (!w.shops.bowl.contracts.some((c) => c.id === claim.id)) break;
      expect(claimedPartIn(w, w.salvage.find((s) => s.id === stock.id)!), `turn ${turn}`).toBe(part.id);
    }
    const left = w.salvage.find((s) => s.id === stock.id)!;
    expect([...left.parts, ...left.hidden.parts].map((p) => p.id)).toContain(part.id);
    expect(visited.size + (left.hidden.parts.length === 0 ? 1 : 0)).toBeGreaterThan(0);
  }, 900_000);
});
