import { committeeIds } from '../committee';
import { reportFailure } from '../fail';
import type { Ctx } from '../types';
import { targetIssue } from './classify-comments';
import { oneLine, playerName } from './digest';
import { isOpen, messageLink } from './file-comments';
import { isolated } from './isolate';
import { imageNote, issueLink, issueStatus } from './replies';
import { textsFor, type ReplyText } from './reply-text';
import type { PublicStore, StoredComment } from './store';

const WORDS_CHARS = 300;

type Outcome = { corrected: StoredComment; from: number | null; to: number | null; member: boolean };

export async function applyCorrections(ctx: Ctx, store: PublicStore): Promise<void> {
  const members = committeeIds(ctx);
  for (const correction of store.correctionsToApply()) {
    store.markReplied(correction.id, ctx.now());
    await isolated(ctx, correction.issue, `the correction in player comment ${correction.id} failed and is not tried again`, () => applyOne(ctx, store, correction, members));
  }
}

async function newWork(ctx: Ctx, correction: StoredComment): Promise<number | null> {
  if (correction.workIssue === null) return null;
  return (await isOpen(ctx, correction, correction.workIssue)) ? correction.workIssue : null;
}

async function applyOne(ctx: Ctx, store: PublicStore, correction: StoredComment, members: string[]): Promise<void> {
  const corrected = store.comment(correction.answers!)!;
  const from = targetIssue(corrected);
  const to = await newWork(ctx, correction);
  if (to !== null) store.moveComment(corrected.id, to);
  ctx.log('public', to, `player comment ${correction.id} corrected the bot about comment ${corrected.id}: from ${from === null ? 'no issue' : `#${from}`} to ${to === null ? 'nothing new' : `#${to}`}`);
  const outcome = { corrected, from, to, member: correction.sender !== null && members.includes(correction.sender) };
  if (outcome.member) await reportFailure(ctx, 'public', from, memberRequest(correction, outcome), null, []);
  if (correction.chat === null || correction.messageId === null) return;
  store.setReplyId(correction.id, await ctx.telegram.sendMessage(correction.chat, await replyOf(ctx, store, outcome, textsFor(correction.language)), correction.messageId));
}

const linkOf = (comment: StoredComment): string => messageLink(comment.chat, comment.messageId) ?? `message ${comment.messageId} of chat ${comment.chat}`;

function memberRequest(correction: StoredComment, outcome: Outcome): string {
  const where = outcome.from === null ? 'on no issue' : `on #${outcome.from}`;
  const moved = outcome.to === null ? 'found no other open work for it' : `moved it to #${outcome.to}`;
  const words = oneLine(correction.text).slice(0, WORDS_CHARS);
  return `Committee member ${playerName(correction.author)} (Telegram ${correction.sender}) corrected the public chat bot at ${linkOf(correction)}. The bot had put message ${linkOf(outcome.corrected)} ${where}, and the factory ${moved}. Do what they ask as a member, such as closing the wrong issue. Their words: «${words}»`;
}

async function replyOf(ctx: Ctx, store: PublicStore, outcome: Outcome, text: ReplyText): Promise<string> {
  const from = outcome.from === null ? null : issueLink(ctx, outcome.from);
  const moved = outcome.to === null ? text.stays(from) : text.moved(from, issueLink(ctx, outcome.to), await issueStatus(ctx, outcome.to, text));
  const image = outcome.to === null ? null : imageNote(store.mediaOf(outcome.corrected.id), text);
  return [moved, image, outcome.member ? text.toTeam : null].filter((line) => line !== null).join('\n');
}
