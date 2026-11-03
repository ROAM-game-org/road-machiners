import { describe, expect, it } from 'vitest';
import { CONTRACTS, CREDIT } from '../../data/market';
import { REGION } from '../../data/region';
import { playerVehicle } from '../damage';
import { estimateTurns, siteOf } from '../market';
import { getUpkeepReserve } from '../npc-decisions';
import { sitePads } from '../sites';
import { emptyWorld } from '../testkit';
import type { ShopAccount, World } from '../types';
import { lotSpend, payWhenDue, withCredit } from './orders';
import { worth } from './income';
import { Orders } from './orders';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const CASH = 40;

function atBowl(account: Partial<ShopAccount> | null = null): World {
  const w = emptyWorld(sitePads(bowl)[0]);
  w.turn = 300;
  w.player.perks = ['shopCredit'];
  w.player.account = account ? { shop: 'bowl', owed: 60, due: 900, ...account } : null;
  return w;
}

function richAtBowl(account: Partial<ShopAccount>): World {
  const w = atBowl(account);
  w.player.money = 60 + getUpkeepReserve(playerVehicle(w)) + 10;
  return w;
}

describe('the credit bots give themselves the perk', () => {
  it('adds the shop credit perk to the credit trader and the defaulter only', () => {
    const plain = () => { const w = emptyWorld({ x: 0, y: 0 }); w.player.perks = []; return w; };

    expect(withCredit(plain(), 'creditTrader').player.perks).toEqual(['shopCredit']);
    expect(withCredit(plain(), 'defaulter').player.perks).toEqual(['shopCredit']);
    expect(withCredit(plain(), 'trader').player.perks).toEqual([]);
  });
});

describe('the spend a credit bot plans a lot with', () => {
  it('is the cash alone without the perk', () => {
    const w = atBowl();
    w.player.perks = [];

    expect(lotSpend(w, 'bowl', CASH)).toBe(CASH);
  });

  it('is the room left on the account when that is more than the cash', () => {
    expect(lotSpend(atBowl(), 'bowl', CASH)).toBe(CREDIT.line);
    expect(lotSpend(atBowl({ owed: 60 }), 'bowl', CASH)).toBe(CREDIT.line - 60);
    expect(lotSpend(atBowl(), 'bowl', CREDIT.line + 1)).toBe(CREDIT.line + 1);
  });

  it('is the cash alone at a shop other than the account', () => {
    expect(lotSpend(atBowl({ shop: 'nose' }), 'bowl', CASH)).toBe(CASH);
  });
});

describe('the credit trader pays its account', () => {
  it('pays in full at the shop and books it as goods bought', () => {
    const w = richAtBowl({ owed: 60 });
    const o = new Orders(w);

    expect(payWhenDue(o, 'creditTrader')).toBe(true);
    expect(o.world.player.account).toBeNull();
    expect(o.world.player.money).toBe(w.player.money - 60);
    expect(o.ledger.goodsBought).toBe(-60);
  });

  it('keeps its fuel money: no pay while cash would fall under the upkeep reserve', () => {
    const w = richAtBowl({ owed: 60 });
    w.player.money = 60 + getUpkeepReserve(playerVehicle(w)) - 1;
    const o = new Orders(w);

    expect(payWhenDue(o, 'creditTrader')).toBe(false);
    expect(o.world.player.account).not.toBeNull();
  });

  it('goes on with its trade away from the shop until the due turn draws near, then drives back', () => {
    const away = (due: number) => new Orders(richAtBowl({ shop: 'nose', due }));
    const probe = away(0);
    const lastSafeTurn = Math.floor(probe.world.turn + estimateTurns(probe.me.pos, siteOf('nose').pos) + CONTRACTS.warnTurns);

    const early = away(lastSafeTurn + 1);
    expect(payWhenDue(early, 'creditTrader')).toBe(false);
    const late = away(lastSafeTurn);
    expect(payWhenDue(late, 'creditTrader')).toBe(true);
    expect(late.world.player.account).not.toBeNull();
  });

  it('never pays as the defaulter', () => {
    const o = new Orders(richAtBowl({ owed: 60 }));

    expect(payWhenDue(o, 'defaulter')).toBe(false);
    expect(o.world.player.account).not.toBeNull();
  });
});

describe('worth with an open account', () => {
  it('counts the owed amount against the goods bought with it', () => {
    const w = atBowl();
    const before = worth(w);
    w.player.account = { shop: 'bowl', owed: 60, due: 900 };

    expect(worth(w)).toBe(before - 60);
  });
});
