import { describe, expect, it } from 'vitest';
import { CONTRACTS, CRIME } from '../data/market';
import { REGION } from '../data/region';
import { advanceCrimes, collectBounty, fileEmbezzlement, openCasesOn, owedBy, payBounty, takeHunt } from './crime';
import { playerVehicle } from './damage';
import { sellGood, sellTruckGood } from './economy';
import { goodsCount } from './grid';
import { addGoods, dumpItem, removeGoods } from './inventory';
import { acceptContract, advanceContracts, deliverContract, goodValue, isLate, lateBy, spareGoods, type Contract } from './market';
import { bountyTerms } from './marshals';
import { fairM } from './money';
import { sitePads } from './sites';
import { addVehicle, emptyWorld } from './testkit';
import type { CrimeCase, GameEvent, World } from './types';
import { update } from './world';
import { BOUNTY } from '../data/market';

type Haul = Extract<Contract, { kind: 'haul' }>;

const nose = REGION.towns.find((t) => t.id === 'nose')!;
const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const haulOf = (over: Partial<Haul> = {}): Haul => ({ id: 'ct-haul', shop: 'bowl', kind: 'haul', good: 'salt', units: 3, to: 'nose', reward: 100, deadline: 500, window: 400, rush: false, tier: 1, ...over });

function holding(contract: Haul, crates = contract.units, at = bowl): World {
  const w = emptyWorld(sitePads(at)[0]);
  w.turn = 300;
  w.player.contracts = [contract];
  const me = playerVehicle(w);
  addGoods(w, me, contract.good, crates);
  return w;
}

const atTurn = (w: World, turn: number): World => update(w, (d) => { d.events = []; d.turn = turn; advanceContracts(d); });
const moveTo = (w: World, site: typeof nose): World => update(w, (d) => { playerVehicle(d).pos = { ...sitePads(site)[0] }; });
const moneyEvents = (events: GameEvent[]) => events.filter((e) => e.t === 'money');
const salt = (w: World) => goodsCount(playerVehicle(w)).salt ?? 0;

describe('a haul past its deadline', () => {
  it('stays held, says so once, and moves no money', () => {
    const before = holding(haulOf());
    const w = atTurn(before, 501);

    expect(w.player.contracts.map((c) => c.id)).toEqual(['ct-haul']);
    expect(isLate(w, w.player.contracts[0])).toBe(true);
    expect(w.events.filter((e) => e.t === 'contract').map((e) => e.t === 'contract' && e.outcome)).toEqual(['overdue']);
    expect(w.player.money).toBe(before.player.money);
    expect(atTurn(w, 502).events.filter((e) => e.t === 'contract')).toEqual([]);
  });

  it('warns a little before the late limit', () => {
    const w = atTurn(holding(haulOf()), 501);
    const limit = lateBy(haulOf());
    const warned = atTurn(w, limit - CONTRACTS.warnTurns);

    expect(warned.events.filter((e) => e.t === 'contract').map((e) => e.t === 'contract' && e.outcome)).toEqual(['expiring']);
  });

  it('is handed in late at the destination: no pay, no xp, no case, crates in the stock, the deed and the closed board', () => {
    const late = moveTo(atTurn(holding(haulOf()), 600), nose);
    const stock = late.shops.nose.goods.salt ?? 0;
    const delivered = update(late, (d) => { d.events = []; d.player.contracts = [...d.player.contracts]; });
    const w = deliverContract(delivered, 'ct-haul');

    expect(w.player.contracts).toEqual([]);
    expect(w.player.pastContracts.map((p) => [p.outcome, p.amount])).toEqual([['late', 0]]);
    expect(w.player.money).toBe(late.player.money);
    expect(w.player.xp).toBe(late.player.xp);
    expect(moneyEvents(w.events)).toEqual([]);
    expect(w.crimes).toEqual([]);
    expect(salt(w)).toBe(0);
    expect(w.shops.nose.goods.salt).toBe(stock + 3);
    expect(w.player.deeds.map((d) => d.deed)).toEqual(['failedContract']);
  });

  it('is still paid in full when handed in on time', () => {
    const w = deliverContract(moveTo(holding(haulOf()), nose), 'ct-haul');

    expect(w.player.pastContracts.map((p) => [p.outcome, p.amount])).toEqual([['done', 100]]);
    expect(w.player.money).toBe(holding(haulOf()).player.money + 100);
  });

  it('is handed in late with the crates left after a partial loss, and refuses an empty truck', () => {
    const partial = moveTo(atTurn(holding(haulOf({ units: 5 }), 3), 600), nose);
    expect(deliverContract(partial, 'ct-haul').player.pastContracts[0].outcome).toBe('late');
    const empty = moveTo(atTurn(holding(haulOf({ units: 5 }), 3), 600), nose);
    expect(() => deliverContract(update(empty, (d) => { removeGoods(playerVehicle(d), 'salt', 3); }), 'ct-haul')).toThrow();
  });

  it('needs every crate on time', () => {
    const w = moveTo(holding(haulOf({ units: 5 }), 3), nose);

    expect(() => deliverContract(w, 'ct-haul')).toThrow();
  });
});

