import { describe, expect, it } from 'vitest';
import { CONTRACTS, CREDIT, CRIME } from '../data/market';
import { REGION } from '../data/region';
import { owedBy } from './crime';
import { playerVehicle } from './damage';
import { buyGood, getLotTradePrice } from './economy';
import { goodsCount } from './grid';
import { fairM } from './money';
import { accountRefusal, payAccount, settleOverdue } from './shop-credit';
import { sitePads } from './sites';
import { emptyWorld, fillCargo } from './testkit';
import type { CrimeCase, GameEvent, ShopAccount, World } from './types';
import { endTurn, update } from './world';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const nose = REGION.towns.find((t) => t.id === 'nose')!;
const GOOD = 'scrap';
const COUNT = 3;

function atBowl(perk = true): World {
  const w = emptyWorld(sitePads(bowl)[0]);
  w.turn = 300;
  if (perk) w.player.perks = ['shopCredit'];
  return w;
}

const priceOf = (w: World): number => getLotTradePrice(w, playerVehicle(w), 'bowl', GOOD, COUNT, 'buy');
const scrap = (w: World): number => goodsCount(playerVehicle(w))[GOOD] ?? 0;

function shortOfCash(w: World): World {
  w.player.money = priceOf(w) - 1;
  return w;
}

function openAccount(over: Partial<ShopAccount> = {}): World {
  const w = atBowl();
  w.player.account = { shop: 'bowl', owed: 60, due: 900, ...over };
  return w;
}

function caseOn(w: World, known: boolean, owed = 50): CrimeCase {
  return {
    id: `case-${w.crimes.length}`, crime: `0:${w.player.vehicleId}:x`, offense: 'robbed', target: w.player.vehicleId, victim: 'v', issuer: { kind: 'faction', faction: 'bowl' },
    reporters: [], site: 'bowl', at: { x: 0, y: 0 }, turn: 0, filed: 0, owed, restitution: 0, escrow: 0,
    status: 'open', closed: null, hunter: null, retryAt: null, offered: null, known, posse: 'lone', lead: { at: { x: 0, y: 0 }, turn: 0, heading: null },
  };
}

