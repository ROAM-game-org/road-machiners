import { describe, expect, it } from 'vitest';
import { TIME } from '../../data/time';
import { JobTally } from './job-checks';
import type { TurnLine } from './turn-log';

const line = (extra: Partial<TurnLine> = {}): TurnLine => ({ ev: [], ledger: {}, ...extra }) as TurnLine;

function play(tally: JobTally, archetype: Parameters<JobTally['failure']>[0], days: number, turn: () => TurnLine): string | null {
  let failure: string | null = null;
  for (let i = 0; i < days * TIME.workDayTurns; i++) {
    tally.note(turn());
    failure ??= tally.failure(archetype);
  }
  return failure;
}

describe('JobTally', () => {
  it('judges a trader by turns with a sale', () => {
    expect(play(new JobTally(), 'trader', 3, () => line())).toMatch(/turns with a sale/);
    let turn = 0;
    expect(play(new JobTally(), 'trader', 3, () => line({ ledger: turn++ % 200 === 0 ? { goodsSold: 90 } : {} }))).toBeNull();
  });

  it('gives a hauler five days before its contract money counts', () => {
    expect(play(new JobTally(), 'hauler', 4, () => line())).toBeNull();
    expect(play(new JobTally(), 'hauler', 5, () => line())).toMatch(/money from contracts/);
  });

  it('sets no floor for a bot that switches jobs', () => {
    expect(play(new JobTally(), 'climber', 5, () => line())).toBeNull();
    expect(play(new JobTally(), 'markov', 5, () => line())).toBeNull();
  });
});
