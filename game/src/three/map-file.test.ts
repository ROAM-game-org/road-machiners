import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fnv1a } from '../file-hash';
import { fetchMap } from './map-file';

const current = new Uint8Array(readFileSync('public/maps/icarus.bin'));
const stale = current.slice();
stale[stale.length - 1] ^= 1;
const want = fnv1a(current);
const routes = new Uint8Array(readFileSync('public/maps/icarus.routes.bin'));
const files = { hashes: { 'maps/icarus.bin': want, 'maps/icarus.routes.bin': fnv1a(routes) }, base: './', dev: false };

function serve(answer: (url: string, init?: RequestInit) => Uint8Array) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = url.includes('icarus.routes.bin') ? routes : answer(url, init);
    return new Response(body.slice().buffer);
  };
  return { calls, deps: { fetch, wait: async () => {}, delaysMs: [] } };
}

describe('fetchMap', () => {
  it('asks for the versioned url, which a cache holding the old map cannot answer', async () => {
    const { deps, calls } = serve((url) => (url.endsWith(`?v=${want}`) ? current : stale));
    expect((await fetchMap(deps, files)).hash).toBe(want);
    expect(calls.filter((c) => !c.url.includes('routes'))).toHaveLength(1);
  });

  it('refetches a wrong map once with a reload', async () => {
    const { deps, calls } = serve((_url, init) => (init?.cache === 'reload' ? current : stale));
    expect((await fetchMap(deps, files)).hash).toBe(want);
    expect(calls.filter((c) => !c.url.includes('routes'))).toHaveLength(2);
  });

  it('names both hashes when the map is still wrong', async () => {
    const { deps } = serve(() => stale);
    await expect(fetchMap(deps, files)).rejects.toThrow(`arrived as ${fnv1a(stale)}, this build expects ${want}`);
  });

  it('returns the map unchecked in dev', async () => {
    const { deps, calls } = serve(() => stale);
    await expect(fetchMap(deps, { ...files, hashes: {}, dev: true })).rejects.toThrow(`this map is ${fnv1a(stale)}`);
    expect(calls.filter((c) => !c.url.includes('routes'))).toHaveLength(1);
  });
});
