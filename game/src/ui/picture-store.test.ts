import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StoreModule from './picture-store';
import { AssetUnreachable } from '../fetch-asset';

const { fetchAsset } = vi.hoisted(() => ({ fetchAsset: vi.fn() }));
vi.mock('../fetch-asset', async (original) => {
  const actual: object = await original();
  return { ...actual, fetchAsset };
});

let store: typeof StoreModule;

function pending() {
  const calls: Array<{ url: string; arrive: () => void }> = [];
  fetchAsset.mockImplementation(
    (_label: string, url: string) =>
      new Promise<ArrayBuffer>((resolve) => calls.push({ url, arrive: () => resolve(new ArrayBuffer(4)) })),
  );
  return calls;
}

beforeEach(async () => {
  vi.resetModules();
  fetchAsset.mockReset();
  let n = 0;
  vi.stubGlobal('URL', { createObjectURL: () => `blob:${++n}` });
  store = await import('./picture-store');
});
afterEach(() => vi.unstubAllGlobals());

describe('picture store', () => {
  it('fetches a path once for two asks and gives both the same URL', async () => {
    const calls = pending();
    const first = store.askPicture('Quest art', 'quest-art/a.webp');
    const second = store.askPicture('Quest art', 'quest-art/a.webp');
    expect(store.pictureUrl('quest-art/a.webp')).toBeNull();
    calls[0]!.arrive();
    expect(await first).toBe(await second);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(store.pictureUrl('quest-art/a.webp')).toBe(await first);
  });

  it('forgets a failed download, warns once and fetches again on the next ask', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchAsset.mockRejectedValueOnce(new AssetUnreachable('Quest art', 'x', 4, 'gone'));
    expect(await store.askPicture('Quest art', 'quest-art/a.webp')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.pictureUrl('quest-art/a.webp')).toBeNull();
    fetchAsset.mockResolvedValueOnce(new ArrayBuffer(4));
    expect(await store.askPicture('Quest art', 'quest-art/a.webp')).toMatch(/^blob:/);
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('preloads one picture at a time, in list order', async () => {
    const calls = pending();
    const done = store.preloadPictures('Quest art', ['p/1', 'p/2', 'p/3']);
    for (const url of ['p/1', 'p/2', 'p/3']) {
      await vi.waitFor(() => expect(calls).toHaveLength(['p/1', 'p/2', 'p/3'].indexOf(url) + 1));
      expect(calls.at(-1)!.url).toContain(url);
      calls.at(-1)!.arrive();
    }
    await done;
    expect(fetchAsset).toHaveBeenCalledTimes(3);
  });

  it('starts a later picture at once when asked, and the preload does not fetch it again', async () => {
    const calls = pending();
    const done = store.preloadPictures('Quest art', ['p/1', 'p/2']);
    const early = store.askPicture('Quest art', 'p/2');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1]!.arrive();
    await early;
    calls[0]!.arrive();
    await done;
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });
});
