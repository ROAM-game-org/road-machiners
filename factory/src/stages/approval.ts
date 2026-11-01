import { rmSync } from 'node:fs';
import { cardFlow, moveCard, type CardFacts } from '../card-events';
import { appendLedger } from '../ledger';
import { adoptReplyMedia, dropReplyMedia, replyMediaLines } from '../reply-media';
import { readState, updateState } from '../state';
import { recordFeedback } from '../pending-feedback';
import { BRANCH, BaseMovedError, FEEDBACK_HEADING, PLAYER_REPORT_HEADING, QUESTION_HEADING, MergeConflictError, WONT_DO_LABEL, type Ctx, type FeedbackSource, type KeptApproval, type Route } from '../types';
import { HOTFIX_BASE, baseBranchFor, mediaDir, workDir } from './common';
import { releaseBundle } from './bundle';
import { shipHotfix } from './hotfix';
import { queueIncidents } from './incident';
import { dropKeptApproval, invalidateApproval } from './kept-approval';

async function requireApproval(ctx: Ctx, issue: number): Promise<void> {
  const card = (await ctx.github.cards()).find((item) => item.issue === issue);
  if (card?.column !== 'Approval') throw new Error(`Issue #${issue} is not in Approval, it is in ${card?.column ?? 'no column'}`);
}

export function forgetPosts(ctx: Ctx, issue: number, keepBuild = false): void {
  const closed = Object.entries(readState(ctx.statePath).approvalPosts).filter(([, number]) => number === issue).map(([post]) => Number(post));
  updateState(ctx.statePath, (state) => {
    const approvalPosts = Object.fromEntries(Object.entries(state.approvalPosts).filter(([, number]) => number !== issue));
    const pendingApprovals = { ...state.pendingApprovals };
    delete pendingApprovals[String(issue)];
    const builds = { ...state.builds };
    const suiteCleared = { ...state.suiteCleared };
    if (!keepBuild) delete builds[String(issue)];
    if (!keepBuild) delete suiteCleared[String(issue)];
    const approvedResolving = { ...state.approvedResolving };
    delete approvedResolving[String(issue)];
    const postOnly = state.postOnly.filter((n) => n !== issue);
    const unroutedReplies = Object.fromEntries(Object.entries(state.unroutedReplies).filter(([, reply]) => reply.issue !== issue));
    return { ...state, approvalPosts, pendingApprovals, builds, suiteCleared, approvedResolving, postOnly, unroutedReplies };
  });
  dropReplyMedia(ctx.cfg.home, closed);
}

export async function approve(ctx: Ctx, issue: number, by: string): Promise<void> {
  await requireApproval(ctx, issue);
  const item = await ctx.github.issue(issue);
  const base = baseBranchFor(ctx, item.labels);
  if (base !== HOTFIX_BASE) return harden(ctx, issue, by, base);
  const { approval, build } = keepApproval(ctx, issue, by);
  try {
    const message = await shipHotfix(ctx, issue, item.title, approval, build);
    await closeMerged(ctx, issue, item.labels, message, { into: HOTFIX_BASE });
  } catch (error) {
    const reason = movedReason(error, issue);
    if (reason === null) throw error;
    await integrateAgain(ctx, issue, item.labels, approval, reason);
  }
}

function keepApproval(ctx: Ctx, issue: number, by: string): { approval: KeptApproval; build: string } {
  const key = String(issue);
  const state = readState(ctx.statePath);
  const build = state.builds[key];
  if (build === undefined) throw new Error(`Issue #${issue} has no published build, so there is nothing to ship.`);
  const kept = state.keptApprovals[key];
  if (kept !== undefined && kept.checked.includes(build)) return { approval: kept, build };
  const approval: KeptApproval = { by, at: ctx.now().toISOString(), build, checked: [build], reason: null };
  updateState(ctx.statePath, (next) => ({ ...next, keptApprovals: { ...next.keptApprovals, [key]: approval } }));
  return { approval, build };
}

function movedReason(error: unknown, issue: number): string | null {
  if (error instanceof BaseMovedError && error.branch === BRANCH(issue)) return error.message;
  if (error instanceof MergeConflictError && error.step.issue === issue) return `main moved on, and the branch conflicts with it in ${error.files.join(', ')}.`;
  return null;
}

