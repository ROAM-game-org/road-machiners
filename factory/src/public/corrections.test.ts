import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MediaEntry } from '../media';
import { pngBytes } from '../photo-fixtures';
import { readState } from '../state';
import type { Decision, FilterInput } from './decision';
import { CHANNEL, filterOf, publicFake, type PublicFake } from './public-fakes';
import { publicTick } from './tick-steps';

const SINCERE: Decision = { verdict: 'accept', intent: 'sincere', sincere: 0.97, kind: 'bug', route: 'none', relevance: 'other' };
const MEMBER = '42';
const PLAYER = '7';
const REPORT = 'Map markers sit in the sea on the coast map';
const CORRECTION = 'Not this one, it belongs to the map markers task being built';

type Said = { decision: Partial<Decision>; about?: number };

function setup(said: Record<string, Said>) {
  const f = publicFake();
  f.cards = [{ itemId: 'I571', issue: 571, title: 'Map markers show landmarks', column: 'Implementation', labels: [] }];
  const duplicate = f.store.addComment({ issue: null, source: 'telegram', sourceId: `${CHANNEL}:5`, postChat: CHANNEL, postMessageId: null, author: 'Bo', text: 'Coast map markers are wrong', at: 'x', messageId: 5 })!;
  f.store.classify(duplicate, 'bug', 'none', f.clock.now, 'other');
  f.store.markFiling(duplicate, f.clock.now);
  f.store.setFiled(duplicate, 652);
  f.store.markReplied(duplicate, f.clock.now);
  const asked: FilterInput[] = [];
  const classify = async (input: FilterInput): Promise<Decision> => {
    asked.push(input);
    const found = said[input.text];
    if (found === undefined) throw new Error(`no decision for ${input.text}`);
    const work = found.about === undefined ? {} : { work: (input.work ?? []).findIndex((line) => line.startsWith(`#${found.about} `)) };
    return { ...SINCERE, ...found.decision, ...work };
  };
  return { f, asked, tick: () => publicTick(f.ctx, filterOf(classify)) };
}

let update = 0;

function post(f: PublicFake, message: { id: number; text: string; sender: string; thread?: number; images?: string[] }): void {
  const dir = `${f.home}/public-inbox`;
  mkdirSync(dir, { recursive: true });
  update += 1;
  const event = { updateId: update, kind: 'comment', chat: CHANNEL, messageId: message.id, threadId: message.thread ?? null, author: 'Ann Lee', sender: message.sender, text: message.text, at: f.clock.now.toISOString(), standalone: true, addressed: true, images: message.images ?? [] };
  writeFileSync(`${dir}/${String(update).padStart(10, '0')}.json`, JSON.stringify(event));
}

const manifest = (f: PublicFake, issue: number): MediaEntry[] => {
  const path = `${f.home}/media/issue-${issue}/committee.json`;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as MediaEntry[]) : [];
};

const replyTo = (f: PublicFake, id: number): string => f.messages.find((message) => message.replyTo === id)?.text ?? '';
const failures = (f: PublicFake): string[] => readState(f.ctx.statePath).failures.map((failure) => failure.error);
const githubWrites = (f: PublicFake): string[] => f.calls.filter((call) => /^(move|close|addLabel|removeLabel)/.test(call));

async function misfiled(said: Record<string, Said>, images: string[] = ['photo']) {
  const run = setup({ [REPORT]: { decision: {}, about: 652 }, ...said });
  run.f.files.photo = pngBytes(1, 4, 3);
  post(run.f, { id: 31, text: REPORT, sender: MEMBER, images });
  await run.tick();
  return run;
}

