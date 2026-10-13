import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from './config';
import { fetchBytes } from './fetch-bytes';

const bytes = new ArrayBuffer(4);
const ok = { ok: true, status: 200, arrayBuffer: async () => bytes };

async function settle<T>(p: Promise<T>): Promise<T | Error> {
  const result = p.catch((e: Error) => e);
  await vi.advanceTimersByTimeAsync(CONFIG.assetRetryMs * 10);
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
    expect((err as Error).message).toContain(`after ${CONFIG.assetFetchTries} tries`);
    expect((err as Error).message).toContain('Load failed');
    expect(fetchMock).toHaveBeenCalledTimes(CONFIG.assetFetchTries);
  });
});
