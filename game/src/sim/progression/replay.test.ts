import { describe, expect, it, onTestFinished } from 'vitest';
import { TARGET_DAYS, TARGET_TOLERANCE, XP_RULES, XP_SOURCES } from '../../data/skills';
import { TIME } from '../../data/time';
import { cumulativeCost } from '../progress';
import { clockOf } from '../sun';
import type { TraceLine } from './record';
import { parseRunEnd, replay, targetMisses, type Curve } from './replay';

function simpleSearchXp(): void {
  const rules = { ...XP_RULES };
  const search = { ...XP_SOURCES.search };
  Object.assign(XP_RULES, { dailyCap: 100, overCap: 0.5 });
  Object.assign(XP_SOURCES.search, { weight: 1 });
  onTestFinished(() => {
    Object.assign(XP_RULES, rules);
    Object.assign(XP_SOURCES.search, search);
  });
}

const search = (turn: number, amount: number): TraceLine => ({ turn, source: 'search', amount, difficulty: null, target: `stock-${turn}` });

describe('replay', () => {
  it('applies the daily cap per family and per day', () => {
    simpleSearchXp();
    const dayTwo = TIME.turnsPerDay * 0.75;
    expect(clockOf(40).day).toBe(1);
    expect(clockOf(dayTwo).day).toBe(2);

    const curve = replay([search(10, 100), search(40, 400), search(dayTwo, 50), search(dayTwo + 10, 150)], 2 * TIME.turnsPerDay);

    expect(curve.families.machining.total).toBe(450);
    expect(curve.families.machining.perDay).toBe(225);
    expect(curve.families.driving).toEqual({ total: 0, perDay: 0 });
  });

  it('pools the families, so two under-cost families together reach a rank neither reaches alone', () => {
    const half = cumulativeCost(1) / 2;
    const caps = { ...XP_RULES };
    Object.assign(XP_RULES, { dailyCap: half });
    onTestFinished(() => {
      Object.assign(XP_RULES, caps);
    });
    const searchWeight = XP_SOURCES.search.weight;
    const discoverWeight = XP_SOURCES.discover.weight;
    Object.assign(XP_SOURCES.search, { weight: 1 });
    const found: TraceLine = { turn: 30, source: 'discover', amount: 1, difficulty: null, target: 'bowl' };
    Object.assign(XP_SOURCES.discover, { weight: half });
    onTestFinished(() => {
      Object.assign(XP_SOURCES.search, { weight: searchWeight });
      Object.assign(XP_SOURCES.discover, { weight: discoverWeight });
    });

    const curve = replay([search(20, half), found], 100);

    expect(curve.families.machining.total).toBe(half);
    expect(curve.families.perception.total).toBe(half);
    expect(curve.pooled.total).toBe(2 * half);
    expect(curve.pooled.one).toEqual([30, null, null, null, null]);
    expect(curve.pooled.every).toEqual([null, null, null, null, null]);
  });

  it('marks every skill at a rank on the turn the pool covers five times the cumulative cost', () => {
    simpleSearchXp();
    Object.assign(XP_RULES, { dailyCap: 100000 });
    const need = 5 * cumulativeCost(1);

    const curve = replay([search(10, need - 1), search(20, 1), search(30, 100000)], 100);

    expect(curve.pooled.every[0]).toBe(20);
    expect(curve.pooled.one[0]).toBe(10);
    expect(curve.pooled.total).toBe(curve.families.machining.total);
  });

  it('scales a scaled source by its difficulty', () => {
    const curve = replay([{ turn: 5, source: 'hit', amount: 1, difficulty: 1, target: 'v2' }], 200);

    expect(curve.families.perception.total).toBe(Math.min(XP_SOURCES.hit.weight * XP_RULES.hard, XP_RULES.dailyCap));
  });

  it('pays less for repeats on one target, and a once-only target pays once', () => {
    const hits = replay([1, 2].map((turn) => ({ turn, source: 'hit' as const, amount: 1, difficulty: 1, target: 'v2' })), 200);
    expect(hits.families.perception.total).toBeCloseTo(XP_SOURCES.hit.weight * XP_RULES.hard * (1 + XP_SOURCES.hit.repeat ** 1));
    const found = replay([1, 2].map((turn) => ({ turn, source: 'discover' as const, amount: 1, difficulty: null, target: 'bowl' })), 200);
    expect(found.families.perception.total).toBe(XP_SOURCES.discover.weight);
  });

  it('rejects a trace out of turn order', () => {
    expect(() => replay([search(20, 1), search(10, 1)], 200)).toThrow(/turn order/);
  });

  it('rejects a trace line past the recorded turns', () => {
    expect(() => replay([search(202, 1)], 200)).toThrow(/past the end/);
  });

  it('counts XP per day up to the death turn it is given', () => {
    const curve = replay([search(10, 1)], TIME.turnsPerDay / 2);

    expect(curve.families.machining.perDay).toBe(curve.families.machining.total * 2);
  });
});

