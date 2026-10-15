import { describe, expect, it } from 'vitest';
import { CONTRACTS, EFFORT, SHOPS } from '../data/market';
import { chassisDef } from '../data/chassis';
import { GOODS } from '../data/goods';
import { graphEdges } from '../data/market';
import { PARTS } from '../data/parts';
import { REGION } from '../data/region';
import { playerVehicle } from './damage';
import { makePart } from './factory';
import { corePart, goodsCount, mountedItems } from './grid';
import { addGoods, stowParcel, stowPart } from './inventory';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain, practiceOf, testDrive } from './testkit';
import { vehicleStats } from './stats';
import { fireWeapons, resolveDestroyed } from './combat';
import type { GameEvent, Vehicle, World } from './types';
import { remember } from './memory';
import { townWork } from './dialogue-rules';
import { endTurn, update } from './world';
import {
  acceptContract,
  advanceContracts,
  advanceShops,
  haulBlocked,
  bountyReward,
  deliverContract,
  goodValue,
  bountyLapsed,
  contractReward,
  estimateTurns,
  fetchReward,
  contractXp,
  noteSearchLead,
  searchReward,
  haulPenalty,
  haulWindow,
  initializeShops,
  isExpired,
  playerDefeats,
  partPristineBuyPrice,
  rollContract,
  siteOf,
  vehicleValue,
  searchCandidates,
  searchRefusal,
  type Contract,
  type SearchContract,
} from './market';

