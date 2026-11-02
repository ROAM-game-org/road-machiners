import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cardSession, cardSessionDir, keepCardSession } from './card-session';
import { clearSessions, sessionsDir } from './sessions';

let home = '';

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-card-session-');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function testingSession(issue: number, id: string, transcript: string): void {
  const dir = sessionsDir(home, issue);
  mkdirSync(join(dir, '-work-game', id, 'subagents'), { recursive: true });
  writeFileSync(join(dir, 'test.id'), id);
  writeFileSync(join(dir, '-work-game', `${id}.jsonl`), transcript);
  writeFileSync(join(dir, '-work-game', id, 'subagents', 'a.jsonl'), 'sub');
}

describe('the kept card session', () => {
  it('keeps the Testing session with its transcript after the card sessions are cleared, so a merge can resume it', () => {
    testingSession(7, 'abc', 'approved build');
    expect(keepCardSession(home, 7)).toBeNull();
    clearSessions(home, 7);
    const session = cardSession(home, 7);
    expect(session).toEqual({ dir: cardSessionDir(home, 7), id: 'abc', resume: true });
    expect(readFileSync(join(session!.dir, '-work-game', 'abc.jsonl'), 'utf8')).toBe('approved build');
    expect(existsSync(join(session!.dir, '-work-game', 'abc', 'subagents', 'a.jsonl'))).toBe(true);
  });

  it('replaces the kept session when the card passes Testing again', () => {
    testingSession(7, 'old', 'first build');
    keepCardSession(home, 7);
    clearSessions(home, 7);
    testingSession(7, 'new', 'patched build');
    keepCardSession(home, 7);
    expect(cardSession(home, 7)?.id).toBe('new');
    expect(existsSync(join(cardSessionDir(home, 7), '-work-game', 'old.jsonl'))).toBe(false);
  });

  it('keeps nothing and says why when Testing left no session, like a docs-only card', () => {
    expect(keepCardSession(home, 7)).toContain('no test session id');
    expect(cardSession(home, 7)).toBeNull();
  });

  it('keeps nothing when the session id has no transcript', () => {
    mkdirSync(sessionsDir(home, 7), { recursive: true });
    writeFileSync(join(sessionsDir(home, 7), 'test.id'), 'ghost');
    expect(keepCardSession(home, 7)).toContain('session ghost has no transcript');
    expect(cardSession(home, 7)).toBeNull();
  });

  it('fails loudly on a kept session whose transcript is gone', () => {
    testingSession(7, 'abc', 'x');
    keepCardSession(home, 7);
    rmSync(join(cardSessionDir(home, 7), '-work-game'), { recursive: true });
    expect(() => cardSession(home, 7)).toThrow('The kept session abc of #7 has no transcript');
  });
});
