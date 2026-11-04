import { describe, expect, it, vi } from 'vitest';
import { ASSET_RETRY_DELAYS_MS, AssetStatusError, AssetUnreachable, BuildGone, fetchAsset, type AssetNet } from './fetch-asset';

function bytes(n: number): ArrayBuffer {
  return new Uint8Array([n]).buffer;
}

function net(answers: Array<() => Promise<Response>>, page: string | null = null): { net: AssetNet; waits: number[]; fetch: ReturnType<typeof vi.fn> } {
  const waits: number[] = [];
  const queue = [...answers];
  const fetch = vi.fn(() => {
    const next = queue.shift() ?? queue[0];
    return next();
  });
  return { net: { fetch, wait: async (ms) => void waits.push(ms), delaysMs: ASSET_RETRY_DELAYS_MS, page: () => page }, waits, fetch };
}

const ok = () => Promise.resolve(new Response(bytes(7)));
const dropped = () => Promise.reject(new TypeError('Failed to fetch'));
const status = (code: number) => () => Promise.resolve(new Response('', { status: code, statusText: 'No' }));

describe('fetchAsset', () => {
  it('retries a dropped request and returns the bytes', async () => {
    const run = net([dropped, ok]);
    const body = await fetchAsset('Map', 'map.bin', run.net);
    expect(new Uint8Array(body)[0]).toBe(7);
    expect(run.waits).toEqual([1000]);
  });

  it('gives up with AssetUnreachable after every delay', async () => {
    const run = net([dropped]);
    const err = await fetchAsset('Map', 'map.bin', run.net).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AssetUnreachable);
    expect((err as AssetUnreachable).attempts).toBe(4);
    expect((err as AssetUnreachable).label).toBe('Map');
    expect(run.waits).toEqual([1000, 3000, 9000]);
  });

  it('retries a transient status', async () => {
    const run = net([status(503), ok]);
    await expect(fetchAsset('Map', 'map.bin', run.net)).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it.each([520, 521, 522, 523, 524, 525, 526, 530])('retries CDN status %i', async (code) => {
    const run = net([status(code), ok]);
    await expect(fetchAsset('Model', 'a.glb', run.net)).resolves.toBeInstanceOf(ArrayBuffer);
    expect(run.waits).toEqual([1000]);
  });

  it('gives up on a status that never clears', async () => {
    const run = net([status(520)]);
    const err = await fetchAsset('Model', 'a.glb', run.net).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AssetUnreachable);
    expect((err as AssetUnreachable).attempts).toBe(4);
    expect(run.waits).toEqual([1000, 3000, 9000]);
  });

  it('fails at once on a forbidden file', async () => {
    const run = net([status(403), ok]);
    const err = await fetchAsset('Map', 'map.bin', run.net).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(AssetUnreachable);
    expect(run.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails at once on a missing file', async () => {
    const run = net([status(404), ok]);
    const err = await fetchAsset('Map', 'map.bin', run.net).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(AssetUnreachable);
    expect((err as Error).message).toContain('HTTP 404');
    expect(run.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a body that fails partway', async () => {
    const broken = () => {
      const res = new Response(bytes(1));
      vi.spyOn(res, 'arrayBuffer').mockRejectedValue(new TypeError('network error'));
      return Promise.resolve(res);
    };
    const run = net([broken, ok]);
    await expect(fetchAsset('Map', 'map.bin', run.net)).resolves.toBeInstanceOf(ArrayBuffer);
  });

  describe('after a permanent status', () => {
    const served = (url: string, pageStatus: () => Promise<Response>) => (url === 'https://game/index.html' ? pageStatus() : status(403)());

    function hosted(pageAnswer: () => Promise<Response>) {
      const fetch = vi.fn((url: string) => served(url, pageAnswer));
      const hostNet: AssetNet = { fetch, wait: async () => {}, delaysMs: ASSET_RETRY_DELAYS_MS, page: () => 'https://game/index.html' };
      return { net: hostNet, fetch };
    }

    it('throws BuildGone, an unreachable file, when the page is gone too', async () => {
      const run = hosted(status(403));
      const err = await fetchAsset('Song', 'song.ogg', run.net).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BuildGone);
      expect(err).toBeInstanceOf(AssetUnreachable);
      expect(run.fetch).toHaveBeenCalledTimes(2);
    });

    it('keeps AssetStatusError when the page is served', async () => {
      const err = await fetchAsset('Song', 'song.ogg', hosted(ok).net).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AssetStatusError);
      expect(err).not.toBeInstanceOf(AssetUnreachable);
    });

    it('keeps AssetStatusError when the page probe is dropped', async () => {
      const err = await fetchAsset('Song', 'song.ogg', hosted(dropped).net).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AssetStatusError);
    });

    it('probes the page once for a build known gone', async () => {
      const run = hosted(status(404));
      await fetchAsset('Song', 'a.ogg', run.net).catch(() => {});
      await fetchAsset('Song', 'b.ogg', run.net).catch(() => {});
      expect(run.fetch.mock.calls.filter(([url]) => url === 'https://game/index.html')).toHaveLength(1);
    });
  });
});
