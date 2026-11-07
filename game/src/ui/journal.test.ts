import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAsset } from '../fetch-asset';
import { TIME } from '../data/time';
import { emptyWorld } from '../sim/testkit';
import { claimLeads, journalEntries, journalTabs, JournalScreen } from './journal';
import { surveyClue, surveySites } from '../sim/survey';
import { resolve } from '../text/resolve';
import { t } from '../text/msg';
import type { SalvageStock, World } from '../sim/types';
import { emptyHidden } from '../sim/salvage';
import { gridSquareTiles } from '../sim/map-grid';
import { TEST_MAP } from '../test/map';
import type { Contract } from '../sim/market';

vi.mock('../fetch-asset', async (orig) => ({ ...(await orig<typeof import('../fetch-asset')>()), fetchAsset: vi.fn(async () => new ArrayBuffer(1)) }));

const stock = (id: string, pos: { x: number; y: number }): SalvageStock => ({ id, pos, radius: 0.6, goods: { scrap: 2 }, parts: [], hidden: emptyHidden() });
const haul: Contract = { id: 'ct-h', shop: 'bowl', kind: 'haul', good: 'scrap', units: 3, to: 'nose', reward: 200, deadline: 5000, window: 600, rush: false, tier: 2 };
const claim = (leads: Extract<Contract, { kind: 'claim' }>['leads'] = []): Extract<Contract, { kind: 'claim' }> => ({ id: 'ct-1', shop: 'bowl', kind: 'claim', stockId: 'armyTruck-1', at: { x: 100, y: 50 }, partId: 'p1', defId: 'mg', reward: 9, deadline: 9000, window: 9000, tier: 1, rivalAt: 9000, rival: null, leads });
const order: Extract<Contract, { kind: 'procure' }> = { id: 'ct-b', shop: 'nose', kind: 'procure', good: 'water', units: 6, cratePay: 9, reward: 111, deadline: 900, window: 900, tier: 1 };
const escort: Contract = { id: 'ct-e', shop: 'bowl', kind: 'escort', client: 'v-gone', to: 'nose', reward: 80, deadline: 2000, window: 2000, tier: 1, threat: 2, span: 100, together: 40, seen: null, apart: 0, stuck: 0, holdUntil: null };

function everyKind(): Contract[] {
  const [site] = surveySites(TEST_MAP);
  return [
    haul,
    order,
    claim(),
    { id: 'ct-s', shop: 'nose', kind: 'search', target: 'v-x', driver: 'Jed Cobb', template: 'trader', lead: { at: { x: 1, y: 1 }, turn: 0 }, reward: 90, deadline: 900, window: 600, tier: 1, delivered: false },
    { id: 'ct-r', shop: 'bowl', kind: 'rescue', client: 'v-y', driver: 'Ada Cobb', need: 'fuel', area: { x: 40, y: 40 }, reward: 30, deadline: 900, window: 600, tier: 1, fulfilled: false },
    escort,
    { id: 'ct-v', shop: 'bowl', kind: 'survey', points: [{ site: site.id, found: false, done: false }], reward: 30, deadline: 900, window: 600, tier: 1 },
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
      { contract: haul, outcome: 'failed', turn: 10, amount: -18 },
      { contract: order, outcome: 'done', turn: TIME.turnsPerDay + 10, amount: 111 },
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
    expect(journalEntries(emptyWorld())).toEqual({ work: [], wrecks: [], notes: [], past: [] });
  });

  it('keeps one row per square of the told wrecks not yet searched, newest first, with a count', () => {
    const w = emptyWorld();
    const side = gridSquareTiles();
    w.salvage = [
      stock('wreck1', { x: side * 2 + 5, y: side * 3 + 5 }),
      stock('wreck2', { x: side * 5 + 5, y: side + 5 }),
      stock('wreck3', { x: side * 2 + 40, y: side * 3 + 40 }),
      stock('wreck4', { x: side * 6 + 5, y: side * 6 + 5 }),
    ];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck3', 'wreck4'];
    w.player.scavenged = ['wreck4'];

    const { wrecks } = journalEntries(w);

    expect(wrecks).toEqual([{ square: { column: 2, row: 3 }, count: 2 }, { square: { column: 5, row: 1 }, count: 1 }]);
  });
});

