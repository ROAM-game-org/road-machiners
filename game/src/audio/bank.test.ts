import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK, beatLoopSeconds, type Cue } from '../data/sounds';
import { loadBank, recoverBank, reportFailures, type BankOptions } from './bank';

const SOUNDS = { a: { files: ['a.mp3'] }, b: { files: ['b.mp3'] } } as unknown as Record<string, Cue>;
const PAIR = { hit: { files: ['hit-1.ogg', 'hit-2.ogg'] } } as unknown as Record<string, Cue>;
const BEAT = { score: { files: ['score-1.ogg'], beat: { bpm: 120, bars: 2 } } } as unknown as Record<string, Cue>;
const SIZE = 8;
const NAMES = ['a.mp3', 'b.mp3', 'hit-1.ogg', 'hit-2.ogg', 'score-1.ogg', ...Array.from({ length: 20 }, (_, i) => `f${i}.ogg`)];
const expectedBytes = Object.fromEntries(NAMES.map((n) => [n, SIZE]));
const options = (extra: Partial<BankOptions> = {}): BankOptions => ({ expectedBytes, opusSupport: 'probably', ...extra });

function body(length: number, magic = 'OggS'): ArrayBuffer {
  const bytes = new Uint8Array(length);
  bytes.set([...magic].map((c) => c.charCodeAt(0)));
  return bytes.buffer;
}
function reply(over: Record<string, unknown> = {}, data: ArrayBuffer = body(SIZE)) {
  return { ok: true, status: 200, redirected: false, headers: { get: () => 'audio/ogg' }, arrayBuffer: async () => data, ...over };
}
const ok = reply();
const real = { length: 100, numberOfChannels: 1 } as unknown as AudioBuffer;
const silent = { sampleRate: 100, state: 'suspended', createBuffer: (_c: number, length: number) => ({ length, duration: length / 100 }) };

function ctxOf(decode: (data: ArrayBuffer) => Promise<AudioBuffer>) {
  return { ...silent, decodeAudioData: decode } as unknown as BaseAudioContext;
}
const ctx = ctxOf(async () => real);
const rejecting = ctxOf(async () => { throw new Error('bad'); });

afterEach(() => vi.unstubAllGlobals());

describe('loadBank', () => {
  it('reports 0 first, then each decoded file', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const calls: [number, number][] = [];
    const { failures } = await loadBank(ctx, SOUNDS, options({ progress: (done, total) => calls.push([done, total]) }));
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(failures).toEqual([]);
  });

  it('fetches a file that decodes once', async () => {
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    await loadBank(ctx, SOUNDS, options());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives a failed file the buffer of a decoded sibling', async () => {
    vi.stubGlobal('fetch', async (url: string) => reply({ ok: !url.endsWith('hit-2.ogg'), status: 404 }));
    const calls: number[] = [];
    const { bank, failures } = await loadBank(ctx, PAIR, options({ progress: (done) => calls.push(done) }));
    expect(bank.get('hit-2.ogg')).toBe(real);
    expect(failures.map((f) => f.file)).toEqual(['hit-2.ogg']);
    expect(Math.max(...calls)).toBe(2);
  });

  it('retries a file that fails once', async () => {
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    let calls = 0;
    const flaky = ctxOf(async () => {
      if (++calls === 1) throw new Error('once');
      return real;
    });
    const { failures } = await loadBank(flaky, { a: SOUNDS.a }, options());
    expect(failures).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('tries a failing file BANK.tries times, and only the later tries skip the cache', async () => {
    const fetch = vi.fn(async (..._args: unknown[]) => ok);
    vi.stubGlobal('fetch', fetch);
    await loadBank(rejecting, { a: SOUNDS.a }, options());
    expect(fetch).toHaveBeenCalledTimes(BANK.tries);
    expect(fetch.mock.calls[0]).toHaveLength(1);
    for (const call of fetch.mock.calls.slice(1)) expect(call[1]).toEqual({ cache: 'reload' });
  });

  it('gives a cue with no decoded file a silent buffer', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const { bank } = await loadBank(rejecting, { a: SOUNDS.a }, options());
    expect(bank.get('a.mp3')!.duration).toBeCloseTo(BANK.silentSeconds, 1);
  });

  it('gives a beat cue a silent buffer one loop long', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const { bank } = await loadBank(rejecting, BEAT, options());
    expect(bank.get('score-1.ogg')!.duration).toBeCloseTo(beatLoopSeconds({ bpm: 120, bars: 2 }), 1);
  });

  it('treats a 404 like a decode failure', async () => {
    vi.stubGlobal('fetch', async () => reply({ ok: false, status: 404 }));
    const { bank, failures } = await loadBank(ctx, SOUNDS, options());
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
      return real;
    });
    await loadBank(counting, many, options());
    expect(peak).toBe(BANK.decodeAtOnce);
  });

  it('throws on a file with no expected size', async () => {
    vi.stubGlobal('fetch', async () => ok);
    await expect(loadBank(ctx, SOUNDS, options({ expectedBytes: {} }))).rejects.toThrow('no expected size');
  });
});

