import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runJob } from '../job';
import { pngBytes } from '../photo-fixtures';
import { CHANNEL, publicFake, type PublicFake } from '../public/public-fakes';
import { readState } from '../state';
import type { AgentRun, AlbumPhoto, RunResult } from '../types';
import { answerNext, queueAnswer } from './answer';

const ENCOUNTERS = 345;
const PITCH = 'Roadside Encounters - Make NPCs Matter Bey...';
const ASKED = 'Please explain exactly what encounters were added, how they work, show some screenshots of the dialogue.';
const SHA = 'abc1234def5678abc1234def5678abc1234def56';
const FILE = 'game/src/encounters/roadside.ts';
const OAUTH = 'sk-ant-oat01-secretvalue';
const FAILED = 'I could not finish an answer to this just now, and the factory team has been told.';
const TEXT = 'Three roadside encounters shipped on main with #345: a trader, a warning and a stranded driver. Each one opens a dialogue when your truck stops next to the NPC.';

type Answer = { kind?: string; text?: string; sources?: { type: string; ref: string }[]; images?: { file: string; caption: string }[] };
type Setup = { f: PublicFake; id: number; runs: AgentRun[]; albums: { chat: string; photos: AlbumPhoto[]; replyTo?: number }[]; questions: string[]; issues: string[] };

const VALID: Answer = { kind: 'answer', text: TEXT, sources: [{ type: 'issue', ref: '345' }, { type: 'commit', ref: SHA }, { type: 'file', ref: FILE }], images: [{ file: 'trader.png', caption: 'The trader encounter' }] };

function gitAnswer(args: string[]): RunResult {
  const known = [`merge-base --is-ancestor ${SHA} origin/main`, `cat-file -e origin/main:${FILE}`];
  return { code: known.includes(args.slice(2).join(' ')) ? 0 : 1, stdout: '', stderr: '' };
}

function setup(answer: Answer | null, images: Record<string, Buffer> = { 'trader.png': pngBytes(3) }): Setup {
  const f = publicFake({ designModel: 'opus', publicUrl: 'https://play.test/play', oauthToken: OAUTH, telegramToken: '123456789:AAbbCCddEEffGGhhIIjjKKllMMnnOOppQQr', elevenlabsKey: '', geminiKey: '', openaiKey: 'sk-openai-key-123', butlerKey: null, tokenPrices: {} });
  const id = f.store.addComment({ issue: null, source: 'telegram', sourceId: `${CHANNEL}:802`, postChat: CHANNEL, postMessageId: null, author: 'Ann Lee', sender: '42', text: ASKED, at: f.clock.now.toISOString(), messageId: 802, addressed: true, context: PITCH })!;
  f.store.classify(id, 'question', 'none', f.clock.now, 'other', { workIssue: ENCOUNTERS, language: 'en' });
  f.store.link(id, ENCOUNTERS);
  const made: Setup = { f, id, runs: [], albums: [], questions: [], issues: [] };
  const ctx = f.ctx as unknown as Record<string, Record<string, unknown>>;
  ctx.github!.comments = async () => [];
  ctx.github!.issue = async (number: number) => ({ number, title: number === ENCOUNTERS ? PITCH : `T${number}`, body: 'NPCs on the road', labels: [], createdAt: '', state: 'CLOSED', author: 'anna' });
  ctx.telegram!.sendPhotos = async (chat: string, photos: AlbumPhoto[], replyTo?: number) => { made.albums.push({ chat, photos, replyTo }); return photos.map((_photo, index) => 900 + index); };
  ctx.repo = { fetch: async () => undefined, prepareWorkClone: async (_branch: string, _base: string, dir: string) => { mkdirSync(join(dir, 'game'), { recursive: true }); } };
  (f.ctx as unknown as { run: unknown }).run = async (_cmd: string, args: string[]) => gitAnswer(args);
  ctx.container = {
    agent: async (run: AgentRun) => {
      made.runs.push(run);
      const out = join(run.clone, run.dir, '.factory');
      made.questions.push(readFileSync(join(out, 'question.md'), 'utf8'));
      made.issues.push(existsSync(join(out, 'issue.md')) ? readFileSync(join(out, 'issue.md'), 'utf8') : '');
      mkdirSync(join(out, 'answer-images'), { recursive: true });
      for (const [name, data] of Object.entries(images)) writeFileSync(join(out, 'answer-images', name), data);
      if (answer !== null) writeFileSync(join(out, 'answer.json'), JSON.stringify(answer));
      return '';
    },
  };
  queueAnswer(f.ctx, id);
  return made;
}

const repliesTo = (f: PublicFake, id: number) => f.messages.filter((message) => message.replyTo === id);

