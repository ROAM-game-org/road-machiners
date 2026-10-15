import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANK, beatLoopSeconds, type Cue } from '../data/sounds';
import { ASSET_RETRY_DELAYS_MS } from '../fetch-asset';
import { loadBank, SoundDecodeFailure, SoundUnreachable, soundFormats, type SoundFormat } from './bank';

const SOUNDS = { a: { files: ['a.mp3'] }, b: { files: ['b.mp3'] } } as unknown as Record<string, Cue>;
const PAIR = { hit: { files: ['hit-1.ogg', 'hit-2.ogg'] } } as unknown as Record<string, Cue>;
const BEAT = { score: { files: ['score-1.ogg'], beat: { bpm: 120, bars: 2 } } } as unknown as Record<string, Cue>;
const ok = { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) };
const OGG: SoundFormat[] = ['ogg', 'm4a'];
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
    const { failures } = await loadBank(ctx, SOUNDS, OGG, (done, total) => calls.push([done, total]));
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(failures).toEqual([]);
  });

  it('fetches a file that decodes once', async () => {
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    await loadBank(ctx, SOUNDS, OGG);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives a failed file the buffer of a decoded sibling', async () => {
    const good = { id: 'good' } as unknown as AudioBuffer;
    vi.stubGlobal('fetch', async (url: string) => ({ ...ok, ok: !url.includes('hit-2'), status: 404 }));
    const calls: number[] = [];
    const { bank, failures } = await loadBank(ctxOf(async () => good), PAIR, OGG, (done) => calls.push(done));
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
    const { bank, failures } = await loadBank(ctxOf(decode), PAIR, OGG);
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
    const { failures } = await loadBank(flaky, { a: SOUNDS.a }, OGG, undefined);
    expect(failures).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('tries a failing file BANK.tries times', async () => {
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    await loadBank(rejecting, { a: SOUNDS.a }, OGG);
    expect(fetch).toHaveBeenCalledTimes(BANK.tries * 2);
  });

  it('gives a cue with no decoded file a silent buffer', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const { bank } = await loadBank(rejecting, { a: SOUNDS.a }, OGG);
    expect(bank.get('a.mp3')!.duration).toBeCloseTo(BANK.silentSeconds, 1);
  });

  it('gives a beat cue a silent buffer one loop long', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const { bank } = await loadBank(rejecting, BEAT, OGG);
    expect(bank.get('score-1.ogg')!.duration).toBeCloseTo(beatLoopSeconds({ bpm: 120, bars: 2 }), 1);
  });

  it('treats a 404 like a decode failure', async () => {
    vi.stubGlobal('fetch', async () => ({ ...ok, ok: false, status: 404 }));
    const { bank, failures, unreachable } = await loadBank(ctx, SOUNDS, OGG);
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
    await loadBank(counting, many, OGG);
    expect(peak).toBe(BANK.decodeAtOnce);
  });
});

describe('loadBank with the network down', () => {
  const down = new TypeError('Failed to fetch');
  beforeEach(() => vi.useFakeTimers());

  it('stands in for an unreachable file and does not report it', async () => {
    const fetch = vi.fn(async () => { throw down; });
    vi.stubGlobal('fetch', fetch);
    const run = loadBank(ctx, { a: SOUNDS.a }, OGG);
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
    const run = loadBank(ctx, { a: SOUNDS.a }, OGG);
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
    const run = loadBank(ctxOf(async () => good), PAIR, OGG);
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
    const one = new SoundDecodeFailure([{ file: 'a.ogg', error }], 104, ['m4a', 'ogg'], 'maybe');
    const two = new SoundDecodeFailure([{ file: 'zzz.ogg', error }], 104, ['m4a', 'ogg'], 'maybe');
    expect(one.message).toBe('Sounds failed to decode: 1 of 104, tried m4a, ogg, Ogg Opus support "maybe": EncodingError');
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
    const run = loadBank(ctx, SOUNDS, OGG, (done, total) => calls.push([done, total]));
    await vi.advanceTimersByTimeAsync(20000);
    const { failures } = await run;
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(failures).toEqual([]);
  });
});