class FakeNode {
  className = '';
  innerHTML = '';
  style = { display: '' };
  blurred = false;
  classes = new Set<string>();
  classList = {
    add: (c: string) => { this.classes.add(c); },
    toggle: (c: string, on: boolean) => { if (on) this.classes.add(c); else this.classes.delete(c); },
    contains: (c: string) => this.classes.has(c),
  };
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((e: unknown) => void)[]>();
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = c; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener(k: string, fn: (e: unknown) => void) { this.listeners.set(k, [...(this.listeners.get(k) ?? []), fn]); }
  blur() { this.blurred = true; }
  click() { for (const fn of this.listeners.get('click') ?? []) fn({ currentTarget: this }); }
  has(cls: string): boolean { return this.className.split(' ').includes(cls) || this.classes.has(cls); }
  text(): string { return this.children.map((c) => (typeof c === 'string' ? c : c.text())).join(''); }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    const here = pred(this) ? [this] : [];
    return [...here, ...this.children.flatMap((c) => (typeof c === 'string' ? [] : c.all(pred)))];
  }
}

const ui = new FakeNode('div');

function stubDocument(): void {
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeNode(tag), createElementNS: (_ns: string, tag: string) => new FakeNode(tag), createTextNode: (text: string) => Object.assign(new FakeNode('#text'), { children: [text] }), getElementById: () => ui });
  vi.stubGlobal('window', { addEventListener: () => {} });
}

function journalOf(world: World): { screen: JournalScreen; root: FakeNode } {
  stubDocument();
  const screen = new JournalScreen({ world: () => world } as never);
  screen.toggle();
  return { screen, root: ui.children[ui.children.length - 1] as FakeNode };
}

const openJournal = (world: World): FakeNode => journalOf(world).root;

describe('journal tabs', () => {
  it('lists only tabs with content, in the order work, wrecks, notes, past', () => {
    expect(journalTabs({ work: [], wrecks: [], notes: [], past: [] })).toEqual([]);
    const w = emptyWorld();
    w.player.contracts = [haul];
    w.player.notes = [{ id: 'wagonBowl', turn: 10 }];
    w.player.pastContracts = [{ contract: order, outcome: 'done', turn: 1, amount: 1 }];
    expect(journalTabs(journalEntries(w))).toEqual(['work', 'notes', 'past']);
  });
});

