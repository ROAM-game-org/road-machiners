import { beforeAll, describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { PARTS } from '../data/parts';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from './damage';
import { makePart } from './factory';
import { spareParts, stowPart } from './inventory';
import { acceptContract, advanceContracts, advanceShops, contractReward, deliverContract, estimateTurns, rollContract, shopState, siteOf, type Contract } from './market';
import { sellPart, partTradePrice } from './economy';
import { bakedTier, shopClue } from './claim-clue';
import { claimCandidates, claimClue, claimLook, claimPartHeld, claimReward, claimRivalAt, claimSpots, claimTargets, claimWindow, isFreeRival, sendRival } from './claims';
import { leaveLoot } from './loot-warning';
import { getResources } from './resources';
import type { TraitId } from '../data/npcs';
import { CONTRACTS, SHOPS } from '../data/market';
import { SEARCH } from '../data/utilities';
import { beginSearch, searchTurn } from './search';
import { partValue } from './wear';
import { dist } from './vec';
import { resolveNpcActivities, pushGoal, thinkNpc, topGoal } from './npc-activities';
import { claimOnly, canTakeAny, claimedPartIn, collectSalvage, hasSalvage, liveClaims, type ClaimContract } from './salvage';
import { defaultSetup } from './settings';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain, practiceOf } from './testkit';
import { standardWorld } from '../test/world-cache';
import type { PartInstance, SalvageStock, Vehicle, World } from './types';
import { dumpItem } from './inventory';
import { cloneWorld, endTurn, newWorld, update } from './world';
import { advanceFar } from './far';
import { mapObstacles } from './mapgen';
import { navLayer } from './nav/layer';
import { MAX_RADIUS, oldSpotOf, reachable } from './salvage';
import { TIME } from '../data/time';
import { gridSquareOf, sameGridSquare } from './map-grid';

let real: World;

beforeAll(() => {
  real = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup("roaming"), false);
  for (const shop of Object.values(real.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'claim');
});

function claimFor(stock: SalvageStock, part: PartInstance, over: Partial<ClaimContract> = {}): ClaimContract {
  return { id: 'ct-claim', shop: 'bowl', kind: 'claim', stockId: stock.id, at: { ...stock.pos }, partId: part.id, defId: part.defId, reward: 9, deadline: 900, window: 900, tier: PARTS[part.defId].tier, rivalAt: 900, rival: null, leads: [], ...over };
}

function claimWorld(posted: 'board' | 'held' = 'board'): { w: World; stock: SalvageStock; part: PartInstance; claim: ClaimContract } {
  const target = claimTargets(real, 'bowl')[0];
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
  const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: stock.pos.x + 1, y: stock.pos.y });
  npc.brain = npcBrain('scavenger', npc.pos, ['scavenger']);
  return npc;
}

