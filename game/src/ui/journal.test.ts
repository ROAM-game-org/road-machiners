import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIME } from '../data/time';
import { emptyWorld } from '../sim/testkit';
import { journalEntries, JournalScreen } from './journal';
import { surveyClue, surveySites } from '../sim/survey';
import { surveyClueText } from './format';
import { resolve } from '../text/resolve';
import { t } from '../text/msg';
import type { World } from '../sim/types';
import { TEST_MAP } from '../test/map';
import type { Contract } from '../sim/market';

describe('journal entries', () => {
  it('lists the notes newest first, with the day each was learned', () => {
    const w = emptyWorld();
    w.player.notes = [
      { id: 'wagonBowl', turn: 10 },
      { id: 'greenPit', turn: TIME.turnsPerDay + 10 },
      { id: 'wagonNose', turn: TIME.turnsPerDay + 10 },
    ];

    const entries = journalEntries(w);

    expect(entries.map((e) => (e.kind === 'note' ? e.id : null))).toEqual(['wagonNose', 'greenPit', 'wagonBowl']);
    expect(entries.map((e) => e.day)).toEqual([2, 2, 1]);
  });

  it('lists each held survey above the notes, with the day it was taken', () => {
    const w = emptyWorld();
    const [site] = surveySites(TEST_MAP);
    const survey: Contract = { id: 'ct-s', shop: 'bowl', kind: 'survey', points: [{ site: site.id, found: true, done: false }], reward: 3000, deadline: TIME.turnsPerDay + 500, window: 500, tier: 1 };
    w.player.contracts = [survey, { id: 'ct-h', shop: 'bowl', kind: 'haul', good: 'scrap', units: 3, to: 'nose', reward: 20000, deadline: 5000, window: 600, rush: false, tier: 2 }];
    w.player.notes = [{ id: 'wagonBowl', turn: 10 }];

    expect(journalEntries(w)).toEqual([
      { kind: 'survey', contract: survey, day: 2 },
      { kind: 'note', id: 'wagonBowl', day: 1 },
    ]);
  });

  it('is empty with no notes', () => {
    expect(journalEntries(emptyWorld())).toEqual([]);
  });
});

class FakeNode {
  className = '';
  innerHTML = '';
  style = { display: '' };
  classList = { add: (c: string) => { this.className += ` ${c}`; } };
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = c; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener() {}
  text(): string { return this.children.map((c) => (typeof c === 'string' ? c : c.text())).join(''); }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    const here = pred(this) ? [this] : [];
    return [...here, ...this.children.flatMap((c) => (typeof c === 'string' ? [] : c.all(pred)))];
  }
}

const ui = new FakeNode('div');

function openJournal(world: World): FakeNode {
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeNode(tag), createTextNode: (text: string) => Object.assign(new FakeNode('#text'), { children: [text] }), getElementById: () => ui });
  vi.stubGlobal('window', { addEventListener: () => {} });
  const screen = new JournalScreen({ world: () => world } as never);
  screen.toggle();
  return ui.children[ui.children.length - 1] as FakeNode;
}

describe('journal survey brief', () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it('gives each place what to look for, the clue, what the shop wants to learn, and a found or surveyed tag', () => {
    const w = emptyWorld();
    const [a, b, c] = surveySites(TEST_MAP);
    const survey: Extract<Contract, { kind: 'survey' }> = {
      id: 'ct-s', shop: 'bowl', kind: 'survey', reward: 3000, deadline: 900, window: 600, tier: 1,
      points: [{ site: a.id, found: true, done: true }, { site: b.id, found: true, done: false }, { site: c.id, found: false, done: false }],
    };
    w.player.contracts = [survey];

    const root = openJournal(w);
    const places = root.all((n) => n.className === 'journal-place');
    const tags = (n: FakeNode) => n.all((x) => x.className.split(' ').includes('tag')).map((x) => x.text());

    expect(root.text()).toContain('Survey for Bowl');
    expect(places).toHaveLength(3);
    expect(places.map(tags)).toEqual([['surveyed'], ['found'], []]);
    survey.points.forEach((p, i) => {
      const clue = surveyClue(survey, p);
      expect(places[i].text()).toContain(resolve(t(`contract.look.${clue.type}`), 'en'));
      expect(places[i].text()).toContain(resolve(surveyClueText(clue), 'en'));
      expect(places[i].text()).toContain(resolve(t(`contract.want.${clue.type}`), 'en'));
    });
  });
});