describe('the late limit', () => {
  it('ends a haul still held with an embezzlement case of the crates kept, in the faction of the Bowl shop', () => {
    const w = atTurn(holding(haulOf()), lateBy(haulOf()) + 1);
    const [c] = w.crimes;

    expect(w.player.contracts).toEqual([]);
    expect(w.player.pastContracts.map((p) => [p.outcome, p.amount])).toEqual([['failed', 0]]);
    expect(moneyEvents(w.events)).toEqual([]);
    expect(c).toMatchObject({ offense: 'embezzled', target: w.player.vehicleId, victim: 'bowl', site: 'bowl', status: 'open', issuer: { kind: 'faction', faction: 'bowl' }, owed: fairM(3 * goodValue('salt')), reporters: [], escrow: 0 });
    expect(c.lead).toMatchObject({ heading: null, turn: lateBy(haulOf()) + 1 });
    expect(salt(w)).toBe(3);
    const filed = w.events.find((e) => e.t === 'bountyFiled');
    expect(filed).toMatchObject({ offense: 'embezzled', reporter: 'bowl', owed: c.owed, kept: { good: 'salt', crates: 3 } });
  });

  it('files as the stall itself for a shop with no faction', () => {
    const w = atTurn(holding(haulOf({ shop: 'granary' })), lateBy(haulOf()) + 1);

    expect(w.crimes[0].issuer).toEqual({ kind: 'shop', shop: 'granary' });
  });

  it('files nothing when the kept crates are worth under the minimum, and owes only the room under the cap', () => {
    const cheap = atTurn(holding(haulOf({ units: 1 }), 1), lateBy(haulOf()) + 1);
    expect(cheap.crimes).toHaveLength(1);
    const none = update(holding(haulOf()), (d) => {
      d.turn = lateBy(haulOf()) + 1;
      fillCases(d, CRIME.maxOwed - (CRIME.minStake - 1));
      advanceContracts(d);
    });
    expect(none.crimes).toHaveLength(1);
    const room = CRIME.minStake + 1;
    const partial = update(holding(haulOf()), (d) => {
      d.turn = lateBy(haulOf()) + 1;
      fillCases(d, CRIME.maxOwed - room);
      advanceContracts(d);
    });
    expect(partial.crimes.map((c) => c.owed)).toEqual([CRIME.maxOwed - room, room]);
  });

  it('ends a late haul with no crate aboard at its deadline, free of a case', () => {
    const w = atTurn(holding(haulOf(), 0), 501);

    expect(w.player.pastContracts.map((p) => p.outcome)).toEqual(['failed']);
    expect(w.crimes).toEqual([]);
    expect(moneyEvents(w.events)).toEqual([]);
    expect(w.player.deeds.map((d) => d.deed)).toEqual(['failedContract']);
  });

  it('files no case for crates lost before the limit', () => {
    const late = atTurn(holding(haulOf()), 501);
    const lost = update(late, (d) => { removeGoods(playerVehicle(d), 'salt', 3); });
    const w = atTurn(lost, lateBy(haulOf()) + 1);

    expect(w.player.pastContracts.map((p) => p.outcome)).toEqual(['failed']);
    expect(w.crimes).toEqual([]);
  });

  it('counts only the crates owed to this haul when another haul holds the rest', () => {
    const w = update(holding(haulOf({ units: 2 }), 3), (d) => { d.player.contracts.push(haulOf({ id: 'ct-other', units: 2, deadline: 5000 })); d.turn = lateBy(haulOf()) + 1; advanceContracts(d); });

    expect(w.crimes[0].owed).toBe(fairM(goodValue('salt')));
  });
});

function fillCases(w: World, owed: number): void {
  const base = { id: 'case-x', crime: 'x', offense: 'robbed', target: w.player.vehicleId, victim: 'v', issuer: { kind: 'faction', faction: 'bowl' }, reporters: [], site: 'bowl', at: { x: 0, y: 0 }, turn: 0, filed: 0, owed, restitution: 0, escrow: 0, status: 'open', closed: null, hunter: null, retryAt: null, offered: null, known: true, posse: 'lone', lead: { at: { x: 0, y: 0 }, turn: 0, heading: null } } as CrimeCase;
  w.crimes = [...w.crimes, base];
}

