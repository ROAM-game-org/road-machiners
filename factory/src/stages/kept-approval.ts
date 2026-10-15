import { cardFlow, moveCard } from '../card-events';
import { readState, updateState } from '../state';
import { BRANCH, STUCK_LABEL, type Card, type Ctx, type FactoryState, type KeptApproval } from '../types';

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
  await moveCard(ctx, issue, 'Approval', 'requeued', cardFlow((await ctx.github.issue(issue)).labels));
  updateState(ctx.statePath, (state) => ({ ...state, pendingApprovals: { ...state.pendingApprovals, [key]: approval.by } }));
  await ctx.github.comment(issue, `The full checks passed on ${build}, which merges newer main into the approved build ${approval.build}. The approval by ${approval.by} still holds, so it ships next with no new post.`);
  ctx.log('verify', issue, `checks passed on ${build}, approval by ${approval.by} queued again`);
}

function waitsInApproval(card: Card): boolean {
  return card.column === 'Approval' && !card.labels.includes(STUCK_LABEL);
}

function busy(state: FactoryState, issue: number): boolean {
  const key = String(issue);
  const owned = state.jobs.some((job) => job.issue === issue) || state.failures.some((failure) => failure.issue === issue);
  return owned || key in state.pendingApprovals || key in state.held;
}

export function readyToShip(state: FactoryState, card: Card): KeptApproval | null {
  const approval = state.keptApprovals[String(card.issue)];
  if (approval === undefined || !waitsInApproval(card) || busy(state, card.issue)) return null;
  return approval.checked.includes(state.builds[String(card.issue)] ?? '') ? approval : null;
}

export function requeueKept(ctx: Ctx, cards: Card[]): void {
  for (const card of cards) {
    const approval = readyToShip(readState(ctx.statePath), card);
    if (approval === null) continue;
    updateState(ctx.statePath, (state) => ({ ...state, pendingApprovals: { ...state.pendingApprovals, [String(card.issue)]: approval.by } }));
    ctx.log('tick', card.issue, `queued the kept approval by ${approval.by} again, since its checked build waits in Approval with no job`);
  }
}
