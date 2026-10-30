import { afterEach, describe, expect, it, vi } from 'vitest';
import { ECONOMY } from './goods';
import { RULES } from './rules';
import { TIME, workDayOf, workDayStart } from './time';

async function effortUnder(turnsPerDay: number) {
  vi.resetModules();
  vi.doMock('./time', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./time')>();
    return { ...actual, TIME: { ...actual.TIME, turnsPerDay } };
  });
  const [market, oddJobs, encounters, behavior, skills, goods] = await Promise.all([
    import('./market'), import('./odd-jobs'), import('./encounters'), import('./npc-behavior'), import('./skills'), import('./goods'),
  ]);
  return {
    contracts: { warn: market.CONTRACTS.warnTurns, haulSlack: market.CONTRACTS.haul.slackTurns, claimSlack: market.CONTRACTS.claim.slackTurns, searchFresh: market.CONTRACTS.search.freshTurns },
    production: market.PRODUCTION.cycleTurns,
    cyclesPerDay: market.CYCLES_PER_DAY,
    reliefDelay: market.RELIEF.delayTurns,
    bounty: [market.BOUNTY.lapseTurns, market.BOUNTY.huntTurns, market.BOUNTY.retryTurns, market.BOUNTY.offerGapTurns],
    oddJobs: { ...oddJobs.ODD_JOBS },
    encounters: [encounters.ENCOUNTERS.gapTurns, encounters.ENCOUNTERS.storyGapTurns, encounters.ENCOUNTERS.wrongedTurns],
    hire: behavior.HIRE.turns,
    memory: behavior.MEMORY.turns,
    deeds: behavior.DEEDS.repeatTurns,
    spotter: skills.PERK_NUMBERS.spotter.turns,
    rations: goods.GOODS.rations.value,
  };
}

afterEach(() => {
  vi.doUnmock('./time');
  vi.resetModules();
});

describe('the work day', () => {
  it('keeps every effort number the same under any turn clock', async () => {
    const quick = await effortUnder(5760);
    const slow = await effortUnder(450);
    const odd = await effortUnder(337);
    expect(quick).toEqual(slow);
    expect(odd).toEqual(slow);
  });

  it('keeps the effort numbers dev measured at 450 turns a day', async () => {
    const now = await effortUnder(5760);
    expect(now.production).toBe(19);
    expect(now.contracts).toEqual({ warn: 38, haulSlack: 113, claimSlack: 225, searchFresh: 113 });
    expect(now.reliefDelay).toBe(675);
    expect(now.bounty).toEqual([2250, 225, 225, 450]);
    expect(now.encounters).toEqual([150, 900, 2700]);
    expect(now.hire).toBe(450);
    expect(now.memory).toEqual({ prices: 450, stripped: 450, wronged: 2700, helped: 900, sighting: 450, witnessed: 1350 });
    expect(now.deeds).toBe(450);
    expect(now.spotter).toBe(450);
    expect(now.oddJobs.shiftTurns).toBe(150);
    expect(now.oddJobs.hireBelow).toBe(55);
    expect(now.oddJobs.payPerTurn).toBeCloseTo(20 / 450 + RULES.suppliesPerTurn * ECONOMY.supplyPrice.supplies, 10);
    expect(now.rations).toBeCloseTo(11.9, 1);
  });

  it('leaves the clock day to the sun', () => {
    expect(TIME.turnsPerDay).toBe(Math.round(86400 / 15));
  });

  it('counts whole windows of work days from turn 1', () => {
    expect(workDayOf(1)).toBe(0);
    expect(workDayOf(TIME.workDayTurns)).toBe(0);
    expect(workDayOf(TIME.workDayTurns + 1)).toBe(1);
    expect(workDayStart(TIME.workDayTurns + 7)).toBe(TIME.workDayTurns + 1);
    expect(Number.isInteger(TIME.workDayTurns) && TIME.workDayTurns > 0).toBe(true);
  });
});
