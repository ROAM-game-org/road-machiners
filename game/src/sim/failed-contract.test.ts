import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../data/market';
import { REGION } from '../data/region';
import { townWork } from './dialogue-rules';
import { acceptContract, advanceContracts, boardClosedUntil, finishContract, type Contract } from './market';
import { sitePads } from './sites';
import { emptyWorld } from './testkit';
import type { GameEvent, World } from './types';
import { update } from './world';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const haul = (id = 'ct-haul', deadline = 500): Extract<Contract, { kind: 'haul' }> => ({ id, shop: 'bowl', kind: 'haul', good: 'salt', units: 3, to: 'nose', reward: 10000, deadline, window: 500, rush: false, tier: 1 });
const claim = (): Contract => ({ id: 'ct-claim', shop: 'granary', kind: 'claim', stockId: 's-1', at: { x: 50, y: 50 }, partId: 'p-1', defId: 'mg', reward: 12000, deadline: 900, window: 600, tier: 1, rivalAt: 700, rival: 'v-rival', leads: [] });
const offer = (id = 'ct-next'): Contract => ({ id, shop: 'bowl', kind: 'haul', good: 'salt', units: 1, to: 'nose', reward: 4000, deadline: 5000, window: 500, rush: false, tier: 1 });

function atBowlHolding(...held: Contract[]): World {
  const w = emptyWorld(sitePads(bowl)[0]);
  w.turn = 300;
  w.player.contracts = held;
  w.shops.bowl.contracts = [offer()];
  return w;
}

const missed = (w: World): World => update(w, (d) => { d.events = []; d.turn = 600; advanceContracts(d); });
const ended = (w: World, c: Contract, outcome: 'done' | 'failed' | 'lapsed' | 'released'): World =>
  update(w, (d) => { d.events = []; finishContract(d, d.player.contracts.find((x) => x.id === c.id)!, outcome); });
const moneyMoved = (events: GameEvent[]) => events.reduce((sum, e) => (e.t === 'money' ? sum + e.amount : sum), 0);

describe('a failed contract', () => {
  it('costs 5 standing with the posting shop faction and no money', () => {
    const before = atBowlHolding(haul());
    const w = missed(before);

    expect(w.player.standing.bowl).toBe(before.player.standing.bowl - 5);
    expect(w.player.deeds.map((d) => [d.deed, d.faction, d.delta, d.subject])).toEqual([['failedContract', 'bowl', -5, 'ct-haul']]);
    expect(w.events.filter((e) => e.t === 'money')).toEqual([]);
  });

  it('closes that shop board until one day after the failure and then opens it', () => {
    const w = missed(atBowlHolding(haul()));
    const opens = 600 + CONTRACTS.failedRestTurns;

    expect(boardClosedUntil(w, 'bowl')).toBe(opens);
    expect(() => acceptContract(w, 'ct-next')).toThrow(expect.objectContaining({ refusal: { id: 'boardClosed' } }));
    expect(boardClosedUntil(update(w, (d) => { d.turn = opens - 1; }), 'bowl')).toBe(opens);
    const later = update(w, (d) => { d.turn = opens; });
    expect(boardClosedUntil(later, 'bowl')).toBeNull();
    expect(acceptContract(later, 'ct-next').player.contracts.map((c) => c.id)).toEqual(['ct-next']);
  });

  it('leaves the other shops open', () => {
    const w = missed(atBowlHolding(haul()));

    expect(boardClosedUntil(w, 'nose')).toBeNull();
  });

  it('makes the radio ask for work find none while the board is closed', () => {
    const w = atBowlHolding(haul());
    expect(townWork(w)).not.toBeNull();
    expect(townWork(missed(w))).toBeNull();
  });

  it('closes the board of a shop with no faction without moving standing', () => {
    const w = update(atBowlHolding(claim()), (d) => { d.turn = 300; d.events = []; finishContract(d, d.player.contracts[0], 'failed'); });

    expect(boardClosedUntil(w, 'granary')).toBe(300 + CONTRACTS.failedRestTurns);
    expect(w.player.deeds).toEqual([]);
    expect(moneyMoved(w.events)).toBe(0);
  });

  it.each(['done', 'lapsed', 'released'] as const)('is not what a %s ending is: no deed and no closed board', (outcome) => {
    const w = ended(atBowlHolding(haul()), haul(), outcome);

    expect(w.player.deeds.filter((d) => d.deed === 'failedContract')).toEqual([]);
    expect(boardClosedUntil(w, 'bowl')).toBeNull();
  });

  it('moves no standing on Chaos Highway', () => {
    const before = atBowlHolding(haul());
    before.setup = { ...before.setup, mode: 'furyRoad' };
    const w = missed(before);

    expect(w.player.deeds).toEqual([]);
    expect(w.player.standing.bowl).toBe(before.player.standing.bowl);
  });

  it('counts each contract once', () => {
    const w = missed(atBowlHolding(haul('ct-a'), haul('ct-b')));

    expect(w.player.deeds.map((d) => d.subject).sort()).toEqual(['ct-a', 'ct-b']);
  });
});
