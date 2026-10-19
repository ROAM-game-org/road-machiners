import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestLive } from '../sim/types';
import { lastTagged, pagesOf, paragraphsOf } from './quest-lines';
import { askOf, loadArt, questFrameFits, questPageStacks } from './quest-screen';
import { QUEST_ART } from '../data/quest-art';

vi.mock('../fetch-asset', async (orig) => ({ ...(await orig<typeof import('../fetch-asset')>()), fetchAsset: async () => new ArrayBuffer(1) }));

const live = (quest: string, text: string): QuestLive => ({ quest, lang: 'en', ink: '{}', lines: [{ text, tags: [] }], choices: ['Goodbye.'], costs: [null], checks: [null] });
const line = (text: string, ...tags: string[]) => ({ text, tags });

describe('pagesOf', () => {
  it('starts a new page at each page line after the first', () => {
    const lines = [line('Outcome.'), line('More.'), line('Desk.', 'page', 'place: Office'), line('Hub.')];
    expect(pagesOf(lines)).toEqual([lines.slice(0, 2), lines.slice(2)]);
  });

  it('keeps one page when the page line comes first, as after a load', () => {
    const lines = [line('Desk.', 'page'), line('Hub.')];
    expect(pagesOf(lines)).toEqual([lines]);
  });
});

describe('paragraphsOf', () => {
  it('gives each line its own paragraph and keeps a table together', () => {
    const lines = [line('Board.'), line('Item;Price', 'head'), line('Fuel;5 M', 'row'), line('Done.')];
    expect(paragraphsOf(lines)).toEqual([[lines[0]], lines.slice(1, 3), [lines[3]]]);
  });
});

describe('lastTagged', () => {
  it('finds the latest place on view, or none', () => {
    expect(lastTagged([line('A', 'place: Gate'), line('B'), line('C', 'place: Barracks')], 'place')).toBe('Barracks');
    expect(lastTagged([line('A')], 'img')).toBeNull();
  });
});

describe('askOf', () => {
  it('shows the pick above the reply it led to in the same quest', () => {
    const hattie = live('bowl_hattie', 'Hello.');
    expect(askOf(hattie, live('bowl_hattie', 'Rumors.'), 'Heard any rumors?')).toBe('Heard any rumors?');
  });

  it('shows no pick at the start of a talk, in a new quest or after a load', () => {
    const hattie = live('bowl_hattie', 'Hello.');
    expect(askOf(null, hattie, null)).toBeNull();
    expect(askOf(hattie, live('bowl_ruben', 'Sit.'), 'Hi')).toBeNull();
    expect(askOf(hattie, live('bowl_hattie', 'Back.'), null)).toBeNull();
  });
});

describe('questPageStacks', () => {
  const FRAME = 3;

  it('keeps three columns while the picture column holds its minimum', () => {
    expect(questPageStacks(1280, FRAME)).toBe(false);
    expect(questPageStacks(1197, FRAME)).toBe(false);
  });

  it('stacks the page below that width', () => {
    expect(questPageStacks(1196, FRAME)).toBe(true);
    expect(questPageStacks(1000, FRAME)).toBe(true);
  });

  it('answers stack for a zero width, which the screen ignores to keep its last layout', () => {
    expect(questPageStacks(0, FRAME)).toBe(true);
  });
});

describe('questFrameFits', () => {
  it('keeps a column frame between 3:4 and wider', () => {
    expect(questFrameFits(300, 400, false)).toBe(true);
    expect(questFrameFits(300, 300, false)).toBe(true);
    expect(questFrameFits(300, 84, false)).toBe(true);
  });

  it('rejects a column frame taller than 4/3 of its width, with half a pixel of slack', () => {
    expect(questFrameFits(300, 400.5, false)).toBe(true);
    expect(questFrameFits(300, 401, false)).toBe(false);
    expect(questFrameFits(84, 300, false)).toBe(false);
  });

  it('keeps a band frame no wider than 3 times its height', () => {
    expect(questFrameFits(300, 100, true)).toBe(true);
    expect(questFrameFits(200, 100, true)).toBe(true);
    expect(questFrameFits(300.5, 100, true)).toBe(true);
    expect(questFrameFits(900, 100, true)).toBe(false);
  });

  it('counts a hidden page, which has no frame size, as fitting', () => {
    expect(questFrameFits(0, 0, false)).toBe(true);
    expect(questFrameFits(0, 0, true)).toBe(true);
  });
});

describe('loadArt', () => {
  const key = Object.keys(QUEST_ART)[0]!;
  const fakeImage = (decode: () => Promise<void>) => {
    const attrs = new Map<string, string>();
    return {
      style: {} as Record<string, string>,
      onerror: null as null | (() => void),
      decode,
      setAttribute: (n: string, v: string) => attrs.set(n, v),
      hasAttribute: (n: string) => attrs.has(n),
      removeAttribute: (n: string) => attrs.delete(n),
      set src(v: string) {
        attrs.set('src', v);
      },
      get src() {
        return attrs.get('src') ?? '';
      },
    };
  };
  let img: ReturnType<typeof fakeImage>;

  beforeEach(() => {
    vi.useFakeTimers();
    img = fakeImage(() => Promise.resolve());
    vi.stubGlobal('document', { createElement: () => img });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:art', revokeObjectURL: () => undefined });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('leaves the picture blank without throwing when it fails to show', async () => {
    loadArt(key);
    await vi.advanceTimersByTimeAsync(0);
    expect(() => img.onerror?.()).not.toThrow();
    expect(img.style.visibility).toBe('hidden');
  });

  it('crops around the focus point both ways, so the zoom keeps it in place', () => {
    const art = QUEST_ART[key]!;
    const focus = `${art.focusX}% ${art.focusY}%`;
    loadArt(key);
    expect(img.style.objectPosition).toBe(focus);
    expect(img.style.transformOrigin).toBe(focus);
  });

  it('swallows a decode failure', async () => {
    img = fakeImage(() => Promise.reject(new Error('EncodingError')));
    loadArt(key);
    await vi.advanceTimersByTimeAsync(0);
    expect(img.hasAttribute('src')).toBe(true);
  });
});
