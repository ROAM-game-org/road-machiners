import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pngBytes } from '../photo-fixtures';
import { readShelf, PLAYER_SHELF } from '../reply-media';
import { mediaDir } from '../stages/common';
import { fetchChatMedia, holdDir, placeChatMedia } from './chat-media';
import { imageLines } from './digest';
import { CHANNEL, publicFake, type PublicFake } from './public-fakes';
import type { CommentKind } from './store';

const MAP = pngBytes(7, 1280, 853);

function comment(f: PublicFake, kind: CommentKind, files: string[] = ['map']): number {
  const media = files.map((fileId) => ({ fileId, uniqueId: `u-${fileId}`, origin: 'reply' as const }));
  const id = f.store.addComment({ issue: null, source: 'telegram', sourceId: `${CHANNEL}:${kind}${files.join()}`, postChat: CHANNEL, postMessageId: null, author: 'Ann', text: 'Add this map', at: 'x', messageId: 219, media })!;
  f.store.classify(id, kind, 'none', f.clock.now, 'other');
  return id;
}

const shelfFiles = (f: PublicFake, issue: number) => readShelf(mediaDir(f.ctx, issue), PLAYER_SHELF);

describe('chat media', () => {
  it('keeps the image of a linked message and places it on the issue once its digest went out', async () => {
    const f = publicFake();
    f.files.map = MAP;
    const id = comment(f, 'feature');
    await fetchChatMedia(f.ctx, f.store);
    const [held] = f.store.mediaOf(id);
    expect(held).toMatchObject({ status: 'ok', image: { type: 'png', width: 1280, height: 853, bytes: MAP.length } });
    expect(existsSync(join(holdDir(f.home), held!.image!.file))).toBe(true);
    f.store.link(id, 571);
    await placeChatMedia(f.ctx, f.store);
    expect(shelfFiles(f, 571)).toEqual([]);
    f.store.markSent([id], f.clock.now);
    await placeChatMedia(f.ctx, f.store);
    const [entry] = shelfFiles(f, 571);
    expect(entry).toMatchObject({ status: 'ok', type: 'png', sha256: held!.image!.sha256, source: `public chat, message 219 of chat ${CHANNEL}` });
    expect(readFileSync(join(mediaDir(f.ctx, 571), entry!.file!))).toEqual(MAP);
    expect(readdirSync(holdDir(f.home))).toEqual([]);
  });

  it('marks an image Telegram no longer serves as not available after one retry, and places nothing', async () => {
    const f = publicFake();
    const id = comment(f, 'feature', ['gone']);
    await fetchChatMedia(f.ctx, f.store);
    expect(f.downloads).toEqual(['gone', 'gone']);
    const media = f.store.mediaOf(id);
    expect(media[0]).toMatchObject({ status: 'failed', image: null });
    expect(imageLines(media)).toEqual(['- An image on the message it replies to is not available: Telegram getFile failed: Bad Request: wrong file_id or the file is temporarily unavailable.']);
    f.store.setFiled(id, 601);
    await placeChatMedia(f.ctx, f.store);
    expect(shelfFiles(f, 601)).toEqual([]);
    expect(f.store.unsettledMedia()).toEqual([]);
  });

  it('refuses a file that is not an image', async () => {
    const f = publicFake();
    f.files.map = Buffer.from('<html>not an image</html>');
    const id = comment(f, 'bug');
    await fetchChatMedia(f.ctx, f.store);
    expect(f.store.mediaOf(id)[0]).toMatchObject({ status: 'failed', reason: 'it is not a PNG, JPEG, GIF or WebP image' });
  });

  it('never fetches the image of rejected text or chatter, and settles it', async () => {
    const f = publicFake();
    f.files.map = MAP;
    comment(f, 'rejected');
    comment(f, 'chatter', ['map', 'other']);
    await fetchChatMedia(f.ctx, f.store);
    expect(f.downloads).toEqual([]);
    await placeChatMedia(f.ctx, f.store);
    expect(f.store.unsettledMedia()).toEqual([]);
  });

  it('drops the held image of a message that ends on no issue', async () => {
    const f = publicFake();
    f.files.map = MAP;
    const id = comment(f, 'question');
    await fetchChatMedia(f.ctx, f.store);
    await placeChatMedia(f.ctx, f.store);
    expect(readdirSync(holdDir(f.home))).toHaveLength(1);
    f.store.markReplied(id, f.clock.now);
    await placeChatMedia(f.ctx, f.store);
    expect(readdirSync(holdDir(f.home))).toEqual([]);
  });

  it('places a moved message image again on its new issue from the old issue folder', async () => {
    const f = publicFake();
    f.files.map = MAP;
    const id = comment(f, 'feature');
    await fetchChatMedia(f.ctx, f.store);
    f.store.link(id, 652);
    f.store.markSent([id], f.clock.now);
    await placeChatMedia(f.ctx, f.store);
    f.store.moveComment(id, 571);
    f.store.markSent([id], f.clock.now);
    await placeChatMedia(f.ctx, f.store);
    const [entry] = shelfFiles(f, 571);
    expect(entry).toMatchObject({ status: 'ok' });
    expect(readFileSync(join(mediaDir(f.ctx, 571), entry!.file!))).toEqual(MAP);
  });
});
