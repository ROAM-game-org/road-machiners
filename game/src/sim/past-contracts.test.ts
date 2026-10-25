import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../data/market';
import { escortShare } from './escort-job';
import { stowParcel } from './inventory';
import { playerVehicle } from './damage';
import { finishContract, type Contract } from './market';
import { emptyWorld } from './testkit';
import type { GameEvent, World } from './types';
import { update } from './world';

const haul = (id = 'ct-haul'): Extract<Contract, { kind: 'haul' }> => ({ id, shop: 'bowl', kind: 'haul', good: 'salt', units: 3, to: 'nose', reward: 10000, deadline: 500, window: 500, rush: false, tier: 1 });
const search = (): Contract => ({ id: 'ct-search', shop: 'nose', kind: 'search', target: 'v-gone', driver: 'd-1', template: 'trader', lead: { at: { x: 10, y: 10 }, turn: 1 }, reward: 9000, deadline: 800, window: 600, tier: 1, delivered: false });
const claim = (): Extract<Contract, { kind: 'claim' }> => ({ id: 'ct-claim', shop: 'bowl', kind: 'claim', stockId: 's-1', at: { x: 50, y: 50 }, partId: 'p-1', defId: 'mg', reward: 12000, deadline: 900, window: 600, tier: 1, rivalAt: 700, rival: 'v-rival', leads: [] });
const escort = (): Extract<Contract, { kind: 'escort' }> => ({ id: 'ct-escort', shop: 'bowl', kind: 'escort', client: 'v-client', to: 'nose', reward: 8000, deadline: 2000, window: 2000, tier: 1, threat: 2, span: 100, together: 40, seen: null, apart: 0, stuck: 0, holdUntil: null });

function holding(...contracts: Contract[]): World {
  const w = emptyWorld();
  w.turn = 120;
  w.player.contracts = contracts;
  return w;
}

function finished(w: World, c: Contract, outcome: 'done' | 'failed' | 'lapsed' | 'released', cause?: 'rival'): World {
  return update(w, (d) => { d.events = []; finishContract(d, d.player.contracts.find((x) => x.id === c.id)!, outcome, cause); });
}

const moneyMoved = (events: GameEvent[]) => events.reduce((sum, e) => (e.t === 'money' ? sum + e.amount : sum), 0);

describe('past contracts', () => {
  it('records a done haul with its turn and the reward it paid', () => {
    const w = finished(holding(haul()), haul(), 'done');

    expect(w.player.pastContracts).toEqual([{ contract: haul(), outcome: 'done', turn: 120, amount: 10000 }]);
    expect(moneyMoved(w.events)).toBe(10000);
  });

  it('records a failed haul with no money moved', () => {
    const w = finished(holding(haul()), haul(), 'failed');

    const [record] = w.player.pastContracts;
    expect(record.outcome).toBe('failed');
    expect(record.amount).toBe(0);
    expect(moneyMoved(w.events)).toBe(0);
  });

  it('records a lapsed search and a claim lost to its rival with no money moved', () => {
    const carrying = holding(search());
    stowParcel(playerVehicle(carrying), { id: 'i-parcel', x: 0, y: 0, rot: 0, kind: 'parcel', contract: 'ct-search' });
    const lapsed = finished(carrying, search(), 'lapsed');
    const lost = finished(holding(claim()), claim(), 'lapsed', 'rival');

    expect(lapsed.player.pastContracts.map((p) => [p.outcome, p.amount])).toEqual([['lapsed', 0]]);
    expect(lost.player.pastContracts.map((p) => [p.outcome, p.amount])).toEqual([['lapsed', 0]]);
    expect(moneyMoved([...lapsed.events, ...lost.events])).toBe(0);
  });

  it('records a released escort with the share of the reward it paid', () => {
    const w = finished(holding(escort()), escort(), 'released');

    const share = Math.round(escort().reward * escortShare(escort()));
    expect(w.player.pastContracts[0]).toMatchObject({ outcome: 'released', amount: share });
    expect(moneyMoved(w.events)).toBe(share);
  });

  it('records the same outcome as the contract event of the ending', () => {
    const w = finished(holding(haul()), haul(), 'failed');

    const event = w.events.find((e) => e.t === 'contract');
    expect(event).toMatchObject({ outcome: w.player.pastContracts[0].outcome });
  });

  it('keeps only the newest endings, oldest dropped first', () => {
    let w = holding();
    for (let i = 0; i <= CONTRACTS.pastKept; i++) {
      const c = haul(`ct-${i}`);
      w = finished(update(w, (d) => { d.player.contracts = [c]; d.turn = 200 + i; }), c, 'done');
    }

    expect(w.player.pastContracts).toHaveLength(CONTRACTS.pastKept);
    expect(w.player.pastContracts[0].contract.id).toBe('ct-1');
    expect(w.player.pastContracts.at(-1)!.contract.id).toBe(`ct-${CONTRACTS.pastKept}`);
  });

  it('keeps its own copy, so later edits to the contract object leave the record as it was', () => {
    const w = holding(claim());
    const live = w.player.contracts[0] as Extract<Contract, { kind: 'claim' }>;

    finishContract(w, live, 'failed');
    live.leads.push({ turn: 130, from: { x: 1, y: 1 }, driver: 'd-2' });
    live.reward = 1;

    expect(w.player.pastContracts[0].contract).toEqual(claim());
  });
});
