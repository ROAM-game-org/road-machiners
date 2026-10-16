import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fnv1a } from '../file-hash';
import { fetchMap } from './map-file';

const current = new Uint8Array(readFileSync('public/maps/icarus.bin'));
const stale = current.slice();
stale[stale.length - 1] ^= 1;
const want = fnv1a(current);
const files = { hashes: { 'maps/icarus.bin': want }, base: './', dev: false };

function serve(answer: (url: string, init?: RequestInit) => Uint8Array) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(answer(url, init).slice().buffer);
  };
  return { calls, deps: { fetch, wait: async () => {} } };
}

describe('fetchMap', () => {
  it('asks for the versioned url, which a cache holding the old map cannot answer', async () => {
    const { deps, calls } = serve((url) => (url.endsWith(`?v=${want}`) ? current : stale));
    expect((await fetchMap(deps, files)).hash).toBe(want);
    expect(calls).toHaveLength(1);
  });

  it('refetches a wrong map once with a reload', async () => {
    const { deps, calls } = serve((_url, init) => (init?.cache === 'reload' ? current : stale));
    expect((await fetchMap(deps, files)).hash).toBe(want);
    expect(calls).toHaveLength(2);
  });

  it('names both hashes when the map is still wrong', async () => {
    const { deps } = serve(() => stale);
    await expect(fetchMap(deps, files)).rejects.toThrow(`arrived as ${fnv1a(stale)}, this build expects ${want}`);
  });

  it('returns the map unchecked in dev', async () => {
    const { deps, calls } = serve(() => stale);
    expect((await fetchMap(deps, { ...files, hashes: {}, dev: true })).hash).toBe(fnv1a(stale));
    expect(calls).toHaveLength(1);
  });
});