describe('parseRunEnd', () => {
  it('reads a death marker and passes over trace lines', () => {
    expect(parseRunEnd({ end: 'death', turn: 57 })).toEqual({ end: 'death', turn: 57 });
    expect(parseRunEnd(search(10, 1))).toBeNull();
  });

  it('reads an error marker with its message', () => {
    expect(parseRunEnd({ end: 'error', turn: 57, message: 'No free engine mount' })).toEqual({ end: 'error', turn: 57, message: 'No free engine mount' });
    expect(() => parseRunEnd({ end: 'error', turn: 57 })).toThrow(/Bad run end/);
  });

  it('rejects a malformed marker', () => {
    expect(() => parseRunEnd({ end: 'stall', turn: 57 })).toThrow(/Bad run end/);
  });
});

describe('targetMisses', () => {
  const day = (d: number) => d * TIME.turnsPerDay;
  const pooledWith = (kind: 'one' | 'every', days: (number | null)[]): Curve => ({
    families: { driving: { total: 0, perDay: 0 }, perception: { total: 0, perDay: 0 }, machining: { total: 0, perDay: 0 }, toughness: { total: 0, perDay: 0 }, social: { total: 0, perDay: 0 } },
    pooled: { total: 0, perDay: 0, one: [null, null, null, null, null], every: [null, null, null, null, null], [kind]: days },
  });
  const pastWindow = (target: number) => day(Math.ceil(target * (1 + TARGET_TOLERANCE)) + 1);

  it('passes a specialist who reaches each one-skill rank on its target day', () => {
    const curve = pooledWith('one', [day(1), day(TARGET_DAYS.one[2]), day(5), day(TARGET_DAYS.one[4]), day(TARGET_DAYS.one[5])]);
    expect(targetMisses(curve, 'trader', day(40))).toEqual([]);
  });

  it('judges an archetype with a main skill on one skill and one without on every skill', () => {
    const never = pooledWith('one', [null, null, null, null, null]);
    expect(targetMisses(never, 'trader', pastWindow(TARGET_DAYS.one[5])).every((m) => m.startsWith('one skill'))).toBe(true);
    expect(targetMisses(never, 'markov', pastWindow(TARGET_DAYS.one[5])).every((m) => m.startsWith('every skill'))).toBe(true);
    expect(targetMisses(never, 'markov', pastWindow(TARGET_DAYS.one[5])).length).toBe(Object.keys(TARGET_DAYS.every).length);
  });

  it('flags a rank reached too early or too late', () => {
    const early = targetMisses(pooledWith('one', [1, 2, 3, day(TARGET_DAYS.one[4]), day(TARGET_DAYS.one[5])]), 'trader', day(40));
    expect(early).toContain(`one skill rank 2: day 0.0, target day ${TARGET_DAYS.one[2]}, too early`);
    const late = targetMisses(pooledWith('every', [day(TARGET_DAYS.every[1]), null, null, null, null]), 'markov', pastWindow(TARGET_DAYS.every[2]));
    expect(late).toContain(`every skill rank 2: never, target day ${TARGET_DAYS.every[2]}, too late`);
  });

  it('does not flag an unreached rank whose window starts after the run', () => {
    const misses = targetMisses(pooledWith('one', [day(1), day(TARGET_DAYS.one[2]), day(5), null, null]), 'trader', day(10));
    expect(misses).toEqual([]);
  });
});
