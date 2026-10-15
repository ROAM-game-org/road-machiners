import { cardFlow, moveCard } from '../card-events';
import { readState, updateState } from '../state';
import { BRANCH, type Ctx, type KeptApproval } from '../types';

export function keptApprovalOf(ctx: Ctx, issue: number): KeptApproval | null {
  return readState(ctx.statePath).keptApprovals[String(issue)] ?? null;
}

export function dropKeptApproval(ctx: Ctx, issue: number): KeptApproval | null {
  let dropped: KeptApproval | null = null;
  updateState(ctx.statePath, (state) => {
    const { [String(issue)]: kept, ...rest } = state.keptApprovals;
    dropped = kept ?? null;
    return { ...state, keptApprovals: rest };
  });
  return dropped;
}

export async function invalidateApproval(ctx: Ctx, issue: number, reason: string): Promise<boolean> {
  const dropped = dropKeptApproval(ctx, issue);
  if (dropped === null) return false;
  await ctx.github.comment(issue, `The approval by ${dropped.by} of build ${dropped.build} no longer holds: ${reason} The changed build needs a new approval, so it gets a new post.`);
  ctx.log('approve', issue, `kept approval by ${dropped.by} dropped: ${reason}`);
  return true;
}

export async function containsApproved(ctx: Ctx, approval: KeptApproval, head: string): Promise<boolean> {
  try {
    return await ctx.repo.isMerged(approval.build, head);
  } catch {
    return false;
  }
}

export async function stillApproved(ctx: Ctx, issue: number): Promise<KeptApproval | null> {
  const approval = keptApprovalOf(ctx, issue);
  if (approval === null) return null;
  if (await containsApproved(ctx, approval, BRANCH(issue))) return approval;
  await invalidateApproval(ctx, issue, `${BRANCH(issue)} no longer contains the approved build, so what ships would not be what was approved.`);
  return null;
}

export async function requeueApproved(ctx: Ctx, issue: number, approval: KeptApproval, build: string): Promise<void> {
  const key = String(issue);
  updateState(ctx.statePath, (state) => {
    const kept = state.keptApprovals[key] ?? approval;
    return { ...state, builds: { ...state.builds, [key]: build }, keptApprovals: { ...state.keptApprovals, [key]: { ...kept, checked: [...kept.checked, build] } } };
  });
  await ctx.github.comment(issue, `The full checks passed on ${build}, which merges newer main into the approved build ${approval.build}. The approval by ${approval.by} still holds, so it ships next with no new post.`);
  await moveCard(ctx, issue, 'Approval', 'requeued', cardFlow((await ctx.github.issue(issue)).labels));
  updateState(ctx.statePath, (state) => ({ ...state, pendingApprovals: { ...state.pendingApprovals, [key]: approval.by } }));
  ctx.log('verify', issue, `checks passed on ${build}, approval by ${approval.by} queued again`);
}
