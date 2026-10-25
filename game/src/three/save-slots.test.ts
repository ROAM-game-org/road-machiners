import { describe, expect, it } from 'vitest';
import { resolve } from '../text/resolve';
import { allSlots, listSaves, manualSlots, requestBoot, slotKey, slotLabel, takeBootRequest } from './save-slots';
import { memoryBackend, SaveSlots } from './save-db';

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const save = (turn: number, savedAt?: number, mode = 'roaming') => ({ format: { major: 2, minor: 3 }, savedAt, world: { turn, setup: { mode } } });
const makeSlots = () => new SaveSlots(memoryBackend(), new Map());

describe('save slots', () => {
  it('keeps the old key for the autosave and adds the slot to the others', () => {
    expect(slotKey('roam.save', 'auto')).toBe('roam.save');
    expect(slotKey('roam.save', 'day')).toBe('roam.save:day');
    expect(slotKey('roam.save.factory', 'slot2')).toBe('roam.save.factory:slot2');
  });

  it('lists the autosaves first, then the manual slots, with labels', () => {
    expect(manualSlots(3)).toEqual(['slot1', 'slot2', 'slot3']);
    expect(allSlots(2)).toEqual(['auto', 'day', 'slot1', 'slot2']);
    expect(['auto', 'day', 'slot3'].map((s) => resolve(slotLabel(s as 'auto'), 'en'))).toEqual(['Autosave', 'Day start', 'Slot 3']);
    expect(resolve(slotLabel('slot3'), 'ru')).toBe('Ячейка 3');
  });

  it('lists filled slots newest first, counts a missing savedAt as 0 and flags an unreadable row', () => {
    const slots = makeSlots();
    slots.put('auto', save(40));
    slots.put('slot1', save(30, 500));
    slots.put('slot2', '{');
    slots.put('day', save(20, 900, 'furyRoad'));

    expect(listSaves(slots, 3)).toEqual([
      { slot: 'day', savedAt: 900, turn: 20, mode: 'chaosHighway' },
      { slot: 'slot1', savedAt: 500, turn: 30, mode: 'roaming' },
      { slot: 'auto', savedAt: 0, turn: 40, mode: 'roaming' },
      { slot: 'slot2', savedAt: 0, turn: null, mode: null },
    ]);
    expect(listSaves(slots, 3)[0].slot).toBe('day');
    expect(listSaves(makeSlots(), 3)).toEqual([]);
  });

  it('removes the boot request when it is read', () => {
    const session = makeStorage();
    expect(takeBootRequest(session, 'roam.save')).toBeNull();
    requestBoot(session, 'roam.save', 'slot2');
    expect(takeBootRequest(session, 'roam.save')).toBe('slot2');
    expect(takeBootRequest(session, 'roam.save')).toBeNull();
  });

  it('throws on an unknown boot request', () => {
    const session = makeStorage();
    session.setItem('roam.save.boot', 'bogus');
    expect(() => takeBootRequest(session, 'roam.save')).toThrow(/bogus/);
  });

  it('carries a new game setup through the reload exactly once, with its exact values', () => {
    const session = makeStorage();
    const setup = { mode: 'roaming' as const, settings: { damage: 1.5, fuelUse: 2, supplyUse: 0.75, enemyGearGrowth: 1 } };
    requestBoot(session, 'roam.save', { new: setup, intro: false });

    expect(takeBootRequest(session, 'roam.save')).toEqual({ new: setup, intro: false });
    expect(takeBootRequest(session, 'roam.save')).toBeNull();
  });

  it('refuses a new game request that does not say whether the intro plays', () => {
    const session = makeStorage();
    session.setItem('roam.save.boot', JSON.stringify({ new: { mode: 'roaming', settings: { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } } }));

    expect(() => takeBootRequest(session, 'roam.save')).toThrow(/intro/);
  });

  it('carries a road boot of a slot through the reload exactly once', () => {
    const session = makeStorage();
    requestBoot(session, 'roam.save', { slot: 'auto', reason: 'road' });

    expect(takeBootRequest(session, 'roam.save')).toEqual({ slot: 'auto', reason: 'road' });
    expect(takeBootRequest(session, 'roam.save')).toBeNull();
  });

  it.each([
    ['a setting out of bounds', JSON.stringify({ new: { mode: 'roaming', settings: { damage: 5, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 } } })],
    ['broken JSON', '{"new":'],
    ['a road boot of no slot', JSON.stringify({ slot: 'garage', reason: 'road' })],
    ['JSON with no new game', JSON.stringify({ old: 1 })],
    ['the old plain new request', 'new'],
  ])('removes a request with %s and throws', (_, value) => {
    const session = makeStorage();
    session.setItem('roam.save.boot', value);

    expect(() => takeBootRequest(session, 'roam.save')).toThrow();
    expect(session.getItem('roam.save.boot')).toBeNull();
  });
});
