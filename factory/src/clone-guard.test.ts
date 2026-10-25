import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, writeState } from './state';
import { cleanWork } from './tick';
import type { Card, Ctx, FactoryConfig } from './types';

const ROOT = resolve('tmp/factory-clone-guard-test');
const statePath = join(ROOT, 'state.json');
const design = (issue: number): Card => ({ itemId: `I${issue}`, issue, column: 'Design', labels: [] });

function ctxWith(card: (issue: number) => Promise<Card | null>, logs: string[]): Ctx {
  return { cfg: { home: ROOT, logDays: 14, transcriptDays: 14 } as FactoryConfig, statePath, now: () => new Date('2026-10-22T19:05:00Z'), log: (_stage: string, _issue: number | null, msg: string) => void logs.push(msg), github: { card } } as unknown as Ctx;
}

const exists = (name: string): boolean => existsSync(join(ROOT, 'work', name));

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  for (const name of ['issue-892', 'issue-893', 'issue-894']) mkdirSync(join(ROOT, 'work', name), { recursive: true });
  writeState(statePath, structuredClone(EMPTY_STATE));
});

describe('cleanWork when the board list omits open cards', () => {
  const listed = [{ ...design(1), column: 'Done' as const }];

  it('keeps the clone of a card its own issue shows open, though the board list omits it', async () => {
    const logs: string[] = [];
    await cleanWork(ctxWith(async (issue) => (issue === 892 || issue === 893 ? design(issue) : null), logs), listed);
    expect([exists('issue-892'), exists('issue-893'), exists('issue-894')]).toEqual([true, true, false]);
    expect(logs).toEqual(['removed work clone issue-894']);
  });

  it('keeps every clone it cannot confirm off the board, and says why', async () => {
    const logs: string[] = [];
    await cleanWork(ctxWith(async () => { throw new Error('GitHub is down'); }, logs), listed);
    expect([exists('issue-892'), exists('issue-893'), exists('issue-894')]).toEqual([true, true, true]);
    expect(logs).toHaveLength(3);
    expect(logs[0]).toContain('GitHub is down');
  });

  it('removes the clone of a card its own issue shows in Done', async () => {
    await cleanWork(ctxWith(async (issue) => ({ ...design(issue), column: 'Done' }), []), listed);
    expect([exists('issue-892'), exists('issue-893'), exists('issue-894')]).toEqual([false, false, false]);
  });
});
