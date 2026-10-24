import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mediaSection } from './media';
import { solidPng } from './media-fixtures';
import { adoptReplyMedia, dropReplyMedia, readCommitteeMedia, replyMediaDir } from './reply-media';

const noDownload = async (): Promise<Buffer> => { throw new Error('no download expected'); };
let home = '';
let issueDir = '';

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/reply-media-');
  issueDir = join(home, 'media', 'issue-7');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function reply(post: number, files: Record<string, Buffer | string>): void {
  mkdirSync(replyMediaDir(home, post), { recursive: true });
  for (const [name, data] of Object.entries(files)) writeFileSync(join(replyMediaDir(home, post), name), data);
}

describe('adoptReplyMedia', () => {
  it('returns nothing when the post has no files', async () => {
    expect(await adoptReplyMedia(home, 55, issueDir, 'ann', noDownload)).toEqual([]);
    expect(readCommitteeMedia(issueDir)).toEqual([]);
  });

  it('checks the bytes itself, so a file that is no image is not available', async () => {
    const png = solidPng(2, 2, [9, 9, 9]);
    reply(55, { '6-1.png': Buffer.from('not an image'), '5-1.bin': png, '5-2.tmp': png });
    const entries = await adoptReplyMedia(home, 55, issueDir, 'ann', noDownload);
    expect(entries.map((e) => [e.url, e.status, e.reason])).toEqual([
      ['telegram:post-55-5-1.bin', 'ok', undefined],
      ['telegram:post-55-6-1.png', 'failed', 'it is not a PNG, JPEG, GIF or WebP image'],
    ]);
    expect(entries[0]).toMatchObject({ type: 'png', width: 2, height: 2, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex'), source: 'committee reply in Telegram by ann' });
    expect(existsSync(replyMediaDir(home, 55))).toBe(false);
  });

  it('keeps the images of earlier routes, and marks one whose file is gone', async () => {
    reply(55, { '5-1.png': solidPng(1, 1, [1, 1, 1]) });
    const [first] = await adoptReplyMedia(home, 55, issueDir, 'ann', noDownload);
    reply(56, { '8-1.png': solidPng(1, 1, [2, 2, 2]) });
    await adoptReplyMedia(home, 56, issueDir, 'bob', noDownload);
    expect(readCommitteeMedia(issueDir).map((e) => e.status)).toEqual(['ok', 'ok']);
    rmSync(join(issueDir, first.file ?? ''));
    expect(readCommitteeMedia(issueDir)[0]).toMatchObject({ status: 'failed', reason: 'its file is gone from the media folder' });
  });

  it('lists a kept image by its path in the agent mount and a lost one as NOT AVAILABLE', async () => {
    reply(55, { '5-1.png': solidPng(1, 1, [1, 1, 1]), '5-2.skipped': 'Telegram gave no local file for it' });
    const section = mediaSection(await adoptReplyMedia(home, 55, issueDir, 'ann', noDownload));
    expect(section).toMatch(/1\. \/work\/\.factory-media\/committee\/[0-9a-f]{16}\.png \(png, 1x1, \d+ bytes, sha256 [0-9a-f]{64}, from the committee reply in Telegram by ann\)/);
    expect(section).toContain('2. NOT AVAILABLE, telegram:post-55-5-2 (committee reply in Telegram by ann): the chat bot could not keep it: Telegram gave no local file for it');
    expect(section).toContain('never describe what it shows');
    expect(readFileSync(join(issueDir, 'committee.json'), 'utf8')).not.toContain(home);
  });
});

describe('adoptReplyMedia of Telegram notes', () => {
  const note = (fileId: string, text: string | null = null) => JSON.stringify({ fileId, bytes: 10, by: '5', byName: 'Ann', text });

  it('downloads the file a note names and keeps its exact bytes', async () => {
    const png = solidPng(3, 2, [4, 5, 6]);
    reply(55, { '9-1.telegram': note('A1', 'Like this, with a roof') });
    const asked: string[] = [];
    const [entry] = await adoptReplyMedia(home, 55, issueDir, 'ann', async (fileId) => { asked.push(fileId); return png; });
    expect(asked).toEqual(['A1']);
    expect(entry).toMatchObject({ url: 'telegram:post-55-9-1', status: 'ok', sha256: createHash('sha256').update(png).digest('hex'), source: 'committee reply in Telegram by Ann, who wrote with it: "Like this, with a roof"' });
    expect(readFileSync(join(issueDir, entry.file ?? ''))).toEqual(png);
  });

  it('fetches once more when the first download fails', async () => {
    reply(55, { '9-1.telegram': note('A1') });
    let tries = 0;
    const [entry] = await adoptReplyMedia(home, 55, issueDir, 'ann', async () => { tries += 1; if (tries === 1) throw new Error('timeout'); return solidPng(1, 1, [1, 1, 1]); });
    expect([tries, entry.status]).toEqual([2, 'ok']);
  });

  it('marks an image Telegram never gives, or a broken note, as not available with the reason', async () => {
    reply(55, { '9-1.telegram': note('A1'), '9-2.telegram': '{oops', '9-3.telegram': JSON.stringify({ bytes: 1 }) });
    const entries = await adoptReplyMedia(home, 55, issueDir, 'ann', async () => { throw new Error('Telegram getFile failed: Bad Request: invalid file_id'); });
    expect(entries.map((e) => [e.url, e.status, e.reason])).toEqual([
      ['telegram:post-55-9-1', 'failed', 'Telegram did not give it after two tries: Telegram getFile failed: Bad Request: invalid file_id'],
      ['telegram:post-55-9-2', 'failed', expect.stringMatching(/^the chat bot left a note the factory could not read: /)],
      ['telegram:post-55-9-3', 'failed', 'the chat bot left a note the factory could not read: the note names no Telegram file'],
    ]);
    expect(mediaSection(entries)).toContain('1. NOT AVAILABLE, telegram:post-55-9-1 (committee reply in Telegram by Ann): Telegram did not give it after two tries');
  });
});

describe('adoptReplyMedia limits', () => {
  it('lists an image sent twice once, and keeps the newest MAX_FILES', async () => {
    const same = solidPng(1, 1, [5, 5, 5]);
    reply(55, { '5-1.png': same });
    await adoptReplyMedia(home, 55, issueDir, 'ann', noDownload);
    reply(56, { '6-1.png': same });
    await adoptReplyMedia(home, 56, issueDir, 'ann', noDownload);
    expect(readCommitteeMedia(issueDir).map((e) => e.url)).toEqual(['telegram:post-56-6-1.png']);
    reply(57, Object.fromEntries(Array.from({ length: 13 }, (_, n) => [`7-${n + 1}.png`, solidPng(1, n + 1, [1, 1, 1])])));
    const entries = await adoptReplyMedia(home, 57, issueDir, 'ann', noDownload);
    expect(entries).toHaveLength(13);
    expect(readCommitteeMedia(issueDir).map((e) => e.url)).toEqual(entries.slice(1).map((e) => e.url));
  });

  it('turns a file it cannot read into a failed entry, so the route still goes on', async () => {
    reply(55, { '5-1.png': solidPng(1, 1, [1, 1, 1]) });
    mkdirSync(join(replyMediaDir(home, 55), '5-2.png'));
    const entries = await adoptReplyMedia(home, 55, issueDir, 'ann', noDownload);
    expect(entries.map((e) => e.status)).toEqual(['ok', 'failed']);
    expect(entries[1].reason).toMatch(/^the factory could not read it: /);
  });

  it('reads a broken manifest as empty', () => {
    mkdirSync(issueDir, { recursive: true });
    writeFileSync(join(issueDir, 'committee.json'), '{oops');
    expect(readCommitteeMedia(issueDir)).toEqual([]);
  });
});

describe('dropReplyMedia', () => {
  it('removes the files of closed posts only', () => {
    reply(55, { '5-1.png': 'x' });
    reply(56, { '6-1.png': 'y' });
    dropReplyMedia(home, [55, 99]);
    expect(existsSync(replyMediaDir(home, 55))).toBe(false);
    expect(existsSync(replyMediaDir(home, 56))).toBe(true);
  });
});
