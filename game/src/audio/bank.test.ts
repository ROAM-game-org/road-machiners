import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cue } from '../data/sounds';
import { CONFIG } from '../config';
import { loadBank } from './bank';

const SOUNDS = { a: { files: ['a.mp3'] }, b: { files: ['b.mp3'] } } as unknown as Record<string, Cue>;
const ctx = { decodeAudioData: async () => ({}) as AudioBuffer } as unknown as BaseAudioContext;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loadBank progress', () => {
  it('reports 0 first, then each decoded file', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
    const calls: [number, number][] = [];
    await loadBank(ctx, SOUNDS, (done, total) => calls.push([done, total]));
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
  });

  it('rejects with the missing file before the count reaches the total', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({ ok: !url.endsWith('b.mp3'), status: 404, arrayBuffer: async () => new ArrayBuffer(1) }));
    const calls: number[] = [];
    await expect(loadBank(ctx, SOUNDS, (done) => calls.push(done))).rejects.toThrow('b.mp3');
    expect(Math.max(...calls)).toBeLessThan(2);
  });

  it('reports a decode rejection as a decode failure without retrying', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
    vi.stubGlobal('fetch', fetchMock);
    const bad = { decodeAudioData: async () => Promise.reject(new Error('bad data')) } as unknown as BaseAudioContext;
    await expect(loadBank(bad, { a: SOUNDS.a })).rejects.toThrow('a.mp3 failed to decode');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a body read that never recovers as a load failure', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => Promise.reject(new TypeError('Load failed')) }));
    const result = loadBank(ctx, { a: SOUNDS.a }).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(CONFIG.assetRetryMs * 10);
    const err = (await result) as Error;
    expect(err.message).toContain('failed to load');
    expect(err.message).not.toContain('decode');
  });

  it('counts a retried file once', async () => {
    vi.useFakeTimers();
    let first = true;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('a.mp3') && first) {
        first = false;
        throw new TypeError('Load failed');
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    });
    const calls: [number, number][] = [];
    const run = loadBank(ctx, SOUNDS, (done, total) => calls.push([done, total]));
    await vi.advanceTimersByTimeAsync(CONFIG.assetRetryMs * 10);
    await run;
    expect(calls).toEqual([[0, 2], [1, 2], [2, 2]]);
  });
});
