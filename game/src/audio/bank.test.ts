import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANK, beatLoopSeconds, type Cue } from '../data/sounds';
import { ASSET_RETRY_DELAYS_MS } from '../fetch-asset';
import { loadBank, SoundDecodeFailure, SoundUnreachable } from './bank';

const SOUNDS = { a: { files: ['a.mp3'] }, b: { files: ['b.mp3'] } } as unknown as Record<string, Cue>;
const PAIR = { hit: { files: ['hit-1.ogg', 'hit-2.ogg'] } } as unknown as Record<string, Cue>;
const BEAT = { score: { files: ['score-1.ogg'], beat: { bpm: 120, bars: 2 } } } as unknown as Record<string, Cue>;
const ok = { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) };
const silent = { sampleRate: 100, createBuffer: (_c: number, length: number) => ({ length, duration: length / 100 }) };

function ctxOf(decode: (data: ArrayBuffer) => Promise<AudioBuffer>) {
  return { ...silent, decodeAudioData: decode } as unknown as BaseAudioContext;
}
const ctx = ctxOf(async () => ({}) as AudioBuffer);
const rejecting = ctxOf(async () => { throw new Error('bad'); });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loadBank', () => {
  it('reports 0 first, then each decoded file', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const calls: [number, number][] = [];
    const { failures } = await loadBank(ctx, SOUNDS, (done, total) => calls.push([done, total]));
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(failures).toEqual([]);
  });

  it('fetches a file that decodes once', async () => {
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    await loadBank(ctx, SOUNDS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives a failed file the buffer of a decoded sibling', async () => {
    const good = { id: 'good' } as unknown as AudioBuffer;
    vi.stubGlobal('fetch', async (url: string) => ({ ...ok, ok: !url.endsWith('hit-2.ogg'), status: 404 }));
    const calls: number[] = [];
    const { bank, failures } = await loadBank(ctxOf(async () => good), PAIR, (done) => calls.push(done));
    expect(bank.get('hit-2.ogg')).toBe(good);
    expect(failures.map((f) => f.file)).toEqual(['hit-2.ogg']);
    expect(Math.max(...calls)).toBe(2);
  });

  it('gives a file that never decodes the buffer of a decoded sibling', async () => {
    const good = { id: 'good' } as unknown as AudioBuffer;
    const fetch = vi.fn(async (url: string) => ({ ...ok, arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
    vi.stubGlobal('fetch', fetch);
    const decode = vi.fn(async (data: ArrayBuffer) => {
      if (new TextDecoder().decode(data).endsWith('hit-2.ogg')) throw new Error('EncodingError');
      return good;
    });
    const { bank, failures } = await loadBank(ctxOf(decode), PAIR);
    expect(bank.get('hit-1.ogg')).toBe(good);
    expect(bank.get('hit-2.ogg')).toBe(good);
    expect(failures.map((f) => f.file)).toEqual(['hit-2.ogg']);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('hit-2.ogg'))).toHaveLength(BANK.tries);
  });

  it('retries a file that fails once', async () => {
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    let calls = 0;
    const flaky = ctxOf(async () => {
      if (++calls === 1) throw new Error('once');
      return {} as AudioBuffer;
    });
    const { failures } = await loadBank(flaky, { a: SOUNDS.a }, undefined);
    expect(failures).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('tries a failing file BANK.tries times', async () => {
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    await loadBank(rejecting, { a: SOUNDS.a });
    expect(fetch).toHaveBeenCalledTimes(BANK.tries);
  });

  it('gives a cue with no decoded file a silent buffer', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const { bank } = await loadBank(rejecting, { a: SOUNDS.a });
    expect(bank.get('a.mp3')!.duration).toBeCloseTo(BANK.silentSeconds, 1);
  });

  it('gives a beat cue a silent buffer one loop long', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const { bank } = await loadBank(rejecting, BEAT);
    expect(bank.get('score-1.ogg')!.duration).toBeCloseTo(beatLoopSeconds({ bpm: 120, bars: 2 }), 1);
  });

  it('treats a 404 like a decode failure', async () => {
    vi.stubGlobal('fetch', async () => ({ ...ok, ok: false, status: 404 }));
    const { bank, failures, unreachable } = await loadBank(ctx, SOUNDS);
    expect(failures).toHaveLength(2);
    expect(unreachable).toEqual([]);
    expect(bank.size).toBe(2);
  });

  it('runs at most BANK.decodeAtOnce jobs at the same time', async () => {
    const many = { m: { files: Array.from({ length: 20 }, (_, i) => `f${i}.ogg`) } } as unknown as Record<string, Cue>;
    vi.stubGlobal('fetch', async () => ok);
    let running = 0;
    let peak = 0;
    const counting = ctxOf(async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return {} as AudioBuffer;
    });
    await loadBank(counting, many);
    expect(peak).toBe(BANK.decodeAtOnce);
  });
});

