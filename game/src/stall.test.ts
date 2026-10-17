import { describe, expect, it, vi } from 'vitest';
import { Stalled, withinMs, type Timers } from './stall';

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
    const error = await pending.catch((e) => e);
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
