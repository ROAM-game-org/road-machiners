import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIME } from '../data/time';
import { emptyWorld } from '../sim/testkit';
import { claimLeads, journalEntries, JournalScreen } from './journal';
import { surveyClue, surveySites } from '../sim/survey';
import { surveyWayText } from './format';
import { resolve } from '../text/resolve';
import { t } from '../text/msg';
import type { World } from '../sim/types';
import { TEST_MAP } from '../test/map';
import type { Contract } from '../sim/market';

const haul: Contract = { id: 'ct-h', shop: 'bowl', kind: 'haul', good: 'scrap', units: 3, to: 'nose', reward: 20000, deadline: 5000, window: 600, rush: false, tier: 2 };
const claim = (leads: Extract<Contract, { kind: 'claim' }>['leads'] = []): Extract<Contract, { kind: 'claim' }> => ({ id: 'ct-1', shop: 'bowl', kind: 'claim', stockId: 'armyTruck-1', at: { x: 100, y: 50 }, partId: 'p1', defId: 'mg', reward: 900, deadline: 9000, window: 9000, tier: 1, rivalAt: 9000, rival: null, leads });
const order: Extract<Contract, { kind: 'procure' }> = { id: 'ct-b', shop: 'nose', kind: 'procure', good: 'water', units: 6, cratePay: 900, reward: 11100, deadline: 900, window: 900, tier: 1 };
const escort: Contract = { id: 'ct-e', shop: 'bowl', kind: 'escort', client: 'v-gone', to: 'nose', reward: 8000, deadline: 2000, window: 2000, tier: 1, threat: 2, span: 100, together: 40, seen: null, apart: 0, stuck: 0, holdUntil: null };

function everyKind(): Contract[] {
  const [site] = surveySites(TEST_MAP);
  return [
    haul,
    order,
    claim(),
    { id: 'ct-s', shop: 'nose', kind: 'search', target: 'v-x', driver: 'Jed Cobb', template: 'trader', lead: { at: { x: 1, y: 1 }, turn: 0 }, reward: 9000, deadline: 900, window: 600, tier: 1, delivered: false },
    { id: 'ct-r', shop: 'bowl', kind: 'rescue', client: 'v-y', driver: 'Ada Cobb', need: 'fuel', area: { x: 40, y: 40 }, reward: 3000, deadline: 900, window: 600, tier: 1, fulfilled: false },
    escort,
    { id: 'ct-v', shop: 'bowl', kind: 'survey', points: [{ site: site.id, found: false, done: false }], reward: 3000, deadline: 900, window: 600, tier: 1 },
  ];
}

