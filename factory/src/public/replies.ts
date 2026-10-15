import { readLedger } from '../ledger';
import { readState, updateState } from '../state';
import { RELEASE_CANDIDATE_LABEL, VOTING_LABEL, type Column, type Ctx } from '../types';
import { isolated } from './isolate';
import { textsFor, type ReplyText } from './reply-text';
import type { IssueComment, PublicStore, StoredComment } from './store';

const issueLink = (ctx: Ctx, issue: number): string => `#${issue}: https://github.com/${ctx.cfg.repo}/issues/${issue}`;

const APPROVED: Column[] = ['Hardening', 'Merging'];
const IN_WORK: Column[] = ['Design', 'Implementation', 'Testing', 'Approval'];

async function columnStatus(ctx: Ctx, issue: number, text: ReplyText): Promise<string> {
  const column = (await ctx.github.cards()).find((card) => card.issue === issue)?.column;
  if (column !== undefined && APPROVED.includes(column)) return text.approved;
  return column !== undefined && IN_WORK.includes(column) ? text.inWork : text.notBuilt;
}

async function issueStatus(ctx: Ctx, issue: number, text: ReplyText): Promise<string> {
  const found = await ctx.github.issue(issue);
  if (found.state === 'CLOSED') return text.closed;
  if (found.labels.includes(RELEASE_CANDIDATE_LABEL)) return text.releaseCandidate;
  if (found.labels.includes(VOTING_LABEL)) return text.voting;
  return columnStatus(ctx, issue, text);
}

async function filingReply(ctx: Ctx, store: PublicStore, comment: StoredComment, text: ReplyText): Promise<string> {
  if (comment.filedIssue === null) return text.fileFailed;
  const link = issueLink(ctx, comment.filedIssue);
  if (!store.filedBefore(comment)) return comment.kind === 'bug' ? text.filedBug(link) : text.filedIdea(link);
  return `${text.alreadyFiled(link)}\n${await issueStatus(ctx, comment.filedIssue, text)}`;
}

async function threadNote(ctx: Ctx, comment: IssueComment, text: ReplyText): Promise<string> {
  const link = issueLink(ctx, comment.issue);
  return comment.linked ? text.aboutWork(link, await issueStatus(ctx, comment.issue, text)) : text.added(link);
}

const waitsForAddress = (comment: IssueComment): boolean => comment.kind === 'feedback' || (comment.linked && comment.kind === 'question');

const isOnThread = (comment: StoredComment): comment is IssueComment => comment.issue !== null && comment.relevance !== 'other';

function asksBot(comment: StoredComment): boolean {
  if (comment.kind !== 'question') return false;
  if (isOnThread(comment)) return !waitsForAddress(comment) || comment.addressed;
  return comment.addressed || comment.issue !== null;
}

export async function replyText(ctx: Ctx, store: PublicStore, comment: StoredComment): Promise<string | null> {
  if (comment.kind === null || comment.kind === 'rejected' || comment.kind === 'chatter') return null;
  const text = textsFor(comment.language);
  if (isOnThread(comment)) return waitsForAddress(comment) && !comment.addressed ? null : threadNote(ctx, comment, text);
  return comment.kind === 'bug' || comment.kind === 'feature' ? filingReply(ctx, store, comment, text) : null;
}

const DAY_MS = 24 * 3_600_000;

function answerJobsToday(ctx: Ctx): number {
  const ended = readLedger(ctx.cfg.home, new Date(ctx.now().getTime() - DAY_MS)).filter((line) => line.kind === 'job' && line.stage === 'answer').length;
  const state = readState(ctx.statePath);
  return ended + state.jobs.filter((job) => job.stage === 'answer').length + state.pendingAnswers.length;
}

function queueAnswer(ctx: Ctx, comment: StoredComment): void {
  if (!asksBot(comment)) return;
  if (answerJobsToday(ctx) >= ctx.cfg.answersPerDay) return ctx.log('public', comment.issue, `player comment ${comment.id} gets no answer job, since ${ctx.cfg.answersPerDay} ran or wait in the last 24 hours`);
  updateState(ctx.statePath, (state) => ({ ...state, pendingAnswers: [...state.pendingAnswers, comment.id] }));
  ctx.log('public', comment.issue, `player comment ${comment.id} waits for the answer job`);
}

export async function sendReplies(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const comment of store.toReply()) {
    store.markReplied(comment.id, ctx.now());
    queueAnswer(ctx, comment);
    await isolated(ctx, comment.issue, `the chat reply to player comment ${comment.id} failed and is not sent again`, async () => {
      const text = await replyText(ctx, store, comment);
      if (text === null || comment.chat === null || comment.messageId === null) return;
      store.setReplyId(comment.id, await ctx.telegram.sendMessage(comment.chat, text, comment.messageId));
    });
  }
}
