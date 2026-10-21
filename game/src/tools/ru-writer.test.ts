import { describe, expect, it } from 'vitest';
import { type Run, type Runner, unavailable, type Writer, WriterFailed, writeRussian } from './ru-writer';

const OK = (text: string): Run => ({ status: 0, stdout: text, stderr: '' });
const FAIL = (stderr: string): Run => ({ status: 1, stdout: '', stderr });
const MISSING: Run = { status: null, stdout: '', stderr: '', missing: true };

function runner(replies: Partial<Record<Writer, Run>>): { run: Runner; calls: Writer[] } {
  const calls: Writer[] = [];
  return { calls, run: (writer) => { calls.push(writer); return replies[writer] ?? MISSING; } };
}

describe('writeRussian', () => {
  it('uses agy first and asks no one else when it writes', () => {
    const { run, calls } = runner({ agy: OK('Привет'), codex: OK('другое') });
    expect(writeRussian('p', run)).toMatchObject({ writer: 'agy', text: 'Привет' });
    expect(calls).toEqual(['agy']);
  });

  it.each([
    ['depleted prepaid credits', 'Error 402: prepayment credits are depleted'],
    ['a spent quota', '429 RESOURCE_EXHAUSTED: quota exceeded'],
    ['the run cap of the factory wrapper', 'agy: run 3 exceeds AGY_MAX_RUNS=2 for this job'],
    ['a missing model setting', 'agy: AGY_MODEL is not set'],
    ['a lost login', 'agy: 401 Unauthorized'],
    ['an outage', '503 Service Unavailable'],
  ])('falls back from agy to Codex on %s', (_name, stderr) => {
    const { run, calls } = runner({ agy: FAIL(stderr), codex: OK('Привет') });
    const written = writeRussian('p', run);
    expect(written).toMatchObject({ writer: 'codex', text: 'Привет' });
    expect(written.attempts.map((a) => [a.writer, a.outcome])).toEqual([['agy', 'unavailable'], ['codex', 'written']]);
    expect(calls).toEqual(['agy', 'codex']);
  });

  it('falls back from agy to Codex when agy is not installed', () => {
    expect(writeRussian('p', runner({ agy: MISSING, codex: OK('Привет') }).run).writer).toBe('codex');
  });

  it('falls back to Claude Sonnet when agy and Codex are both unavailable', () => {
    const { run, calls } = runner({ agy: FAIL('Error 402'), codex: FAIL('codex: ~/.codex/auth.json is missing'), sonnet: OK('Привет') });
    const written = writeRussian('p', run);
    expect(written).toMatchObject({ writer: 'sonnet', text: 'Привет' });
    expect(calls).toEqual(['agy', 'codex', 'sonnet']);
  });

  it('sends every writer the same request, so the context and the style rules travel with it', () => {
    const seen: string[] = [];
    const run: Runner = (_writer, prompt) => { seen.push(prompt); return FAIL('Error 402'); };
    expect(() => writeRussian('read docs/russian-style.md; key log.a', run)).toThrow(WriterFailed);
    expect(seen).toEqual(Array(3).fill('read docs/russian-style.md; key log.a'));
  });

  it('fails and lists every writer when none is available', () => {
    const { run } = runner({ agy: FAIL('Error 402'), codex: MISSING, sonnet: FAIL('429 rate limit') });
    expect(() => writeRussian('p', run)).toThrow(/No Russian writer is available: agy .*codex \(not installed\).*sonnet/);
  });

  it('stops at a writer that fails for another reason instead of hiding it behind the next one', () => {
    const { run, calls } = runner({ agy: FAIL('SyntaxError: bad request file'), codex: OK('Привет') });
    expect(() => writeRussian('p', run)).toThrow(/agy failed on this request/);
    expect(calls).toEqual(['agy']);
  });

  it('stops at an empty reply, since agy ran and wrote nothing', () => {
    const { run, calls } = runner({ agy: OK('  \n'), codex: OK('Привет') });
    expect(() => writeRussian('p', run)).toThrow(/wrote nothing/);
    expect(calls).toEqual(['agy']);
  });

  it('only returns text and attempts, so it writes no file and skips no check', () => {
    expect(Object.keys(writeRussian('p', runner({ agy: OK('Привет') }).run)).sort()).toEqual(['attempts', 'text', 'writer']);
  });
});

describe('unavailable', () => {
  it('is false for a run that worked, even when its text says credits', () => {
    expect(unavailable(OK('credits: 402'))).toBe(false);
  });
});
