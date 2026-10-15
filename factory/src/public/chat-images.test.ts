import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pngBytes } from '../photo-fixtures';
import type { MediaEntry } from '../media';
import type { Decision, FilterInput } from './decision';
import { CHANNEL, filterOf, publicFake, type PublicFake } from './public-fakes';
import { publicTick } from './tick-steps';

const SINCERE: Decision = { verdict: 'accept', intent: 'sincere', sincere: 0.97, kind: 'bug', route: 'none', relevance: 'other' };

function setup(decision: Partial<Decision>) {
  const f = publicFake();
  f.store.addProposal(571, 'Map markers\nShow landmarks on the map.', f.clock.now);
  const classify = async (input: FilterInput): Promise<Decision> => ({ ...SINCERE, ...decision, ...(decision.work === undefined ? {} : { work: (input.work ?? []).findIndex((line) => line.startsWith('#571 ')) }) });
  return { f, tick: () => publicTick(f.ctx, filterOf(classify)) };
}

function post(f: PublicFake, images: string[]): void {
  const dir = `${f.home}/public-inbox`;
  mkdirSync(dir, { recursive: true });
  const event = { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 31, threadId: null, author: 'Ann Lee', sender: '42', text: 'The map marker sits in the sea, see the photo', at: f.clock.now.toISOString(), standalone: true, addressed: true, images };
  writeFileSync(`${dir}/0000000001.json`, JSON.stringify(event));
}

const manifest = (f: PublicFake, issue: number): MediaEntry[] => {
  const path = `${f.home}/media/issue-${issue}/committee.json`;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as MediaEntry[]) : [];
};

describe('chat images', () => {
  it('puts the photo of a message linked to known work in that issue media folder and says it is kept', async () => {
    const { f, tick } = setup({ work: 0 });
    f.files.photo = pngBytes(1, 4, 3);
    post(f, ['photo']);
    await tick();
    const [entry] = manifest(f, 571);
    expect(entry).toMatchObject({ url: 'telegram:chat--100channel-31-1', status: 'ok', type: 'png', width: 4, height: 3, source: 'player chat message by Ann Lee, message 31 of chat -100channel' });
    expect(existsSync(`${f.home}/media/issue-571/${entry!.file}`)).toBe(true);
    expect(f.messages.at(-1)!.text).toContain('Its image is kept for the team.');
    expect(f.comments.map((comment) => comment.body).join('')).not.toContain('iVBOR');
  });

  it('lists a photo Telegram cannot give as not available, tries twice and says so in the reply', async () => {
    const { f, tick } = setup({});
    f.files.lost = new Error('Telegram getFile failed: Bad Request: file is too big');
    post(f, ['lost']);
    await tick();
    expect(f.downloads).toEqual(['lost', 'lost']);
    expect(manifest(f, 601)).toEqual([expect.objectContaining({ status: 'failed', reason: 'Telegram did not give the image: Telegram getFile failed: Bad Request: file is too big' })]);
    expect(f.messages.at(-1)!.text).toContain('I could not get its image from Telegram, so the team has the text only.');
  });

  it('fetches nothing for rejected text and places each image once', async () => {
    const rejected = setup({ verdict: 'reject' });
    rejected.f.files.photo = pngBytes(1);
    post(rejected.f, ['photo']);
    await rejected.tick();
    expect(rejected.f.downloads).toEqual([]);
    const kept = setup({});
    kept.f.files.photo = pngBytes(1);
    post(kept.f, ['photo']);
    await kept.tick();
    await kept.tick();
    expect(kept.f.downloads).toEqual(['photo']);
  });
});