function addRaider(w: World, templateId: string, pos = { x: 5, y: 5 }): Vehicle {
  const v = addVehicle(w, 'raiders', 'buggy', [], pos);
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
      const c = rollContract(w, { id: 'bowl', pos: { x: 0, y: 0 } }, [{ good: 'salt', to: { id: 'nose', pos: { x: 100, y: 0 } }, units: 20 }], [], []);
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

describe('bountyReward', () => {
  it('pays turns of tier 1 wage set per raider template, more for a gunwagon than an outrider', () => {
    expect(bountyReward('buggy')).toBe(Math.round(CONTRACTS.bounty.rewardTurns.buggy * EFFORT.wage[1]));
    expect(bountyReward('gunwagon')).toBeGreaterThan(bountyReward('buggy'));
  });

  it('throws for a template with no bounty reward', () => {
    expect(() => bountyReward('trader')).toThrow(/trader/);
  });
});

describe('contractXp', () => {
  it('pays fetch XP for the search fee only, not the part price', () => {
    const cheap: Contract = { id: 'a', shop: 'bowl', kind: 'fetch', defId: 'panniers', reward: fetchReward('panniers', 1), deadline: 500, window: 500, tier: 1 };
    const dear: Contract = { ...cheap, defId: 'cage', reward: fetchReward('cage', 1) };
    expect(contractXp(cheap)).toBe(contractXp(dear));
    expect(contractXp(cheap)).toBe(Math.round(CONTRACTS.fetch.searchFeeTurns * EFFORT.wage[1] * CONTRACTS.fetch.xpPerEffort));
  });
});

describe('fetchReward', () => {
  it('exceeds the part\'s buy price by exactly the search fee', () => {
    for (const defId of ['mg', 'plates', 'stockEngine']) {
      for (const tier of [1, 2, 3] as const) {
        const fee = Math.round(CONTRACTS.fetch.searchFeeTurns * EFFORT.wage[tier]);
        expect(fetchReward(defId, tier)).toBe(partPristineBuyPrice(defId) + fee);
      }
    }
  });

  it('pays more for a pricier part at the same tier', () => {
    expect(PARTS.cage.value).toBeGreaterThan(PARTS.stockEngine.value);
    expect(PARTS.cage.tier).toBe(PARTS.stockEngine.tier);
    const cheap = fetchReward('stockEngine', PARTS.stockEngine.tier);
    const dear = fetchReward('cage', PARTS.cage.tier);
    expect(dear).toBeGreaterThan(cheap);
  });
});

describe('rollContract', () => {
  const shop = { id: 'bowl', pos: { x: 0, y: 0 } };
  const places = [{ id: 'nose', pos: { x: 100, y: 0 } }];
  const legs = [{ good: 'salt', to: places[0], units: 20 }];
  const partDefIds = ['mg'];

  it('is deterministic for the same rng state', () => {
    const w1 = emptyWorld();
    const w2 = emptyWorld();
    w1.marketRng.rngState = 42;
    w2.marketRng.rngState = 42;
    const raider = addRaider(w1, 'buggy');
    addRaider(w2, 'buggy');
    const c1 = rollContract(w1, shop, legs, partDefIds, [raider]);
    const c2 = rollContract(w2, shop, legs, partDefIds, [w2.vehicles.find((v) => v.faction === 'raiders')!]);
    expect(c1).toEqual(c2);
  });

  it('returns null when every kind is impossible', () => {
    const w = emptyWorld();
    expect(rollContract(w, shop, [], [], [])).toBeNull();
  });

  it('never rolls a bounty when there are no raiders', () => {
    const w = emptyWorld();
    for (let i = 0; i < 50; i++) {
      const c = rollContract(w, shop, legs, partDefIds, []);
      expect(c?.kind).not.toBe('bounty');
    }
  });

  it('never rolls a haul when no leg is short', () => {
    const w = emptyWorld();
    for (let i = 0; i < 50; i++) {
      const c = rollContract(w, shop, [], partDefIds, []);
      expect(c?.kind).not.toBe('haul');
    }
  });

  it('never rolls a fetch when there are no part defs', () => {
    const w = emptyWorld();
    for (let i = 0; i < 50; i++) {
      const c = rollContract(w, shop, legs, [], []);
      expect(c?.kind).not.toBe('fetch');
    }
  });

  it('sets a haul deadline at the current turn plus its window', () => {
    const w = emptyWorld();
    w.turn = 10;
    let haul: Contract | null = null;
    for (let i = 0; i < 50 && !haul; i++) {
      const c = rollContract(w, shop, legs, [], []);
      if (c?.kind === 'haul') haul = c;
    }
    expect(haul).not.toBeNull();
    expect(haul!.deadline).toBe(w.turn + haul!.window);
  });

  it('takes a haul\'s tier from the hauled good, not a random roll', () => {
    const w = emptyWorld();
    let haul: Contract | null = null;
    for (let i = 0; i < 50 && !haul; i++) {
      const c = rollContract(w, shop, [{ good: 'tools', to: places[0], units: 20 }], [], []);
      if (c?.kind === 'haul') haul = c;
    }
    expect(haul).not.toBeNull();
    expect(haul!.tier).toBe(GOODS.tools.tier);
  });

  it('takes a fetch\'s tier from the fetched part, not a random roll', () => {
    const w = emptyWorld();
    let fetchContract: Contract | null = null;
    for (let i = 0; i < 50 && !fetchContract; i++) {
      const c = rollContract(w, shop, [], ['workhorseDiesel'], []);
      if (c?.kind === 'fetch') fetchContract = c;
    }
    expect(fetchContract).not.toBeNull();
    expect(fetchContract!.tier).toBe(PARTS.workhorseDiesel.tier);
  });

  it('takes a bounty\'s tier from the highest tier fitted to the target', () => {
    const w = emptyWorld();
    const raider = addRaider(w, 'buggy');
    const stowed = stowPart(w, raider, makePart(w, 'plates', 0));
    expect(stowed).toBe(true);
    let bounty: Contract | null = null;
    for (let i = 0; i < 50 && !bounty; i++) {
      const c = rollContract(w, shop, [], [], [raider]);
      if (c?.kind === 'bounty') bounty = c;
    }
    expect(bounty).not.toBeNull();
    expect(bounty!.tier).toBe(PARTS.plates.tier);
  });

  it('pays a bounty the same reward whatever its random deadline window', () => {
    const w = emptyWorld();
    const raider = addRaider(w, 'buggy');
    const rewards = new Set<number>();
    const deadlines = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const c = rollContract(w, shop, [], [], [raider]);
      if (c?.kind === 'bounty') {
        rewards.add(c.reward);
        deadlines.add(c.deadline);
      }
    }
    expect(deadlines.size).toBeGreaterThan(1);
    expect(rewards.size).toBe(1);
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

describe('bounty settlement', () => {
  const held = (id: string, template = 'buggy', shop = 'bowl'): Contract =>
    ({ id, shop, kind: 'bounty', template, reward: 100, deadline: 900, window: 900, tier: 1, fulfilled: false });

  function settle(w: World, contracts: Contract[], events: GameEvent[], removed: Vehicle[] = []): World {
    return update(w, (d) => {
      d.player.contracts = contracts;
      d.removed = removed;
      d.events = events;
      advanceContracts(d);
    });
  }

  const done = (w: World) => w.events.flatMap((e) => (e.t === 'contract' && e.outcome === 'fulfilled' ? [e.contract.id] : []));

  it('counts the player\'s kill of any truck of the template', () => {
    const w = emptyWorld();
    const outrider = addRaider(w, 'buggy');
    const other = addRaider(w, 'warband');
    const kill = (v: Vehicle, by: string) => {
      w.removed = [v];
      w.events = [{ t: 'destroyed', vehicle: v.id, by }];
      return playerDefeats(w);
    };
    expect(kill(outrider, w.player.vehicleId)).toEqual(new Map([['buggy', 1]]));
    expect(kill(outrider, 'other-npc')).toEqual(new Map());
    expect(kill(other, w.player.vehicleId)).toEqual(new Map([['warband', 1]]));
  });

  it('counts the player\'s knockout of a truck of the template, which stays in the world', () => {
    const w = emptyWorld();
    const outrider = addRaider(w, 'buggy');
    w.removed = [];
    w.events = [{ t: 'npcKnockout', vehicle: outrider.id, by: 'other-npc' }];
    expect(playerDefeats(w)).toEqual(new Map());
    w.events = [{ t: 'npcKnockout', vehicle: outrider.id, by: w.player.vehicleId }];
    expect(playerDefeats(w)).toEqual(new Map([['buggy', 1]]));
  });

  it('two knockouts in one turn fulfil two held bounties from two shops, each paid when claimed', () => {
    const w = emptyWorld();
    const a = addRaider(w, 'buggy');
    const b = addRaider(w, 'buggy', { x: 20, y: 5 });
    const me = w.player.vehicleId;
    const after = settle(w, [held('b1', 'buggy', 'bowl'), held('b2', 'buggy', 'nose')], [
      { t: 'npcKnockout', vehicle: a.id, by: me },
      { t: 'npcKnockout', vehicle: b.id, by: me },
    ]);
    expect(done(after)).toEqual(['b1', 'b2']);
    expect(after.player.money).toBe(w.player.money);
    expect(after.player.contracts.map((c) => c.kind === 'bounty' && c.fulfilled)).toEqual([true, true]);
  });

  it('one knockout fulfils only the first held bounty', () => {
    const w = emptyWorld();
    const a = addRaider(w, 'buggy');
    addRaider(w, 'buggy', { x: 20, y: 5 });
    const after = settle(w, [held('b1'), held('b2')], [{ t: 'npcKnockout', vehicle: a.id, by: w.player.vehicleId }]);
    expect(done(after)).toEqual(['b1']);
    expect(after.player.contracts.map((c) => c.kind === 'bounty' && c.fulfilled)).toEqual([true, false]);
  });

  it('a wreck of a truck already lying defeated or heading home finishes nothing, and of one still fighting finishes one', () => {
    for (const phase of ['out', 'retreat'] as const) {
      const w = emptyWorld();
      const a = addRaider(w, 'buggy');
      addRaider(w, 'buggy', { x: 20, y: 5 });
      a.defeat = { phase, turns: 0, unseen: 0, foes: [], gaveUp: false };
      w.vehicles = w.vehicles.filter((v) => v.id !== a.id);
      const after = settle(w, [held('b1')], [{ t: 'destroyed', vehicle: a.id, by: w.player.vehicleId }], [a]);
      expect(done(after)).toEqual([]);
      delete a.defeat;
      expect(done(settle(w, [held('b1')], [{ t: 'destroyed', vehicle: a.id, by: w.player.vehicleId }], [a]))).toEqual(['b1']);
    }
  });

  it('a defeat of another template, or by another truck, finishes nothing', () => {
    const w = emptyWorld();
    const gunwagon = addRaider(w, 'gunwagon');
    const outrider = addRaider(w, 'buggy', { x: 20, y: 5 });
    expect(done(settle(w, [held('b1')], [{ t: 'npcKnockout', vehicle: gunwagon.id, by: w.player.vehicleId }]))).toEqual([]);
    expect(done(settle(w, [held('b1')], [{ t: 'npcKnockout', vehicle: outrider.id, by: 'other-npc' }]))).toEqual([]);
  });

  it('a bounty fulfilled on its deadline turn is met, and one past it fails', () => {
    const w = emptyWorld();
    const outrider = addRaider(w, 'buggy');
    w.turn = 900;
    expect(done(settle(w, [held('b1')], [{ t: 'npcKnockout', vehicle: outrider.id, by: w.player.vehicleId }]))).toEqual(['b1']);
    w.turn = 901;
    const late = settle(w, [held('b1')], []);
    expect(late.events).toContainEqual(expect.objectContaining({ t: 'contract', outcome: 'failed' }));
  });

  it('throws on a defeat of a truck in neither list', () => {
    const w = emptyWorld();
    w.events = [{ t: 'npcKnockout', vehicle: 'ghost', by: w.player.vehicleId }];
    expect(() => playerDefeats(w)).toThrow(/ghost/);
  });
});

describe('bountyLapsed', () => {
  it('is true once no truck of the template is left in the world', () => {
    const w = emptyWorld();
    const first = addRaider(w, 'buggy');
    const second = addRaider(w, 'buggy', { x: 20, y: 5 });
    const c = { kind: 'bounty', template: 'buggy' } as Contract;
    w.vehicles = w.vehicles.filter((v) => v.id !== first.id);
    expect(bountyLapsed(w, c)).toBe(false);
    w.vehicles = w.vehicles.filter((v) => v.id !== second.id);
    expect(bountyLapsed(w, c)).toBe(true);
  });
});

describe('haulPenalty', () => {
  it('owes the full value of the hauled units', () => {
    const c = { kind: 'haul', units: 5 } as Extract<Contract, { kind: 'haul' }>;
    expect(haulPenalty(c, 20)).toBe(100);
  });
});

describe('contract boards and delivery', () => {
  const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
  const nose = REGION.towns.find((t) => t.id === 'nose')!;
  const haul = (to: string, units: number): Contract => ({ id: 'ct-haul', shop: 'bowl', kind: 'haul', good: 'salt', units, to, reward: 10000, deadline: 500, window: 500, rush: false, tier: 1 });
  const fetch = (): Contract => ({ id: 'ct-fetch', shop: 'bowl', kind: 'fetch', defId: 'mg', reward: fetchReward('mg', 1), deadline: 500, window: 500, tier: 1 });

  function atBowlWithOffer(c: Contract): World {
    const w = emptyWorld(sitePads(bowl)[0]);
    w.shops.bowl.contracts = [c];
    return w;
  }

  it('posts contracts on every shop board at world creation', () => {
    const w = emptyWorld();
    for (const id of Object.keys(SHOPS)) expect(w.shops[id].contracts.length).toBeGreaterThan(0);
  });

  it('never posts a fetch for a part the shop has in stock', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = emptyWorld();
      w.marketRng.rngState = seed;
      initializeShops(w);
      for (const state of Object.values(w.shops)) {
        const stocked = new Set(state.stock.map((p) => p.defId));
        for (const c of state.contracts) if (c.kind === 'fetch') expect(stocked.has(c.defId)).toBe(false);
      }
    }
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

  it('takes a fetch part from garage storage', () => {
    let w = acceptContract(atBowlWithOffer(fetch()), 'ct-fetch');
    w = update(w, (d) => { d.player.storage.push(makePart(d, 'mg', 1)); });
    const money = w.player.money;
    w = deliverContract(w, 'ct-fetch');
    expect(w.player.storage).toHaveLength(0);
    expect(w.player.money).toBe(money + fetchReward('mg', 1));
  });

  it('refuses a fetch part worn past CONTRACTS.fetch.maxWear', () => {
    let w = acceptContract(atBowlWithOffer(fetch()), 'ct-fetch');
    w = update(w, (d) => { d.player.storage.push(makePart(d, 'mg', CONTRACTS.fetch.maxWear + 1)); });
    expect(() => deliverContract(w, 'ct-fetch')).toThrow(/spare/);
  });

  it('refuses a fetch part at 0 HP', () => {
    let w = acceptContract(atBowlWithOffer(fetch()), 'ct-fetch');
    w = update(w, (d) => {
      const part = makePart(d, 'mg', 0);
      part.hp = 0;
      d.player.storage.push(part);
    });
    expect(() => deliverContract(w, 'ct-fetch')).toThrow(/spare/);
  });

  it('refuses a junk fetch part', () => {
    let w = acceptContract(atBowlWithOffer(fetch()), 'ct-fetch');
    w = update(w, (d) => {
      const part = { ...makePart(d, 'mg', 0), wear: 99, hp: 0 };
      d.player.storage.push(part);
    });
    expect(() => deliverContract(w, 'ct-fetch')).toThrow(/spare/);
  });

  it('refuses a fetch with no spare part of that type', () => {
    const w = acceptContract(atBowlWithOffer(fetch()), 'ct-fetch');
    expect(() => deliverContract(w, 'ct-fetch')).toThrow(/spare/);
  });

  it('holds at most the active limit', () => {
    let w = atBowlWithOffer(fetch());
    w = update(w, (d) => {
      d.player.contracts = Array.from({ length: CONTRACTS.maxActive }, (_, i) => ({ ...fetch(), id: `held${i}` }));
    });
    expect(() => acceptContract(w, 'ct-fetch')).toThrow(/already hold/);
  });

  it('charges the goods value when a haul expires', () => {
    let w = acceptContract(atBowlWithOffer(haul('nose', 3)), 'ct-haul');
    const money = w.player.money;
    w = update(w, (d) => { d.turn += 501; advanceContracts(d); });
    expect(w.player.contracts).toHaveLength(0);
    expect(w.player.money).toBe(money - haulPenalty(haul('nose', 3) as Extract<Contract, { kind: 'haul' }>, goodValue('salt')));
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

  const bounty = (id: string): Contract =>
    ({ id, shop: 'bowl', kind: 'bounty', template: 'buggy', reward: 400, deadline: 900, window: 900, tier: 2, fulfilled: false });

  function holding(...held: Contract[]): { w: World; raider: Vehicle } {
    const w = emptyWorld(sitePads(bowl)[0]);
    const raider = addRaider(w, 'buggy', { x: 50, y: 50 });
    w.player.contracts = held;
    return { w, raider };
  }

  const kill = (raider: Vehicle, gone = true) => (d: World) => {
    if (gone) d.vehicles = d.vehicles.filter((v) => v.id !== raider.id);
    d.removed = gone ? [raider] : [];
    d.events = [{ t: 'destroyed', vehicle: raider.id, by: d.player.vehicleId }];
    advanceContracts(d);
  };

  const fulfilledOf = (w: World) => w.player.contracts.map((c) => c.kind === 'bounty' && c.fulfilled);

  it('marks a bounty fulfilled on the player kill, pays nothing yet, and keeps it though the target is gone', () => {
    const { w: base, raider } = holding(bounty('ct-b'));
    const w = update(base, kill(raider));
    expect(w.player.money).toBe(base.player.money);
    expect(practiceOf(w, 'contract')).toEqual([]);
    expect(fulfilledOf(w)).toEqual([true]);
    expect(w.events).toContainEqual({ t: 'contract', contract: { ...bounty('ct-b'), fulfilled: true }, outcome: 'fulfilled' });
  });

  it('lapses an unfulfilled bounty when the target leaves', () => {
    const { w: base, raider } = holding(bounty('ct-b'));
    const lapsed = update(base, (d) => {
      d.vehicles = d.vehicles.filter((v) => v.id !== raider.id);
      advanceContracts(d);
    });
    expect(lapsed.player.money).toBe(base.player.money);
    expect(lapsed.player.contracts).toHaveLength(0);
  });

  it('marks at most one held bounty per kill of the same template', () => {
    const { w: base, raider } = holding(bounty('ct-b1'), bounty('ct-b2'), bounty('ct-b3'));
    const w = update(base, kill(raider));
    expect(w.player.money).toBe(base.player.money);
    expect(w.player.contracts.map((c) => c.id)).toEqual(['ct-b1']);
    expect(fulfilledOf(w)).toEqual([true]);
  });

  it('marks the next same-template bounty on a later kill, never the fulfilled one again', () => {
    const { w: base, raider } = holding(bounty('ct-b1'), bounty('ct-b2'));
    const once = update(base, kill(raider, false));
    expect(fulfilledOf(once)).toEqual([true, false]);
    const twice = update(once, kill(raider, false));
    expect(fulfilledOf(twice)).toEqual([true, true]);
    expect(twice.events.filter((e) => e.t === 'contract' && e.outcome === 'fulfilled')).toHaveLength(1);
  });

  it('pays the reward and contract XP once when a fulfilled bounty is claimed at the shop that posted it', () => {
    const { w: base, raider } = holding(bounty('ct-b'));
    const met = update(base, kill(raider));
    const w = deliverContract(met, 'ct-b');
    expect(w.player.money).toBe(base.player.money + 400);
    expect(practiceOf(w, 'contract')).toMatchObject([{ amount: contractXp(bounty('ct-b')), target: 'bowl' }]);
    expect(w.player.contracts).toHaveLength(0);
    expect(() => deliverContract(w, 'ct-b')).toThrow(/No active contract/);
  });

  it('refuses a claim away from the shop that posted the bounty', () => {
    const { w: base, raider } = holding({ ...bounty('ct-b'), shop: 'nose' });
    const met = update(base, kill(raider));
    expect(() => deliverContract(met, 'ct-b')).toThrow(/Not parked at nose/);
  });

  it('refuses a claim on a bounty not met yet', () => {
    const { w } = holding(bounty('ct-b'));
    expect(() => deliverContract(w, 'ct-b')).toThrow(/not met/);
  });

  it('keeps a bounty fulfilled on its deadline claimable long after, with no warning or failure', () => {
    const { w: base, raider } = holding(bounty('ct-b'));
    let w = update(base, (d) => { d.turn = 900; });
    w = update(w, kill(raider));
    for (const turn of [900 - CONTRACTS.warnTurns, 901, 950]) {
      w = update(w, (d) => { d.turn = turn; d.events = []; advanceContracts(d); });
      expect(w.events.filter((e) => e.t === 'contract')).toEqual([]);
    }
    expect(deliverContract(w, 'ct-b').player.money).toBe(base.player.money + 400);
  });

  it('fails an unfulfilled bounty past its deadline and pays nothing', () => {
    const { w: base } = holding(bounty('ct-b'));
    const w = update(base, (d) => { d.turn = 901; advanceContracts(d); });
    expect(w.player.contracts).toHaveLength(0);
    expect(w.player.money).toBe(base.player.money);
    expect(w.events.some((e) => e.t === 'contract' && e.outcome === 'failed')).toBe(true);
  });

  it('never posts two bounties for the same template on one board', () => {
    const w = emptyWorld();
    addRaider(w, 'buggy', { x: 1, y: 1 });
    addRaider(w, 'buggy', { x: 2, y: 2 });
    addRaider(w, 'buggy', { x: 3, y: 3 });
    for (const seed of [1, 2, 3, 4, 5]) {
      w.marketRng.rngState = seed;
      initializeShops(w);
      for (const state of Object.values(w.shops)) {
        const templates = state.contracts.filter((c) => c.kind === 'bounty').map((c) => c.template);
        expect(new Set(templates).size).toBe(templates.length);
      }
    }
  });

  it('drops an expired offer from the board every turn, before any restock', () => {
    let w = atBowlWithOffer(haul('nose', 3));
    w.shops.bowl.restockAt = 10000;
    w = update(w, (d) => { d.turn = 501; advanceShops(d); });
    expect(w.shops.bowl.contracts.find((c) => c.id === 'ct-haul')).toBeUndefined();
  });

  it('starts the clock at acceptance for every kind', () => {
    const offers: Contract[] = [{ ...haul('nose', 3), deadline: 400, window: 300 }, { ...fetch(), deadline: 400, window: 300 }];
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

describe('bounties in a real fight', () => {
  const bounty = (id: string): Contract => ({ id, shop: 'bowl', kind: 'bounty', template: 'buggy', reward: 100, deadline: 900, window: 900, tier: 1, fulfilled: false });
  const contractEvents = (w: World) => w.events.filter((e) => e.t === 'contract');

  function sharedFight(seed: number) {
    const w = emptyWorld();
    w.rngState = seed;
    const me = w.vehicles[0];
    const raider = addVehicle(w, 'raiders', 'buggy', ['mg', 'stockEngine'], { x: 33, y: 30 }, Math.PI);
    raider.brain = npcBrain('buggy', raider.pos, ['raider']);
    const ally = addVehicle(w, 'bowl', 'buggy', ['mg', 'stockEngine'], { x: 33, y: 33 }, -Math.PI / 2);
    ally.brain = npcBrain('bowlFarmer', ally.pos, ['lawman']);
    for (const it of mountedItems(raider)) if (it.part.id !== corePart(raider, 'cab').id && it.part.defId !== 'stockEngine') it.part.hp = 0;
    corePart(raider, 'cab').hp = 1;
    me.weaponOrders[vehicleStats(w, me).weapons[0].part.id] = { targetId: raider.id, aim: corePart(raider, 'cab').id };
    ally.weaponOrders[vehicleStats(w, ally).weapons[0].part.id] = { targetId: raider.id, aim: 'body' };
    w.player.contracts = [bounty('b1'), bounty('b2')];
    return { w, raider, ally };
  }

  function playerKnockout() {
    for (let seed = 1; seed <= 40; seed++) {
      const { w, raider, ally } = sharedFight(seed * 7919);
      const after = update(w, (d) => {
        fireWeapons(d);
        resolveDestroyed(d);
        advanceContracts(d);
      });
      const allyHit = after.events.some((e) => e.t === 'shot' && e.shooter === ally.id && e.rounds.some((r) => r.struck === raider.id && r.hits.some((h) => h.damage > 0)));
      const ko = after.events.some((e) => e.t === 'npcKnockout' && e.vehicle === raider.id && e.by === w.player.vehicleId);
      if (allyHit && ko) return { w, after, raider };
    }
    throw new Error('No seed gives a shared knockout');
  }

  it('a shared fight the player wins fulfils one held bounty that turn, and the next turn fulfils nothing more', () => {
    const { w, after } = playerKnockout();
    expect(contractEvents(after).map((e) => e.t === 'contract' && [e.contract.id, e.outcome])).toEqual([['b1', 'fulfilled']]);
    expect(after.player.money).toBe(w.player.money);
    const next = endTurn(after, testDrive);
    expect(contractEvents(next)).toEqual([]);
    expect(next.player.money).toBe(after.player.money);
  });

  it('shooting the knocked-out raider into a wreck fulfils no second held bounty', () => {
    const { after: out, raider } = playerKnockout();
    let w = out;
    const money = w.player.money;
    for (let turn = 0; turn < 30 && w.vehicles.some((v) => v.id === raider.id); turn++) {
      w = update(w, (d) => {
        const me = playerVehicle(d);
        me.weaponOrders[vehicleStats(d, me).weapons[0].part.id] = { targetId: raider.id, aim: 'body' };
      });
      w = endTurn(w, testDrive);
      expect(contractEvents(w).filter((e) => e.t === 'contract' && e.outcome === 'fulfilled')).toEqual([]);
    }
    expect(w.vehicles.some((v) => v.id === raider.id)).toBe(false);
    expect(w.player.money).toBe(money);
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
    const target = addVehicle(w, 'traders', 'hauler', [], { x: 300, y: 300 });
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
      const c = rollContract(w, bowlSpot, [], [], [], [], [{ vehicle: target, seenTurn: 90 }]);
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
      const stale = addVehicle(w, 'traders', 'hauler', [], { x: 310, y: 300 });
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
