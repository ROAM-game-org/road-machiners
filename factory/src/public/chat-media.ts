import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_BYTES, detectType, imageSize, validSize, type MediaEntry } from '../media';
import { PLAYER_SHELF, addToShelf, takeFromShelf } from '../reply-media';
import { mediaDir } from '../stages/common';
import type { Ctx } from '../types';
import { messageLink } from './file-comments';
import { UNKEPT_KINDS, type ChatMedia, type HeldImage, type PublicStore, type StoredComment } from './store';

export const holdDir = (home: string): string => join(home, 'public', 'media');

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function downloadTwice(ctx: Ctx, fileId: string): Promise<Buffer> {
  try {
    return await ctx.telegram.downloadFile(fileId, MAX_BYTES);
  } catch {
    return ctx.telegram.downloadFile(fileId, MAX_BYTES);
  }
}

function checkedImage(data: Buffer): Omit<HeldImage, 'file'> {
  const type = detectType(data);
  if (type === null) throw new Error('it is not a PNG, JPEG, GIF or WebP image');
  const size = imageSize(data, type);
  if (!validSize(size)) throw new Error(`it does not decode as a ${type} image`);
  return { type, ...size, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

function hold(home: string, data: Buffer): HeldImage {
  const image = checkedImage(data);
  const file = `${image.sha256.slice(0, 16)}.${image.type === 'jpeg' ? 'jpg' : image.type}`;
  const dir = holdDir(home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${file}.part`), data);
  renameSync(join(dir, `${file}.part`), join(dir, file));
  return { ...image, file };
}

async function fetchOne(ctx: Ctx, store: PublicStore, media: ChatMedia): Promise<void> {
  try {
    store.setMediaFetched(media.id, hold(ctx.cfg.home, await downloadTwice(ctx, media.fileId)));
  } catch (error) {
    store.setMediaFailed(media.id, messageOf(error));
    ctx.log('public', null, `image ${media.id} of player comment ${media.commentId} could not be kept: ${messageOf(error)}`);
  }
}

export async function fetchChatMedia(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const media of store.mediaToFetch()) await fetchOne(ctx, store, media);
}

export async function keepMovedMedia(ctx: Ctx, store: PublicStore, commentId: number): Promise<void> {
  for (const media of store.mediaOf(commentId)) {
    if (media.image === null || sourceFile(ctx, media, media.image.file) !== null) continue;
    store.refetchMedia(media.id);
    await fetchOne(ctx, store, media);
  }
}

type Target = number | null | 'wait';

function targetOf(comment: StoredComment): Target {
  if (comment.kind === null || UNKEPT_KINDS.includes(comment.kind) || comment.droppedAt !== null) return null;
  if (comment.filedIssue !== null && !comment.linked) return comment.filedIssue;
  if (comment.issue !== null && comment.relevance !== 'other') return comment.sentAt === null ? 'wait' : comment.issue;
  return comment.repliedAt === null ? 'wait' : null;
}

function sourceFile(ctx: Ctx, media: ChatMedia, file: string): string | null {
  const held = join(holdDir(ctx.cfg.home), file);
  if (existsSync(held)) return held;
  const placed = media.placedIssue === null ? null : join(mediaDir(ctx, media.placedIssue), PLAYER_SHELF.folder, file);
  return placed !== null && existsSync(placed) ? placed : null;
}

function entryOf(comment: StoredComment, image: HeldImage, available: boolean): MediaEntry {
  const link = messageLink(comment.chat, comment.messageId) ?? `message ${comment.messageId} of chat ${comment.chat}`;
  const base = { url: `telegram:${link}`, source: `public chat, ${link}` };
  if (!available) return { ...base, status: 'failed', reason: 'its held file is gone' };
  return { ...base, status: 'ok', file: `${PLAYER_SHELF.folder}/${image.file}`, type: image.type, width: image.width, height: image.height, bytes: image.bytes, sha256: image.sha256 };
}

function place(ctx: Ctx, media: ChatMedia, image: HeldImage, comment: StoredComment, issue: number): void {
  const issueDir = mediaDir(ctx, issue);
  const from = sourceFile(ctx, media, image.file);
  mkdirSync(join(issueDir, PLAYER_SHELF.folder), { recursive: true });
  const to = join(issueDir, PLAYER_SHELF.folder, image.file);
  if (from !== null && from !== to) copyFileSync(from, to);
  addToShelf(issueDir, PLAYER_SHELF, [entryOf(comment, image, from !== null)]);
  if (media.placedIssue !== null && media.placedIssue !== issue) takeFromShelf(mediaDir(ctx, media.placedIssue), PLAYER_SHELF, `${PLAYER_SHELF.folder}/${image.file}`);
  ctx.log('public', issue, `image ${media.id} of player comment ${comment.id} is in the media folder of #${issue}`);
}

export async function placeChatMedia(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const media of store.unsettledMedia()) {
    const comment = store.comment(media.commentId);
    const target = comment === null ? null : targetOf(comment);
    if (target === 'wait' || (target !== null && media.status === 'waiting')) continue;
    if (target !== null && media.image !== null && comment !== null) place(ctx, media, media.image, comment, target);
    store.settleMedia(media.id, target);
    if (media.image !== null && !store.holdsFile(media.image.file)) rmSync(join(holdDir(ctx.cfg.home), media.image.file), { force: true });
  }
}
