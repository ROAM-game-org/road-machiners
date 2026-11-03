import { describe, expect, it, vi } from 'vitest';
import { ASSET_RETRY_DELAYS_MS, AssetUnreachable, fetchAsset, type AssetNet } from './fetch-asset';

function bytes(n: number): ArrayBuffer {
  return new Uint8Array([n]).buffer;
}

function net(answers: Array<() => Promise<Response>>): { net: AssetNet; waits: number[]; fetch: ReturnType<typeof vi.fn> } {
  const waits: number[] = [];
  const queue = [...answers];
  const fetch = vi.fn(() => {
    const next = queue.shift() ?? queue[0];
    return next();
  });
  return { net: { fetch, wait: async (ms) => void waits.push(ms), delaysMs: ASSET_RETRY_DELAYS_MS }, waits, fetch };
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
});
