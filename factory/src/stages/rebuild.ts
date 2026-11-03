import { rmSync } from 'node:fs';
import { cardFlow, moveCard } from '../card-events';
import type { ForeignBaseError } from '../diff-guard';
import { withoutFailuresOf } from '../fail';
import { clearSessions } from '../sessions';
import { updateState } from '../state';
import { BRANCH, type Ctx, type Stage } from '../types';
import { forgetPosts } from './approval';
import { workDir } from './common';
import { dropKeptApproval } from './kept-approval';

export async function rebuildOnOwnBase(ctx: Ctx, stage: Stage, issue: number, error: ForeignBaseError): Promise<void> {
  const { labels } = await ctx.github.issue(issue);
  await ctx.repo.deleteBranch(BRANCH(issue));
  rmSync(workDir(ctx, issue), { recursive: true, force: true });
  rmSync(`${ctx.cfg.home}/work/check-issue-${issue}`, { recursive: true, force: true });
  clearSessions(ctx.cfg.home, issue);
  forgetPosts(ctx, issue);
  dropKeptApproval(ctx, issue);
  updateState(ctx.statePath, (state) => {
    const caughtUpTo = Object.fromEntries(Object.entries(state.caughtUpTo).filter(([key]) => key !== String(issue)));
    return { ...state, caughtUpTo, interrupted: state.interrupted.filter((number) => number !== issue), failures: withoutFailuresOf(state.failures, issue) };
  });
  await ctx.github.comment(issue, `${error.message} The branch ${BRANCH(issue)} and its work clone are deleted. The card goes back to Design, which starts a clean branch from ${error.base}.`);
  await moveCard(ctx, issue, 'Design', 'rebuild', cardFlow(labels));
  ctx.log(stage, issue, `${error.count} commits of ${error.other} were on the branch, rebuilt from ${error.base}`);
}
