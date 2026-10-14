import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestLive } from '../sim/types';
import { lastTagged, pagesOf, paragraphsOf } from './quest-lines';
import { askOf, loadArt } from './quest-screen';
import { QUEST_ART } from '../data/quest-art';
import { CONFIG } from '../config';

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

describe('loadArt', () => {
  const key = Object.keys(QUEST_ART)[0]!;
  const fakeImage = (decode: () => Promise<void>) => {
    const attrs = new Map<string, string>();
    const classes = new Set<string>();
    return {
      style: {} as Record<string, string>,
      classList: { add: (c: string) => classes.add(c) },
      classes,
      srcWrites: 0,
      onerror: null as null | (() => void),
      decode,
      setAttribute: (n: string, v: string) => attrs.set(n, v),
      hasAttribute: (n: string) => attrs.has(n),
      removeAttribute: (n: string) => attrs.delete(n),
      set src(v: string) {
        this.srcWrites++;
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
    img = fakeImage(() => Promise.reject(new Error('load failed')));
    vi.stubGlobal('document', { createElement: () => img });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries once, then leaves the picture blank without throwing', async () => {
    loadArt(key);
    expect(img.srcWrites).toBe(1);
    expect(() => img.onerror?.()).not.toThrow();
    vi.advanceTimersByTime(CONFIG.questArtRetryMs);
    expect(img.srcWrites).toBe(2);
    expect(() => img.onerror?.()).not.toThrow();
    expect(img.classes.has('quest-art-failed')).toBe(true);
    expect(img.style.visibility).toBe('hidden');
    vi.advanceTimersByTime(CONFIG.questArtRetryMs * 2);
    expect(img.srcWrites).toBe(2);
  });

  it('does not revive an image that was dropped before the retry', () => {
    loadArt(key);
    img.onerror?.();
    img.removeAttribute('src');
    vi.advanceTimersByTime(CONFIG.questArtRetryMs);
    expect(img.hasAttribute('src')).toBe(false);
  });
});
