import { afterEach, describe, expect, it, vi } from 'vitest';
import { stallMessage, stallMinutes, watchStalls } from '../../scripts/stall-watch.mjs';

function fakeStream(): { write: (chunk: string) => boolean } {
  return { write: () => true };
}

describe('the playtest stall watch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays off without TEST_STALL_MINUTES', () => {
    expect(watchStalls('The playtest', {}, fakeStream(), () => undefined).timer).toBeNull();
  });

  it('closes what the run registered before it exits on a stall', async () => {
    vi.useFakeTimers();
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stream = fakeStream();
    const order: string[] = [];
    const watch = watchStalls('The playtest', { TEST_STALL_MINUTES: '1' }, stream);
    watch.closeOnStall(async () => {
      order.push('browser closed');
    });
    exit.mockImplementation((() => {
      order.push('exit');
    }) as never);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(order.slice(0, 2)).toEqual(['browser closed', 'exit']);
    vi.restoreAllMocks();
  });

  it('refuses a stall limit that is not a positive number of minutes', () => {
    expect(() => stallMinutes({ TEST_STALL_MINUTES: '0' })).toThrow(/above 0/);
    expect(() => stallMinutes({ TEST_STALL_MINUTES: 'soon' })).toThrow(/above 0/);
  });

  it('fails a run that prints nothing for the limit and names the last line it printed', () => {
    vi.useFakeTimers();
    const stream = fakeStream();
    const exit = vi.fn();
    watchStalls('The playtest', { TEST_STALL_MINUTES: '2' }, stream, exit);
    stream.write('night roaming at the night peak: missing ground share 0.000\n');
    vi.advanceTimersByTime(119_000);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11_000);
    expect(exit).toHaveBeenCalledWith(stallMessage('The playtest', 2, 'night roaming at the night peak: missing ground share 0.000'));
  });

  it('counts every printed line as progress', () => {
    vi.useFakeTimers();
    const stream = fakeStream();
    const exit = vi.fn();
    watchStalls('The playtest', { TEST_STALL_MINUTES: '1' }, stream, exit);
    for (let minute = 0; minute < 5; minute++) {
      vi.advanceTimersByTime(50_000);
      stream.write(`turn ${minute}\n`);
    }
    expect(exit).not.toHaveBeenCalled();
  });
});