async function integrateAgain(ctx: Ctx, issue: number, labels: string[], approval: KeptApproval, reason: string): Promise<void> {
  forgetPosts(ctx, issue);
  updateState(ctx.statePath, (state) => ({ ...state, keptApprovals: { ...state.keptApprovals, [String(issue)]: { ...approval, reason } } }));
  await ctx.github.comment(issue, `The approval by ${approval.by} of build ${approval.build} still holds. ${reason} Testing merges main, keeps both sides and runs the full checks on the result. It ships with no new post, unless the merge changes what was approved.`);
  await moveCard(ctx, issue, 'Testing', 'base-moved', cardFlow(labels));
  ctx.log('approve', issue, `main moved, back to Testing with the approval by ${approval.by} kept`);
}

async function harden(ctx: Ctx, issue: number, by: string, base: string): Promise<void> {
  forgetPosts(ctx, issue, true);
  dropKeptApproval(ctx, issue);
  updateState(ctx.statePath, (state) => ({ ...state, approvedResolving: { ...state.approvedResolving, [String(issue)]: by } }));
  await ctx.github.comment(issue, `Approved by ${by} in the committee chat. Hardening runs now. Then the factory checks it merged with ${base} and merges it by itself, with no new post.`);
  await moveCard(ctx, issue, 'Hardening', 'approved');
  ctx.log('approve', issue, `approved by ${by}, to Hardening`);
}

export async function closeMerged(ctx: Ctx, issue: number, labels: string[], message: string | null, merge: CardFacts): Promise<void> {
  await moveCard(ctx, issue, 'Done', 'merged', cardFlow(labels), merge);
  forgetPosts(ctx, issue, merge.into !== HOTFIX_BASE);
  dropKeptApproval(ctx, issue);
  rmSync(workDir(ctx, issue), { recursive: true, force: true });
  rmSync(`${ctx.cfg.home}/work/check-issue-${issue}`, { recursive: true, force: true });
  if (message !== null) await ctx.telegram.sendMessage(ctx.cfg.committeeChat, message);
}

export async function routeFeedback(ctx: Ctx, issue: number, by: string, text: string, route: Route, post: number, source: FeedbackSource = 'committee'): Promise<boolean> {
  await requireApproval(ctx, issue);
  const state = readState(ctx.statePath);
  const body = await routeComment(ctx, issue, by, text, route, post, source === 'player' ? PLAYER_REPORT_HEADING : FEEDBACK_HEADING);
  await ctx.github.comment(issue, body);
  appendLedger(ctx.cfg.home, { kind: 'route', issue, route, by, at: ctx.now().toISOString() });
  if (route === 'answer') return false;
  recordFeedback(ctx.statePath, issue, { source, body });
  await moveCard(ctx, issue, route === 'patch' ? 'Testing' : 'Design', route);
  forgetPosts(ctx, issue);
  if (source === 'committee') queueIncidents(ctx, [issue]);
  await invalidateApproval(ctx, issue, `${by} sent it back as a ${route}, which changes what was approved.`);
  return String(issue) in state.pendingApprovals;
}

async function routeComment(ctx: Ctx, issue: number, by: string, text: string, route: Route, post: number, heading: string): Promise<string> {
  if (route === 'answer') return `${QUESTION_HEADING}\n\nFrom ${by}, routed as answer:\n\n${text}`;
  const media = replyMediaLines(await adoptReplyMedia(ctx.cfg.home, post, mediaDir(ctx, issue), by, (fileId) => ctx.telegram.downloadFile(fileId)));
  return `${heading}\n\nFrom ${by}, routed as ${route}:\n\n${text}${media}`;
}

export async function deny(ctx: Ctx, issue: number, by: string): Promise<void> {
  await requireApproval(ctx, issue);
  await closeCard(ctx, issue, `Denied by ${by} in the committee chat.`, 'denied');
  queueIncidents(ctx, [issue]);
}

export async function closeCard(ctx: Ctx, issue: number, comment: string, step: 'denied' | 'dropped'): Promise<void> {
  await ctx.github.comment(issue, comment);
  if ((await ctx.github.pullRequestFor(BRANCH(issue))) !== null) await ctx.github.closePullRequest(BRANCH(issue), comment);
  await ctx.github.addLabel(issue, WONT_DO_LABEL);
  await ctx.github.close(issue, 'not planned');
  await moveCard(ctx, issue, 'Done', step);
  forgetPosts(ctx, issue);
  dropKeptApproval(ctx, issue);
  await releaseBundle(ctx, issue, 'was denied');
}