describe('committee corrections', () => {
  it('lists active #571 with its status beside the chat duplicate #652, and a member correction moves the message and its photo from duplicate #652 to #571', async () => {
    const { f, asked, tick } = await misfiled({ [CORRECTION]: { decision: { kind: 'feedback', corrects: true }, about: 571 } });
    expect(asked[0]!.work).toEqual(expect.arrayContaining(['#571 [being built] Map markers show landmarks', '#652 [filed from the chat] Coast map markers are wrong']));
    expect(manifest(f, 652)).toHaveLength(1);
    const botReply = f.messages.find((message) => message.replyTo === 31)!;
    post(f, { id: 32, text: CORRECTION, sender: MEMBER, thread: 500 + f.messages.indexOf(botReply) + 1 });
    await tick();
    expect(asked[1]).toMatchObject({ corrected: REPORT });
    expect(asked[1]!.work).not.toContainEqual(expect.stringMatching(/^#652 /));
    expect(manifest(f, 652)).toEqual([]);
    expect(manifest(f, 571)).toEqual([expect.objectContaining({ status: 'ok', type: 'png', url: 'telegram:chat--100channel-31-1' })]);
    expect(f.comments.filter((comment) => comment.issue === 571).map((comment) => comment.body)).toEqual([expect.stringContaining(REPORT)]);
    expect(f.comments.map((comment) => comment.body).join('')).not.toContain(CORRECTION);
    expect(replyTo(f, 32)).toContain('I moved the earlier message from #652: https://github.com/o/r/issues/652 to the player comments of #571');
    expect(replyTo(f, 32)).toContain('Its image is kept for the team.');
    expect(failures(f)).toEqual([expect.stringContaining('Committee member Ann Lee (Telegram 42) corrected the public chat bot')]);
    expect(failures(f)[0]).toContain('moved it to #571');
    expect(githubWrites(f)).toEqual([]);
  });

  it('lists known work the text names by number first', async () => {
    const text = 'Coast map markers are wrong again, see #571';
    const { f, asked, tick } = setup({ [text]: { decision: {}, about: 571 } });
    post(f, { id: 40, text, sender: PLAYER });
    await tick();
    expect(asked[0]!.work![0]).toBe('#571 [being built] Map markers show landmarks');
    expect(f.store.landedIssue(2)).toBe(571);
  });

  it('never treats a player reply to the bot as a correction, so nothing moves and nobody is asked', async () => {
    const { f, asked, tick } = await misfiled({ [CORRECTION]: { decision: { kind: 'feedback', corrects: true }, about: 571 } });
    post(f, { id: 32, text: CORRECTION, sender: PLAYER, thread: 501 });
    await tick();
    expect(asked[1]).not.toHaveProperty('corrected');
    expect(manifest(f, 571)).toEqual([]);
    expect(f.store.landedIssue(1)).toBe(652);
    expect(failures(f)).toEqual([]);
    expect(githubWrites(f)).toEqual([]);
  });

  it('says plainly when it holds no image of the corrected message, and keeps a photo the member sends again', async () => {
    const { f, tick } = await misfiled({ [CORRECTION]: { decision: { corrects: true }, about: 571 }, 'Here is the photo again': { decision: { corrects: true }, about: 571 } }, []);
    post(f, { id: 32, text: CORRECTION, sender: MEMBER, thread: 501 });
    await tick();
    expect(replyTo(f, 32)).toContain('I have no image of that message, so the team has the text only.');
    expect(failures(f)[0]).toContain('The factory holds no image of that message.');
    f.files.again = pngBytes(2, 5, 5);
    post(f, { id: 33, text: 'Here is the photo again', sender: MEMBER, thread: 501, images: ['again'] });
    await tick();
    expect(manifest(f, 571)).toEqual([expect.objectContaining({ status: 'ok', width: 5, url: 'telegram:chat--100channel-33-1' })]);
  });

  it('moves nothing when the work it picks is closed, and still answers', async () => {
    const { f, tick } = await misfiled({ [CORRECTION]: { decision: { corrects: true }, about: 571 } });
    f.issueState[571] = 'CLOSED';
    post(f, { id: 32, text: CORRECTION, sender: MEMBER, thread: 501 });
    await tick();
    expect(f.store.landedIssue(1)).toBe(652);
    expect(manifest(f, 652)).toHaveLength(1);
    expect(replyTo(f, 32)).toContain('I found no other open work this fits, so it stays on #652');
    expect(githubWrites(f)).toEqual([]);
  });
});
