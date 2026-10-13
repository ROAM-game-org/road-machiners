import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from './config';
import { download, DownloadFailed } from './download';

const ok = (bytes = 3) => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(bytes) });
const status = (code: number) => ({ ok: false, status: code, arrayBuffer: async () => new ArrayBuffer(0) });

function stubFetch(...replies: (object | Error)[]) {
  const fn = vi.fn(async () => {
    const reply = replies[Math.min(fn.mock.calls.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('download', () => {
  it('retries a rejected fetch after one wait', async () => {
    const fetchFn = stubFetch(new TypeError('Failed to fetch'), ok());
    const waits: number[] = [];
    const bytes = await download('/a', 'Thing', async (ms) => void waits.push(ms));
    expect(bytes.byteLength).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([CONFIG.download.waitsMs[0]]);
  });

  it('retries a body read that rejects', async () => {
    stubFetch({ ok: true, status: 200, arrayBuffer: async () => Promise.reject(new TypeError('dropped')) }, ok());
    await expect(download('/a', 'Thing', async () => {})).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it('retries a 503', async () => {
    const fetchFn = stubFetch(status(503), ok());
    await download('/a', 'Thing', async () => {});
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws a plain error on the first 404', async () => {
    const fetchFn = stubFetch(status(404));
    const err = await download('/a', 'Thing', async () => {}).catch((e) => e);
    expect(err).not.toBeInstanceOf(DownloadFailed);
    expect(err.message).toBe('Thing /a failed to load: HTTP 404');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up with DownloadFailed after the configured tries', async () => {
    const fetchFn = stubFetch(new TypeError('Failed to fetch'));
    const waits: number[] = [];
    const err = await download('/a', 'Thing', async (ms) => void waits.push(ms)).catch((e) => e);
    expect(err).toBeInstanceOf(DownloadFailed);
    expect(err.message).toContain('Thing');
    expect(err.message).toContain('Failed to fetch');
    expect(fetchFn).toHaveBeenCalledTimes(CONFIG.download.tries);
    expect(waits).toEqual(CONFIG.download.waitsMs);
  });
});
