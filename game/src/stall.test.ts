import { describe, expect, it, vi } from 'vitest';
import { workerError } from './three/travel';
import { errorText, Stalled, withinMs, type Timers } from './stall';

function fakeTimers() {
  const runs = new Map<number, () => void>();
  let next = 0;
  const timers: Timers = {
    set: (_ms, run) => {
      runs.set(++next, run);
      return next;
    },
    clear: (handle) => void runs.delete(handle as number),
  };
  return { timers, runs, fire: () => [...runs.values()].forEach((run) => run()) };
}

describe('withinMs', () => {
  it('passes the value and clears its timer when the work settles', async () => {
    const t = fakeTimers();
    expect(await withinMs(Promise.resolve(7), 100, 'x', t.timers)).toBe(7);
    expect(t.runs.size).toBe(0);
  });

  it('passes a rejection and clears its timer', async () => {
    const t = fakeTimers();
    await expect(withinMs(Promise.reject(new Error('no')), 100, 'x', t.timers)).rejects.toThrow('no');
    expect(t.runs.size).toBe(0);
  });

  it('rejects with Stalled when the work never settles', async () => {
    const t = fakeTimers();
    const pending = withinMs(new Promise(() => {}), 5000, 'The thing', t.timers);
    t.fire();
    const error = (await pending.catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(Stalled);
    expect(error.message).toBe('The thing got no answer for 5 s');
  });

  it.each([0, -1, NaN, Infinity])('throws on the limit %s', (ms) => {
    expect(() => withinMs(Promise.resolve(), ms, 'x')).toThrow('finite positive');
  });

  it('uses real timers by default', async () => {
    vi.useFakeTimers();
    const pending = withinMs(new Promise(() => {}), 50, 'x').catch((e) => e);
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toBeInstanceOf(Stalled);
    vi.useRealTimers();
  });
});

const FIREFOX_STACK = 'readSummary@https://example.test/turn-worker.js:16:695484\nterrainEntry@https://example.test/turn-worker.js:16:12';

function withStack<E extends Error>(error: E, stack: string | undefined): E {
  error.stack = stack;
  return error;
}

describe('errorText', () => {
  it('keeps a V8 stack that already starts with the name and message', () => {
    const stack = 'Error: no route\n    at readSummary (layer.ts:476:115)';
    expect(errorText(withStack(new Error('no route'), stack))).toBe(stack);
  });

  it('puts the name and message before a Firefox stack', () => {
    expect(errorText(withStack(new Error('no route'), FIREFOX_STACK))).toBe(`Error: no route\n${FIREFOX_STACK}`);
  });

  it('gives the name and message of an error with no stack', () => {
    expect(errorText(withStack(new RangeError('too far'), undefined))).toBe('RangeError: too far');
  });

  it('gives only the name when the message is empty', () => {
    expect(errorText(withStack(new TypeError(''), undefined))).toBe('TypeError');
  });

  it('turns anything else into its string', () => {
    expect(errorText('lost')).toBe('lost');
    expect(errorText(42)).toBe('42');
  });

  it('lets a worker error from Firefox keep its message on the main thread', () => {
    const error = workerError(errorText(withStack(new TypeError('Turn worker has no terrain'), FIREFOX_STACK)));
    expect(error.message).toBe('Turn worker has no terrain');
    expect(error.name).toBe('TypeError');
  });
});
