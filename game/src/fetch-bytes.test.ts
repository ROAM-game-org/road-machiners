import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from './config';
import { DownloadFailed, fetchBytes } from './fetch-bytes';

const bytes = new ArrayBuffer(4);
const ok = { ok: true, status: 200, arrayBuffer: async () => bytes };

async function settle<T>(p: Promise<T>): Promise<T | Error> {
  const result = p.catch((e: Error) => e);
  await vi.advanceTimersByTimeAsync(60_000);
  return result;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchBytes', () => {
  it('retries a rejected fetch', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Load failed')).mockResolvedValue(ok);
    vi.stubGlobal('fetch', fetchMock);
    expect(await settle(fetchBytes('/a'))).toBe(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a rejected body read', async () => {
    const broken = { ok: true, status: 200, arrayBuffer: async () => Promise.reject(new TypeError('Load failed')) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(broken).mockResolvedValue(ok));
    expect(await settle(fetchBytes('/a'))).toBe(bytes);
  });

  it('retries a 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue(ok));
    expect(await settle(fetchBytes('/a'))).toBe(bytes);
  });

  it('fails a 404 at once, naming the url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const err = await settle(fetchBytes('/a'));
    expect((err as Error).message).toContain('/a');
    expect((err as Error).message).toContain('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured tries with the last error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    vi.stubGlobal('fetch', fetchMock);
    const err = await settle(fetchBytes('/a'));
    expect((err as Error).message).toContain('/a');
    expect(err).toBeInstanceOf(DownloadFailed);
    expect((err as Error).message).toContain(`after ${CONFIG.assetFetchTries} tries`);
    expect((err as Error).message).toContain('Load failed');
    expect(fetchMock).toHaveBeenCalledTimes(CONFIG.assetFetchTries);
  });

  it('fails as DownloadFailed when every try was a network error', async () => {
    const cause = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
    const err = await settle(fetchBytes('/a'));
    expect(err).toBeInstanceOf(DownloadFailed);
    const failed = err as DownloadFailed;
    expect(failed.url).toBe('/a');
    expect(failed.tries).toBe(CONFIG.assetFetchTries);
    expect(failed.cause).toBe(cause);
  });

  it('does not hide an earlier 5xx behind DownloadFailed', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('x')).mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const err = await settle(fetchBytes('/a'));
    expect(err).not.toBeInstanceOf(DownloadFailed);
    expect((err as Error).message).toContain('/a');
  });

  it('doubles the wait between tries up to the cap', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('x'));
    vi.stubGlobal('fetch', fetchMock);
    const result = fetchBytes('/a').catch((e: Error) => e);
    const waits = [500, 1000, 2000, 4000, 4000];
    for (const [i, wait] of waits.entries()) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(fetchMock).toHaveBeenCalledTimes(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(i + 2);
    }
    expect(await result).toBeInstanceOf(DownloadFailed);
  });

  it('does not call a 503 on every try a DownloadFailed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const err = await settle(fetchBytes('/a'));
    expect(err).not.toBeInstanceOf(DownloadFailed);
    expect((err as Error).message).toContain('HTTP 503');
  });

  it('does not call a 404 a DownloadFailed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await settle(fetchBytes('/a'))).not.toBeInstanceOf(DownloadFailed);
  });
});
