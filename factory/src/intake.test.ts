import { describe, expect, it } from 'vitest';
import { intake } from './intake';
import type { Ctx, Issue } from './types';

const NOW = new Date('2026-01-10T12:00:00Z');

function issue(over: Partial<Issue>): Issue {
  return { number: 1, title: 't', body: '', labels: [], createdAt: '2026-01-01T00:00:00Z', state: 'OPEN', author: 'anna', ...over };
}

function fakeCtx(found: Issue[], calls: string[], asked: string[][] = []): Ctx {
  return {
    cfg: { home: 'tmp/factory-intake-none', minAgeHours: 24 },
    now: () => NOW,
    log: () => undefined,
    github: {
      cards: async () => [],
      candidates: async (labels: string[]) => { asked.push(labels); return found; },
      addCard: async (n: number, column: string) => { calls.push(`addCard ${n} ${column}`); },
      comment: async (n: number, body: string) => { calls.push(`comment ${n} ${body}`); },
    },
  } as unknown as Ctx;
}

describe('intake', () => {
  it('puts every aged bug and feature request in Triage with no votes', async () => {
    const calls: string[] = [];
    const found = [issue({ number: 4, labels: ['bug'] }), issue({ number: 5, labels: ['feature-request'] })];
    expect(await intake(fakeCtx(found, calls))).toEqual([4, 5]);
    expect(calls).toEqual(['addCard 4 Triage', 'addCard 5 Triage']);
  });

  it('keeps an issue younger than the minimum age out', async () => {
    const calls: string[] = [];
    const found = [issue({ number: 4, createdAt: '2026-01-10T00:00:00Z' }), issue({ number: 5 })];
    expect(await intake(fakeCtx(found, calls))).toEqual([5]);
    expect(calls).toEqual(['addCard 5 Triage']);
  });

  it('puts a fresh error report into Triage, not Design, and keeps a fresh plain bug waiting', async () => {
    const calls: string[] = [];
    const found = [issue({ number: 8, labels: ['bug', 'error-report'], createdAt: NOW.toISOString() }), issue({ number: 9, labels: ['bug'], createdAt: NOW.toISOString() })];
    expect(await intake(fakeCtx(found, calls))).toEqual([8]);
    expect(calls).toEqual(['addCard 8 Triage']);
  });

  it('puts a fresh report from the game into Triage at once, since a player cannot edit it', async () => {
    const calls: string[] = [];
    const found = [issue({ number: 10, labels: ['feature-request', 'player-report'], createdAt: NOW.toISOString() }), issue({ number: 11, labels: ['feature-request'], createdAt: NOW.toISOString() })];
    expect(await intake(fakeCtx(found, calls))).toEqual([10]);
    expect(calls).toEqual(['addCard 10 Triage']);
  });

  it('puts a fresh hotfix straight into Design', async () => {
    const calls: string[] = [];
    const asked: string[][] = [];
    const found = [issue({ number: 6, labels: ['bug', 'hotfix'], createdAt: NOW.toISOString() })];
    expect(await intake(fakeCtx(found, calls, asked))).toEqual([6]);
    expect(asked[0]).toContain('hotfix');
    expect(calls).toEqual(['addCard 6 Design']);
  });
});
