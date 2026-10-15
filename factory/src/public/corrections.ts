import { reportFailure } from '../fail';
import type { Ctx } from '../types';
import { placeImages, type ImageOutcome } from './chat-images';
import { oneLine, playerName } from './digest';
import { isOpen, messageLink } from './file-comments';
import { isolated } from './isolate';
import { issueLink, issueStatus } from './replies';
import { textsFor } from './reply-text';
import type { PublicStore, StoredComment } from './store';

const WORDS_CHARS = 300;

type Outcome = { from: number | null; to: number | null; images: ImageOutcome };

export async function applyCorrection(ctx: Ctx, store: PublicStore, correction: StoredComment, corrected: StoredComment): Promise<void> {
  store.markReplied(correction.id, ctx.now());
  await isolated(ctx, correction.issue, `the correction in player comment ${correction.id} failed and is not tried again`, async () => {
    const outcome = await moveCorrected(ctx, store, correction, corrected);
    ctx.log('public', outcome.to, `committee member comment ${correction.id} corrected the bot about comment ${corrected.id}: from ${issueName(outcome.from)} to ${issueName(outcome.to)}, images ${outcome.images}`);
    await isolated(ctx, correction.issue, `the reply to the correction in player comment ${correction.id} failed and is not sent again`, () => reply(ctx, store, correction, outcome));
    await reportFailure(ctx, 'public', outcome.from, memberRequest(correction, corrected, outcome), null, []);
  });
}

const issueName = (issue: number | null): string => (issue === null ? 'no issue' : `#${issue}`);

async function targetOf(ctx: Ctx, correction: StoredComment, from: number | null): Promise<number | null> {
  const picked = correction.workIssue;
  if (picked === null || picked === from) return null;
  return (await isOpen(ctx, correction, picked)) ? picked : null;
}

async function moveCorrected(ctx: Ctx, store: PublicStore, correction: StoredComment, corrected: StoredComment): Promise<Outcome> {
  const from = store.landedIssue(corrected.id);
  const to = await targetOf(ctx, correction, from);
  if (to !== null) store.moveComment(corrected.id, to);
  const landed = to ?? from;
  if (landed !== null) {
    for (const comment of [corrected, correction]) if (comment.images.length > 0) await placeImages(ctx, store, store.comment(comment.id)!, landed);
  }
  return { from, to, images: imagesOf([store.comment(corrected.id)!, store.comment(correction.id)!]) };
}

function imagesOf(comments: StoredComment[]): ImageOutcome {
  const total = comments.reduce((sum, comment) => sum + comment.images.length, 0);
  if (total === 0) return 'none';
  return comments.reduce((sum, comment) => sum + (comment.imagesKept ?? 0), 0) === total ? 'kept' : 'lost';
}

async function reply(ctx: Ctx, store: PublicStore, correction: StoredComment, outcome: Outcome): Promise<void> {
  if (correction.chat === null || correction.messageId === null) return;
  const text = textsFor(correction.language);
  const from = outcome.from === null ? null : issueLink(ctx, outcome.from);
  const moved = outcome.to === null ? text.stays(from) : text.moved(from, issueLink(ctx, outcome.to), await issueStatus(ctx, outcome.to, text));
  store.setReplyId(correction.id, await ctx.telegram.sendMessage(correction.chat, [moved, text.images[outcome.images], text.toTeam].join('\n'), correction.messageId));
}

const linkOf = (comment: StoredComment): string => messageLink(comment.chat, comment.messageId) ?? `message ${comment.messageId} of chat ${comment.chat}`;

const IMAGE_FACTS: Record<ImageOutcome, string> = {
  kept: 'Its images are in the media folder of the issue it is on now.',
  lost: 'Telegram did not give every image, so the issue lists the missing ones as not available.',
  none: 'The factory holds no image of that message.',
};

function memberRequest(correction: StoredComment, corrected: StoredComment, outcome: Outcome): string {
  const moved = outcome.to === null ? 'found no other open work for it, so nothing moved' : `moved it to #${outcome.to}`;
  const words = oneLine(correction.text).slice(0, WORDS_CHARS);
  return `Committee member ${playerName(correction.author)} (Telegram ${correction.sender}) corrected the public chat bot at ${linkOf(correction)}. The bot had put message ${linkOf(corrected)} on ${issueName(outcome.from)}, and the factory ${moved}. ${IMAGE_FACTS[outcome.images]} The factory itself closed, moved and relabelled nothing. Do what they ask as a member, such as closing the wrong issue. Their words: «${words}»`;
}
