import { describe, expect, it } from 'vitest';
import { defang } from './defang';

const JOINER = '‍';

describe('defang', () => {
  it.each([
    ['a user mention', '@octocat'],
    ['a team mention', '@github/security'],
    ['a same-repo number', '#5'],
    ['a cross-repo number', 'torvalds/linux#1'],
    ['an upper case GH number', 'GH-123'],
    ['a lower case gh number', 'gh-45'],
    ['a github link', 'https://github.com/o/r/issues/1'],
    ['a www github link', 'https://www.GitHub.com/o/r'],
  ])('breaks %s and keeps the text readable', (_name, text) => {
    const out = defang(text);
    expect(out).not.toBe(text);
    expect(out.replaceAll(JOINER, '')).toBe(text);
    expect(out).not.toMatch(/@\w|#\d|gh-\d|github\.com/i);
  });

  it('leaves an email address, a lone hash and plain words alone where nothing links', () => {
    expect(defang('mail a@b.com')).toBe(`mail a@${JOINER}b.com`);
    expect(defang('The truck sinks at turn 4, # not a number, high-5')).toBe('The truck sinks at turn 4, # not a number, high-5');
  });

  it('does not grow when applied twice', () => {
    const text = '@a @org/team #1 o/r#2 GH-3 gh-4 github.com';
    expect(defang(defang(text))).toBe(defang(text));
  });
});
