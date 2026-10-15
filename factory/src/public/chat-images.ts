import { mediaDir } from '../stages/common';
import { MAX_BYTES, type MediaEntry } from '../media';
import { addMediaEntries, adoptChatImage, dropMediaEntries, failedChatImage } from '../reply-media';
import type { Ctx } from '../types';
import { playerName } from './digest';
import { messageLink } from './file-comments';
import { isolated } from './isolate';
import type { PublicStore, StoredComment } from './store';

export type ImageOutcome = 'kept' | 'lost' | 'none';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const imageName = (comment: StoredComment, index: number): string => `chat-${comment.chat}-${comment.messageId}-${index + 1}`;

const imageUrls = (comment: StoredComment): string[] => comment.images.map((_, index) => `telegram:${imageName(comment, index)}`);

function sourceOf(comment: StoredComment): string {
  const link = messageLink(comment.chat, comment.messageId) ?? `message ${comment.messageId} of chat ${comment.chat}`;
  return `player chat message by ${playerName(comment.author)}, ${link}`;
}

async function downloadTwice(ctx: Ctx, fileId: string): Promise<Buffer> {
  try {
    return await ctx.telegram.downloadFile(fileId, MAX_BYTES);
  } catch {
    return ctx.telegram.downloadFile(fileId, MAX_BYTES);
  }
}

async function placeOne(ctx: Ctx, issueDir: string, comment: StoredComment, index: number): Promise<MediaEntry> {
  const name = imageName(comment, index);
  try {
    return adoptChatImage(issueDir, name, await downloadTwice(ctx, comment.images[index]!), sourceOf(comment));
  } catch (error) {
    return failedChatImage(name, sourceOf(comment), `Telegram did not give the image: ${messageOf(error)}`);
  }
}

export async function placeImages(ctx: Ctx, store: PublicStore, comment: StoredComment, issue: number): Promise<void> {
  if (comment.imagesIssue !== null && comment.imagesIssue !== issue) dropMediaEntries(mediaDir(ctx, comment.imagesIssue), imageUrls(comment));
  const issueDir = mediaDir(ctx, issue);
  const entries: MediaEntry[] = [];
  for (let index = 0; index < comment.images.length; index++) entries.push(await placeOne(ctx, issueDir, comment, index));
  addMediaEntries(issueDir, entries);
  const kept = entries.filter((entry) => entry.status === 'ok').length;
  store.setImagesPlaced(comment.id, issue, kept);
  ctx.log('public', issue, `player comment ${comment.id} has ${kept} of ${entries.length} images in the media folder of #${issue}`);
}

export async function placeChatImages(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const comment of store.imagesToPlace()) {
    const issue = store.landedIssue(comment.id)!;
    store.setImagesPlaced(comment.id, issue, 0);
    await isolated(ctx, issue, `the images of player comment ${comment.id} could not be placed and are not tried again`, () => placeImages(ctx, store, comment, issue));
  }
}

export function imageOutcome(comment: StoredComment): ImageOutcome {
  if (comment.images.length === 0 || comment.imagesKept === null) return 'none';
  return comment.imagesKept === comment.images.length ? 'kept' : 'lost';
}
