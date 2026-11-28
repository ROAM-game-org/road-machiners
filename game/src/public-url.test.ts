import { describe, expect, it } from 'vitest';
import { AssetUnreachable, type AssetNet } from './fetch-asset';
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
        const body = new ReadableStream({ start: (c) => (c.enqueue(pack), c.close()), cancel: () => void cancels.push(url) });
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

function text(bytes: ArrayBuffer): string {
  return new TextDecoder().decode(bytes);
}

const PACK = new TextEncoder().encode('AAABBBBCC');
const PACKS: PublicPacks = {
  base: '/game/',
  slices: {
    'models/a.glb': { pack: 'packs/models.pack?v=1', offset: 0, length: 3 },
    'models/b.glb': { pack: 'packs/models.pack?v=1', offset: 3, length: 4 },
    'models/c.glb': { pack: 'packs/models.pack?v=1', offset: 7, length: 2 },
  },
};

describe('publicBytes', () => {
  it('asks the pack for exactly the bytes of the packed file', async () => {
    const calls: Call[] = [];

    const { bytes } = await publicBytes('Model', 'models/b.glb', undefined, PACKS, hostOf(PACK, () => 'slice', calls));

    expect(new TextDecoder().decode(bytes)).toBe('BBBB');
    expect(calls).toEqual([{ url: '/game/packs/models.pack?v=1', range: 'bytes=3-6' }]);
  });

  it('serves each member from one whole-pack answer', async () => {
    const calls: Call[] = [];
    const net = hostOf(PACK, () => 'whole', calls);

    const [a, b] = await Promise.all([publicBytes('Model', 'models/a.glb', undefined, PACKS, net), publicBytes('Model', 'models/b.glb', undefined, PACKS, net)]);

    expect([text(a.bytes), text(b.bytes)]).toEqual(['AAA', 'BBBB']);
    expect(calls).toHaveLength(1);
  });

  it('reads ranges in parallel once the host honors them', async () => {
    const calls: Call[] = [];
    const net = hostOf(PACK, () => 'slice', calls);

    const all = await Promise.all(Object.keys(PACKS.slices).map((file) => publicBytes('Model', file, undefined, PACKS, net)));

    expect(all.map((one) => text(one.bytes))).toEqual(['AAA', 'BBBB', 'CC']);
    expect(calls.map((call) => call.range).sort()).toEqual(['bytes=0-2', 'bytes=3-6', 'bytes=7-8']);
  });

  it('refuses a whole answer that is not the pack size', async () => {
    const longer = new TextEncoder().encode('AAABBBBCCXX');
    const page = new TextEncoder().encode('<html>');

    await expect(publicBytes('Model', 'models/a.glb', undefined, PACKS, hostOf(longer, () => 'whole', []))).rejects.toThrow(PackRangeRefused);
    await expect(publicBytes('Model', 'models/a.glb', undefined, PACKS, hostOf(page, () => 'whole', []))).rejects.toThrow(/6 bytes instead of the pack's 9/);
  });

  it('refuses another success status', async () => {
    const net: AssetNet = { ...hostOf(PACK, () => 'slice', []), fetch: async () => new Response(null, { status: 203 }) };

    await expect(publicBytes('Model', 'models/a.glb', undefined, PACKS, net)).rejects.toThrow(PackRangeRefused);
  });

  it('probes again after a failed first read', async () => {
    const calls: Call[] = [];
    const good = hostOf(PACK, () => 'slice', calls);
    let failures = 1;
    const net: AssetNet = { ...good, fetch: (url, init) => (failures-- > 0 ? Promise.reject(new TypeError('offline')) : good.fetch(url, init)) };

    const first = publicBytes('Model', 'models/a.glb', undefined, PACKS, net);
    const waiter = publicBytes('Model', 'models/b.glb', undefined, PACKS, net);

    await expect(first).rejects.toThrow(AssetUnreachable);
    expect(text((await waiter).bytes)).toBe('BBBB');
    expect(calls).toHaveLength(1);
    expect(text((await publicBytes('Model', 'models/a.glb', undefined, PACKS, net)).bytes)).toBe('AAA');
  });

  it('fetches the whole pack again after every member was served', async () => {
    const calls: Call[] = [];
    const net = hostOf(PACK, () => 'whole', calls);

    await Promise.all(Object.keys(PACKS.slices).map((file) => publicBytes('Model', file, undefined, PACKS, net)));
    await publicBytes('Model', 'models/a.glb', undefined, PACKS, net);

    expect(calls).toHaveLength(2);
  });

  it('asks the host again on a reload read', async () => {
    const calls: Call[] = [];
    const net = hostOf(PACK, () => 'whole', calls);

    await publicBytes('Sound', 'models/a.glb', undefined, PACKS, net);
    await publicBytes('Sound', 'models/a.glb', { cache: 'reload' }, PACKS, net);

    expect(calls).toHaveLength(2);
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
