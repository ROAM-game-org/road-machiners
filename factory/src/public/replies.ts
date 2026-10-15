import { reportFailure } from '../fail';
import { RELEASE_CANDIDATE_LABEL, VOTING_LABEL, type Column, type Ctx } from '../types';
import { isolated } from './isolate';
import type { PublicFilter } from './decision';
import { textsFor, type ReplyText } from './reply-text';
import type { IssueComment, PublicStore, StoredComment } from './store';
import { excerpt, passageLabel, passageLink, type Ground, type Passage } from './wiki';

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

const ANSWER_CHARS = 600;

const wikiAnswer = (ctx: Ctx, passage: Passage, text: ReplyText): string => `${text.fromWiki(passageLabel(passage))}\n${excerpt(passage.text, ANSWER_CHARS)}\n${passageLink(ctx.cfg.repo, passage)}`;

async function answerText(ctx: Ctx, ground: Ground, comment: StoredComment, text: ReplyText): Promise<string | null> {
  try {
    const passage = await ground(comment.text);
    return passage === null ? null : wikiAnswer(ctx, passage, text);
  } catch (error) {
    await reportFailure(ctx, 'public', comment.issue, `the wiki answer to player comment ${comment.id} failed, so it got no answer: ${error instanceof Error ? error.message : String(error)}`, null, []);
    return null;
  }
}

async function threadNote(ctx: Ctx, comment: IssueComment, text: ReplyText): Promise<string> {
  const link = issueLink(ctx, comment.issue);
  return comment.linked ? text.aboutWork(link, await issueStatus(ctx, comment.issue, text)) : text.added(link);
}

const waitsForAddress = (comment: IssueComment): boolean => comment.kind === 'feedback' || (comment.linked && comment.kind === 'question');

async function onThreadReply(ctx: Ctx, ground: Ground, comment: IssueComment, text: ReplyText): Promise<string | null> {
  if (waitsForAddress(comment) && !comment.addressed) return null;
  const note = await threadNote(ctx, comment, text);
  const answer = comment.kind === 'question' ? await answerText(ctx, ground, comment, text) : null;
  return answer === null ? note : `${answer}\n\n${note}`;
}

const isOnThread = (comment: StoredComment): comment is IssueComment => comment.issue !== null && comment.relevance !== 'other';

export async function replyText(ctx: Ctx, store: PublicStore, ground: Ground, comment: StoredComment): Promise<string | null> {
  if (comment.kind === null || comment.kind === 'rejected' || comment.kind === 'chatter') return null;
  const text = textsFor(comment.language);
  if (isOnThread(comment)) return onThreadReply(ctx, ground, comment, text);
  if (comment.kind === 'bug' || comment.kind === 'feature') return filingReply(ctx, store, comment, text);
  const asked = comment.addressed || comment.issue !== null;
  return comment.kind === 'question' && asked ? answerText(ctx, ground, comment, text) : null;
}

export async function sendReplies(ctx: Ctx, store: PublicStore, filter: PublicFilter): Promise<void> {
  for (const comment of store.toReply()) {
    store.markReplied(comment.id, ctx.now());
    await isolated(ctx, comment.issue, `the chat reply to player comment ${comment.id} failed and is not sent again`, async () => {
      const text = await replyText(ctx, store, filter.ground, comment);
      if (text === null || comment.chat === null || comment.messageId === null) return;
      store.setReplyId(comment.id, await ctx.telegram.sendMessage(comment.chat, text, comment.messageId));
    });
  }
}
