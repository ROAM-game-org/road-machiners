import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cue } from '../data/sounds';
import { loadBank } from './bank';

const SOUNDS = { a: { files: ['a.mp3'] }, b: { files: ['b.mp3'] } } as unknown as Record<string, Cue>;
const ctx = { decodeAudioData: async () => ({}) as AudioBuffer } as unknown as BaseAudioContext;

afterEach(() => vi.unstubAllGlobals());

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

  it('says decode when the bytes do not decode, without a retry', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
    vi.stubGlobal('fetch', fetchFn);
    const bad = { decodeAudioData: async () => Promise.reject(new Error('bad')) } as unknown as BaseAudioContext;
    await expect(loadBank(bad, { a: SOUNDS.a }, undefined)).rejects.toThrow('failed to decode');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
