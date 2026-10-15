import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOWNLOAD } from '../config';
import { BANK, beatLoopSeconds, type Cue } from '../data/sounds';
import { loadBank, SoundDecodeFailure, SoundUnreachable } from './bank';

const SOUNDS = { a: { files: ['a.ogg'] }, b: { files: ['b.ogg'] } } as unknown as Record<string, Cue>;
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
    vi.stubGlobal('fetch', async (url: string) => ({ ...ok, ok: !url.includes('hit-2.'), status: 404 }));
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
      if (new TextDecoder().decode(data).includes('hit-2.')) throw new Error('EncodingError');
      return good;
    });
    const { bank, failures } = await loadBank(ctxOf(decode), PAIR);
    expect(bank.get('hit-1.ogg')).toBe(good);
    expect(bank.get('hit-2.ogg')).toBe(good);
    expect(failures.map((f) => f.file)).toEqual(['hit-2.ogg']);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('hit-2.ogg'))).toHaveLength(BANK.tries);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('hit-2.m4a'))).toHaveLength(BANK.tries);
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
    expect(fetch).toHaveBeenCalledTimes(BANK.tries * BANK.formats.length);
  });

  it('gives a cue with no decoded file a silent buffer', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const { bank } = await loadBank(rejecting, { a: SOUNDS.a });
    expect(bank.get('a.ogg')!.duration).toBeCloseTo(BANK.silentSeconds, 1);
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
  beforeEach(() => { vi.useFakeTimers(); });

  it('stands in for an unreachable file and does not report it', async () => {
    const fetch = vi.fn(async () => { throw down; });
    vi.stubGlobal('fetch', fetch);
    const run = loadBank(ctx, { a: SOUNDS.a });
    await vi.advanceTimersByTimeAsync(DOWNLOAD.waitMs.reduce((a, b) => a + b));
    const { bank, failures, unreachable } = await run;
    expect(failures).toEqual([]);
    expect(unreachable.map((f) => f.file)).toEqual(['a.ogg']);
    expect(bank.get('a.ogg')!.duration).toBeCloseTo(BANK.silentSeconds, 1);
    expect(fetch).toHaveBeenCalledTimes(DOWNLOAD.tries);
  });

  it('recovers when the second try gets through', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      if (++calls === 1) throw down;
      return ok;
    });
    const run = loadBank(ctx, { a: SOUNDS.a });
    await vi.advanceTimersByTimeAsync(DOWNLOAD.waitMs[0]);
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
    await vi.advanceTimersByTimeAsync(DOWNLOAD.waitMs.reduce((a, b) => a + b));
    const { bank, failures, unreachable } = await run;
    expect(bank.get('hit-2.ogg')).toBe(good);
    expect(failures).toEqual([]);
    expect(unreachable.map((f) => f.file)).toEqual(['hit-2.ogg']);
  });

  it('keeps the network error as the cause', () => {
    const error = new SoundUnreachable('a.ogg', down);
    expect(error.cause).toBe(down);
    expect(error.message).toContain('a.ogg');
  });
});

describe('SoundDecodeFailure', () => {
  it('names no files and reads the same for equal counts', () => {
    const error = Object.assign(new Error('x'), { name: 'EncodingError' });
    const support = { ogg: 'probably', m4a: 'maybe' };
    const one = new SoundDecodeFailure([{ file: 'a.ogg', errors: [error, error] }], 104, support);
    const two = new SoundDecodeFailure([{ file: 'zzz.ogg', errors: [error, error] }], 104, support);
    expect(one.message).toBe('Sounds failed to decode: 1 of 104, ogg "probably" EncodingError, m4a "maybe" EncodingError');
    expect(one.message).toBe(two.message);
    expect(one.files).toEqual(['a.ogg']);
  });

  it('counts a file once when its download is retried', async () => {
    vi.useFakeTimers();
    let first = true;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('a.ogg') && first) {
        first = false;
        throw new TypeError('Load failed');
      }
      return ok;
    });
    const calls: [number, number][] = [];
    const run = loadBank(ctx, SOUNDS, (done, total) => calls.push([done, total]));
    await vi.advanceTimersByTimeAsync(DOWNLOAD.waitMs[0] * 10);
    const { failures } = await run;
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(failures).toEqual([]);
  });
});

