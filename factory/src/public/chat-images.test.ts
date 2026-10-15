import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { solidPng } from '../media-fixtures';
import type { MediaEntry } from '../media';
import { placeChatImages } from './chat-images';
import { CHANNEL, publicFake, type PublicFake } from './public-fakes';

let fakes: PublicFake[] = [];
afterEach(() => {
  for (const f of fakes) {
    f.store.close();
    rmSync(f.home, { recursive: true, force: true });
  }
  fakes = [];
});

function setup(files: Record<string, Buffer>) {
  const f = publicFake();
  fakes.push(f);
  Object.assign(f.ctx.telegram, {
    downloadFile: async (fileId: string) => {
      const data = files[fileId];
      if (data === undefined) throw new Error(`no file ${fileId}`);
      return data;
    },
  });
  return f;
}

function addPhoto(f: PublicFake, issue: number | null, images: string[], relevance: 'parent' | 'other'): number {
  const id = f.store.addComment({ issue, source: 'telegram', sourceId: `c${images.join()}`, postChat: CHANNEL, postMessageId: null, author: 'Ann Lee', sender: '42', text: 'the truck clips here', at: f.clock.now.toISOString(), messageId: 13, images })!;
  f.store.classify(id, 'bug', 'none', f.clock.now, relevance, { language: 'en' });
  return id;
}

const manifest = (f: PublicFake, issue: number): MediaEntry[] => JSON.parse(readFileSync(join(f.home, 'media', `issue-${issue}`, 'committee.json'), 'utf8')) as MediaEntry[];

describe('chat images', () => {
  it('puts each photo of a thread comment in its issue media folder once, and lists a failed download as not available', async () => {
    const f = setup({ shot: solidPng(4, 3, [200, 30, 30]) });
    addPhoto(f, 568, ['shot', 'gone'], 'parent');
    await placeChatImages(f.ctx, f.store);
    await placeChatImages(f.ctx, f.store);
    const entries = manifest(f, 568);
    expect(entries.map((entry) => entry.status)).toEqual(['ok', 'failed']);
    expect(entries[0]).toMatchObject({ type: 'png', width: 4, height: 3 });
    expect(readFileSync(join(f.home, 'media', 'issue-568', entries[0]!.file!)).length).toBeGreaterThan(0);
    expect(entries[1]!.reason).toBe('Telegram did not give the image');
  });

  it('waits until an off-thread comment is filed, then uses its filed issue', async () => {
    const f = setup({ shot: solidPng(2, 2, [0, 0, 255]) });
    const id = addPhoto(f, null, ['shot'], 'other');
    await placeChatImages(f.ctx, f.store);
    expect(f.store.imagesToPlace()).toEqual([]);
    f.store.setFiled(id, 700);
    expect(f.store.imagesToPlace().map((item) => item.issue)).toEqual([700]);
    await placeChatImages(f.ctx, f.store);
    expect(manifest(f, 700).map((entry) => entry.status)).toEqual(['ok']);
  });
});
