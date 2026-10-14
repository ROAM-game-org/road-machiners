import { describe, expect, it } from 'vitest';
import { defang } from './defang';

describe('defang', () => {
  it('breaks mentions, team mentions, references and github links and leaves the text readable', () => {
    const text = '@octocat @github/security torvalds/linux#1 #5 mail a@b.com https://github.com/o/r/issues/1 GitHub.com';
    const out = defang(text);
    expect(out).not.toMatch(/@\w/);
    expect(out).not.toMatch(/(?<!\u200D)#\d/);
    expect(out).not.toMatch(/github\.com/i);
    expect(out.replaceAll('‍', '')).toBe(text);
  });

  it('does not change text with nothing to break and does not grow when applied twice', () => {
    expect(defang('The truck sinks at turn 4')).toBe('The truck sinks at turn 4');
    expect(defang(defang('@a #1'))).toBe(defang('@a #1'));
  });
});
