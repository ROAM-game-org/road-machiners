import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pngBytes } from '../photo-fixtures';
import type { FactoryConfig } from '../types';
import { checkAnswer, configSecrets, type AnswerChecks } from './answer-check';

const SHA = 'abc1234def5678abc1234def5678abc1234def56';
const FILE = 'game/src/encounters/roadside.ts';
const OAUTH = 'sk-ant-oat01-secretvalue';
const BOT = '123456789:AAbbCCddEEffGGhhIIjjKKllMMnnOOppQQr';

function clone(): string {
  const dir = mkdtempSync(join(tmpdir(), 'answer-check-'));
  mkdirSync(join(dir, 'game', '.factory', 'answer-images'), { recursive: true });
  return dir;
}

function checks(dir: string, over: Partial<AnswerChecks> = {}): AnswerChecks {
  const refs: Record<string, 'main' | 'dev'> = { [`commit ${SHA}`]: 'main', [`commit ${SHA.slice(0, 7)}`]: 'dev', [`file ${FILE}`]: 'main', 'file game/data/new.json': 'dev' };
  return {
    clone: dir, dir: 'game', repo: 'o/r', publicUrl: 'https://play.test/play', secrets: [OAUTH, BOT], language: 'en',
    findRef: async (kind, ref) => refs[`${kind} ${ref}`] ?? null,
    issueExists: async (issue) => issue === 345,
    ...over,
  };
}

const VALID = { kind: 'answer', text: 'Roadside encounters shipped on main in #345.', sources: [{ type: 'issue', ref: '345' }] };

function write(dir: string, answer: unknown): void {
  writeFileSync(join(dir, 'game', '.factory', 'answer.json'), typeof answer === 'string' ? answer : JSON.stringify(answer));
}

function image(dir: string, name: string, data: Buffer = pngBytes(1)): void {
  writeFileSync(join(dir, 'game', '.factory', 'answer-images', name), data);
}

async function checked(answer: unknown, over: Partial<AnswerChecks> = {}, setup: (dir: string) => void = () => undefined) {
  const dir = clone();
  write(dir, answer);
  setup(dir);
  return checkAnswer(checks(dir, over));
}

