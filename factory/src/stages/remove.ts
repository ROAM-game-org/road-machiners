import { moveCard } from '../card-events';
import { rmSync } from 'node:fs';
import { deployDev } from '../deploy';
import { recordFeedback } from '../pending-feedback';
import { readState, updateState } from '../state';
import { BRANCH, FEEDBACK_HEADING, RELEASE_CANDIDATE_LABEL, type Ctx, type IssueMerge, type ReleaseState } from '../types';
import { BASE_BRANCH, agentLog, workDir } from './common';
import { revertResolving } from './merge-resolve';
import { requireRelease } from './release-common';

async function revertReleaseMerge(ctx: Ctx, release: ReleaseState, issue: number): Promise<void> {
  const merge = release.merges.find((item) => item.issue === issue);
  if (merge === undefined) throw new Error(`Release ${release.day} has no recorded merge of issue #${issue}`);
  for (const [branch, sha] of (await revertsOf(ctx, release, merge)).filter(([name]) => !merge.reverted.includes(name))) {
    await revertResolving(ctx, 'remove', { issue, sha }, branch);
    updateState(ctx.statePath, (state) => (state.release ? { ...state, pendingShip: null, release: { ...state.release, postId: null, merges: markReverted(state.release.merges, issue, branch) } } : state));
  }
}

async function revertsOf(ctx: Ctx, release: ReleaseState, merge: IssueMerge): Promise<[string, string][]> {
  if (merge.fromDev !== undefined) return [[release.branch, merge.sha], [BASE_BRANCH, merge.fromDev]];
  const both = merge.into === BASE_BRANCH || (await ctx.repo.isMerged(merge.sha, BASE_BRANCH));
  return both ? [[release.branch, merge.sha], [BASE_BRANCH, merge.sha]] : [[release.branch, merge.sha]];
}

function markReverted(merges: IssueMerge[], issue: number, branch: string): IssueMerge[] {
  return merges.map((merge) => (merge.issue === issue ? { ...merge, reverted: [...merge.reverted, branch] } : merge));
}

export async function remove(ctx: Ctx, issue: number): Promise<void> {
  const removal = readState(ctx.statePath).pendingRemovals.find((item) => item.issue === issue);
  if (!removal) throw new Error(`No removal of issue #${issue} is queued`);
  const release = requireRelease(ctx);
  await ctx.repo.fetch();
  await revertReleaseMerge(ctx, release, issue);
  updateState(ctx.statePath, (state) => ({ ...state, release: state.release && { ...state.release, removed: [...new Set([...state.release.removed, issue])] } }));
  await deployDev(ctx, agentLog(ctx, issue, 'remove'));
  await ctx.repo.deleteBranch(BRANCH(issue));
  rmSync(workDir(ctx, issue), { recursive: true, force: true });
  rmSync(`${ctx.cfg.home}/work/check-issue-${issue}`, { recursive: true, force: true });
  await ctx.github.reopen(issue);
  await ctx.github.removeLabel(issue, RELEASE_CANDIDATE_LABEL);
  const body = `${FEEDBACK_HEADING}\n\nRemoved from release ${release.day} by ${removal.by}:\n\n${removal.text}`;
  await ctx.github.comment(issue, body);
  recordFeedback(ctx.statePath, issue, { source: 'committee', body });
  await moveCard(ctx, issue, 'Design', 'removed');
  updateState(ctx.statePath, (state) => ({ ...state, pendingShip: null, release: state.release && { ...state.release, postId: null } }));
  await ctx.telegram.sendMessage(ctx.cfg.committeeChat, `Issue #${issue} is out of release ${release.day} and back in design. A new candidate follows when the release tasks are done.`);
}
