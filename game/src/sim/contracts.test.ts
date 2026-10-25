import { describe, expect, it } from 'vitest';
import { CONTRACTS, EFFORT, SHOPS } from '../data/market';
import { chassisDef } from '../data/chassis';
import { GOODS } from '../data/goods';
import { graphEdges } from '../data/market';
import { REGION } from '../data/region';
import { playerVehicle } from './damage';
import { makePart } from './factory';
import { goodsCount } from './grid';
import { addGoods, removeGoods, stowParcel, stowPart } from './inventory';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain, practiceOf } from './testkit';
import type { Vehicle, World } from './types';
import { remember } from './memory';
import { townWork } from './dialogue-rules';
import { update } from './world';
import {
  acceptContract,
  advanceContracts,
  advanceShops,
  haulBlocked,
  deliverContract,
  goodValue,
  contractReward,
  estimateTurns,
  contractXp,
  noteSearchLead,
  searchReward,
  haulWindow,
  initializeShops,
  isExpired,
  rollContract,
  siteOf,
  vehicleValue,
  searchCandidates,
  searchRefusal,
  type Contract,
  type SearchContract,
} from './market';

function addRaider(w: World, templateId: string, pos = { x: 5, y: 5 }): Vehicle {
  const v = addVehicle(w, 'scrapjaw', 'buggy', [], pos);
  v.brain = npcBrain(templateId, pos, ['raider']);
  return v;
}

