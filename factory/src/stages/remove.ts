import { moveCard } from '../card-events';
import { rmSync } from 'node:fs';
import { deployDev } from '../deploy';
import { recordFeedback } from '../pending-feedback';
import { readState, updateState } from '../state';
import { BRANCH, FEEDBACK_HEADING, RELEASE_CANDIDATE_LABEL, type Ctx, type IssueMerge, type ReleaseState } from '../types';
import { BASE_BRANCH, agentLog, workDir } from './common';
import { revertResolving } from './merge-resolve';
import { requireRelease, requireReleaseMerges } from './release-common';

async function revertReleaseMerge(ctx: Ctx, release: ReleaseState, issue: number): Promise<void> {
  const merge = requireReleaseMerges(release).find((item) => item.issue === issue);
  if (merge === undefined) throw new Error(`Release ${release.day} has no recorded merge of issue #${issue}`);
  const branches = merge.into === BASE_BRANCH ? [release.branch, BASE_BRANCH] : [release.branch];
  for (const branch of branches.filter((name) => !merge.reverted.includes(name))) {
    await revertResolving(ctx, 'remove', merge, branch);
    updateState(ctx.statePath, (state) => (state.release ? { ...state, pendingShip: null, release: { ...state.release, postId: null, merges: markReverted(requireReleaseMerges(state.release), issue, branch) } } : state));
  }
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
