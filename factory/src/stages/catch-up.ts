import { withoutStageFailuresOf } from '../fail';
import { readState, updateState } from '../state';
import { BRANCH, type Ctx } from '../types';
import { baseBranchFor } from './common';
import { waitingMerges } from './merge';
import { mergeResolving } from './merge-resolve';

export async function catchUp(ctx: Ctx, issue: number): Promise<void> {
  const card = (await ctx.github.cards()).find((other) => other.issue === issue);
  if (card === undefined || !waitingMerges(readState(ctx.statePath), [card]).length) return ctx.log('catch-up', issue, 'the card no longer waits in Merging');
  const base = baseBranchFor(ctx, card.labels);
  await ctx.repo.fetch();
  const head = await ctx.repo.headHash(base);
  if (await ctx.repo.isMerged(base, BRANCH(issue))) {
    recordCaughtUp(ctx, issue, head);
    return ctx.log('catch-up', issue, `${BRANCH(issue)} already holds ${base}`);
  }
  await mergeBase(ctx, issue, base);
  recordCaughtUp(ctx, issue, head);
  ctx.log('catch-up', issue, `${BRANCH(issue)} took ${base}`);
}

async function mergeBase(ctx: Ctx, issue: number, base: string): Promise<void> {
  try {
    await mergeResolving(ctx, 'catch-up', [{ branch: base, into: BRANCH(issue), message: `Merge ${base} into ${BRANCH(issue)} while it waits in Merging`, issue: null }]);
  } catch (error) {
    throw new Error(`The catch-up of #${issue} with ${base} failed, and its merge job merges it as before: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

function recordCaughtUp(ctx: Ctx, issue: number, head: string): void {
  updateState(ctx.statePath, (state) => ({ ...state, caughtUpTo: { ...state.caughtUpTo, [issue]: head }, failures: withoutStageFailuresOf(state.failures, 'catch-up', issue) }));
}
