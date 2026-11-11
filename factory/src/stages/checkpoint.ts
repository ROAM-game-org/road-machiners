import { usageFromOutput } from '../ledger';

export class BudgetError extends Error {}

export class StalledFixError extends Error {
  constructor(readonly head: string, readonly rounds: number, readonly failure: string) {
    super(`The last ${rounds} fix rounds in a row made no commit, so ${head} still fails its checks and the stage stops instead of spending the rest of its budget. The failure:\n${failure}`);
  }
}

export class BaselineFailureError extends Error {
  constructor(readonly into: string, readonly base: string, readonly tests: string[], detail: string) {
    super(`The checks fail only on tests that fail on ${into} at ${base} too, so no fix round runs and nothing merges. Failed tests: ${tests.join('; ')}.\n${detail}`);
  }
}

export function runCost(stream: string): number {
  return usageFromOutput(stream, '').costUsd;
}

export async function untilPasses(budgetUsd: number, spent: number, check: () => Promise<string | null>, fix: (failure: string) => Promise<string>): Promise<number> {
  let total = spent;
  for (;;) {
    const failure = await check();
    if (failure === null) return total;
    if (total >= budgetUsd) throw new BudgetError(`The stage spent $${total.toFixed(2)} of its $${budgetUsd} budget, and its checkpoint still fails.\n${failure}`);
    total += runCost(await fix(failure));
  }
}

export type HeadChecks = (head: string) => Promise<string | null>;

export function onceEachHead(rounds: number, log: (message: string) => void, checks: HeadChecks): HeadChecks {
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`FACTORY_NO_COMMIT_ROUNDS must be a whole number of at least 1, not ${rounds}`);
  let failed: { head: string; failure: string; stalled: number } | null = null;
  return async (head) => {
    if (failed?.head !== head) {
      const failure = await checks(head);
      failed = failure === null ? null : { head, failure, stalled: 0 };
      return failure;
    }
    failed.stalled += 1;
    if (failed.stalled >= rounds) throw new StalledFixError(head, failed.stalled, failed.failure);
    log(`the fix round made no commit, so ${head} keeps its failure and the checks do not run again`);
    return `${failed.failure}\n\n${noCommitNote(head, rounds)}`;
  };
}

function noCommitNote(head: string, rounds: number): string {
  return `Your last round made no commit, so the head is still ${head} and the factory did not run the checks again. The failure above still stands. Commit the fix. Changes left uncommitted are never tested. After ${rounds} rounds in a row with no commit the stage stops.`;
}