describe('claim spots', () => {
  it('only offers real spare parts that lie in the world', () => {
    const targets = claimTargets(real, 'bowl');
    expect(targets.length).toBeGreaterThan(0);
    for (const { stock, part } of targets) {
      expect([...stock.parts, ...stock.hidden.parts]).toContain(part);
      expect(claimSpots(real)).toContain(stock);
    }
  });

  it('rolls a claim that names a present part, and never two claims on one stock', () => {
    const w = cloneWorld(real);
    const shop = { id: 'bowl', pos: siteOf('bowl').pos };
    const first = rollContract(w, shop, { claims: claimTargets(w, 'bowl').slice(0, 1) });
    expect(first).toMatchObject({ kind: 'claim' });
    shopState(w, 'bowl').contracts = [first!];
    expect(claimTargets(w, 'bowl').some((t) => t.stock.id === (first as ClaimContract).stockId)).toBe(false);
  });

  it('refuses a claim roll with no part', () => {
    const shop = { id: 'bowl', pos: siteOf('bowl').pos };
    expect(rollContract(cloneWorld(real), shop, {})).toBeNull();
  });

  it('pays more than any shop would for the part, at its value plus the travel pay of the trip', () => {
    const rows: string[] = [];
    for (const { stock, part } of claimTargets(real, 'bowl')) {
      const w = emptyWorld();
      for (const shopId of Object.keys(SHOPS)) {
        const turns = estimateTurns(siteOf(shopId).pos, stock.pos);
        const reward = claimReward(part, contractReward(turns, 0, false));
        const old = Math.round(partValue(part) + (turns * 24 + CONTRACTS.claim.searchTurns) * 12.33);
        rows.push(`${shopId} ${part.defId} ${Math.round(turns)} turns: old ${old} c, new ${reward} c`);
        expect(reward).toBeGreaterThan(partTradePrice(w, playerVehicle(w), part, 'sell'));
        expect(reward).toBeGreaterThanOrEqual(Math.round(partValue(part)));
      }
    }
    console.log(['claim reward, old against new:', ...rows].join('\n'));
  });

  it('throws on a bad trip length or travel pay', () => {
    const part = claimTargets(real, 'bowl')[0].part;
    expect(() => claimReward(part, -1)).toThrow();
    expect(() => claimWindow(NaN)).toThrow();
    expect(() => claimRivalAt(0, -1)).toThrow();
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
    expect(w.player.money).toBe(money + 9);
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

describe('boat wrecks', () => {
  it('are never claim wrecks', () => {
    expect(claimSpots(real).filter((stock) => oldSpotOf(stock)?.type === 'boats')).toEqual([]);
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
      expect(prop && reachable(layer, prop, REGION.navigation.reachClimb), stock.id).toBe(true);
    }
  });
});

function nearestClaim(w: World): { shop: string; stock: SalvageStock; part: PartInstance } {
  const options = Object.keys(SHOPS).flatMap((shop) => claimTargets(w, shop).map(({ stock, part }) => ({ shop, stock, part, turns: estimateTurns(siteOf(shop).pos, stock.pos) })));
  return options.sort((a, b) => a.turns - b.turns)[0];
}

function keepNearestDrivers(w: World, count: number, also: string[] = [], shopId = 'bowl'): void {
  const shop = siteOf(shopId).pos;
  const npcs = w.vehicles.filter((v) => v.id !== w.player.vehicleId && v.brain && !v.brain.goals.some((g) => g.kind === 'follow'));
  const near = new Set(npcs.sort((a, b) => dist(a.pos, shop) - dist(b.pos, shop)).slice(0, count).map((v) => v.id));
  w.vehicles = w.vehicles.filter((v) => v.id === w.player.vehicleId || near.has(v.id) || also.includes(v.id));
}

const CLAIM_DAY_TURNS = 60;

describe('claim days', () => {
  function holdRivals(w: World): void {
    for (const c of liveClaims(w)) if (c.rival === null) c.rivalAt = c.deadline + 1;
  }

  function waitInTown(w: World): void {
    const me = w.player.vehicleId;
    holdRivals(w);
    for (const v of w.vehicles) if (v.id !== me) advanceFar(w, v);
  }

  it('keeps the claimed part in its wreck while the nearest NPCs play and the player waits in town', () => {
    let w = standardWorld(1);
    for (const shop of Object.values(w.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'claim');
    const { stock, part } = claimTargets(w, 'bowl')[0];
    const claim = rollContract(w, { id: 'bowl', pos: siteOf('bowl').pos }, { claims: [{ stock, part }] }) as ClaimContract;
    shopState(w, 'bowl').contracts.push(claim);
    holdRivals(w);
    const scavenger = w.vehicles.find((v) => v.brain?.templateId === 'scavenger') ?? w.vehicles.find((v) => v.faction === 'independent')!;
    keepNearestDrivers(w, 3, [scavenger.id]);
    w = update(w, (d) => {
      const npc = d.vehicles.find((v) => v.id === scavenger.id)!;
      npc.pos = { x: stock.pos.x + stock.radius + 4, y: stock.pos.y };
      pushGoal(d, npc, { kind: 'scavenge', targetId: stock.id, destination: { ...stock.pos }, phase: 'act', reason: 'searchSite' });
    });
    const visited = new Set<string>();
    for (let turn = 0; turn < CLAIM_DAY_TURNS; turn++) {
      w = endTurn(w, waitInTown);
      if (w.player.call) w = update(w, (d) => { d.player.call = null; });
      for (const e of w.events) if (e.t === 'activity' && e.reason === 'claimedWreck') visited.add(e.vehicle);
      if (!w.shops.bowl.contracts.some((c) => c.id === claim.id)) break;
      expect(claimedPartIn(w, w.salvage.find((s) => s.id === stock.id)!), `turn ${turn}`).toBe(part.id);
    }
    const left = w.salvage.find((s) => s.id === stock.id)!;
    expect([...left.parts, ...left.hidden.parts].map((p) => p.id)).toContain(part.id);
    expect(visited.size + (left.hidden.parts.length === 0 ? 1 : 0)).toBeGreaterThan(0);
  }, 900_000);
});

describe('the clue', () => {
  function claimAt(at: { x: number; y: number }, stockId = claimSpots(real)[0].id): ClaimContract {
    const stock = real.salvage.find((s) => s.id === stockId)!;
    return { ...claimFor(stock, stock.parts[0] ?? makePart(emptyWorld(), 'mg', 0)), at };
  }

  it('snaps the bearing to eight points and rounds the distance from the shop to the clue step', () => {
    const shop = siteOf('bowl').pos;
    const step = CONTRACTS.claim.clueStepTiles;
    const clue = claimClue(claimAt({ x: shop.x + 3.4 * step * Math.cos(0.7), y: shop.y + 3.4 * step * Math.sin(0.7) }));
    expect(clue.angle).toBeCloseTo(Math.PI / 4);
    expect(clue.distance).toBe(3 * step);
    expect(clue.from).toEqual(shop);
    const wreck = { id: 'x', pos: { x: shop.x + 3.4 * step * Math.cos(0.7), y: shop.y + 3.4 * step * Math.sin(0.7) }, look: 'tank' as const, territory: null };
    expect(dist(shopClue(wreck, shop).point, shop)).toBeCloseTo(3 * step);
  });

  it('never rounds a near wreck down to no distance', () => {
    const shop = siteOf('bowl').pos;
    expect(claimClue(claimAt({ x: shop.x + 5, y: shop.y })).distance).toBe(CONTRACTS.claim.clueStepTiles);
  });

  it('names the look of the wreck the part lies in', () => {
    const looks = new Set(claimSpots(real).map((s) => claimLook(s)));
    expect([...looks].every((l) => ['armyTruck', 'deadTruck', 'tank', 'hullCompartment', 'cargoPod', 'engineSection'].includes(l))).toBe(true);
    expect(claimClue(claimAt(claimSpots(real)[0].pos)).look).toBe(claimLook(claimSpots(real)[0]));
  });

  it('lists the true wreck among the candidates, all in the clue circle and the named square, for every claim spot and every shop', () => {
    for (const stock of claimSpots(real)) {
      for (const shop of Object.keys(SHOPS)) {
        const c = { ...claimAt(stock.pos, stock.id), shop };
        const candidates = claimCandidates(real, c);
        expect(candidates, `${stock.id} from ${shop}`).toContain(stock.id);
        if (bakedTier(stock.id, shop) === null) continue;
        for (const id of candidates) expect(dist(real.salvage.find((s) => s.id === id)!.pos, stock.pos), `${id} for ${stock.id} from ${shop}`).toBeLessThanOrEqual(CONTRACTS.claim.clue.nearby);
      }
    }
  });

  it('leaves out wrecks of the same look near the clue point but outside the named square', () => {
    const spots = claimSpots(real);
    const left = spots.flatMap((stock) => {
      const c = claimAt(stock.pos, stock.id);
      const clue = claimClue(c);
      const outside = spots.filter((s) => claimLook(s) === clue.look && dist(s.pos, clue.point) <= CONTRACTS.claim.clue.shopBand * 2 && !sameGridSquare(gridSquareOf(s.pos), clue.square));
      return outside.map((s) => ({ c, other: s.id }));
    });
    expect(left.length).toBeGreaterThan(0);
    for (const { c, other } of left) expect(claimCandidates(real, c)).not.toContain(other);
  });

  it('orders the candidates nearest the clue point first, all of one look', () => {
    const stock = claimSpots(real)[0];
    const c = claimAt(stock.pos, stock.id);
    const clue = claimClue(c);
    const spots = claimCandidates(real, c).map((id) => real.salvage.find((s) => s.id === id)!);
    expect(spots.every((s) => claimLook(s) === clue.look)).toBe(true);
    const gaps = spots.map((s) => dist(s.pos, clue.point));
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
  });

  it('throws when the candidates would miss the true wreck', () => {
    const stock = claimSpots(real)[0];
    const shop = siteOf('bowl').pos;
    const onMap = (n: number) => Math.min(REGION.size - 1, Math.max(1, n));
    const far = { x: onMap(shop.x + (shop.x - stock.pos.x)), y: onMap(shop.y + (shop.y - stock.pos.y)) };
    expect(() => claimCandidates(real, { ...claimAt(stock.pos, stock.id), at: far })).toThrow(/miss/);
  });
});

describe('a full search', () => {
  function searchToEnd(w: World, stock: SalvageStock, who: 'player' | 'npc'): void {
    const v = who === 'player' ? playerVehicle(w) : npcAt(w, stock);
    v.pos = { x: stock.pos.x + 1, y: stock.pos.y };
    beginSearch(w, v, stock.id);
    const reveal = SEARCH.reveal;
    (SEARCH as { reveal: number }).reveal = 0;
    try {
      for (let i = 0; i < 500 && v.job?.kind === 'search'; i++) if (searchTurn(w, v, v.job)) break;
    } finally {
      (SEARCH as { reveal: number }).reveal = reveal;
    }
  }

  it('always turns up a hidden claimed part for the player', () => {
    const { w, stock, part } = claimWorld();
    searchToEnd(w, stock, 'player');
    expect(stock.parts.map((p) => p.id)).toContain(part.id);
    expect(stock.hidden.parts.map((p) => p.id)).not.toContain(part.id);
  });

  it('always turns up a hidden claimed part for a driver off the claim, who leaves it', () => {
    const { w, stock, part } = claimWorld();
    searchToEnd(w, stock, 'npc');
    expect(stock.parts.map((p) => p.id)).toEqual([part.id]);
  });

  it('leaves other hidden parts to chance', () => {
    const { w, stock } = claimWorld();
    const other = makePart(w, 'stockEngine', 0);
    stock.hidden.parts.push(other);
    searchToEnd(w, stock, 'player');
    expect(stock.hidden.parts.map((p) => p.id)).toEqual([other.id]);
  });
});

describe('rival crews', () => {
  function rivalWorld(posted: 'board' | 'held' = 'board'): { w: World; stock: SalvageStock; part: PartInstance; claim: ClaimContract } {
    const w = cloneWorld(real);
    w.vehicles = w.vehicles.filter((v) => v.id === w.player.vehicleId);
    for (const shop of Object.values(w.shops)) Object.assign(shop, { contracts: [], restockAt: Infinity });
    const { stock } = claimTargets(w, 'bowl')[0];
    const part = makePart(w, 'mg', 0);
    stock.hidden.parts.push(part);
    stock.goods = { ...stock.goods, scrap: 2 };
    const claim = claimFor(stock, part, { rivalAt: 50, deadline: 5000 });
    if (posted === 'board') shopState(w, 'bowl').contracts = [claim];
    else w.player.contracts = [claim];
    playerVehicle(w).pos = { ...sitePads(siteOf('bowl'))[0] };
    return { w, stock, part, claim };
  }

  function crew(w: World, at: { x: number; y: number }, traits: TraitId[] = ['scavenger']): Vehicle {
    const npc = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { ...at });
    npc.brain = npcBrain('scavenger', npc.pos, traits);
    npc.brain.goals = [{ kind: 'wait', targetId: null, destination: null, phase: 'act', reason: 'idle' }];
    return npc;
  }

  function near(pos: { x: number; y: number }, dx: number): { x: number; y: number } {
    return { x: pos.x + dx, y: pos.y };
  }

  function sendDue(w: World, claim: ClaimContract): void {
    w.turn = claim.rivalAt;
    advanceShops(w);
  }

  function runUntilSearchDone(w: World, v: Vehicle): void {
    for (let i = 0; i < 300 && v.job?.kind === 'search'; i++) if (searchTurn(w, v, v.job)) v.job = null;
  }

  function stepRival(w: World, v: Vehicle): void {
    v.speed = 0;
    resolveNpcActivities(w);
  }

  it('sends no rival before the head start runs out, and exactly one after it', () => {
    const { w, claim } = rivalWorld();
    const bowl = siteOf('bowl').pos;
    const npc = crew(w, near(bowl, 30));
    w.turn = claim.rivalAt - 1;
    advanceShops(w);
    expect(claim.rival).toBeNull();
    sendDue(w, claim);
    expect(claim.rival).toBe(npc.id);
    expect(topGoal(npc)).toMatchObject({ kind: 'claim', claim: claim.id, reason: 'claimRun' });
    expect(w.events).toContainEqual({ t: 'claimRival', contract: claim.id, vehicle: npc.id });
    crew(w, near(bowl, 10));
    w.turn = claim.rivalAt + CONTRACTS.claim.rivalRetryTurns;
    advanceShops(w);
    expect(claim.rival).toBe(npc.id);
    expect(w.events.filter((e) => e.t === 'claimRival')).toHaveLength(1);
    expect(() => sendRival(w, claim)).toThrow(/already/);
  });

  it('sends the nearest free crew of a rival trait and skips busy, knocked-out and other trucks', () => {
    const { w, claim } = rivalWorld();
    const bowl = siteOf('bowl').pos;
    const lawman = crew(w, near(bowl, 5), ['lawman']);
    const searching = crew(w, near(bowl, 6));
    searching.job = { kind: 'search', stockId: claim.stockId, turnsLeft: 5, total: 5 };
    const far = crew(w, near(bowl, 90), ['vulture']);
    const close = crew(w, near(bowl, 40), ['trader']);
    sendDue(w, claim);
    expect(claim.rival).toBe(close.id);
    expect([lawman, searching, far].every((v) => topGoal(v)?.kind !== 'claim')).toBe(true);
  });

  it('tries again later when no crew is free, and starts the run from the clue', () => {
    const { w, claim } = rivalWorld();
    sendDue(w, claim);
    expect(claim.rival).toBeNull();
    const npc = crew(w, near(siteOf('bowl').pos, 30));
    w.turn = claim.rivalAt + 1;
    advanceShops(w);
    expect(claim.rival).toBeNull();
    w.turn = claim.rivalAt + CONTRACTS.claim.rivalRetryTurns;
    advanceShops(w);
    expect(claim.rival).toBe(npc.id);
    expect(topGoal(npc)!.left).toEqual(claimCandidates(w, claim));
  });

  it('lets only the rival take the claimed part, while another crew leaves it', () => {
    const { w, stock, part, claim } = rivalWorld();
    reveal(stock);
    const other = npcAt(w, stock);
    collectSalvage(w, other, stock.id, Infinity);
    expect(stock.parts.map((p) => p.id)).toEqual([part.id]);
    const rival = crew(w, near(stock.pos, 1));
    claim.rival = rival.id;
    expect(canTakeAny(w, rival, stock)).toBe(true);
    collectSalvage(w, rival, stock.id, Infinity);
    expect(claimPartHeld(w, claim)).toBe('rival');
  });

  it('runs the rival to its wreck, searches, takes the part, and hands it in for the reward', () => {
    const { w, stock, part, claim } = rivalWorld();
    const npc = crew(w, near(siteOf('bowl').pos, 20));
    sendDue(w, claim);
    const goal = topGoal(npc)!;
    for (let i = 0; i < 20 && carriesNot(npc, part); i++) {
      const target = w.salvage.find((s) => s.id === goal.targetId)!;
      npc.pos = near(target.pos, 1);
      stepRival(w, npc);
      runUntilSearchDone(w, npc);
      stepRival(w, npc);
    }
    expect(claimPartHeld(w, claim)).toBe('rival');
    expect(stock.parts.concat(stock.hidden.parts).some((p) => p.id === part.id)).toBe(false);
    const money = getResources(w, npc).money;
    const playerMoney = w.player.money;
    stepRival(w, npc);
    expect(topGoal(npc)).toMatchObject({ kind: 'claim', targetId: 'bowl', phase: 'travel' });
    npc.pos = { ...sitePads(siteOf('bowl'))[0] };
    stepRival(w, npc);
    expect(getResources(w, npc).money).toBe(money + claim.reward);
    expect(w.player.money).toBe(playerMoney);
    expect(shopState(w, 'bowl').stock.filter((p) => p.id === part.id)).toHaveLength(1);
    expect(shopState(w, 'bowl').contracts).toEqual([]);
    expect(npc.brain!.goals.some((g) => g.kind === 'claim')).toBe(false);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'shopMoney', vehicle: npc.id, amount: claim.reward, kind: 'claimReward' }));
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'activity', vehicle: npc.id, reason: 'claimOver' }));
    expect(countPart(w, part.id)).toBe(1);
  });

  it('lapses a held claim with the rival cause and no money change when the rival hands in first', () => {
    const { w, part, claim } = rivalWorld('held');
    const npc = crew(w, { ...sitePads(siteOf('bowl'))[0] });
    claim.rival = npc.id;
    stowPart(w, npc, takeFromWreck(w, claim));
    npc.brain!.goals.push({ kind: 'claim', claim: claim.id, left: [], targetId: 'bowl', destination: { ...siteOf('bowl').pos }, phase: 'travel', reason: 'claimRun' });
    const money = w.player.money;
    stepRival(w, npc);
    expect(w.player.contracts).toEqual([]);
    expect(w.player.money).toBe(money);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'contract', outcome: 'lapsed', cause: 'rival' }));
    expect(practiceOf(w, 'contract')).toHaveLength(0);
    expect(countPart(w, part.id)).toBe(1);
  });

  it('keeps the claim live when the player takes the part off the rival, and pays the player on delivery', () => {
    const { w: base, part, claim } = rivalWorld('held');
    const npc = crew(base, near(siteOf('bowl').pos, 20));
    claim.rival = npc.id;
    stowPart(base, npc, takeFromWreck(base, claim));
    npc.brain!.goals.push({ kind: 'claim', claim: claim.id, left: [], targetId: 'bowl', destination: { ...siteOf('bowl').pos }, phase: 'travel', reason: 'claimRun' });
    let w = update(base, (d) => {
      const rival = d.vehicles.find((v) => v.id === npc.id)!;
      const item = rival.items.find((it) => it.kind === 'part' && it.part.id === part.id)!;
      rival.items = rival.items.filter((it) => it !== item);
      if (item.kind === 'part') stowPart(d, playerVehicle(d), item.part);
      advanceContracts(d);
    });
    expect(w.player.contracts).toHaveLength(1);
    expect(claimPartHeld(w, w.player.contracts[0] as ClaimContract)).toBe('player');
    w = update(w, (d) => { d.vehicles.find((v) => v.id === npc.id)!.speed = 0; resolveNpcActivities(d); });
    expect(w.vehicles.find((v) => v.id === npc.id)!.brain!.goals.some((g) => g.kind === 'claim')).toBe(false);
    const money = w.player.money;
    w = deliverContract(w, claim.id);
    expect(w.player.money).toBe(money + claim.reward);
  });

  it('lapses the claim when a third truck takes the part off the rival', () => {
    const { w, claim } = rivalWorld('held');
    const npc = crew(w, near(siteOf('bowl').pos, 20));
    claim.rival = npc.id;
    const raider = crew(w, near(siteOf('bowl').pos, 25), ['raider']);
    stowPart(w, raider, takeFromWreck(w, claim));
    advanceContracts(w);
    expect(w.player.contracts).toEqual([]);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'contract', outcome: 'lapsed' }));
    expect(w.events.some((e) => e.t === 'contract' && e.cause === 'rival')).toBe(false);
  });

  it('ends the rival run when the offer expires, and frees the part', () => {
    const { w, stock, claim } = rivalWorld();
    const npc = crew(w, near(siteOf('bowl').pos, 20));
    sendDue(w, claim);
    w.turn = claim.deadline + 1;
    advanceShops(w);
    expect(claimedPartIn(w, stock)).toBeNull();
    stepRival(w, npc);
    thinkNpc(w, npc);
    expect(npc.brain!.goals.some((g) => g.kind === 'claim')).toBe(false);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'activity', vehicle: npc.id, reason: 'claimOver' }));
  });

  it('drops a wrong wreck from the list after searching it, and moves on', () => {
    const { w, claim } = rivalWorld();
    const npc = crew(w, near(siteOf('bowl').pos, 20));
    sendDue(w, claim);
    const goal = topGoal(npc)!;
    const wrong = goal.left!.find((id) => id !== claim.stockId);
    if (!wrong) return;
    goal.targetId = wrong;
    const stock = w.salvage.find((s) => s.id === wrong)!;
    npc.pos = near(stock.pos, 1);
    stepRival(w, npc);
    expect(npc.job?.kind).toBe('search');
    expect(goal.left).not.toContain(wrong);
    runUntilSearchDone(w, npc);
    stepRival(w, npc);
    expect(goal.targetId).not.toBe(wrong);
    expect(goal.phase).toBe('travel');
  });

  it('ends the run when the rival gives way to a loot warning', () => {
    const { w, stock, claim } = rivalWorld();
    const npc = crew(w, near(siteOf('bowl').pos, 20));
    sendDue(w, claim);
    topGoal(npc)!.targetId = stock.id;
    npc.pos = near(stock.pos, 1);
    stepRival(w, npc);
    leaveLoot(w, npc, stock.id, 'warnedOff');
    expect(npc.brain!.goals.some((g) => g.kind === 'claim')).toBe(false);
  });

  it('finds a free rival in the start world', () => {
    const w = standardWorld(1);
    const part = makePart(w, 'mg', 0);
    expect(w.vehicles.some((v) => isFreeRival(w, v, part))).toBe(true);
  });

  function carriesNot(v: Vehicle, part: PartInstance): boolean {
    return !v.items.some((it) => it.kind === 'part' && it.part.id === part.id);
  }

  function takeFromWreck(w: World, claim: ClaimContract): PartInstance {
    const stock = w.salvage.find((s) => s.id === claim.stockId)!;
    const part = [...stock.parts, ...stock.hidden.parts].find((p) => p.id === claim.partId)!;
    stock.parts = stock.parts.filter((p) => p !== part);
    stock.hidden.parts = stock.hidden.parts.filter((p) => p !== part);
    return part;
  }

  function countPart(w: World, id: string): number {
    const inStocks = w.salvage.flatMap((s) => [...s.parts, ...s.hidden.parts]);
    const onTrucks = w.vehicles.flatMap((v) => v.items.flatMap((it) => (it.kind === 'part' ? [it.part] : [])));
    const inShops = Object.values(w.shops).flatMap((s) => s.stock);
    return [...inStocks, ...onTrucks, ...inShops, ...w.player.storage].filter((p) => p.id === id).length;
  }
});

