import { afterEach, describe, expect, it, vi } from 'vitest';
import { download, DownloadFailed } from './download';
import { DOWNLOAD } from './config';
import { Stalled } from './stall';

const URL = 'models/truck.glb';

function ok(): Response {
  return new Response(new Uint8Array([1, 2, 3]));
}

function status(code: number): Response {
  return new Response('', { status: code });
}

function setup(...outcomes: (Response | Error)[]) {
  const waits: number[] = [];
  const fetch = vi.fn(async () => {
    const next = outcomes.shift()!;
    if (next instanceof Error) throw next;
    return next;
  });
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  return { fetch, wait, waits };
}

function drops(n: number): Error[] {
  return Array.from({ length: n }, () => new TypeError('Failed to fetch'));
}

afterEach(() => vi.unstubAllGlobals());

describe('download', () => {
  it('returns the body after one call and no wait', async () => {
    const d = setup(ok());
    expect(new Uint8Array(await download(URL, d))).toEqual(new Uint8Array([1, 2, 3]));
    expect(d.fetch).toHaveBeenCalledTimes(1);
    expect(d.waits).toEqual([]);
  });

  it('tries again after a dropped request', async () => {
    const d = setup(new TypeError('Failed to fetch'), ok());
    expect((await download(URL, d)).byteLength).toBe(3);
    expect(d.fetch).toHaveBeenCalledTimes(2);
    expect(d.waits).toEqual([500]);
  });

  it('tries again after a body read that drops', async () => {
    const broken = new Response(new ReadableStream({ pull: (c) => c.error(new TypeError('Load failed')) }));
    const d = setup(broken, ok());
    expect((await download(URL, d)).byteLength).toBe(3);
    expect(d.waits).toEqual([500]);
  });

  it('throws DownloadFailed with the last error after every try dropped', async () => {
    const last = new TypeError('Failed to fetch');
    const d = setup(...drops(5), last);
    const err = await download(URL, d).catch((e) => e);
    expect(err).toBeInstanceOf(DownloadFailed);
    expect(err.url).toBe(URL);
    expect(err.cause).toBe(last);
    expect(d.fetch).toHaveBeenCalledTimes(6);
    expect(d.waits).toEqual([500, 1000, 2000, 4000, 4000]);
  });

  it('throws at once on a 404 with a plain error naming the url and status', async () => {
    const d = setup(status(404));
    const err = await download(URL, d).catch((e) => e);
    expect(err).not.toBeInstanceOf(DownloadFailed);
    expect(err.message).toContain(URL);
    expect(err.message).toContain('404');
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it('tries again after a 503', async () => {
    const d = setup(status(503), ok());
    expect((await download(URL, d)).byteLength).toBe(3);
  });

  it('throws the plain HTTP error when every try got a 503', async () => {
    const d = setup(...Array.from({ length: 6 }, () => status(503)));
    const err = await download(URL, d).catch((e) => e);
    expect(err).not.toBeInstanceOf(DownloadFailed);
    expect(err.message).toContain('503');
    expect(d.fetch).toHaveBeenCalledTimes(6);
  });

  it('throws the plain HTTP error when the last try got a 503 after drops', async () => {
    const d = setup(...drops(5), status(503));
    const err = await download(URL, d).catch((e) => e);
    expect(err).not.toBeInstanceOf(DownloadFailed);
  });

  it('uses the global fetch looked up at call time', async () => {
    vi.stubGlobal('fetch', async () => ok());
    expect((await download(URL)).byteLength).toBe(3);
  });

  describe('when the connection goes silent', () => {
    const stall = DOWNLOAD.stallMs;

    function hangingFetch() {
      const signals: AbortSignal[] = [];
      const fetch = vi.fn((_url: string, init?: RequestInit) => {
        signals.push(init!.signal!);
        return new Promise<Response>(() => {});
      });
      return { fetch, signals };
    }

    function streamOf(chunks: number[], gap: number): Response {
      let sent = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (sent === chunks.length) return controller.close();
            await new Promise((resolve) => setTimeout(resolve, gap));
            controller.enqueue(new Uint8Array([chunks[sent++]]));
          },
        }),
      );
    }

    function stuckAfterOneChunk(): Response {
      return new Response(new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new Uint8Array([1])), pull: () => new Promise(() => {}) }));
    }

    afterEach(() => vi.useRealTimers());

    it('aborts and retries a fetch that never answers, then throws DownloadFailed caused by Stalled', async () => {
      vi.useFakeTimers();
      const h = hangingFetch();
      const waits: number[] = [];
      const result = download(URL, { fetch: h.fetch, wait: async (ms) => void waits.push(ms) }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(stall * DOWNLOAD.tries);
      const err = await result;
      expect(err).toBeInstanceOf(DownloadFailed);
      expect(err.cause).toBeInstanceOf(Stalled);
      expect(err.message).toContain('no answer for 20 s');
      expect(h.fetch).toHaveBeenCalledTimes(DOWNLOAD.tries);
      expect(h.signals.every((signal) => signal.aborted)).toBe(true);
      expect(waits).toEqual(DOWNLOAD.waitMs);
    });

    it('retries a body that sends one chunk and stops', async () => {
      vi.useFakeTimers();
      const fetch = vi.fn(async () => stuckAfterOneChunk());
      const result = download(URL, { fetch, wait: async () => {} }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(stall * DOWNLOAD.tries);
      expect((await result).cause).toBeInstanceOf(Stalled);
      expect(fetch).toHaveBeenCalledTimes(DOWNLOAD.tries);
    });

    it('completes a slow download that keeps sending chunks', async () => {
      vi.useFakeTimers();
      const fetch = vi.fn(async () => streamOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], stall - 1));
      const result = download(URL, { fetch, wait: async () => {} });
      await vi.advanceTimersByTimeAsync((stall - 1) * 11);
      expect(new Uint8Array(await result)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('returns the bytes of try two after a stall on try one', async () => {
      vi.useFakeTimers();
      const fetch = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockImplementationOnce(async () => ok());
      const result = download(URL, { fetch, wait: async () => {} });
      await vi.advanceTimersByTimeAsync(stall);
      expect((await result).byteLength).toBe(3);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