describe('sound formats', () => {
  const ONE = { hit: { files: ['hit-1.ogg'] } } as unknown as Record<string, Cue>;
  const LENGTHS = { 'hit-1.ogg': 24000, 'hit-2.ogg': 24000 };
  const tracked = () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url.split('/').pop()!);
      return ok;
    });
    return urls;
  };
  const bufferOf = (length: number) => {
    const data = Float32Array.from({ length }, (_, i) => i);
    return { length, sampleRate: 100, numberOfChannels: 1, duration: length / 100, getChannelData: () => data } as unknown as AudioBuffer;
  };
  const cuttingCtx = (decode: (data: ArrayBuffer) => Promise<AudioBuffer>) => {
    const copied: Float32Array[] = [];
    const made: number[] = [];
    const context = {
      sampleRate: 100,
      decodeAudioData: decode,
      createBuffer: (_c: number, length: number) => {
        made.push(length);
        return { length, copyToChannel: (data: Float32Array) => copied.push(data) };
      },
    } as unknown as BaseAudioContext;
    return { context, copied, made };
  };

  it('puts ogg first when Ogg Opus is supported and m4a first when it is not', () => {
    expect(soundFormats('maybe')).toEqual(['ogg', 'm4a']);
    expect(soundFormats('probably')).toEqual(['ogg', 'm4a']);
    expect(soundFormats('')).toEqual(['m4a', 'ogg']);
  });

  it('fetches only ogg when ogg decodes', async () => {
    const urls = tracked();
    await loadBank(ctx, PAIR, OGG, undefined, LENGTHS);
    expect(urls).toEqual(['hit-1.ogg', 'hit-2.ogg']);
  });

  it('fetches only m4a first and keeps the ogg names as keys', async () => {
    const urls = tracked();
    const { bank, failures } = await loadBank(ctxOf(async () => bufferOf(10)), PAIR, ['m4a', 'ogg'], undefined, LENGTHS);
    expect(urls).toEqual(['hit-1.m4a', 'hit-2.m4a']);
    expect([...bank.keys()]).toEqual(['hit-1.ogg', 'hit-2.ogg']);
    expect(failures).toEqual([]);
  });

  it('switches the whole bank to m4a after ogg fails once', async () => {
    const urls = tracked();
    const many = { m: { files: ['m-1.ogg', 'm-2.ogg', 'm-3.ogg'] } } as unknown as Record<string, Cue>;
    const lengths = { 'm-1.ogg': 24000, 'm-2.ogg': 24000, 'm-3.ogg': 24000 };
    const oneAtATime = vi.spyOn(BANK, "decodeAtOnce", "get").mockReturnValue(1);
    let current = '';
    vi.stubGlobal('fetch', async (url: string) => {
      current = url.split('/').pop()!;
      urls.push(current);
      return ok;
    });
    const picky = ctxOf(async () => {
      if (current.endsWith('.ogg')) throw new Error('no opus');
      return bufferOf(10);
    });
    const { failures } = await loadBank(picky, many, OGG, undefined, lengths);
    oneAtATime.mockRestore();
    expect(failures).toEqual([]);
    expect(urls.filter((u) => u.endsWith('.ogg'))).toHaveLength(BANK.tries);
    expect(urls.slice(-2)).toEqual(['m-2.m4a', 'm-3.m4a']);
  });

  it('fails a file only when both formats fail, and tries each BANK.tries times', async () => {
    const urls = tracked();
    const { failures, bank } = await loadBank(rejecting, ONE, OGG, undefined, LENGTHS);
    expect(failures.map((f) => f.file)).toEqual(['hit-1.ogg']);
    expect(urls).toHaveLength(BANK.tries * 2);
    expect(bank.get('hit-1.ogg')!.duration).toBeCloseTo(BANK.silentSeconds, 1);
  });

  it('cuts a longer m4a buffer to the ogg length at the context rate', async () => {
    tracked();
    const { context, copied, made } = cuttingCtx(async () => bufferOf(80));
    await loadBank(context, ONE, ['m4a'], undefined, { 'hit-1.ogg': 48000 / 2 });
    expect(made).toEqual([50]);
    expect(Array.from(copied[0])).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('keeps a shorter m4a buffer and never cuts an ogg buffer', async () => {
    tracked();
    const short = bufferOf(30);
    const long = bufferOf(80);
    const a = await loadBank(cuttingCtx(async () => short).context, ONE, ['m4a'], undefined, { 'hit-1.ogg': 24000 });
    const b = await loadBank(cuttingCtx(async () => long).context, ONE, ['ogg'], undefined, { 'hit-1.ogg': 24000 });
    expect(a.bank.get('hit-1.ogg')).toBe(short);
    expect(b.bank.get('hit-1.ogg')).toBe(long);
  });

  it('fails an m4a file that has no length entry', async () => {
    tracked();
    const { failures } = await loadBank(ctxOf(async () => bufferOf(10)), ONE, ['m4a'], undefined, {});
    expect(String(failures[0].error)).toContain('No length for hit-1.ogg');
  });

  it('boots a browser with no Ogg Opus on m4a alone, like Safari 26.6.1 in issue 549', async () => {
    const sounds = {
      hit: { files: ['hit-1.ogg', 'hit-2.ogg'] },
      engine: { files: ['engine-1.ogg', 'engine-2.ogg'] },
      score: { files: ['score-1.ogg', 'score-2.ogg'], beat: { bpm: 120, bars: 2 } },
    } as unknown as Record<string, Cue>;
    const beatFrames = beatLoopSeconds({ bpm: 120, bars: 2 } as never) * 48000;
    const lengths = Object.fromEntries(
      Object.values(sounds).flatMap((cue) => cue.files.map((f) => [f, cue.beat ? beatFrames : 24000])),
    );
    const urls: string[] = [];
    let current = '';
    vi.stubGlobal('fetch', async (url: string) => {
      current = url.split('/').pop()!;
      urls.push(current);
      return ok;
    });
    const noOpus = cuttingCtx(async () => {
      if (current.endsWith('.ogg')) throw Object.assign(new Error('x'), { name: 'EncodingError' });
      return bufferOf(900);
    }).context;
    const oneAtATime = vi.spyOn(BANK, 'decodeAtOnce', 'get').mockReturnValue(1);
    const { bank, failures } = await loadBank(noOpus, sounds, soundFormats(''), undefined, lengths);
    oneAtATime.mockRestore();
    expect(failures).toEqual([]);
    expect(urls.filter((u) => u.endsWith('.ogg'))).toEqual([]);
    expect([...bank.keys()]).toEqual(Object.values(sounds).flatMap((cue) => cue.files));
    expect(bank.get('score-1.ogg')!.length).toBe(Math.round((beatFrames * 100) / 48000));
  });
});