describe('loadBank with the network down', () => {
  const down = new TypeError('Failed to fetch');
  beforeEach(() => vi.useFakeTimers());

  it('stands in for an unreachable file and does not report it', async () => {
    const fetch = vi.fn(async () => { throw down; });
    vi.stubGlobal('fetch', fetch);
    const run = loadBank(ctx, { a: SOUNDS.a });
    await vi.advanceTimersByTimeAsync(20000);
    const { bank, failures, unreachable } = await run;
    expect(failures).toEqual([]);
    expect(unreachable.map((f) => f.file)).toEqual(['a.mp3']);
    expect(bank.get('a.mp3')!.duration).toBeCloseTo(BANK.silentSeconds, 1);
    expect(fetch).toHaveBeenCalledTimes(ASSET_RETRY_DELAYS_MS.length + 1);
  });

  it('recovers when the second try gets through', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      if (++calls === 1) throw down;
      return ok;
    });
    const run = loadBank(ctx, { a: SOUNDS.a });
    await vi.advanceTimersByTimeAsync(20000);
    const { failures, unreachable } = await run;
    expect(failures).toEqual([]);
    expect(unreachable).toEqual([]);
  });

  it('gives an unreachable file the buffer of its sibling', async () => {
    const good = { id: 'good' } as unknown as AudioBuffer;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('hit-2.ogg')) throw down;
      return ok;
    });
    const run = loadBank(ctxOf(async () => good), PAIR);
    await vi.advanceTimersByTimeAsync(20000);
    const { bank, failures, unreachable } = await run;
    expect(bank.get('hit-2.ogg')).toBe(good);
    expect(failures).toEqual([]);
    expect(unreachable.map((f) => f.file)).toEqual(['hit-2.ogg']);
  });

  it('keeps the network error as the cause', () => {
    const error = new SoundUnreachable('a.mp3', down);
    expect(error.cause).toBe(down);
    expect(error.message).toContain('a.mp3');
  });
});

describe('SoundDecodeFailure', () => {
  it('names no files and reads the same for equal counts', () => {
    const error = Object.assign(new Error('x'), { name: 'EncodingError' });
    const one = new SoundDecodeFailure([{ file: 'a.ogg', error }], 104, 'maybe');
    const two = new SoundDecodeFailure([{ file: 'zzz.ogg', error }], 104, 'maybe');
    expect(one.message).toBe('Sounds failed to decode: 1 of 104, Ogg Opus support "maybe": EncodingError');
    expect(one.message).toBe(two.message);
    expect(one.files).toEqual(['a.ogg']);
  });

  it('counts a file once when its download is retried', async () => {
    vi.useFakeTimers();
    let first = true;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('a.mp3') && first) {
        first = false;
        throw new TypeError('Load failed');
      }
      return ok;
    });
    const calls: [number, number][] = [];
    const run = loadBank(ctx, SOUNDS, (done, total) => calls.push([done, total]));
    await vi.advanceTimersByTimeAsync(20000);
    const { failures } = await run;
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(failures).toEqual([]);
  });
});