const refusalOf = (w: World): string | undefined => {
  try {
    buyGood(w, GOOD, COUNT);
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
};

const atTurn = (w: World, turn: number): World => update(w, (d) => { d.events = []; d.turn = turn; settleOverdue(d); });
const accountEvents = (events: GameEvent[]) => events.flatMap((e) => (e.t === 'account' ? [e.outcome] : []));

describe('buying goods on account', () => {
  it('leaves the account alone when cash covers the lot', () => {
    const before = atBowl();
    const w = buyGood(before, GOOD, COUNT);

    expect(w.player.account).toBeNull();
    expect(w.player.money).toBe(before.player.money - priceOf(before));
    expect(w.events.some((e) => e.t === 'onAccount')).toBe(false);
  });

  it('puts a lot cash cannot cover on account: goods aboard, cash untouched, due two days on', () => {
    const before = shortOfCash(atBowl());
    const price = priceOf(before);
    const w = buyGood(before, GOOD, COUNT);

    expect(scrap(w)).toBe(scrap(before) + COUNT);
    expect(w.player.money).toBe(before.player.money);
    expect(w.player.account).toEqual({ shop: 'bowl', owed: price, due: before.turn + CREDIT.dueTurns });
    expect(w.player.costBasis[GOOD]).toBeGreaterThan(0);
    expect(w.events.filter((e) => e.t === 'onAccount')).toEqual([{ t: 'onAccount', shop: 'bowl', good: GOOD, count: COUNT, price }]);
    expect(w.events.some((e) => e.t === 'shopMoney')).toBe(false);
  });

  it('adds a later lot to the same account and keeps its due turn', () => {
    const before = openAccount({ owed: 20, due: 700 });
    before.player.money = 0;
    const w = buyGood(before, GOOD, COUNT);

    expect(w.player.account).toEqual({ shop: 'bowl', owed: 20 + priceOf(before), due: 700 });
  });

  it('takes a lot that brings the owed amount exactly to the line', () => {
    const w = openAccount();
    w.player.money = 0;
    w.player.account!.owed = CREDIT.line - priceOf(w);

    expect(buyGood(w, GOOD, COUNT).player.account?.owed).toBe(CREDIT.line);
  });
});

describe('a refused account buy', () => {
  it('refuses with no money and no account for a driver without the perk', () => {
    const w = shortOfCash(atBowl(false));

    expect(refusalOf(w)).toBe('Refused: noMoney');
    expect(accountRefusal(w, 'bowl', priceOf(w))).toEqual({ id: 'noMoney' });
  });

  it('names the other shop when an account is open elsewhere', () => {
    const w = openAccount({ shop: 'nose' });
    w.player.money = 0;

    expect(refusalOf(w)).toBe('Refused: accountElsewhere');
    expect(accountRefusal(w, 'bowl', priceOf(w))).toEqual({ id: 'accountElsewhere', shop: 'nose' });
  });

  it('refuses a lot that would take the owed amount over the line', () => {
    const w = openAccount();
    w.player.money = 0;
    w.player.account!.owed = CREDIT.line - priceOf(w) + 1;

    expect(refusalOf(w)).toBe('Refused: accountFull');
  });

  it('refuses a driver who knows of a case on them, and says nothing of a case they have not learned of', () => {
    const silent = shortOfCash(atBowl());
    silent.crimes = [caseOn(silent, false)];
    expect(buyGood(silent, GOOD, COUNT).player.account?.shop).toBe('bowl');

    const wanted = shortOfCash(atBowl());
    wanted.crimes = [caseOn(wanted, true)];
    expect(refusalOf(wanted)).toBe('Refused: wantedNoCredit');
  });

  it('gives no credit where bounties are off', () => {
    const w = shortOfCash(atBowl());
    w.setup = { ...w.setup, mode: 'chaosHighway' };

    expect(accountRefusal(w, 'bowl', priceOf(w))).toEqual({ id: 'noMoney' });
  });

  it('still refuses a lot with no cargo room and opens no account', () => {
    const w = shortOfCash(atBowl());
    fillCargo(w);

    expect(refusalOf(w)).toBe('Refused: noCargoRoom');
    expect(w.player.account).toBeNull();
  });
});

describe('paying the account', () => {
  it('pays the whole owed amount once at its shop and clears it', () => {
    const before = openAccount({ owed: 60 });
    before.player.money = 100;
    const w = payAccount(before);

    expect(w.player.account).toBeNull();
    expect(w.player.money).toBe(40);
    expect(w.events.filter((e) => e.t === 'shopMoney')).toEqual([{ t: 'shopMoney', vehicle: w.player.vehicleId, amount: -60, kind: 'accountPaid' }]);
    expect(w.events.filter((e) => e.t === 'accountPaid')).toEqual([{ t: 'accountPaid', shop: 'bowl', amount: 60 }]);
  });

  it('refuses when cash is short, and pays nowhere but its shop', () => {
    const short = openAccount({ owed: 60 });
    short.player.money = 59;
    expect(() => payAccount(short)).toThrow('Refused: noMoney');

    const away = openAccount({ shop: 'nose' });
    expect(() => payAccount(away)).toThrow();
    away.vehicles[0].pos = { ...sitePads(nose)[0] };
    expect(payAccount(away).player.account).toBeNull();
  });
});

describe('an account past due', () => {
  it('warns once a little before the due turn', () => {
    const w = openAccount({ due: 900 });

    expect(accountEvents(atTurn(w, 900 - CONTRACTS.warnTurns - 1).events)).toEqual([]);
    expect(accountEvents(atTurn(w, 900 - CONTRACTS.warnTurns).events)).toEqual(['expiring']);
    expect(accountEvents(atTurn(w, 900 - CONTRACTS.warnTurns + 1).events)).toEqual([]);
  });

  it('files one embezzlement case with the owed amount as restitution and the late share as the fine', () => {
    const owed = 120;
    const w = atTurn(openAccount({ owed, due: 900 }), 900);
    const [c] = w.crimes;

    expect(w.crimes).toHaveLength(1);
    expect(c).toMatchObject({ offense: 'embezzled', target: w.player.vehicleId, victim: 'bowl', site: 'bowl', issuer: { kind: 'faction', faction: 'bowl' }, restitution: owed, owed: Math.max(fairM(owed * CREDIT.lateShare), CRIME.minStake), known: false });
    expect(w.events.filter((e) => e.t === 'bountyFiled')).toMatchObject([{ case: c.id, unpaid: owed }]);
    expect(accountEvents(w.events)).toEqual(['lapsed']);
    expect(w.player.account).toBeNull();
    expect(w.player.deeds.filter((d) => d.deed === 'failedContract')).toHaveLength(1);
  });

  it('raises a small fine to the least stake', () => {
    const w = atTurn(openAccount({ owed: 4, due: 900 }), 900);

    expect(w.crimes[0]).toMatchObject({ owed: CRIME.minStake, restitution: 4 });
  });

  it('still files the whole owed amount when the player is at the fine cap', () => {
    const capped = openAccount({ owed: 120, due: 900 });
    capped.crimes = [caseOn(capped, true, CRIME.maxOwed)];
    const w = atTurn(capped, 900);
    const filed = w.crimes.find((c) => c.offense === 'embezzled')!;

    expect(filed).toMatchObject({ owed: 0, restitution: 120 });
    expect(owedBy(w, w.player.vehicleId)).toBe(CRIME.maxOwed + 120);
  });

  it('lapses in the turn pipeline on its due turn', () => {
    const before = openAccount({ owed: 60 });
    before.player.account!.due = before.turn + 1;
    const w = endTurn(before, () => {});

    expect(w.player.account).toBeNull();
    expect(accountEvents(w.events)).toEqual(['lapsed']);
    expect(w.crimes.map((c) => c.restitution)).toEqual([60]);
  });

  it('does nothing before the due turn', () => {
    const before = openAccount({ due: 900 });
    const w = atTurn(before, 899);

    expect(w.player.account).toEqual(before.player.account);
    expect(w.crimes).toEqual([]);
  });
});