describe('journal screen', () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  const tabButtons = (root: FakeNode) => root.all((n) => n.tag === 'div' && n.has('tabs'))[0]?.children as FakeNode[] | undefined;
  const rowsOf = (root: FakeNode) => root.all((n) => n.className === 'job');
  const tagsOf = (n: FakeNode) => n.all((x) => x.className.split(' ').includes('tag')).map((x) => `${x.className} ${x.text()}`);

  it('shows an empty journal as its one line, with no tabs', () => {
    const root = openJournal(emptyWorld());

    expect(root.text()).toContain(resolve(t('journal.empty'), 'en'));
    expect(tabButtons(root)).toBeUndefined();
  });

  it('draws the close button without a keycap and the title as a panel title', () => {
    const root = openJournal(emptyWorld());

    expect(root.all((n) => n.has('key'))).toHaveLength(0);
    expect(root.all((n) => n.className === 'close')[0].text()).toBe('Close');
    expect(root.all((n) => n.className === 'panel-title')).toHaveLength(1);
  });

  it('opens on the work tab with a claim that has no leads', () => {
    const w = emptyWorld();
    w.player.contracts = [claim()];

    const root = openJournal(w);

    expect(tabButtons(root)!.map((b) => b.text())).toEqual(['Work1']);
    expect(rowsOf(root)).toHaveLength(1);
  });

  it('draws every held kind as one row', () => {
    const w = emptyWorld();
    w.player.contracts = everyKind();

    expect(rowsOf(openJournal(w))).toHaveLength(7);
  });

  it('keeps the tab chosen across a redraw and drops the focus off the tab button', () => {
    const w = emptyWorld();
    w.player.contracts = [haul];
    w.player.notes = [{ id: 'wagonBowl', turn: 10 }];
    const { screen, root } = journalOf(w);

    const clicked = tabButtons(root)!.find((b) => b.text().startsWith('Notes'))!;
    clicked.click();
    screen.render();

    expect(tabButtons(root)!.map((b) => b.has('on'))).toEqual([false, true]);
    expect(clicked.blurred).toBe(true);
    expect(root.text()).toContain('A scavenger with an Army radio');
  });

  it('keeps its drawing when nothing changed', () => {
    const w = emptyWorld();
    w.player.contracts = [haul];
    const { screen, root } = journalOf(w);
    const before = root.children.slice();

    screen.render();

    expect(root.children).toEqual(before);
    expect(root.children.every((c, i) => c === before[i])).toBe(true);
  });

  it('names the squares of told wrecks, and drops a searched wreck', () => {
    const w = emptyWorld();
    const side = gridSquareTiles();
    w.salvage = [stock('wreck1', { x: side * 2 + 5, y: side * 3 + 5 }), stock('wreck2', { x: side * 2 + 9, y: side * 3 + 9 }), stock('wreck3', { x: 5, y: 5 })];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck3'];

    const { root } = journalOf(w);
    const places = root.all((n) => n.className === 'journal-place');

    expect(tabButtons(root)!.map((b) => b.text())).toEqual(['Wrecks2']);
    expect(places.map((r) => r.text())).toEqual(['Square A1', 'Square C4, 2 wrecks']);
    ui.children = [];
    w.player.scavenged = ['wreck1', 'wreck2', 'wreck3'];
    expect(tabButtons(openJournal(w))).toBeUndefined();
  });

  it('opens the newest note and closes the others to a title and a day', () => {
    const w = emptyWorld();
    w.player.notes = [{ id: 'wagonBowl', turn: 10 }, { id: 'wagonNose', turn: TIME.turnsPerDay + 10 }];
    const { root } = journalOf(w);
    const notes = root.all((n) => n.has('journal-note'));

    expect(notes).toHaveLength(2);
    expect(notes[0].has('open')).toBe(true);
    expect(notes[0].text()).toContain('Sergeant Kovac, Nose dispatch');
    expect(notes[1].text()).toContain('A scavenger with an Army radio');
    expect(notes[1].text()).toContain('Day 1');
    expect(notes[1].text()).not.toContain('Hattie');

    notes[1].children[0] instanceof FakeNode && (notes[1].children[0] as FakeNode).click();
    const after = root.all((n) => n.has('journal-note'));
    expect(after[1].has('open')).toBe(true);
    expect(after[0].has('open')).toBe(false);
  });

  it('shows a past supply order in its posted wording, with its outcome and the money it moved', () => {
    const w = emptyWorld();
    w.player.pastContracts = [
      { contract: order, outcome: 'done', turn: 10, amount: 111 },
      { contract: haul, outcome: 'failed', turn: 20, amount: -18 },
      { contract: escort, outcome: 'lapsed', turn: 30, amount: 0 },
    ];

    const rows = rowsOf(openJournal(w));

    expect(rows.map(tagsOf)).toEqual([['tag dim lapsed'], ['tag bad failed'], ['tag good done']]);
    expect(rows[2].text()).toContain('Bring 6 crates of Water to Nose');
    expect(rows[2].text()).toContain('Day 1, Nose');
    expect(rows[2].text()).toContain('+111');
  });

  it('explains the negative amount of a failed haul as the price of the kept cargo, and nothing else', () => {
    const w = emptyWorld();
    w.player.pastContracts = [
      { contract: order, outcome: 'done', turn: 10, amount: 111 },
      { contract: haul, outcome: 'failed', turn: 20, amount: -18 },
      { contract: escort, outcome: 'lapsed', turn: 30, amount: 0 },
    ];

    const rows = rowsOf(openJournal(w));
    const titled = (row: FakeNode) => row.all((n) => n.className.startsWith('price')).map((n) => n.attrs.get('title'));

    expect(titled(rows[1])).toEqual(['Price of the cargo you kept']);
    expect(titled(rows[0])).toEqual([]);
    expect(titled(rows[2])).toEqual([undefined]);
  });

  it('draws a past claim and escort whose trucks are gone from the world', () => {
    const w = emptyWorld();
    w.player.pastContracts = [
      { contract: { ...claim(), rival: 'v-gone' }, outcome: 'lapsed', turn: 10, amount: 0 },
      { contract: escort, outcome: 'released', turn: 20, amount: 4800 },
    ];

    expect(rowsOf(openJournal(w)).map(tagsOf)).toEqual([['tag dim ended early'], ['tag dim lapsed']]);
  });

  it('lists the radio leads under their claim', () => {
    const w = emptyWorld();
    w.player.contracts = [claim([{ turn: 20, from: { x: 100, y: 80 }, driver: 'Jed Cobb' }])];

    const detail = openJournal(w).all((n) => n.className === 'journal-detail');

    expect(detail).toHaveLength(1);
    expect(detail[0].text()).toContain('north of where we talked, about 100 m out');
    expect(detail[0].text()).toContain('Jed Cobb');
  });

  const surveyOf = (sites: string[], states: { found: boolean; done: boolean }[] = []): Extract<Contract, { kind: 'survey' }> => ({
    id: 'ct-s', shop: 'bowl', kind: 'survey', reward: 30, deadline: 900, window: 600, tier: 1,
    points: sites.map((site, i) => ({ site, found: states[i]?.found ?? false, done: states[i]?.done ?? false })),
  });
  const picturesOf = (place: FakeNode) => place.all((n) => n.className === 'survey-picture');
  const imageOf = (picture: FakeNode) => picture.children[0] as FakeNode & { src?: string; alt?: string };
  const placesOf = (root: FakeNode) => root.all((n) => n.has('journal-place') && n.has('survey'));

  it('opens the first place not yet surveyed, and shows a surveyed place as its row only', () => {
    const w = emptyWorld();
    const [a, b, c] = surveySites(TEST_MAP).slice(-3);
    const survey = surveyOf([a.id, b.id, c.id], [{ found: true, done: true }, { found: true, done: false }, { found: false, done: false }]);
    w.player.contracts = [survey];

    const places = placesOf(openJournal(w));

    expect(places).toHaveLength(3);
    expect(places.map((p) => p.has('open'))).toEqual([false, true, false]);
    expect(places.map(tagsOf)).toEqual([['tag good surveyed'], ['tag found'], []]);
    expect(places.map((p) => picturesOf(p).length)).toEqual([0, 1, 0]);
    expect(places.map((p) => p.all((n) => n.has('way-steps')).length)).toEqual([0, 1, 0]);
  });

  it('gives the open place its square and lay, what the shop wants to learn, the shop once and numbered steps', () => {
    const w = emptyWorld();
    const [site] = surveySites(TEST_MAP).slice(-1);
    const survey = surveyOf([site.id]);
    w.player.contracts = [survey];
    const clue = surveyClue(survey, survey.points[0]);

    const place = placesOf(openJournal(w))[0];

    expect(place.text()).toContain(resolve(t(`contract.look.${clue.type}`), 'en'));
    expect(place.text()).toContain(resolve(t(`contract.want.${clue.type}`), 'en'));
    expect(place.text()).toContain('From Bowl');
    expect(place.text().match(/From Bowl/g)).toHaveLength(1);
  });

  it('opens another place on click and closes the one that was open', () => {
    const w = emptyWorld();
    const [a, b] = surveySites(TEST_MAP).slice(-2);
    w.player.contracts = [surveyOf([a.id, b.id])];
    const { root } = journalOf(w);

    placesOf(root)[1].children[0] instanceof FakeNode && (placesOf(root)[1].children[0] as FakeNode).click();

    expect(placesOf(root).map((p) => p.has('open'))).toEqual([false, true]);
    expect(placesOf(root).map((p) => picturesOf(p).length)).toEqual([0, 1]);
  });

  it('shows no picture on rows of other contracts', () => {
    const w = emptyWorld();
    w.player.contracts = [haul, claim(), escort];

    expect(openJournal(w).all((n) => n.className === 'survey-picture')).toHaveLength(0);
  });

  it('fetches a site once however often the journal redraws', async () => {
    const w = emptyWorld();
    const site = surveySites(TEST_MAP)[3];
    w.player.contracts = [surveyOf([site.id])];
    vi.mocked(fetchAsset).mockClear();

    const first = openJournal(w);
    ui.children = [];
    const second = openJournal(w);
    await new Promise((resolve) => setTimeout(resolve));
    const third = openJournal(w);

    const fetched = vi.mocked(fetchAsset).mock.calls.filter((call) => call[1].includes(`survey/${site.id}.webp`));
    expect(fetched).toHaveLength(1);
    expect(imageOf(picturesOf(first)[0]).src).toBeDefined();
    expect(imageOf(picturesOf(second)[0]).src).toBeDefined();
    expect(imageOf(picturesOf(third)[0]).src).toBe(imageOf(picturesOf(second)[0]).src);
  });

  it('is a side form beside the world, and a modal over a scene', () => {
    const w = emptyWorld();
    w.player.contracts = [haul];
    const { screen, root } = journalOf(w);

    expect(screen.sideForm()).toBe(true);
    expect(root.classList.contains('journal-side')).toBe(true);
    expect(root.classList.contains('modal')).toBe(false);
    root.classList.add('over-scene');
    expect(screen.sideForm()).toBe(false);
    screen.render();
    expect(root.classList.contains('modal')).toBe(true);
  });
});