describe('checkAnswer', () => {
  it('renders the text with a sources block of links the factory builds, on the branch that has each source', async () => {
    const sources = [{ type: 'issue', ref: '345' }, { type: 'commit', ref: SHA }, { type: 'file', ref: FILE }, { type: 'file', ref: 'game/data/new.json' }, { type: 'issue', ref: '#345' }];
    const answer = await checked({ ...VALID, sources });
    expect(answer.message).toBe([
      VALID.text, '', 'Sources:',
      'https://github.com/o/r/issues/345',
      `https://github.com/o/r/commit/${SHA}`,
      `https://github.com/o/r/blob/main/${FILE}`,
      'https://github.com/o/r/blob/dev/game/data/new.json',
    ].join('\n'));
    expect(answer.images).toEqual([]);
  });

  it('names the sources block in Russian for a Russian answer, and lets a clarification go without sources', async () => {
    expect((await checked(VALID, { language: 'ru' })).message).toContain('\n\nИсточники:\n');
    expect((await checked({ kind: 'clarify', text: 'Which change do you mean, the trader or the warnings?' })).message).toBe('Which change do you mean, the trader or the warnings?');
  });

  it('fails a missing, broken or wrongly shaped answer file', async () => {
    const dir = clone();
    await expect(checkAnswer(checks(dir))).rejects.toThrow('wrote no .factory/answer.json');
    await expect(checked('not json')).rejects.toThrow();
    await expect(checked({ ...VALID, kind: 'guess' })).rejects.toThrow('kind');
    await expect(checked({ ...VALID, text: ' ' })).rejects.toThrow('text');
    await expect(checked({ ...VALID, text: 'x'.repeat(3001) })).rejects.toThrow('3000');
    await expect(checked({ ...VALID, sources: [] })).rejects.toThrow('source');
    await expect(checked({ ...VALID, sources: 'issue 345' })).rejects.toThrow('sources');
  });

  it('fails a source that does not resolve or is not a plain ref', async () => {
    for (const source of [{ type: 'issue', ref: '346' }, { type: 'issue', ref: '0' }, { type: 'commit', ref: 'deadbee' }, { type: 'commit', ref: 'HEAD~1' }, { type: 'file', ref: 'game/src/missing.ts' }, { type: 'file', ref: '../.env' }, { type: 'file', ref: '/etc/passwd' }, { type: 'tag', ref: 'v1' }]) {
      await expect(checked({ ...VALID, sources: [source] }), JSON.stringify(source)).rejects.toThrow(/source/);
    }
  });

  it('fails any link but the repo on GitHub and the public game, in the text or a caption', async () => {
    for (const text of ['See https://evil.test/x', 'See http://github.com/o/r/issues/1', 'See https://github.com/other/r', 'See https://github.com.evil.test/o/r/', 'See www.evil.test', 'Ask at t.me/somebot', 'Mail me at a@evil.com', 'Open tg://resolve?domain=x']) {
      await expect(checked({ ...VALID, text }), text).rejects.toThrow('link');
    }
    await expect(checked({ ...VALID, images: [{ file: 'a.png', caption: 'more at evil.com' }] }, {}, (dir) => image(dir, 'a.png'))).rejects.toThrow('link');
    const allowed = await checked({ ...VALID, text: 'Play it at https://play.test/play/abc and read https://github.com/o/r/issues/345.' });
    expect(allowed.message).toContain('https://play.test/play/abc');
  });

  it('fails a configured secret or a token-shaped string in the text or a caption', async () => {
    for (const text of [`token ${OAUTH}`, `bot ${BOT}`, 'key sk-proj-abcdefghijklmnop', 'key ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'key github_pat_11ABCDEFG0123456789_abcdefghijk', 'key xoxb-1234567890-abcdefghij', 'blob Q2xhdWRlQ29kZU9hdXRoVG9rZW5WYWx1ZTEyMzQ1Njc4OTA=']) {
      await expect(checked({ ...VALID, text }), text).rejects.toThrow(/secret|token/);
    }
    await expect(checked({ ...VALID, images: [{ file: 'a.png', caption: OAUTH }] }, {}, (dir) => image(dir, 'a.png'))).rejects.toThrow(/secret|token/);
    const plain = await checked({ ...VALID, text: `It merged as ${SHA} and lives in game/src/encounters/roadside_encounter_dialogue_choices.ts.` });
    expect(plain.message).toContain(SHA);
  });

  it('sends up to four real PNG or JPEG files from the answer image folder with their captions', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x00, 0x00, 0x00, 0x00]);
    const answer = await checked({ ...VALID, images: [{ file: 'trader.png', caption: 'The trader' }, { file: 'warning.jpg', caption: '' }] }, {}, (dir) => { image(dir, 'trader.png'); image(dir, 'warning.jpg', jpeg); });
    expect(answer.images.map((photo) => [photo.path.split('/').slice(-3).join('/'), photo.caption])).toEqual([['.factory/answer-images/trader.png', 'The trader'], ['.factory/answer-images/warning.jpg', '']]);
  });

  it('fails an image that is missing, fake, linked, outside the folder, too many or badly captioned', async () => {
    const one = (file: string, caption = 'x') => ({ ...VALID, images: [{ file, caption }] });
    await expect(checked(one('none.png'))).rejects.toThrow('image');
    await expect(checked(one('fake.png'), {}, (dir) => image(dir, 'fake.png', Buffer.from('GIF89a not a png')))).rejects.toThrow('PNG or JPEG');
    await expect(checked(one('link.png'), {}, (dir) => symlinkSync(join(dir, 'game', 'package.json'), join(dir, 'game', '.factory', 'answer-images', 'link.png')))).rejects.toThrow('image');
    await expect(checked(one('../answer.json'))).rejects.toThrow('image');
    await expect(checked(one('..'))).rejects.toThrow('image');
    await expect(checked(one('a.png', 'c'.repeat(201)), {}, (dir) => image(dir, 'a.png'))).rejects.toThrow('200');
    const five = { ...VALID, images: ['a', 'b', 'c', 'd', 'e'].map((name) => ({ file: `${name}.png`, caption: '' })) };
    await expect(checked(five, {}, (dir) => ['a', 'b', 'c', 'd', 'e'].forEach((name) => image(dir, `${name}.png`)))).rejects.toThrow('4');
  });

  it('fails when the answer folder itself is a link out of the clone', async () => {
    const dir = clone();
    const outside = mkdtempSync(join(tmpdir(), 'answer-outside-'));
    writeFileSync(join(outside, 'answer.json'), JSON.stringify(VALID));
    const factory = join(dir, 'game', '.factory');
    await import('node:fs').then((fs) => fs.rmSync(factory, { recursive: true }));
    symlinkSync(outside, factory);
    await expect(checkAnswer(checks(dir))).rejects.toThrow('.factory');
  });
});

describe('configSecrets', () => {
  it('takes every set secret of the config and skips empty ones', () => {
    const cfg = { oauthToken: OAUTH, elevenlabsKey: 'sound-key-123', geminiKey: '', telegramToken: BOT, openaiKey: 'sk-openai-123456', butlerKey: null } as unknown as FactoryConfig;
    expect(configSecrets(cfg).sort()).toEqual([OAUTH, BOT, 'sk-openai-123456', 'sound-key-123'].sort());
  });
});