describe('failure classes', () => {
  const kindOf = async (fetchStub: unknown, context = rejecting, opusSupport = 'probably') => {
    vi.stubGlobal('fetch', fetchStub);
    const { failures } = await loadBank(context, { a: SOUNDS.a }, options({ opusSupport }));
    return failures[0];
  };

  it('calls a rejected fetch, a 404 and a rejected body read fetch', async () => {
    expect((await kindOf(async () => { throw new TypeError('offline'); })).kind).toBe('fetch');
    expect((await kindOf(async () => reply({ ok: false, status: 404 }))).kind).toBe('fetch');
    expect((await kindOf(async () => reply({ arrayBuffer: async () => { throw new Error('cut'); } }))).kind).toBe('fetch');
  });

  it('calls a short body and a body that is not Ogg bytes', async () => {
    expect((await kindOf(async () => reply({}, body(4)))).kind).toBe('bytes');
    expect((await kindOf(async () => reply({}, body(SIZE, '<htm')))).kind).toBe('bytes');
  });

  it('does not decode a body it already knows is wrong', async () => {
    const decode = vi.fn(async () => real);
    await kindOf(async () => reply({}, body(4)), ctxOf(decode));
    expect(decode).not.toHaveBeenCalled();
  });

  it('calls a rejected decode of intact bytes decoder, or codec with no Opus support', async () => {
    expect((await kindOf(async () => ok)).kind).toBe('decoder');
    expect((await kindOf(async () => ok, rejecting, '')).kind).toBe('codec');
  });

  it('keeps the response facts and the browser state', async () => {
    const failure = await kindOf(async () => reply({ status: 200, redirected: true }, body(4)));
    expect(failure.evidence).toMatchObject({
      status: 200,
      contentType: 'audio/ogg',
      redirected: true,
      receivedBytes: 4,
      expectedBytes: SIZE,
      ogg: true,
      contextState: 'suspended',
    });
  });

  it('counts the megabytes decoded so far', async () => {
    const big = { length: 1_000_000, numberOfChannels: 1 } as unknown as AudioBuffer;
    let calls = 0;
    const mixed = ctxOf(async () => {
      if (++calls <= 4) return big;
      throw new Error('late');
    });
    vi.stubGlobal('fetch', async () => ok);
    const many = { m: { files: Array.from({ length: 6 }, (_, i) => `f${i}.ogg`) } } as unknown as Record<string, Cue>;
    const { failures } = await loadBank(mixed, many, options());
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].evidence.decodedMegabytes).toBeGreaterThanOrEqual(4);
  });
});

describe('recoverBank', () => {
  const flaw = (file: string) => (url: string) => url.endsWith(file);

  it('decodes bytes and decoder failures once more, past the cache, and replaces the stand-ins', async () => {
    const fresh = { length: 50, numberOfChannels: 1 } as unknown as AudioBuffer;
    let served = 0;
    const fetch = vi.fn(async (_url: string, _init?: unknown) => (served++ < 2 ? reply({}, body(4)) : ok));
    vi.stubGlobal('fetch', fetch);
    let healed = false;
    const context = ctxOf(async () => (healed ? fresh : real));
    const loaded = await loadBank(context, { hit: { files: ['hit-1.ogg'] } } as unknown as Record<string, Cue>, options());
    expect(loaded.failures[0].kind).toBe('bytes');
    healed = true;
    const recovered = await recoverBank(context, loaded, options());
    expect([...recovered]).toEqual(['hit-1.ogg']);
    expect(loaded.bank.get('hit-1.ogg')).toBe(fresh);
    expect(fetch.mock.calls.at(-1)![1]).toEqual({ cache: 'reload' });
  });

  it('leaves fetch and codec failures alone', async () => {
    vi.stubGlobal('fetch', async (url: string) => (flaw('hit-2.ogg')(url) ? reply({ ok: false, status: 503 }) : ok));
    const loaded = await loadBank(rejecting, PAIR, options({ opusSupport: '' }));
    const fetch = vi.fn(async () => ok);
    vi.stubGlobal('fetch', fetch);
    expect(loaded.failures.map((f) => f.kind).sort()).toEqual(['codec', 'fetch']);
    expect([...(await recoverBank(ctx, loaded, options()))]).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the stand-in when the decode fails again, and decodes one file at a time', async () => {
    vi.stubGlobal('fetch', async () => ok);
    const many = { m: { files: ['f0.ogg', 'f1.ogg', 'f2.ogg'] } } as unknown as Record<string, Cue>;
    const loaded = await loadBank(rejecting, many, options());
    let running = 0;
    let peak = 0;
    const slow = ctxOf(async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      throw new Error('still bad');
    });
    const before = [...loaded.bank.values()];
    expect([...(await recoverBank(slow, loaded, options()))]).toEqual([]);
    expect(peak).toBe(1);
    expect([...loaded.bank.values()]).toEqual(before);
  });
});

describe('reportFailures', () => {
  it('sends one report per class with the evidence, the counts and the browser text', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.endsWith('hit-2.ogg') ? reply({ ok: false, status: 503 }) : ok));
    const named = ctxOf(async () => { throw Object.assign(new Error('The buffer is bad'), { name: 'EncodingError' }); });
    const loaded = await loadBank(named, PAIR, options());
    const reports = reportFailures(loaded.failures, 104, new Set(['hit-1.ogg']));
    expect(reports.map((r) => r.message)).toEqual([
      'Sound decode failed (decoder): 1 of 104, got 8 of 8 bytes, Ogg yes, HTTP 200 audio/ogg, context suspended, page visible, 0 MB decoded, device memory unknown, recovered later 1: EncodingError: The buffer is bad',
      'Sound decode failed (fetch): 1 of 104, got no of 8 bytes, Ogg no, HTTP 503 audio/ogg, context suspended, page visible, 0 MB decoded, device memory unknown, recovered later 0: Error: Sound hit-2.ogg failed to load: HTTP 503',
    ]);
    expect(reports[0].files).toEqual(['hit-1.ogg']);
  });

  it('sends nothing when nothing failed', () => {
    expect(reportFailures([], 104, new Set())).toEqual([]);
  });
});
