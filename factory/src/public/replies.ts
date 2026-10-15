import { queueAnswer } from './answer-queue';
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

export async function threadNote(ctx: Ctx, comment: IssueComment, text: ReplyText): Promise<string> {
  const link = issueLink(ctx, comment.issue);
  return comment.linked ? text.aboutWork(link, await issueStatus(ctx, comment.issue, text)) : text.added(link);
}

const waitsForAddress = (comment: IssueComment): boolean => comment.kind === 'feedback' || (comment.linked && comment.kind === 'question');

export const isOnThread = (comment: StoredComment): comment is IssueComment => comment.issue !== null && comment.relevance !== 'other';

export function wantsAnswer(comment: StoredComment): boolean {
  if (comment.kind !== 'question') return false;
  if (isOnThread(comment)) return !waitsForAddress(comment) || comment.addressed;
  return comment.addressed || comment.issue !== null;
}

export async function replyText(ctx: Ctx, store: PublicStore, comment: StoredComment): Promise<string | null> {
  if (comment.kind === null || comment.kind === 'rejected' || comment.kind === 'chatter' || comment.kind === 'question') return null;
  const text = textsFor(comment.language);
  if (isOnThread(comment)) return waitsForAddress(comment) && !comment.addressed ? null : threadNote(ctx, comment, text);
  if (comment.kind === 'bug' || comment.kind === 'feature') return filingReply(ctx, store, comment, text);
  return null;
}

const DAY_MS = 24 * 3_600_000;

function sendToAnswerJob(ctx: Ctx, store: PublicStore, comment: StoredComment): void {
  const now = ctx.now();
  if (store.answersQueuedSince(new Date(now.getTime() - DAY_MS)) >= ctx.cfg.answersPerDay) return ctx.log('public', comment.issue, `player question ${comment.id} waits, since ${ctx.cfg.answersPerDay} questions went to the answer job in the last 24 hours`);
  store.queueAnswer(comment.id, now);
  queueAnswer(ctx, comment.id);
  store.markReplied(comment.id, now);
}

export async function sendReplies(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const comment of store.toReply()) {
    if (wantsAnswer(comment)) {
      sendToAnswerJob(ctx, store, comment);
      continue;
    }
    store.markReplied(comment.id, ctx.now());
    await isolated(ctx, comment.issue, `the chat reply to player comment ${comment.id} failed and is not sent again`, async () => {
      const text = await replyText(ctx, store, comment);
      if (text === null || comment.chat === null || comment.messageId === null) return;
      store.setReplyId(comment.id, await ctx.telegram.sendMessage(comment.chat, text, comment.messageId));
    });
  }
}
