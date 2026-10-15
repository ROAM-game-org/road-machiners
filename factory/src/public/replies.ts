import { reportFailure } from '../fail';
import { RELEASE_CANDIDATE_LABEL, VOTING_LABEL, type Ctx } from '../types';
import { isolated } from './isolate';
import type { PublicFilter } from './decision';
import type { IssueComment, PublicStore, StoredComment } from './store';
import { excerpt, passageLabel, passageLink, wikiHome, type Ground, type Passage } from './wiki';

const issueLink = (ctx: Ctx, issue: number): string => `https://github.com/${ctx.cfg.repo}/issues/${issue}`;

const FEEDBACK_ASK = "Thanks. If something is broken or you have an idea, tell me what happens or what you want, and I'll file it.";
const FILE_FAILED = 'Thanks. I could not file this just now, and the factory team has been told.';

async function issueStatus(ctx: Ctx, issue: number): Promise<string> {
  const found = await ctx.github.issue(issue);
  if (found.state === 'CLOSED') return 'It is closed, and the issue says why.';
  if (found.labels.includes(RELEASE_CANDIDATE_LABEL)) return 'It is built and waits for the next release.';
  if (found.labels.includes(VOTING_LABEL)) return 'It waits for player votes as a proposal in this chat.';
  return 'It is open and not built yet.';
}

function filedText(ctx: Ctx, comment: StoredComment, issue: number): string {
  const link = `#${issue}: ${issueLink(ctx, issue)}`;
  if (comment.kind === 'bug') return `Thanks. I filed this bug as ${link}\nTriage reads it next. Nothing is fixed yet.`;
  return `Thanks. I filed this idea as ${link}\nTriage reads it next. If it needs a vote, it comes back to this chat as a proposal. Nothing is built yet.`;
}

async function filingReply(ctx: Ctx, store: PublicStore, comment: StoredComment): Promise<string> {
  if (comment.filedIssue === null) return FILE_FAILED;
  if (!store.filedBefore(comment)) return filedText(ctx, comment, comment.filedIssue);
  return `This is already filed as #${comment.filedIssue}: ${issueLink(ctx, comment.filedIssue)}\n${await issueStatus(ctx, comment.filedIssue)}`;
}

const ANSWER_CHARS = 600;

const noAnswer = (ctx: Ctx): string => `The game wiki has no passage that answers this, so I will not guess. The wiki: ${wikiHome(ctx.cfg.repo)}\nIf something is broken or you have an idea, tell me and I'll file it.`;

const wikiAnswer = (ctx: Ctx, passage: Passage): string => `From the game wiki, ${passageLabel(passage)}:\n${excerpt(passage.text, ANSWER_CHARS)}\n${passageLink(ctx.cfg.repo, passage)}`;

async function answerText(ctx: Ctx, ground: Ground, comment: StoredComment): Promise<string> {
  try {
    const passage = await ground(comment.text);
    return passage === null ? noAnswer(ctx) : wikiAnswer(ctx, passage);
  } catch (error) {
    await reportFailure(ctx, 'public', comment.issue, `the wiki answer to player comment ${comment.id} failed, so it got the fallback: ${error instanceof Error ? error.message : String(error)}`, null, []);
    return noAnswer(ctx);
  }
}

async function onThreadReply(ctx: Ctx, ground: Ground, comment: IssueComment): Promise<string | null> {
  if (comment.kind === 'feedback' && !comment.addressed) return null;
  const added = `Thanks. I added this to the player comments of #${comment.issue}: ${issueLink(ctx, comment.issue)}`;
  return comment.kind === 'question' ? `${await answerText(ctx, ground, comment)}\n\n${added}` : added;
}

const isOnThread = (comment: StoredComment): comment is IssueComment => comment.issue !== null && comment.relevance !== 'other';

export async function replyText(ctx: Ctx, store: PublicStore, ground: Ground, comment: StoredComment): Promise<string | null> {
  if (comment.kind === null || comment.kind === 'rejected' || comment.kind === 'chatter') return null;
  if (isOnThread(comment)) return onThreadReply(ctx, ground, comment);
  if (comment.kind === 'bug' || comment.kind === 'feature') return filingReply(ctx, store, comment);
  const asked = comment.addressed || comment.issue !== null;
  if (comment.kind === 'question') return asked ? answerText(ctx, ground, comment) : null;
  return comment.addressed ? FEEDBACK_ASK : null;
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
