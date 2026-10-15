import { queueAnswer } from '../stages/answer';
import { RELEASE_CANDIDATE_LABEL, VOTING_LABEL, type Column, type Ctx } from '../types';
import { isolated } from './isolate';
import { textsFor, type ReplyText } from './reply-text';
import type { IssueComment, PublicStore, StoredComment } from './store';

export type ReplyPlan = { send: string } | { answer: true } | null;

const ANSWER: ReplyPlan = { answer: true };

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

async function onThreadReply(ctx: Ctx, comment: IssueComment, text: ReplyText): Promise<ReplyPlan> {
  if (waitsForAddress(comment) && !comment.addressed) return null;
  if (comment.kind === 'question') return ANSWER;
  return { send: await threadNote(ctx, comment, text) };
}

const isOnThread = (comment: StoredComment): comment is IssueComment => comment.issue !== null && comment.relevance !== 'other';

const SILENT: StoredComment['kind'][] = [null, 'rejected', 'chatter'];

const isReport = (comment: StoredComment): boolean => comment.kind === 'bug' || comment.kind === 'feature';

const isAsked = (comment: StoredComment): boolean => comment.addressed || comment.issue !== null;

async function offThreadReply(ctx: Ctx, store: PublicStore, comment: StoredComment, text: ReplyText): Promise<ReplyPlan> {
  if (isReport(comment)) return { send: await filingReply(ctx, store, comment, text) };
  if (comment.kind === 'question') return isAsked(comment) ? ANSWER : null;
  return comment.addressed ? { send: text.feedbackThanks } : null;
}

export async function replyPlan(ctx: Ctx, store: PublicStore, comment: StoredComment): Promise<ReplyPlan> {
  if (SILENT.includes(comment.kind)) return null;
  const text = textsFor(comment.language);
  return isOnThread(comment) ? onThreadReply(ctx, comment, text) : offThreadReply(ctx, store, comment, text);
}

export async function sendReplies(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const comment of store.toReply()) {
    store.markReplied(comment.id, ctx.now());
    await isolated(ctx, comment.issue, `the chat reply to player comment ${comment.id} failed and is not sent again`, async () => {
      const plan = await replyPlan(ctx, store, comment);
      if (plan === null || comment.chat === null || comment.messageId === null) return;
      if ('answer' in plan) return queueAnswer(ctx, comment.id);
      store.setReplyId(comment.id, await ctx.telegram.sendMessage(comment.chat, plan.send, comment.messageId));
    });
  }
}
