import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { townWork } from './dialogue-rules';
import { acceptContract, advanceContracts, finishContract, type Contract } from './market';
import { sitePads } from './sites';
import { emptyWorld } from './testkit';
import type { GameEvent, World } from './types';
import { update } from './world';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const haul = (id = 'ct-haul', deadline = 500): Extract<Contract, { kind: 'haul' }> => ({ id, shop: 'bowl', kind: 'haul', good: 'salt', units: 3, to: 'nose', reward: 100, deadline, window: 500, rush: false, tier: 1 });
const claim = (): Contract => ({ id: 'ct-claim', shop: 'granary', kind: 'claim', stockId: 's-1', at: { x: 50, y: 50 }, partId: 'p-1', defId: 'mg', reward: 120, deadline: 900, window: 600, tier: 1, rivalAt: 700, rival: 'v-rival', leads: [] });
const offer = (id = 'ct-next'): Contract => ({ id, shop: 'bowl', kind: 'haul', good: 'salt', units: 1, to: 'nose', reward: 40, deadline: 5000, window: 500, rush: false, tier: 1 });

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

  it('leaves the board open for a new contract at once', () => {
    const w = missed(atBowlHolding(haul()));

    expect(acceptContract(w, 'ct-next').player.contracts.map((c) => c.id)).toEqual(['ct-next']);
    expect(townWork(w)).not.toBeNull();
  });

  it('moves no standing for a shop with no faction', () => {
    const w = update(atBowlHolding(claim()), (d) => { d.turn = 300; d.events = []; finishContract(d, d.player.contracts[0], 'failed'); });

    expect(w.player.deeds).toEqual([]);
    expect(moneyMoved(w.events)).toBe(0);
  });

  it.each(['done', 'lapsed', 'released'] as const)('is not what a %s ending is: no deed', (outcome) => {
    const w = ended(atBowlHolding(haul()), haul(), outcome);

    expect(w.player.deeds.filter((d) => d.deed === 'failedContract')).toEqual([]);
  });

  it('moves no standing on Chaos Highway', () => {
    const before = atBowlHolding(haul());
    before.setup = { ...before.setup, mode: 'chaosHighway' };
    const w = missed(before);

    expect(w.player.deeds).toEqual([]);
    expect(w.player.standing.bowl).toBe(before.player.standing.bowl);
  });

  it('counts each contract once', () => {
    const w = missed(atBowlHolding(haul('ct-a'), haul('ct-b')));

    expect(w.player.deeds.map((d) => d.subject).sort()).toEqual(['ct-a', 'ct-b']);
  });
});
