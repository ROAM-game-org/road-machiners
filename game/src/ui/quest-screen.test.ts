import { describe, expect, it } from 'vitest';
import type { QuestLive } from '../sim/types';
import { lastTagged, pagesOf, paragraphsOf } from './quest-lines';
import { askOf, questPageStacks } from './quest-screen';

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