describe('loadBank with a browser that refuses Ogg Opus', () => {
  const MANY = { m: { files: Array.from({ length: 20 }, (_, i) => `f${i}.ogg`) } } as unknown as Record<string, Cue>;
  const good = { id: 'good' } as unknown as AudioBuffer;
  const urlBytes = (url: string) => ({ ...ok, arrayBuffer: async () => new TextEncoder().encode(url).buffer });
  const urlOf = (data: ArrayBuffer) => new TextDecoder().decode(data);
  const refusing = (refused: string) =>
    ctxOf(async (data) => {
      if (urlOf(data).endsWith(refused)) throw Object.assign(new Error('x'), { name: 'EncodingError' });
      return good;
    });
  const urls = (fetch: { mock: { calls: unknown[][] } }, ext: string) => fetch.mock.calls.filter(([url]) => (url as string).endsWith(ext));

  it('decodes every file from the twin and learns the format', async () => {
    const fetch = vi.fn(async (url: string) => urlBytes(url));
    vi.stubGlobal('fetch', fetch);
    const { bank, failures, format } = await loadBank(refusing('.ogg'), MANY);
    expect(failures).toEqual([]);
    expect(format).toBe('m4a');
    expect([...bank.values()].every((b) => b === good)).toBe(true);
    expect(urls(fetch, '.m4a')).toHaveLength(20);
    expect(urls(fetch, '.ogg').length).toBeLessThanOrEqual(BANK.decodeAtOnce * BANK.tries);
    expect(fetch.mock.calls.some(([url]) => (url as string).includes('sfx-m4a/f19.m4a'))).toBe(true);
  });

  it('fetches only .ogg when it decodes', async () => {
    const fetch = vi.fn(async (url: string) => urlBytes(url));
    vi.stubGlobal('fetch', fetch);
    const { format } = await loadBank(refusing('.never'), MANY);
    expect(format).toBe('ogg');
    expect(urls(fetch, '.m4a')).toHaveLength(0);
    expect(urls(fetch, '.ogg')).toHaveLength(20);
  });

  it('fails a file that decodes in neither format with one error each', async () => {
    vi.stubGlobal('fetch', async (url: string) => urlBytes(url));
    const { failures } = await loadBank(ctxOf(async (data) => {
      if (urlOf(data).includes('hit-2')) throw new Error('bad');
      return good;
    }), PAIR);
    expect(failures.map((f) => f.file)).toEqual(['hit-2.ogg']);
    expect(failures[0].errors).toHaveLength(2);
  });

  it('does not try the twin of an unreachable file or switch the format', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('hit-2.ogg')) throw new TypeError('Failed to fetch');
      return urlBytes(url);
    });
    vi.stubGlobal('fetch', fetch);
    vi.useFakeTimers();
    const run = loadBank(ctxOf(async () => good), PAIR);
    await vi.advanceTimersByTimeAsync(DOWNLOAD.waitMs.reduce((a, b) => a + b));
    const { unreachable, failures, format } = await run;
    expect(unreachable.map((f) => f.file)).toEqual(['hit-2.ogg']);
    expect(failures).toEqual([]);
    expect(format).toBe('ogg');
    expect(urls(fetch, '.m4a')).toHaveLength(0);
  });

  it('counts a 404 of the twin as a failure', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.endsWith('.m4a') ? { ...ok, ok: false, status: 404 } : urlBytes(url)));
    const { failures, unreachable } = await loadBank(refusing('.ogg'), { a: SOUNDS.a });
    expect(failures).toHaveLength(1);
    expect(unreachable).toEqual([]);
  });
});

describe('loadBank with beat cues', () => {
  const loop = Math.round(beatLoopSeconds({ bpm: 120, bars: 2 }) * 100);
  const sized = (length: number) => {
    const made: { length: number; channel: Float32Array }[] = [];
    const context = {
      sampleRate: 100,
      decodeAudioData: async () => ({ length, numberOfChannels: 1, getChannelData: () => new Float32Array(length).fill(1) }),
      createBuffer: (_c: number, n: number) => {
        const channel = new Float32Array(n);
        made.push({ length: n, channel });
        return { length: n, duration: n / 100, numberOfChannels: 1, getChannelData: () => channel };
      },
    };
    return { context: context as unknown as BaseAudioContext, made };
  };
  const bytes = async () => ({ ...ok });

  it('trims a long buffer and pads a short one to exactly one loop', async () => {
    vi.stubGlobal('fetch', bytes);
    for (const length of [loop + 1, loop - 1]) {
      const { context } = sized(length);
      const { bank, failures } = await loadBank(context, BEAT);
      expect(failures).toEqual([]);
      expect(bank.get('score-1.ogg')!.length).toBe(loop);
    }
  });

  it('fails a format whose buffer is far off a loop', async () => {
    vi.stubGlobal('fetch', bytes);
    const { context } = sized(loop + 20);
    const { failures } = await loadBank(context, BEAT);
    expect(failures[0].errors.map((e) => (e as Error).name)).toEqual(['BeatLengthMismatch', 'BeatLengthMismatch']);
  });
});