describe('owed crates', () => {
  it('leaves no spare crate while the haul is held and the rest above it', () => {
    const w = holding(haulOf(), 5);

    expect(spareGoods(w, playerVehicle(w), 'salt')).toBe(2);
    expect(spareGoods(w, playerVehicle(w), 'meds')).toBe(0);
  });

  it('counts every crate of an NPC truck as spare', () => {
    const w = holding(haulOf());
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 100, y: 100 });
    addGoods(w, npc, 'salt', 4);

    expect(spareGoods(w, npc, 'salt')).toBe(4);
  });

  it('refuses a shop sale below the owed count and sells above it', () => {
    const w = holding(haulOf(), 4);

    expect(() => sellGood(w, 'salt', 2)).toThrow(expect.objectContaining({ refusal: { id: 'cargoOwed' } }));
    expect(salt(sellGood(w, 'salt', 1))).toBe(3);
  });

  it('refuses dumping an owed crate', () => {
    const w = holding(haulOf());
    const crate = playerVehicle(w).items.find((it) => it.kind === 'good' && it.good === 'salt')!;

    expect(() => dumpItem(w, crate.id)).toThrow(expect.objectContaining({ refusal: { id: 'cargoOwed' } }));
  });

  it('refuses selling an owed crate to another truck', () => {
    const w = holding(haulOf());
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { ...playerVehicle(w).pos });
    expect(() => sellTruckGood(w, npc.id, 'salt', 1)).toThrow();
  });

  it('lets forced losses through without a charge', () => {
    const w = update(holding(haulOf()), (d) => { removeGoods(playerVehicle(d), 'salt', 3); });

    expect(salt(w)).toBe(0);
    expect(w.player.money).toBe(holding(haulOf()).player.money);
  });

  it('frees the crates for the player once the haul has ended', () => {
    const w = atTurn(holding(haulOf()), lateBy(haulOf()) + 1);

    expect(spareGoods(w, playerVehicle(w), 'salt')).toBe(3);
  });
});

describe('an embezzlement case', () => {
  function filedCase(): World {
    return atTurn(holding(haulOf()), lateBy(haulOf()) + 1);
  }

  it('shows in the player owed total and the Marshalls demand', () => {
    const w = filedCase();

    expect(owedBy(w, w.player.vehicleId)).toBe(fairM(3 * goodValue('salt')));
    expect(JSON.stringify(bountyTerms(w))).toContain('offenseEmbezzled');
  });

  it('is paid like any case: the shop coffers and the office are paid', () => {
    const w = update(filedCase(), (d) => {
      d.player.money = 100000;
      d.events = [];
      payBounty(d, playerVehicle(d), openCasesOn(d, d.player.vehicleId), null);
    });

    expect(w.crimes[0].status).toBe('paid');
    expect(w.player.money).toBe(100000 - fairM(3 * goodValue('salt')));
  });

  it('is taken by a Marshall hunt, collected on a knockout and lapses after the bounty days', () => {
    const w = filedCase();
    const hunted = update(w, (d) => { takeHunt(d, d.player.vehicleId, 'marshal-1'); });
    expect(hunted.crimes[0].hunter).toBe('marshal-1');

    const marshal = update(w, (d) => {
      const m = addVehicle(d, 'marshals', 'scout', ['stockEngine'], { x: 100, y: 100 });
      d.events = [];
      collectBounty(d, m, playerVehicle(d));
    });
    expect(marshal.crimes[0].status).toBe('collected');

    const lapsed = update(w, (d) => { d.turn = d.crimes[0].filed + BOUNTY.lapseTurns; advanceCrimes(d); });
    expect(lapsed.crimes[0].status).toBe('lapsed');
  });

  it('refuses to file against anything but the shop that exists', () => {
    const w = holding(haulOf());

    expect(() => update(w, (d) => fileEmbezzlement(d, 'nowhere', 3, 'salt', { x: 0, y: 0 }))).toThrow();
    expect(() => update(w, (d) => fileEmbezzlement(d, 'bowl', 0, 'salt', { x: 0, y: 0 }))).toThrow();
  });
});

describe('acceptContract keeps taking a haul for free', () => {
  it('moves the crates onto the truck and no money', () => {
    const w = emptyWorld(sitePads(bowl)[0]);
    w.shops.bowl.contracts = [haulOf({ id: 'ct-next', deadline: 5000 })];
    w.shops.bowl.goods.salt = 10;
    const taken = acceptContract(w, 'ct-next');

    expect(salt(taken)).toBe(3);
    expect(taken.player.money).toBe(w.player.money);
  });
});
