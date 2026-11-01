import { moveCard } from '../card-events';
import { rmSync } from 'node:fs';
import { deployDev } from '../deploy';
import { recordFeedback } from '../pending-feedback';
import { readState, updateState } from '../state';
import { BRANCH, FEEDBACK_HEADING, RELEASE_CANDIDATE_LABEL, type Ctx, type FactoryState, type IssueMerge, type ReleaseState } from '../types';
import { BASE_BRANCH, agentLog, workDir } from './common';
import { revertResolving } from './merge-resolve';
import { mergeOf, requireRelease } from './release-common';

async function revertOnDev(ctx: Ctx, release: ReleaseState, issue: number): Promise<void> {
  const merge = mergeOf(readState(ctx.statePath).devMerges, issue);
  if (merge === undefined && release.removed.includes(issue)) return;
  if (merge === undefined) throw new Error(`Dev has no recorded merge of issue #${issue}`);
  if (merge.reverted.includes(BASE_BRANCH)) return;
  await revertResolving(ctx, 'remove', merge, BASE_BRANCH);
  updateState(ctx.statePath, (state) => ({ ...state, devMerges: state.devMerges.map((item) => (sameMerge(item, merge) ? { ...item, reverted: [...item.reverted, BASE_BRANCH] } : item)) }));
}

const sameMerge = (a: IssueMerge, b: IssueMerge): boolean => a.issue === b.issue && a.sha === b.sha;

function dropCandidate(state: FactoryState, issue: number): FactoryState {
  const release = state.release && { ...state.release, postId: null, candidate: null, removed: [...new Set([...state.release.removed, issue])], playtest: { ...state.release.playtest, passed: null } };
  return { ...state, pendingShip: null, release };
}

function forgetMerge(state: FactoryState, issue: number): FactoryState {
  return { ...state, devMerges: state.devMerges.filter((merge) => merge.issue !== issue) };
}

export async function remove(ctx: Ctx, issue: number): Promise<void> {
  const removal = readState(ctx.statePath).pendingRemovals.find((item) => item.issue === issue);
  if (!removal) throw new Error(`No removal of issue #${issue} is queued`);
  const release = requireRelease(ctx);
  await ctx.repo.fetch();
  await revertOnDev(ctx, release, issue);
  updateState(ctx.statePath, (state) => dropCandidate(state, issue));
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
  updateState(ctx.statePath, (state) => forgetMerge(state, issue));
  await ctx.telegram.sendMessage(ctx.cfg.committeeChat, `Issue #${issue} is out of release ${release.day} and back in design. The next playtest pass without it becomes the new candidate.`);
}