describe('a rival on the real map', () => {
  it('runs a rival from the shop to the end of its claim with the nearest NPCs alive, and never stalls', () => {
    let w = standardWorld(2);
    const { shop, stock, part } = nearestClaim(w);
    const claim = rollContract(w, { id: shop, pos: siteOf(shop).pos }, { claims: [{ stock, part }] }) as ClaimContract;
    claim.rivalAt = w.turn + 1;
    shopState(w, shop).contracts.push(claim);
    keepNearestDrivers(w, 4, [], shop);
    const pads = sitePads(siteOf(shop));
    w.vehicles.filter((v) => v.id !== w.player.vehicleId).forEach((v, i) => {
      const pad = pads[i % pads.length];
      v.pos = { x: pad.x + Math.floor(i / pads.length) * 6, y: pad.y };
    });
    const move = (d: World): void => { for (const v of d.vehicles) if (v.id !== d.player.vehicleId) advanceFar(d, v); };
    let rival: string | null = null;
    let ended = false;
    for (let turn = 0; turn < 1500 && !ended; turn++) {
      w = endTurn(w, move);
      expect(w.events.filter((e) => e.t === 'stall'), `turn ${w.turn}`).toEqual([]);
      const live = w.shops[shop].contracts.find((c) => c.id === claim.id) as ClaimContract | undefined;
      rival = live?.rival ?? rival;
      const truck = w.vehicles.find((v) => v.id === rival);
      ended = rival !== null && !truck?.brain?.goals.some((g) => g.kind === 'claim');
    }
    expect(rival).not.toBeNull();
    expect(ended).toBe(true);
    const where = w.shops[shop].stock.some((p) => p.id === part.id) ? 'delivered' : 'over';
    console.log(`rival ${rival} ended its claim run at turn ${w.turn}: ${where}`);
  }, 1_800_000);
});
