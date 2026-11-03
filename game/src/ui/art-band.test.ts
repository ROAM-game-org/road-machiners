import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const askPicture = vi.fn();
let held: Record<string, string> = {};
vi.mock('./picture-store', () => ({ askPicture, pictureUrl: (path: string) => held[path] ?? null }));

type Fake = { tag: string; style: Record<string, string>; attrs: Map<string, string>; kids: Fake[]; [k: string]: unknown };

function fake(tag: string): Fake {
  const attrs = new Map<string, string>();
  const node: Fake = {
    tag,
    style: {},
    attrs,
    kids: [],
    setAttribute: (n: string, v: string) => attrs.set(n, v),
    removeAttribute: (n: string) => attrs.delete(n),
    append: (...c: Fake[]) => node.kids.push(...c),
    decode: () => Promise.resolve(),
    get src() {
      return attrs.get('src') ?? '';
    },
    set src(v: string) {
      attrs.set('src', v);
    },
  };
  return node;
}

beforeEach(() => {
  held = {};
  askPicture.mockReset();
  askPicture.mockReturnValue(new Promise(() => undefined));
  vi.stubGlobal('document', { createElement: fake });
});
afterEach(() => vi.unstubAllGlobals());

async function bandOf() {
  const { ArtBand } = await import('./art-band');
  const { QUEST_ART } = await import('../data/quest-art');
  const file = (key: string) => `quest-art/${QUEST_ART[key]!.file}`;
  return { band: new ArtBand(), file };
}

const imgOf = (frame: unknown) => (frame as Fake).kids[0]!;

describe('ArtBand', () => {
  it('puts a stored picture on the image before frame returns', async () => {
    const { band, file } = await bandOf();
    held[file('town_granary')] = 'blob:granary';
    expect(imgOf(band.frame('town_granary')).src).toBe('blob:granary');
  });

  it('asks again for nothing after clear or a switch to another picture and back', async () => {
    const { band, file } = await bandOf();
    held[file('town_granary')] = 'blob:granary';
    held[file('bowl_scale')] = 'blob:scale';
    band.frame('town_granary');
    band.clear();
    expect(imgOf(band.frame('town_granary')).src).toBe('blob:granary');
    band.frame('bowl_scale');
    expect(imgOf(band.frame('town_granary')).src).toBe('blob:granary');
    expect(askPicture).not.toHaveBeenCalled();
  });

  it('shows no source while the picture is still on its way', async () => {
    const { band } = await bandOf();
    expect(imgOf(band.frame('town_granary')).src).toBe('');
    expect(askPicture).toHaveBeenCalledTimes(1);
  });
});


