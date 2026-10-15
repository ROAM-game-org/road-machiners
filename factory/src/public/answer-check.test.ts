import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkedAnswer, TEXT_LIMIT } from './answer-check';

function home(text: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'answer-check-'));
  mkdirSync(join(dir, '.factory'));
  if (text !== null) writeFileSync(join(dir, '.factory', 'answer.md'), text);
  return dir;
}

const check = (text: string | null) => checkedAnswer({ home: home(text), repo: 'o/r', publicUrl: 'https://play.example/game/', secrets: ['configured-secret'] });

describe('checkedAnswer', () => {
  it('gives the trimmed text with links to the repo and the public game', () => {
    expect(check('  See https://github.com/o/r/issues/5 and play at https://play.example/game/.\n')).toBe('See https://github.com/o/r/issues/5 and play at https://play.example/game/.');
  });

  it('throws on a missing, empty or overlong answer', () => {
    expect(() => check(null)).toThrow('wrote no .factory/answer.md');
    expect(() => check('  \n')).toThrow('empty');
    expect(() => check('a'.repeat(TEXT_LIMIT + 1))).toThrow(`over the ${TEXT_LIMIT} limit`);
  });

  it('refuses an answer file that is a link', () => {
    const dir = home(null);
    writeFileSync(join(dir, 'secret.txt'), 'x');
    symlinkSync(join(dir, 'secret.txt'), join(dir, '.factory', 'answer.md'));
    expect(() => checkedAnswer({ home: dir, repo: 'o/r', publicUrl: 'https://play.example/', secrets: [] })).toThrow('as a link or an odd file');
  });

  it('throws on a foreign link, a bare domain and another repo on GitHub', () => {
    expect(() => check('Go to https://evil.example/x')).toThrow('neither o/r on GitHub nor the public game');
    expect(() => check('Join t.me/scamchat now')).toThrow('neither');
    expect(() => check('Visit cheap-fuel.com today')).toThrow('neither');
    expect(() => check('See https://github.com/other/repo')).toThrow('neither');
  });

  it('throws on a configured secret, a token shape and a long random run, and keeps a commit hash', () => {
    expect(() => check('it is configured-secret')).toThrow('configured secret');
    expect(() => check('key sk-ant-abcdefghijklmnop')).toThrow('token-shaped');
    expect(() => check('blob Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7cDe0f')).toThrow('long token-shaped');
    expect(check('Fixed in 0123456789abcdef0123456789abcdef01234567.')).toContain('0123456789abcdef');
  });
});
