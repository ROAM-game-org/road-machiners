import { describe, expect, it } from 'vitest';
import { BudgetError, StalledFixError, onceEachHead, runCost, untilPasses } from './checkpoint';

const run = (cost: number) => `${JSON.stringify({ type: 'result', total_cost_usd: cost, duration_ms: 1000 })}\n`;

describe('untilPasses', () => {
  it('ends on the first pass with no fix', async () => {
    const fixes: string[] = [];
    await untilPasses(10, 1, async () => null, async (failure) => { fixes.push(failure); return run(1); });
    expect(fixes).toEqual([]);
  });

  it('hands each failure to the fix until the check passes', async () => {
    const results = ['broke', 'broke again', null];
    const fixes: string[] = [];
    await untilPasses(10, 1, async () => results.shift() ?? null, async (failure) => { fixes.push(failure); return run(1); });
    expect(fixes).toEqual(['broke', 'broke again']);
  });

  it('throws a BudgetError with the last failure once the runs cost the budget', async () => {
    const fixes: string[] = [];
    const loop = untilPasses(5, 2, async () => 'still broken', async (failure) => { fixes.push(failure); return run(2); });
    await expect(loop).rejects.toThrow(BudgetError);
    await expect(untilPasses(5, 2, async () => 'still broken', async () => run(2))).rejects.toThrow(/\$6\.00 of its \$5 budget[\s\S]*still broken/);
    expect(fixes).toHaveLength(2);
  });
});

describe('onceEachHead', () => {
  const loop = (heads: string[], results: (string | null)[], firsts: (string | null)[] = []) => {
    const checked: string[] = [];
    const logs: string[] = [];
    const fixes: string[] = [];
    const checkHead = onceEachHead(3, (message) => logs.push(message), async (head) => { checked.push(head); return results.shift() ?? null; });
    const done = untilPasses(100, 0, () => checkHead(heads.shift() ?? 'h9', async () => firsts.shift() ?? null), async (failure) => { fixes.push(failure); return run(1); });
    return { done, checked, logs, fixes };
  };

  it('counts a round whose first checks fail again on the same head, like a fix left uncommitted, and fails after three', async () => {
    const dirty = 'The clone has changes that are not committed';
    const { done, checked, fixes } = loop(['h1', 'h1', 'h1', 'h1'], [], [dirty, dirty, dirty, dirty]);
    const error = await done.catch((caught: unknown) => caught);
    expect(error).toMatchObject({ head: 'h1', rounds: 3, failure: dirty });
    expect(checked).toEqual([]);
    expect(fixes).toHaveLength(3);
  });

  it('starts the count again when a round fixes its first checks, like writing a missing approval, so the head checks get their own rounds', async () => {
    const { done, checked, fixes } = loop(['h1', 'h1', 'h1', 'h1', 'h1', 'h1'], ['FAIL a.test.ts > breaks'], ['no approval', 'no approval']);
    const error = await done.catch((caught: unknown) => caught);
    expect(error).toMatchObject({ head: 'h1', rounds: 3, failure: 'FAIL a.test.ts > breaks' });
    expect(checked).toEqual(['h1']);
    expect(fixes).toHaveLength(5);
  });

  it('runs the checks once per head and hands the same failure back after a round with no commit', async () => {
    const { done, checked, logs, fixes } = loop(['h1', 'h1', 'h2'], ['FAIL a.test.ts > breaks', null]);
    await done;
    expect(checked).toEqual(['h1', 'h2']);
    expect(fixes[1]).toContain('FAIL a.test.ts > breaks');
    expect(fixes[1]).toContain('Your last round made no commit, so the head is still h1');
    expect(fixes[1]).toContain('After 3 rounds in a row with no commit the stage stops.');
    expect(logs).toEqual(['the fix round made no commit, so h1 keeps its failure and the checks do not run again']);
  });

  it('fails with the first failure of the head after that many rounds in a row with no commit, and runs no further fix', async () => {
    const { done, checked, fixes } = loop(['h1', 'h1', 'h1', 'h1', 'h1'], ['FAIL a.test.ts > breaks']);
    const error = await done.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StalledFixError);
    expect(error).toMatchObject({ head: 'h1', rounds: 3, failure: 'FAIL a.test.ts > breaks' });
    expect((error as Error).message).toMatch(/last 3 fix rounds in a row made no commit, so h1[\s\S]*FAIL a.test.ts > breaks$/);
    expect(checked).toEqual(['h1']);
    expect(fixes).toHaveLength(3);
  });

  it('starts the count again on a new head, so rounds that commit never stall the stage', async () => {
    const { done, checked, fixes } = loop(['h1', 'h1', 'h1', 'h2', 'h2', 'h2', 'h3'], ['one', 'two', null]);
    await done;
    expect(checked).toEqual(['h1', 'h2', 'h3']);
    expect(fixes).toHaveLength(6);
  });
});

describe('runCost', () => {
  it('reads the cost of the result event', () => {
    expect(runCost(run(1.25))).toBe(1.25);
  });
});
