import { describe, expect, it } from 'vitest';
import FORMAT_2_120 from './save-fixtures/format-2-120.json';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import type { World } from '../sim/types';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { TINY_FROM, TINY_STEPS, type SavedJson } from './save-migrations';
import { readCarried } from './save-rescue';

type Saved = typeof FORMAT_2_120;

const step = (world: unknown): Saved => TINY_STEPS[120 - TINY_FROM].step(structuredClone(world) as SavedJson) as unknown as Saved;
const fixture = () => structuredClone(FORMAT_2_120);

function roundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

describe('save migration 120 to 121, money is whole M', () => {
  it('is named withWholeMoney', () => {
    expect(TINY_STEPS[120 - TINY_FROM].name).toBe('withWholeMoney');
  });

  it('keeps every amount at the number the screen showed', () => {
    const next = step(fixture());
    expect(next.player.money).toBe(996);
    expect(next.player.contracts.map((c) => c.reward)).toEqual([13, 30]);
    expect(next.player.contracts[1].cratePay).toBe(7);
    expect(next.player.pastContracts[0]).toMatchObject({ amount: 5, contract: { reward: 6, cratePay: 1 } });
    expect(next.shops.bowl.contracts[0].reward).toBe(78);
    expect(next.vehicles[0].resources!.money).toBe(1);
    expect(next.chaosHighway.earned).toBe(124);
  });

  it('rounds each call price the way the old screen did', () => {
    const { vars, line } = step(fixture()).player.call;
    expect(vars.m.amount).toBe(20);
    expect(vars.d.price).toBe(3);
    expect(vars.p.goods[0]).toMatchObject({ buy: 2, sell: 1 });
    expect(vars.n).toEqual({ kind: 'other' });
    expect(line.vars.m.amount).toBe(10);
  });

  it('divides rates exactly', () => {
    const next = step(fixture());
    expect(next.player.costBasis.scrap).toBeCloseTo(6.33, 9);
    expect(next.salvage[0].pile!.basis.scrap).toBeCloseTo(6.33, 9);
    expect(next.player.encounters.story.aidValue).toBeCloseTo(12.5, 9);
    expect(next.chaosHighway.groups.map((g) => g.money)).toEqual([42.5, 1]);
  });

  it('converts states, cases and remembered restitution', () => {
    const next = step(fixture());
    expect(next.states.map((s) => s.data)).toEqual([
      { kind: 'tow', fee: 5, waived: 1, hitched: true },
      { kind: 'towPromise', fee: 3 },
      { kind: 'escort', site: null, fee: 16 },
      { kind: 'hire', fee: 9 },
      { kind: 'patch', price: 2 },
      { kind: 'aid', price: 1 },
      { kind: 'bountyStop', owed: 20, answered: false },
      { kind: 'other', fee: 5 },
    ]);
    expect(next.crimes[0]).toMatchObject({ owed: 26, restitution: 2, escrow: 0 });
    expect(next.vehicles[0].brain!.memories[0].fact).toMatchObject({ restitution: 4 });
  });

  it('keeps a negative balance reading as it did', () => {
    const debt = { ...fixture(), player: { ...fixture().player, money: -150 } };
    expect(step(debt).player.money).toBe(-2);
  });

  it('leaves an empty world alone', () => {
    const empty = { ...fixture(), player: { ...fixture().player, money: 0, contracts: [], pastContracts: [], call: null }, shops: {}, vehicles: [], salvage: [], states: [], crimes: [], chaosHighway: null };
    expect(step(empty)).toMatchObject({ player: { money: 0 }, chaosHighway: null, states: [] });
  });

  it('loads and saves a current world with its balance unchanged and awards nothing', () => {
    const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
    const loaded = roundTrip(w);
    expect(loaded.player.money).toBe(w.player.money);
    expect(Number.isInteger(loaded.player.money)).toBe(true);
    expect(loaded.events).toEqual([]);
  });
});

describe('rescue reads money in three forms', () => {
  const raw = (minor: number, money: number) => ({ format: { major: 2, minor }, world: { player: { money, costBasis: { scrap: 633 } } } });

  it('reads whole M from 2.117', () => {
    expect(readCarried(raw(117, 996)).money).toBe(996);
  });

  it('reads cents from 2.30 to 2.120 as the old screen rounded them', () => {
    const carried = readCarried(raw(100, 99501));
    expect(carried.money).toBe(996);
    expect(carried.costBasis.scrap).toBeCloseTo(6.33, 9);
  });

  it('reads the old unit before 2.30 as a third of an M each', () => {
    expect(readCarried(raw(20, 300)).money).toBe(100);
  });
});