describe('estimateTurns', () => {
  it('grows with distance', () => {
    const near = estimateTurns({ x: 0, y: 0 }, { x: 10, y: 0 });
    const far = estimateTurns({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(far).toBeGreaterThan(near);
  });
});

describe('contractReward', () => {
  it('scales with turns', () => {
    const short = contractReward(50, 0, false);
    const long = contractReward(200, 0, false);
    expect(long).toBeGreaterThan(short);
  });

  it('adds a cut of cargo value to the reward, and nothing else depends on the good', () => {
    const plain = contractReward(100, 0, false);
    const withCargo = contractReward(100, 1000, false);
    expect(withCargo - plain).toBeCloseTo(1000 * CONTRACTS.haul.valueShare, 0);
    const rushCut = contractReward(100, 1000, true) - contractReward(100, 0, true);
    expect(Math.abs(rushCut - 1000 * CONTRACTS.haul.valueShare * CONTRACTS.haul.rush.premium)).toBeLessThanOrEqual(1);
  });

  it('throws on a non-finite or negative estimate or cargo value', () => {
    expect(() => contractReward(NaN, 0, false)).toThrow();
    expect(() => contractReward(-1, 0, false)).toThrow();
    expect(() => contractReward(100, -5, false)).toThrow();
    expect(() => contractReward(100, Infinity, false)).toThrow();
  });
});

describe('haulWindow', () => {
  it('is the drive times the factor plus the slack, and the drive times the rush factor for rush', () => {
    expect(haulWindow(100, false)).toBe(Math.round(100 * CONTRACTS.haul.durationFactor + CONTRACTS.haul.slackTurns));
    expect(haulWindow(100, true)).toBe(Math.round(100 * CONTRACTS.haul.rush.durationFactor));
  });

  it('gives a standard haul at least twice the rush window on every shop pair', () => {
    for (const a of SHOP_SITES) for (const b of SHOP_SITES) {
      if (a === b) continue;
      const turns = estimateTurns(a.pos, b.pos);
      expect(haulWindow(turns, false)).toBeGreaterThanOrEqual(2 * haulWindow(turns, true));
    }
  });

  it('throws on a negative or non-finite estimate', () => {
    expect(() => haulWindow(-1, false)).toThrow();
    expect(() => haulWindow(NaN, true)).toThrow();
  });
});

const MEASURED_DRIVE: { from: string; to: string; slowTurns: number }[] = [
  { from: 'bowl', to: 'nose', slowTurns: 192 }, { from: 'bowl', to: 'salvage-yard', slowTurns: 171 },
  { from: 'bowl', to: 'granary', slowTurns: 123 }, { from: 'bowl', to: 'pump-station', slowTurns: 64 },
  { from: 'nose', to: 'bowl', slowTurns: 199 }, { from: 'nose', to: 'salvage-yard', slowTurns: 60 },
  { from: 'nose', to: 'granary', slowTurns: 86 }, { from: 'nose', to: 'pump-station', slowTurns: 124 },
  { from: 'salvage-yard', to: 'bowl', slowTurns: 173 }, { from: 'salvage-yard', to: 'nose', slowTurns: 34 },
  { from: 'salvage-yard', to: 'granary', slowTurns: 69 }, { from: 'salvage-yard', to: 'pump-station', slowTurns: 66 },
  { from: 'granary', to: 'bowl', slowTurns: 93 }, { from: 'granary', to: 'nose', slowTurns: 78 },
  { from: 'granary', to: 'salvage-yard', slowTurns: 64 }, { from: 'granary', to: 'pump-station', slowTurns: 28 },
  { from: 'pump-station', to: 'bowl', slowTurns: 60 }, { from: 'pump-station', to: 'nose', slowTurns: 115 },
  { from: 'pump-station', to: 'salvage-yard', slowTurns: 64 }, { from: 'pump-station', to: 'granary', slowTurns: 29 },
];

const SHOP_SITES = Object.keys(SHOPS).map((id) => siteOf(id));

const BAND_FLOOR_RATIO = 11.9;

describe('haul pay and rush', () => {
  it('pays a standard haul at least the band floor over the estimated round trip', () => {
    for (const a of SHOP_SITES) {
      for (const b of SHOP_SITES) {
        if (a === b) continue;
        const turns = estimateTurns(a.pos, b.pos);
        expect(contractReward(turns, 0, false) / (2 * turns * EFFORT.wage[1])).toBeGreaterThanOrEqual(BAND_FLOOR_RATIO);
      }
    }
  });

  it('pays the same travel for a tier 1 and a tier 3 good, apart from the value cut', () => {
    const turns = estimateTurns(siteOf('bowl').pos, siteOf('granary').pos);
    const grain = contractReward(turns, 8 * GOODS.grain.value, false);
    const tools = contractReward(turns, 8 * GOODS.tools.value, false);
    expect(Math.abs(tools - grain - 8 * (GOODS.tools.value - GOODS.grain.value) * CONTRACTS.haul.valueShare)).toBeLessThanOrEqual(1);
  });

  it('prices the reported Bowl to Granary tools haul at the salvage wage with a window under the old 934 turns', () => {
    const turns = estimateTurns(siteOf('bowl').pos, siteOf('granary').pos);
    const reward = contractReward(turns, 8 * GOODS.tools.value, false);
    const OLD_TIER_RATIO = 2.2 / 0.37;
    const cut = 8 * GOODS.tools.value * CONTRACTS.haul.valueShare;
    expect(reward).toBeCloseTo(turns * EFFORT.wage[1] * CONTRACTS.haul.rewardFactor + cut, 0);
    expect(reward).toBeLessThan(turns * EFFORT.wage[1] * 5 * OLD_TIER_RATIO);
    expect(haulWindow(turns, false)).toBeLessThan(934);
  });

  it('keeps a rush window at least 1.1 times the slowest measured loaded drive on every pair', () => {
    for (const row of MEASURED_DRIVE) {
      const turns = estimateTurns(siteOf(row.from).pos, siteOf(row.to).pos);
      expect(haulWindow(turns, true), `${row.from} to ${row.to}`).toBeGreaterThanOrEqual(1.1 * row.slowTurns);
    }
  });

  it('pays a rush haul at least 1.5 times a standard one', () => {
    for (const a of SHOP_SITES) {
      const turns = estimateTurns(a.pos, siteOf('granary').pos);
      expect(contractReward(turns, 500, true)).toBeGreaterThanOrEqual(1.5 * contractReward(turns, 500, false));
    }
  });

  it('gives the shortest pair and a zero distance no more pay per estimated turn than the median pair', () => {
    const perTurn = (turns: number) => contractReward(turns, 0, false) / (2 * turns) / EFFORT.wage[1];
    const all = SHOP_SITES.flatMap((a) => SHOP_SITES.filter((b) => b !== a).map((b) => estimateTurns(a.pos, b.pos))).sort((x, y) => x - y);
    const median = perTurn(all[Math.floor(all.length / 2)]);
    expect(perTurn(all[0])).toBeLessThanOrEqual(median * 1.05);
    expect(perTurn(EFFORT.handlingTurns)).toBeLessThanOrEqual(median * 1.05);
  });

  it('gives a rush haul a shorter window and a higher reward than a standard one', () => {
    expect(haulWindow(100, true)).toBeLessThan(haulWindow(100, false));
    expect(contractReward(100, 50, true)).toBeGreaterThan(contractReward(100, 50, false));
  });

  it('rolls both rush and standard hauls, and leaves the main rng alone', () => {
    const w = emptyWorld();
    const before = w.rngState;
    const rolled = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      const c = rollContract(w, { id: 'bowl', pos: { x: 0, y: 0 } }, { legs: [{ good: 'salt', to: { id: 'nose', pos: { x: 100, y: 0 } }, units: 20 }] });
      if (c?.kind === 'haul') {
        rolled.add(c.rush);
        expect(c.window).toBe(haulWindow(estimateTurns({ x: 0, y: 0 }, { x: 100, y: 0 }), c.rush));
      }
    }
    expect(rolled.size).toBe(2);
    expect(w.rngState).toBe(before);
  });
});

describe('vehicleValue', () => {
  it('sums the chassis value and every part it carries', () => {
    const w = emptyWorld();
    const raider = addRaider(w, 'buggy');
    const bare = vehicleValue(raider);
    expect(bare).toBeGreaterThanOrEqual(chassisDef('buggy').value);
    stowPart(w, raider, makePart(w, 'plates', 0));
    expect(vehicleValue(raider)).toBeGreaterThan(bare);
  });
});

describe('rollContract', () => {
  const shop = { id: 'bowl', pos: { x: 0, y: 0 } };
  const places = [{ id: 'nose', pos: { x: 100, y: 0 } }];
  const legs = [{ good: 'salt', to: places[0], units: 20 }];

  it('is deterministic for the same rng state', () => {
    const w1 = emptyWorld();
    const w2 = emptyWorld();
    w1.marketRng.rngState = 42;
    w2.marketRng.rngState = 42;
    const c1 = rollContract(w1, shop, { legs });
    const c2 = rollContract(w2, shop, { legs });
    expect(c1).toEqual(c2);
  });

  it('returns null when every kind is impossible', () => {
    const w = emptyWorld();
    expect(rollContract(w, shop, {})).toBeNull();
  });

  it('never rolls a haul when no leg is short', () => {
    const w = emptyWorld();
    w.shops.bowl.goods.salt = 0;
    for (let i = 0; i < 50; i++) {
      const c = rollContract(w, { id: 'bowl', pos: siteOf('bowl').pos }, { procure: ['salt'] });
      expect(c?.kind).toBe('procure');
    }
  });

  it('sets a haul deadline at the current turn plus its window', () => {
    const w = emptyWorld();
    w.turn = 10;
    let haul: Contract | null = null;
    for (let i = 0; i < 50 && !haul; i++) {
      const c = rollContract(w, shop, { legs });
      if (c?.kind === 'haul') haul = c;
    }
    expect(haul).not.toBeNull();
    expect(haul!.deadline).toBe(w.turn + haul!.window);
  });

  it('takes a haul\'s tier from the hauled good, not a random roll', () => {
    const w = emptyWorld();
    let haul: Contract | null = null;
    for (let i = 0; i < 50 && !haul; i++) {
      const c = rollContract(w, shop, { legs: [{ good: 'tools', to: places[0], units: 20 }] });
      if (c?.kind === 'haul') haul = c;
    }
    expect(haul).not.toBeNull();
    expect(haul!.tier).toBe(GOODS.tools.tier);
  });
});

describe('isExpired', () => {
  it('is false at the deadline and true after it', () => {
    const w = emptyWorld();
    const c = { deadline: 20 } as Contract;
    w.turn = 20;
    expect(isExpired(w, c)).toBe(false);
    w.turn = 21;
    expect(isExpired(w, c)).toBe(true);
  });
});

describe('contract boards and delivery', () => {
  const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
  const nose = REGION.towns.find((t) => t.id === 'nose')!;
  const haul = (to: string, units: number): Contract => ({ id: 'ct-haul', shop: 'bowl', kind: 'haul', good: 'salt', units, to, reward: 10000, deadline: 500, window: 500, rush: false, tier: 1 });
  const order = (): Contract => ({ id: 'ct-procure', shop: 'bowl', kind: 'procure', good: 'salt', units: 3, cratePay: 800, reward: 4000, deadline: 500, window: 500, tier: 1 });

  function atBowlWithOffer(c: Contract): World {
    const w = emptyWorld(sitePads(bowl)[0]);
    w.shops.bowl.contracts = [c];
    return w;
  }

  it('posts contracts on every shop board at world creation', () => {
    const w = emptyWorld();
    for (const id of Object.keys(SHOPS)) expect(w.shops[id].contracts.length).toBeGreaterThan(0);
  });

  it('loads haul cargo on acceptance and pays on delivery at the destination', () => {
    let w = atBowlWithOffer(haul('nose', 3));
    w = acceptContract(w, 'ct-haul');
    expect(goodsCount(playerVehicle(w)).salt).toBe(3);
    expect(w.shops.bowl.contracts).toHaveLength(0);
    w.vehicles[0].pos = { ...sitePads(nose)[0] };
    const money = w.player.money;
    w = deliverContract(w, 'ct-haul');
    expect(w.player.money).toBe(money + 10000);
    expect(goodsCount(playerVehicle(w)).salt ?? 0).toBe(0);
    expect(w.player.contracts).toHaveLength(0);
  });

  it('takes haul cargo from the posting shop stock and delivers it into the destination stock', () => {
    let w = atBowlWithOffer(haul('nose', 3));
    const bowlSalt = w.shops.bowl.goods.salt;
    const noseSalt = w.shops.nose.goods.salt;
    w = acceptContract(w, 'ct-haul');
    expect(w.shops.bowl.goods.salt).toBe(bowlSalt - 3);
    w.vehicles[0].pos = { ...sitePads(nose)[0] };
    w = deliverContract(w, 'ct-haul');
    expect(w.shops.nose.goods.salt).toBe(noseSalt + 3);
  });

  it('blocks a haul the posting shop has too few crates for', () => {
    const w = atBowlWithOffer(haul('nose', 3));
    w.shops.bowl.goods.salt = 2;
    const c = w.shops.bowl.contracts[0];
    expect(haulBlocked(w, c)).toBe(true);
    expect(() => acceptContract(w, 'ct-haul')).toThrow();
  });

  it('leaves both stocks alone and the goods with the player when a haul fails', () => {
    let w = acceptContract(atBowlWithOffer(haul('nose', 3)), 'ct-haul');
    const stocks = { bowl: w.shops.bowl.goods.salt, nose: w.shops.nose.goods.salt };
    w = update(w, (d) => { d.turn += 501; advanceContracts(d); });
    expect({ bowl: w.shops.bowl.goods.salt, nose: w.shops.nose.goods.salt }).toEqual(stocks);
    expect(goodsCount(playerVehicle(w)).salt).toBe(3);
  });

  it('posts hauls only along graph edges, to a destination at or below its target, within the origin stock', () => {
    for (const seed of [1, 2, 3]) {
      const w = emptyWorld();
      w.marketRng.rngState = seed;
      for (const state of Object.values(w.shops)) for (const good of Object.keys(state.goods)) state.goods[good] = Math.floor(state.goods[good] / 2);
      for (const state of Object.values(w.shops)) {
        state.contracts = [];
        state.restockAt = w.turn;
      }
      advanceShops(w);
      const hauls = Object.values(w.shops).flatMap((s) => s.contracts).filter((c): c is Extract<Contract, { kind: 'haul' }> => c.kind === 'haul');
      expect(hauls.length).toBeGreaterThan(0);
      for (const c of hauls) {
        expect(graphEdges()).toContainEqual({ good: c.good, from: c.shop, to: c.to });
        expect(c.units).toBeLessThanOrEqual(w.shops[c.shop].goods[c.good]);
      }
    }
  });

  it('counts haul cargo as paid at its value, so selling it pays no trade XP', () => {
    const w = atBowlWithOffer(haul('nose', 3));
    w.vehicles[0].items = w.vehicles[0].items.filter((it) => it.kind !== 'good' || it.good !== 'salt');
    const next = acceptContract(w, 'ct-haul');
    expect(next.player.costBasis.salt).toBeCloseTo(goodValue('salt'));
  });

  it('pays the contract XP to the pool, targeting the posting shop', () => {
    let w = acceptContract(atBowlWithOffer(haul('nose', 3)), 'ct-haul');
    w.vehicles[0].pos = { ...sitePads(nose)[0] };
    const pool = w.player.xp;
    w = deliverContract(w, 'ct-haul');
    expect(practiceOf(w, 'contract')).toMatchObject([{ amount: 30, difficulty: null, target: 'bowl', xp: 30 }]);
    expect(w.player.xp).toBeCloseTo(pool + 30);
  });

  it('refuses a haul delivery away from its destination', () => {
    const w = acceptContract(atBowlWithOffer(haul('nose', 3)), 'ct-haul');
    expect(() => deliverContract(w, 'ct-haul')).toThrow(/Not parked at nose/);
  });

  it('refuses a haul that does not fit the grid and leaves the board unchanged', () => {
    const w = atBowlWithOffer(haul('nose', 999));
    expect(() => acceptContract(w, 'ct-haul')).toThrow(/free cells|noCargoRoom/);
    expect(w.shops.bowl.contracts).toHaveLength(1);
  });

  it('holds at most the active limit', () => {
    let w = atBowlWithOffer(order());
    w = update(w, (d) => {
      d.player.contracts = Array.from({ length: CONTRACTS.maxActive }, (_, i) => ({ ...order(), id: `held${i}` }));
    });
    expect(() => acceptContract(w, 'ct-procure')).toThrow(/already hold/);
  });

  it('charges nothing when a haul whose cargo is gone expires', () => {
    let w = acceptContract(atBowlWithOffer(haul('nose', 3)), 'ct-haul');
    w = update(w, (d) => { removeGoods(playerVehicle(d), 'salt', 3); });
    const money = w.player.money;
    w = update(w, (d) => { d.turn += 501; advanceContracts(d); });
    expect(w.player.contracts).toHaveLength(0);
    expect(w.player.money).toBe(money);
  });

  it('warns once when a held contract is two game hours from its deadline', () => {
    let w = acceptContract(atBowlWithOffer(haul('nose', 3)), 'ct-haul');
    const warned = (turn: number) =>
      update(w, (d) => { d.turn = turn; d.events = []; advanceContracts(d); }).events.filter((e) => e.t === 'contract' && e.outcome === 'expiring');
    const deadline = w.player.contracts[0].deadline;
    expect(warned(deadline - CONTRACTS.warnTurns - 1)).toHaveLength(0);
    expect(warned(deadline - CONTRACTS.warnTurns)).toHaveLength(1);
    expect(warned(deadline - CONTRACTS.warnTurns + 1)).toHaveLength(0);
  });

  it('drops an expired offer from the board every turn, before any restock', () => {
    let w = atBowlWithOffer(haul('nose', 3));
    w.shops.bowl.restockAt = 10000;
    w = update(w, (d) => { d.turn = 501; advanceShops(d); });
    expect(w.shops.bowl.contracts.find((c) => c.id === 'ct-haul')).toBeUndefined();
  });

  it('starts the clock at acceptance for every kind', () => {
    const offers: Contract[] = [{ ...haul('nose', 3), deadline: 400, window: 300 }, { ...order(), deadline: 400, window: 300 }];
    for (const offer of offers) {
      let w = atBowlWithOffer(offer);
      w = update(w, (d) => { d.turn = 350; });
      w = acceptContract(w, offer.id);
      expect(w.player.contracts[0].deadline).toBe(650);
    }
  });

  it('delivers a rush haul like a standard one', () => {
    let w = acceptContract(atBowlWithOffer({ ...(haul('nose', 3) as Extract<Contract, { kind: 'haul' }>), rush: true }), 'ct-haul');
    w.vehicles[0].pos = { ...sitePads(nose)[0] };
    const money = w.player.money;
    w = deliverContract(w, 'ct-haul');
    expect(w.player.money).toBe(money + 10000);
    expect(goodsCount(playerVehicle(w)).salt ?? 0).toBe(0);
  });

  it('refuses to accept an offer past its deadline', () => {
    let w = atBowlWithOffer(haul('nose', 3));
    w = update(w, (d) => { d.turn = 501; });
    expect(() => acceptContract(w, 'ct-haul')).toThrow(/expired/);
  });
});

describe('search contracts', () => {
  const parcels = (w: World) => playerVehicle(w).items.filter((it) => it.kind === 'parcel');

  function deliverParcel(d: World): void {
    const c = d.player.contracts.find((x): x is SearchContract => x.kind === 'search')!;
    const me = playerVehicle(d);
    me.items = me.items.filter((it) => it.kind !== 'parcel');
    c.delivered = true;
  }

  const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
  const posted = (target: string): Contract => ({
    id: 'ct-search', shop: 'bowl', kind: 'search', target, driver: 'Mack Holt', template: 'trader',
    lead: { at: { ...bowl.pos }, turn: 0 }, reward: searchReward(), deadline: 500, window: 500, tier: 1, delivered: false,
  });

  function worldWithTarget(): { w: World; target: Vehicle } {
    const w = emptyWorld(sitePads(bowl)[0]);
    const target = addVehicle(w, 'independent', 'hauler', [], { x: 300, y: 300 });
    target.brain = npcBrain('trader', target.pos, ['trader']);
    return { w, target };
  }

  function visit(w: World, v: Vehicle, shop: string, turn: number): void {
    const was = w.turn;
    w.turn = turn;
    remember(w, v, { kind: 'prices', shop, pressure: {} });
    w.turn = was;
  }

  const bowlSpot = { id: 'bowl', pos: bowl.pos };

  it('rolls a search for a driver seen at the counter, paying the fixed reward', () => {
    const { w, target } = worldWithTarget();
    w.turn = 100;
    for (let i = 0; i < 40; i++) {
      const c = rollContract(w, bowlSpot, { sought: [{ vehicle: target, seenTurn: 90 }] });
      expect(c).toMatchObject({ kind: 'search', target: target.id, driver: target.brain!.driver, template: 'trader', delivered: false, tier: 1, reward: searchReward(), lead: { at: bowl.pos, turn: 90 } });
      expect(c!.window).toBeGreaterThanOrEqual(CONTRACTS.search.durationTurns[0]);
      expect(c!.window).toBeLessThanOrEqual(CONTRACTS.search.durationTurns[1]);
    }
    expect(searchReward()).toBe(Math.round(CONTRACTS.search.rewardTurns * EFFORT.wage[1]));
  });

  it('posts a search at restock only for a fresh visitor who is not a raider', () => {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const { w, target } = worldWithTarget();
      const stale = addVehicle(w, 'independent', 'hauler', [], { x: 310, y: 300 });
      stale.brain = npcBrain('trader', stale.pos, ['trader']);
      const raider = addRaider(w, 'buggy');
      w.turn = 1000;
      visit(w, target, 'bowl', 1000 - 5);
      visit(w, stale, 'bowl', 1000 - CONTRACTS.search.freshTurns - 1);
      visit(w, raider, 'bowl', 1000 - 5);
      w.marketRng.rngState = seed;
      w.shops.bowl.contracts = [];
      initializeShops(w);
      for (const c of w.shops.bowl.contracts) if (c.kind === 'search') targets.add(c.target);
    }
    expect([...targets]).toHaveLength(1);
  });

  it('never posts a search for a driver still in sight of the shop', () => {
    const { w, target } = worldWithTarget();
    w.turn = 1000;
    visit(w, target, 'bowl', 1000 - 5);
    expect(searchCandidates(w, 'bowl', w.shops.bowl).map((c) => c.vehicle.id)).toEqual([target.id]);
    target.pos = { x: bowl.pos.x + CONTRACTS.search.awayTiles - 1, y: bowl.pos.y };
    expect(searchCandidates(w, 'bowl', w.shops.bowl)).toEqual([]);
  });

  it('leaves search out when nobody was seen at the shop', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { w } = worldWithTarget();
      w.marketRng.rngState = seed;
      initializeShops(w);
      expect(Object.values(w.shops).flatMap((s) => s.contracts).some((c) => c.kind === 'search')).toBe(false);
    }
  });

  it('refuses a second held search and townWork skips it', () => {
    const { w, target } = worldWithTarget();
    const second = { ...posted(target.id), id: 'ct-two' };
    w.shops.bowl.contracts = [posted(target.id), second];
    const next = acceptContract(w, 'ct-search');
    expect(() => acceptContract(next, 'ct-two')).toThrow('already searching');
    expect(townWork(next)).toBeNull();
  });

  it('lapses when the target is wrecked before the find', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const held = acceptContract(w, 'ct-search');
    const after = update(held, (d) => {
      d.vehicles = d.vehicles.filter((v) => v.id !== target.id);
      d.events = [];
      advanceContracts(d);
    });
    expect(after.player.contracts).toEqual([]);
    expect(after.events).toContainEqual(expect.objectContaining({ t: 'contract', outcome: 'lapsed' }));
    expect(after.player.money).toBe(held.player.money);
    expect(parcels(after)).toEqual([]);
  });

  it('drops a board offer once its lead is older than the fresh limit, and keeps it at the limit', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    w.turn = CONTRACTS.search.freshTurns;
    advanceShops(w);
    expect(w.shops.bowl.contracts.some((c) => c.id === 'ct-search')).toBe(true);
    w.turn = CONTRACTS.search.freshTurns + 1;
    advanceShops(w);
    expect(w.shops.bowl.contracts.some((c) => c.id === 'ct-search')).toBe(false);
  });

  it('refills the board at restock with a lead from a fresh visit', () => {
    const leads: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const { w, target } = worldWithTarget();
      w.shops.bowl.contracts = [posted(target.id)];
      w.turn = w.shops.bowl.restockAt;
      visit(w, target, 'bowl', w.turn - 5);
      w.marketRng.rngState = seed;
      advanceShops(w);
      expect(w.shops.bowl.contracts.some((c) => c.id === 'ct-search')).toBe(false);
      for (const c of w.shops.bowl.contracts) if (c.kind === 'search') leads.push(w.turn - c.lead.turn);
    }
    expect(leads.length).toBeGreaterThan(0);
    expect(Math.max(...leads)).toBeLessThanOrEqual(CONTRACTS.search.freshTurns);
  });

  it('leaves a held search with an old lead alone', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const held = acceptContract(w, 'ct-search');
    const after = update(held, (d) => {
      d.turn = CONTRACTS.search.freshTurns * 2;
      advanceShops(d);
      advanceContracts(d);
    });
    expect(after.player.contracts.map((c) => c.id)).toEqual(['ct-search']);
  });

  it('drops a board offer whose target is gone at restock', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    w.vehicles = w.vehicles.filter((v) => v.id !== target.id);
    w.turn = w.shops.bowl.restockAt;
    advanceShops(w);
    expect(w.shops.bowl.contracts.some((c) => c.id === 'ct-search')).toBe(false);
  });

  it('keeps a delivered search claimable after the target dies, and never fails it', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const held = update(acceptContract(w, 'ct-search'), (d) => deliverParcel(d));
    const after = update(held, (d) => {
      d.vehicles = d.vehicles.filter((v) => v.id !== target.id);
      d.turn = 5000;
      d.events = [];
      advanceContracts(d);
    });
    expect(after.player.contracts).toHaveLength(1);
    expect(after.events).toEqual([]);
  });

  it('fails at the deadline with no money change when undelivered, and voids the parcel', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const held = acceptContract(w, 'ct-search');
    const after = update(held, (d) => {
      d.turn = held.player.contracts[0].deadline + 1;
      d.events = [];
      advanceContracts(d);
    });
    expect(after.player.contracts).toEqual([]);
    expect(after.events).toEqual([expect.objectContaining({ t: 'contract', outcome: 'failed' })]);
    expect(after.player.money).toBe(held.player.money);
    expect(parcels(after)).toEqual([]);
  });

  it('pays once with XP at the posting shop after the handover', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const found = update(acceptContract(w, 'ct-search'), (d) => deliverParcel(d));
    const money = found.player.money;
    const paid = deliverContract(found, 'ct-search');
    expect(paid.player.money).toBe(money + searchReward());
    expect(paid.player.contracts).toEqual([]);
    expect(practiceOf(paid, 'contract')).toMatchObject([{ target: 'bowl', xp: contractXp(posted(target.id)) }]);
    expect(() => deliverContract(paid, 'ct-search')).toThrow();
  });

  it('refuses a claim before the handover', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    expect(() => deliverContract(acceptContract(w, 'ct-search'), 'ct-search')).toThrow('not met yet');
  });

  it('loads exactly one parcel for the search on accept', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const held = acceptContract(w, 'ct-search');
    expect(parcels(held)).toEqual([expect.objectContaining({ kind: 'parcel', contract: 'ct-search' })]);
    expect(parcels(w)).toEqual([]);
  });

  it('refuses a search with no free cargo cell, and townWork skips it', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const me = playerVehicle(w);
    while (addGoods(w, me, 'scrap', 1) === 1);
    expect(searchRefusal(w, posted(target.id))).toBe('noCargoRoom');
    expect(() => acceptContract(w, 'ct-search')).toThrow('noCargoRoom');
    expect(townWork(w)).toBeNull();
  });

  it('throws when a held search loses its parcel', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const held = acceptContract(w, 'ct-search');
    expect(() => update(held, (d) => {
      const me = playerVehicle(d);
      me.items = me.items.filter((it) => it.kind !== 'parcel');
      advanceContracts(d);
    })).toThrow('parcel of search ct-search is missing');
  });

  it('throws on a parcel with no open search', () => {
    const { w } = worldWithTarget();
    expect(() => update(w, (d) => {
      stowParcel(playerVehicle(d), { id: 'i-stray', x: 0, y: 0, rot: 0, kind: 'parcel', contract: 'ct-gone' });
      advanceContracts(d);
    })).toThrow('has no open search');
  });

  it('refuses a claim away from the posting shop', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const found = update(acceptContract(w, 'ct-search'), (d) => deliverParcel(d));
    found.vehicles[0].pos = { x: 500, y: 500 };
    expect(() => deliverContract(found, 'ct-search')).toThrow();
  });

  it('moves the lead only to a newer sighting', () => {
    const { w, target } = worldWithTarget();
    w.shops.bowl.contracts = [posted(target.id)];
    const held = acceptContract(w, 'ct-search');
    const newer = update(held, (d) => noteSearchLead(d, { x: 10, y: 20 }, 50));
    expect(newer.player.contracts[0]).toMatchObject({ lead: { at: { x: 10, y: 20 }, turn: 50 } });
    const older = update(newer, (d) => noteSearchLead(d, { x: 99, y: 99 }, 20));
    expect(older.player.contracts[0]).toMatchObject({ lead: { at: { x: 10, y: 20 }, turn: 50 } });
  });

});
