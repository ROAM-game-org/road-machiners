import { describe, expect, it } from 'vitest';
import type { AssetNet } from './fetch-asset';
import { PackRangeRefused, publicBytes, publicUrl, type PublicPacks } from './public-url';

const built = { hashes: { 'maps/icarus.bin': 'abcd1234' }, base: './', dev: false };

describe('publicUrl', () => {
  it('appends the content hash in a build', () => {
    expect(publicUrl('maps/icarus.bin', built)).toBe('./maps/icarus.bin?v=abcd1234');
  });

  it('gives the plain url in dev for a file with no hash', () => {
    expect(publicUrl('maps/icarus.bin', { ...built, hashes: {}, dev: true })).toBe('./maps/icarus.bin');
  });

  it('throws in a build for a file missing from the table', () => {
    expect(() => publicUrl('models/none.glb', built)).toThrow('Public file models/none.glb is not in this build');
  });
});

type Call = { url: string; range: string | null };

function hostOf(pack: Uint8Array, answer: (range: string | null) => 'slice' | 'whole', calls: Call[], cancels: string[] = []): AssetNet {
  return {
    fetch: async (url, init) => {
      const range = new Headers(init?.headers).get('Range');
      calls.push({ url, range });
      if (answer(range) === 'whole') {
        const body = new ReadableStream({ start: (c) => c.enqueue(pack), cancel: () => void cancels.push(url) });
        return new Response(body, { status: 200 });
      }
      const [from, to] = range!.replace('bytes=', '').split('-').map(Number);
      return new Response(pack.slice(from, to + 1), { status: 206 });
    },
    wait: async () => {},
    delaysMs: [],
    page: () => null,
  };
}

const PACK = new TextEncoder().encode('AAABBBBCC');
const PACKS: PublicPacks = {
  base: '/game/',
  slices: {
    'models/a.glb': { pack: 'packs/models.pack?v=1', offset: 0, length: 3 },
    'models/b.glb': { pack: 'packs/models.pack?v=1', offset: 3, length: 4 },
  },
};

describe('publicBytes', () => {
  it('asks the pack for exactly the bytes of the packed file', async () => {
    const calls: Call[] = [];

    const { bytes } = await publicBytes('Model', 'models/b.glb', undefined, PACKS, hostOf(PACK, () => 'slice', calls));

    expect(new TextDecoder().decode(bytes)).toBe('BBBB');
    expect(calls).toEqual([{ url: '/game/packs/models.pack?v=1', range: 'bytes=3-6' }]);
  });

  it('refuses a whole-pack answer at once, without reading or retrying it', async () => {
    const calls: Call[] = [];
    const cancels: string[] = [];

    const read = publicBytes('Model', 'models/a.glb', undefined, PACKS, { ...hostOf(PACK, () => 'whole', calls, cancels), delaysMs: [0, 0, 0] });

    await expect(read).rejects.toThrow(PackRangeRefused);
    expect(cancels).toEqual(['/game/packs/models.pack?v=1']);
    expect(calls).toHaveLength(1);
  });

  it('refuses a slice of the wrong length', async () => {
    const short = PACKS.slices['models/b.glb'];
    const packs: PublicPacks = { ...PACKS, slices: { 'models/b.glb': { ...short, length: 40 } } };

    const read = publicBytes('Model', 'models/b.glb', undefined, packs, hostOf(PACK, () => 'slice', []));

    await expect(read).rejects.toThrow(PackRangeRefused);
  });

  it('keeps the caller request options next to the range', async () => {
    const seen: RequestInit[] = [];
    const net = hostOf(PACK, () => 'slice', []);
    const watching: AssetNet = { ...net, fetch: (url, init) => (seen.push(init ?? {}), net.fetch(url, init)) };

    await publicBytes('Sound', 'models/a.glb', { cache: 'reload' }, PACKS, watching);

    expect(seen[0].cache).toBe('reload');
  });

  it('fetches a file outside the packs by its own address', async () => {
    const calls: Call[] = [];
    const net = hostOf(PACK, () => 'slice', calls);
    const loose: AssetNet = { ...net, fetch: async (url, init) => (calls.push({ url, range: new Headers(init?.headers).get('Range') }), new Response('X')) };

    const { bytes } = await publicBytes('Picture', 'survey/a.webp', undefined, PACKS, loose);

    expect(new TextDecoder().decode(bytes)).toBe('X');
    expect(calls).toEqual([{ url: '/survey/a.webp', range: null }]);
  });
});
