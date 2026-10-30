import { usageFromOutput } from '../ledger';

export class BudgetError extends Error {}

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
