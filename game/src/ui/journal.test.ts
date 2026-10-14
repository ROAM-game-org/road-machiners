import { describe, expect, it } from 'vitest';
import { TIME } from '../data/time';
import { emptyWorld } from '../sim/testkit';
import { journalEntries } from './journal';
import { resolve } from '../text/resolve';

describe('journal entries', () => {
  it('lists the notes newest first, with the day each was learned', () => {
    const w = emptyWorld();
    w.player.notes = [
      { id: 'wagonBowl', turn: 10 },
      { id: 'greenPit', turn: TIME.turnsPerDay + 10 },
      { id: 'wagonNose', turn: TIME.turnsPerDay + 10 },
    ];

    const entries = journalEntries(w);

    expect(entries.map((e) => e.id)).toEqual(['wagonNose', 'greenPit', 'wagonBowl']);
    expect(entries.map((e) => e.day)).toEqual([2, 2, 1]);
  });

  it('is empty with no notes', () => {
    expect(journalEntries(emptyWorld())).toEqual([]);
  });
});

describe('claim leads in the journal', () => {
  it('lists what each driver said under the claimed part, newest first among the notes', () => {
    const w = emptyWorld();
    w.player.notes = [{ id: 'wagonBowl', turn: 10 }];
    w.player.contracts = [{ id: 'ct-1', shop: 'bowl', kind: 'claim', stockId: 'armyTruck-1', at: { x: 100, y: 50 }, partId: 'p1', defId: 'mg', reward: 900, deadline: 9000, window: 9000, tier: 1, rivalAt: 9000, rival: null, leads: [{ turn: 20, from: { x: 100, y: 80 }, driver: 'Jed Cobb' }] }];

    const entries = journalEntries(w);

    expect(entries.map((e) => e.id)).toEqual(['ct-1:Jed Cobb', 'wagonBowl']);
    expect(resolve(entries[0].body, 'en')).toBe('north of where we talked, about 100 m out');
    expect(resolve(entries[0].from, 'en')).toBe('Jed Cobb');
  });
});