describe('answer job', () => {
  it('answers the encounter question from a checked answer with factory-built source links, then the screenshot album under it', async () => {
    const { f, id, runs, albums, questions, issues } = setup(VALID);
    await answerNext(f.ctx);
    const replies = repliesTo(f, 802);
    expect(replies.map((reply) => reply.text)).toEqual([[
      TEXT, '', 'Sources:',
      'https://github.com/o/r/issues/345',
      `https://github.com/o/r/commit/${SHA}`,
      `https://github.com/o/r/blob/main/${FILE}`,
    ].join('\n')]);
    const replyId = 500 + f.messages.length;
    expect(albums).toEqual([{ chat: CHANNEL, replyTo: replyId, photos: [{ path: expect.stringMatching(/answer-images\/trader\.png$/), caption: 'The trader encounter' }] }]);
    expect(f.store.comment(id)?.replyId).toBe(replyId);
    expect(readState(f.ctx.statePath).pendingAnswers).toEqual([]);
    expect(runs).toEqual([expect.objectContaining({ model: 'opus', dir: 'game', openNetwork: false, playerFacing: true, log: `${f.home}/logs/answer-${id}.log`, clone: `${f.home}/work/answer-${id}` })]);
    expect(runs[0]!.prompt).not.toContain('{{');
    expect(questions[0]).toMatch(/^UNTRUSTED PLAYER TEXT/);
    expect(questions[0]).toContain('Reply language: English');
    expect(questions[0]).toContain(`#345 ${PITCH}`);
    expect(questions[0]).toContain(`> ${PITCH}`);
    expect(questions[0]).toContain(`> ${ASKED}`);
    expect(issues[0]).toContain('NPCs on the road');
    expect(existsSync(`${f.home}/work/answer-${id}`)).toBe(false);
    expect(f.created).toEqual([]);
    expect(f.comments).toEqual([]);
  });

  it('sends text only for an answer with no screenshot that says so plainly', async () => {
    const plain = { ...VALID, text: `${TEXT} There is no screenshot, since the game could not be run here. The trader says: "Fuel for scrap, driver?"`, images: [] };
    const { f, albums } = setup(plain, {});
    await answerNext(f.ctx);
    expect(repliesTo(f, 802)).toHaveLength(1);
    expect(repliesTo(f, 802)[0]!.text).toContain('There is no screenshot');
    expect(albums).toEqual([]);
  });

  it('keeps the sent text when the album fails, and logs the failed album', async () => {
    const { f } = setup(VALID);
    f.ctx.telegram.sendPhotos = async () => { throw new Error('Telegram sendMediaGroup failed: boom'); };
    await answerNext(f.ctx);
    expect(repliesTo(f, 802)).toHaveLength(1);
    expect(f.logs.some((line) => line.startsWith('answer null') && line.includes('boom'))).toBe(true);
  });

  const BROKEN: [string, Answer | null][] = [
    ['an unresolvable source', { ...VALID, sources: [{ type: 'commit', ref: 'deadbee' }] }],
    ['a foreign link', { ...VALID, text: `${TEXT} More at https://evil.test/x` }],
    ['a secret value', { ...VALID, text: `${TEXT} ${OAUTH}` }],
    ['no answer file', null],
  ];

  for (const [what, answer] of BROKEN) {
    it(`tells the player once and records a failure for ${what}`, async () => {
      const { f, id, albums } = setup(answer);
      await runJob(f.ctx, 'answer', null);
      expect(repliesTo(f, 802).map((reply) => reply.text)).toEqual([FAILED]);
      expect(albums).toEqual([]);
      expect(readState(f.ctx.statePath).failures).toEqual([expect.objectContaining({ stage: 'answer', issue: null, error: expect.stringContaining(`player comment ${id}`) })]);
      expect(readState(f.ctx.statePath).pendingAnswers).toEqual([]);
      expect(existsSync(`${f.home}/work/answer-${id}`)).toBe(false);
      await runJob(f.ctx, 'answer', null);
      expect(repliesTo(f, 802)).toHaveLength(1);
    });
  }

  it('tells a Russian player in Russian when the answer fails', async () => {
    const { f, id } = setup(null);
    f.store.classify(id, 'question', 'none', f.clock.now, 'parent', { workIssue: ENCOUNTERS, language: 'ru' });
    await expect(answerNext(f.ctx)).rejects.toThrow(`player comment ${id}`);
    expect(repliesTo(f, 802).map((reply) => reply.text)).toEqual(['Сейчас не получилось подготовить ответ на это, команде фабрики уже сообщили.']);
  });

  it('queues a comment once and does nothing with an empty queue', async () => {
    const { f, id, runs } = setup(VALID);
    queueAnswer(f.ctx, id);
    expect(readState(f.ctx.statePath).pendingAnswers).toEqual([id]);
    await answerNext(f.ctx);
    await answerNext(f.ctx);
    expect(runs).toHaveLength(1);
  });
});
