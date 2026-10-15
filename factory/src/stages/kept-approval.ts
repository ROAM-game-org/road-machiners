import { cardFlow, moveCard } from '../card-events';
import { readState, updateState } from '../state';
import { BRANCH, FEEDBACK_HEADING, HOTFIX_LABEL, PLAYER_REPORT_HEADING, STUCK_LABEL, type Card, type Ctx, type FactoryState, type IssueComment, type KeptApproval } from '../types';
import { POST_MARK } from './checks';

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

const APPROVALS = [/^Approved by (.+?), but main moved on/, /^The approval by (.+?) of build ([0-9a-f]{7,40}) still holds\./];
const CHANGES = [FEEDBACK_HEADING, PLAYER_REPORT_HEADING, 'Denied by ', 'Dropped by '];
const LOST = /^The approval by .+ no longer holds/;

type Recorded = { by: string; build: string | null; at: string };

function recordedApproval(comment: IssueComment): Recorded | null {
  for (const pattern of APPROVALS) {
    const found = comment.body.match(pattern);
    if (found) return { by: found[1]!, build: found[2] ?? null, at: comment.createdAt };
  }
  return null;
}

function lastIndex<T>(items: T[], matches: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) if (matches(items[index]!)) return index;
  return -1;
}

function postedBuild(comment: IssueComment): string | null {
  if (!comment.body.startsWith(POST_MARK)) return null;
  return comment.body.slice(POST_MARK.length).trim().split(/\s/)[0]!.match(/\/([0-9a-f]{7,40})\/?$/)?.[1] ?? null;
}

function approvedPost(comments: IssueComment[], approvedAt: number, named: string | null): number {
  const before = comments.slice(0, approvedAt).map(postedBuild);
  return named === null ? lastIndex(before, (build) => build !== null) : before.lastIndexOf(named);
}

function changeSince(comments: IssueComment[], post: number): IssueComment | undefined {
  return comments.slice(post + 1).find((comment) => CHANGES.some((prefix) => comment.body.startsWith(prefix)) || LOST.test(comment.body));
}

function requireRecoverable(ctx: Ctx, card: Card): void {
  const { issue } = card;
  if (!card.labels.includes(HOTFIX_LABEL)) throw new Error(`#${issue} is no hotfix. Only a hotfix keeps its approval this way.`);
  if (card.column !== 'Testing' && card.column !== 'Approval') throw new Error(`#${issue} is in ${card.column}. Only a card in Testing or Approval can get its approval back.`);
  if (keptApprovalOf(ctx, issue) !== null) throw new Error(`#${issue} already keeps an approval.`);
}

function approvalOnRecord(comments: IssueComment[], issue: number): Recorded & { build: string } {
  const approvedAt = lastIndex(comments, (comment) => recordedApproval(comment) !== null);
  if (approvedAt === -1) throw new Error(`No factory comment on #${issue} records an approval that main moved past.`);
  const recorded = recordedApproval(comments[approvedAt]!)!;
  const post = approvedPost(comments, approvedAt, recorded.build);
  if (post === -1) throw new Error(`No factory post on #${issue} before the approval by ${recorded.by} names the build it approved.`);
  const changed = changeSince(comments, post);
  if (changed !== undefined) throw new Error(`#${issue} changed after the post ${recorded.by} approved: ${changed.body.split('\n')[0]}`);
  return { ...recorded, build: postedBuild(comments[post]!)! };
}

export async function verifiedApproval(ctx: Ctx, card: Card, reason: string): Promise<KeptApproval> {
  requireRecoverable(ctx, card);
  const comments = (await ctx.github.comments(card.issue)).filter((comment) => comment.byFactory);
  const { by, at, build } = approvalOnRecord(comments, card.issue);
  await ctx.repo.fetch();
  const approval: KeptApproval = { by, at, build, checked: [], reason };
  if (!(await containsApproved(ctx, approval, BRANCH(card.issue)))) throw new Error(`${BRANCH(card.issue)} no longer contains build ${build}, which ${by} approved.`);
  return approval;
}
