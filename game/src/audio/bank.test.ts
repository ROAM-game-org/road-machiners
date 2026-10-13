import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK, beatLoopSeconds, type Cue } from '../data/sounds';
import { DownloadFailed } from '../download';
import { loadBank, SoundDecodeFailure } from './bank';

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

afterEach(() => vi.unstubAllGlobals());

describe('loadBank', () => {
  it('stops the boot when a file never downloads, with no stand-in', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    const result = expect(loadBank(ctx, { a: SOUNDS.a })).rejects.toBeInstanceOf(DownloadFailed);
    await vi.runAllTimersAsync();
    await result;
    vi.useRealTimers();
  });

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
    const { bank, failures } = await loadBank(ctx, SOUNDS);
    expect(failures).toHaveLength(2);
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

describe('SoundDecodeFailure', () => {
  it('names no files and reads the same for equal counts', () => {
    const error = Object.assign(new Error('x'), { name: 'EncodingError' });
    const one = new SoundDecodeFailure([{ file: 'a.ogg', error }], 104, 'maybe');
    const two = new SoundDecodeFailure([{ file: 'zzz.ogg', error }], 104, 'maybe');
    expect(one.message).toBe('Sounds failed to decode: 1 of 104, Ogg Opus support "maybe": EncodingError');
    expect(one.message).toBe(two.message);
    expect(one.files).toEqual(['a.ogg']);
  });

  it('retries a body that drops and keeps the count rising', async () => {
    vi.useFakeTimers();
    let dropped = false;
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      arrayBuffer: async () => {
        if (url.endsWith('a.mp3') && !dropped) {
          dropped = true;
          throw new TypeError('Failed to fetch');
        }
        return new ArrayBuffer(1);
      },
    }));
    const calls: [number, number][] = [];
    const loading = loadBank(ctx, SOUNDS, (done, total) => calls.push([done, total]));
    await vi.runAllTimersAsync();
    await loading;
    vi.useRealTimers();
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
  });
});
