import { afterEach, describe, expect, it, vi } from 'vitest';
import { download, DownloadFailed } from './download';

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
    expect(d.waits).toEqual([1000]);
  });

  it('throws DownloadFailed with the last error after every try dropped', async () => {
    const last = new TypeError('Failed to fetch');
    const d = setup(new TypeError('a'), new TypeError('b'), last);
    const err = await download(URL, d).catch((e) => e);
    expect(err).toBeInstanceOf(DownloadFailed);
    expect(err.url).toBe(URL);
    expect(err.cause).toBe(last);
    expect(d.fetch).toHaveBeenCalledTimes(3);
    expect(d.waits).toEqual([1000, 3000]);
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
    const d = setup(status(503), status(503), status(503));
    const err = await download(URL, d).catch((e) => e);
    expect(err).not.toBeInstanceOf(DownloadFailed);
    expect(err.message).toContain('503');
    expect(d.fetch).toHaveBeenCalledTimes(3);
  });

  it('throws the plain HTTP error when the last try got a 503 after drops', async () => {
    const d = setup(new TypeError('x'), new TypeError('y'), status(503));
    const err = await download(URL, d).catch((e) => e);
    expect(err).not.toBeInstanceOf(DownloadFailed);
  });

  it('uses the global fetch looked up at call time', async () => {
    vi.stubGlobal('fetch', async () => ok());
    expect((await download(URL)).byteLength).toBe(3);
  });
});