describe('journal entries', () => {
  it('lists the notes newest first, with the day each was learned', () => {
    const w = emptyWorld();
    w.player.notes = [
      { id: 'wagonBowl', turn: 10 },
      { id: 'greenPit', turn: TIME.turnsPerDay + 10 },
      { id: 'wagonNose', turn: TIME.turnsPerDay + 10 },
    ];

    const { notes } = journalEntries(w);

    expect(notes.map((e) => e.id)).toEqual(['wagonNose', 'greenPit', 'wagonBowl']);
    expect(notes.map((e) => e.day)).toEqual([2, 2, 1]);
  });

  it('lists every held contract once as work, whatever its kind', () => {
    const w = emptyWorld();
    w.player.contracts = everyKind();

    expect(journalEntries(w).work.map((c) => c.kind)).toEqual(['haul', 'procure', 'claim', 'search', 'rescue', 'escort', 'survey']);
  });

  it('lists past contracts newest first, with the day each ended', () => {
    const w = emptyWorld();
    w.player.pastContracts = [
      { contract: haul, outcome: 'failed', turn: 10, amount: -1800 },
      { contract: order, outcome: 'done', turn: TIME.turnsPerDay + 10, amount: 11100 },
    ];

    const { past } = journalEntries(w);

    expect(past.map((p) => [p.record.contract.id, p.day])).toEqual([['ct-b', 2], ['ct-h', 1]]);
  });

  it('keeps claim leads under their claim, out of the notes, newest first', () => {
    const w = emptyWorld();
    w.player.notes = [{ id: 'wagonBowl', turn: 10 }];
    const held = claim([{ turn: 20, from: { x: 100, y: 80 }, driver: 'Jed Cobb' }, { turn: 30, from: { x: 100, y: 50 }, driver: 'Ada Cobb' }]);
    w.player.contracts = [held];

    const leads = claimLeads(held);

    expect(journalEntries(w).notes.map((e) => e.id)).toEqual(['wagonBowl']);
    expect(leads.map((l) => resolve(l.from, 'en'))).toEqual(['Ada Cobb', 'Jed Cobb']);
    expect(resolve(leads[1].body, 'en')).toBe('north of where we talked, about 100 m out');
  });

  it('is empty with no notes and no work', () => {
    expect(journalEntries(emptyWorld())).toEqual({ work: [], notes: [], past: [] });
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
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeNode(tag), createElementNS: (_ns: string, tag: string) => new FakeNode(tag), createTextNode: (text: string) => Object.assign(new FakeNode('#text'), { children: [text] }), getElementById: () => ui });
  vi.stubGlobal('window', { addEventListener: () => {} });
  const screen = new JournalScreen({ world: () => world } as never);
  screen.toggle();
  return ui.children[ui.children.length - 1] as FakeNode;
}

describe('journal screen', () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  const groups = (root: FakeNode) => root.all((n) => n.tag === 'section');
  const heads = (root: FakeNode) => groups(root).map((g) => g.all((n) => n.tag === 'h4').map((h) => h.text()));
  const tagsOf = (n: FakeNode) => n.all((x) => x.className.split(' ').includes('tag')).map((x) => `${x.className} ${x.text()}`);

  it('shows a claim with no leads as work in a journal with no notes', () => {
    const w = emptyWorld();
    w.player.contracts = [claim()];

    const root = openJournal(w);

    expect(heads(root)).toEqual([['Work']]);
    expect(groups(root)[0].all((n) => n.className === 'job')).toHaveLength(1);
    expect(root.text()).not.toContain(resolve(t('journal.empty'), 'en'));
  });

  it('draws every held kind as one row', () => {
    const w = emptyWorld();
    w.player.contracts = everyKind();

    const root = openJournal(w);

    expect(groups(root)[0].all((n) => n.className === 'job')).toHaveLength(7);
  });

  it('heads the notes only beside another group', () => {
    const w = emptyWorld();
    w.player.notes = [{ id: 'wagonBowl', turn: 10 }];
    const alone = heads(openJournal(w));
    ui.children = [];
    w.player.contracts = [haul];

    expect(alone).toEqual([[]]);
    expect(heads(openJournal(w))).toEqual([['Work'], ['Notes']]);
  });

  it('shows a past supply order in its posted wording, with its outcome and the money it moved', () => {
    const w = emptyWorld();
    w.player.pastContracts = [
      { contract: order, outcome: 'done', turn: 10, amount: 11100 },
      { contract: haul, outcome: 'failed', turn: 20, amount: -1800 },
      { contract: escort, outcome: 'lapsed', turn: 30, amount: 0 },
    ];

    const rows = groups(openJournal(w))[0].all((n) => n.className === 'job');

    expect(rows.map(tagsOf)).toEqual([['tag dim lapsed'], ['tag bad failed'], ['tag good done']]);
    expect(rows[2].text()).toContain('Bring 6 crates of Water to Nose');
    expect(rows[2].text()).toContain('Day 1, Nose');
    expect(rows[2].text()).toContain('+111');
    expect(rows[1].all((n) => n.className === 'amount bad')).toHaveLength(1);
    expect(rows[0].all((n) => n.className.startsWith('amount'))).toHaveLength(0);
  });

  it('draws a past claim and escort whose trucks are gone from the world', () => {
    const w = emptyWorld();
    w.player.pastContracts = [
      { contract: { ...claim(), rival: 'v-gone' }, outcome: 'lapsed', turn: 10, amount: 0 },
      { contract: escort, outcome: 'released', turn: 20, amount: 4800 },
    ];

    const rows = groups(openJournal(w))[0].all((n) => n.className === 'job');

    expect(rows.map(tagsOf)).toEqual([['tag dim ended early'], ['tag dim lapsed']]);
  });

  it('lists the radio leads under their claim', () => {
    const w = emptyWorld();
    w.player.contracts = [claim([{ turn: 20, from: { x: 100, y: 80 }, driver: 'Jed Cobb' }])];

    const detail = openJournal(w).all((n) => n.className === 'journal-detail');

    expect(detail).toHaveLength(1);
    expect(detail[0].text()).toContain('north of where we talked, about 100 m out');
    expect(detail[0].text()).toContain('Jed Cobb');
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

    expect(places).toHaveLength(3);
    expect(places.map(tags)).toEqual([['surveyed'], ['found'], []]);
    survey.points.forEach((p, i) => {
      const clue = surveyClue(survey, p);
      expect(places[i].text()).toContain(resolve(t(`contract.look.${clue.type}`), 'en'));
      expect(places[i].text()).toContain(resolve(surveyWayText(w, survey, p), 'en'));
      expect(places[i].text()).toContain(resolve(t(`contract.want.${clue.type}`), 'en'));
    });
  });
});

