import { noteBody, noteFrom, noteTitle, fullName, siteName } from '../text/names';
import { t, PLUS, type Msg } from '../text/msg';
import { keyTip, narrowMode } from './input-mode';
import { leadOf } from '../sim/claims';
import { clockOf } from '../sim/sun';
import type { ClaimContract } from '../sim/salvage';
import type { World } from '../sim/types';
import { toldWrecks } from '../sim/rumors';
import { gridSquareOf, type GridSquare } from '../sim/map-grid';
import type { Contract, ContractEnd, PastContract } from '../sim/market';
import { surveyClue, surveyWay, type SurveyClue, type SurveyContract, type SurveyPoint } from '../sim/survey';
import { claimClueLines, gridSquareText, postedSummary } from './format';
import { directionsSteps } from './directions-text';
import { createIcon } from './cards';
import { surveyPictureEl } from './picture-store';
import { contractIcon, heldContractRow } from './contract-row';
import { el, panel, uiRoot } from './dom';
import type { UiHost } from './host';
import { compassText, distanceText, moneyEl } from './units';

export type JournalNote = { id: string; day: number; title: Msg; from: Msg; body: Msg };

export type ClaimLeadNote = { id: string; day: number; from: Msg; body: Msg };

export type PastEntry = { record: PastContract; day: number };

export type WreckSquareNote = { square: GridSquare; count: number };

export type Journal = { work: Contract[]; wrecks: WreckSquareNote[]; notes: JournalNote[]; past: PastEntry[] };

function wreckSquares(world: World): WreckSquareNote[] {
  const squares = new Map<string, WreckSquareNote>();
  for (const stock of toldWrecks(world)) {
    const square = gridSquareOf(stock.pos);
    const key = `${square.column},${square.row}`;
    const note = squares.get(key);
    if (note) note.count += 1;
    else squares.set(key, { square, count: 1 });
  }
  return [...squares.values()];
}

export function journalEntries(world: World): Journal {
  const notes = world.player.notes
    .map((n, k) => ({ n, k }))
    .sort((a, b) => b.n.turn - a.n.turn || b.k - a.k)
    .map(({ n }) => ({ id: n.id, day: clockOf(n.turn).day, title: noteTitle(n.id), from: noteFrom(n.id), body: noteBody(n.id) }));
  const past = [...world.player.pastContracts].reverse().map((record) => ({ record, day: clockOf(record.turn).day }));
  return { work: [...world.player.contracts], wrecks: wreckSquares(world), notes, past };
}

export function claimLeads(c: ClaimContract): ClaimLeadNote[] {
  return c.leads
    .map((lead, k) => ({ lead, k }))
    .sort((a, b) => b.lead.turn - a.lead.turn || b.k - a.k)
    .map(({ lead }) => {
      const { angle, distance } = leadOf(c.at, lead.from);
      return { id: `${c.id}:${lead.driver}`, day: clockOf(lead.turn).day, from: fullName(lead.driver), body: t('journal.claimLead', { bearing: compassText(angle), distance: distanceText(distance) }) };
    });
}

export type JournalTab = 'work' | 'wrecks' | 'notes' | 'past';

const ALL_TABS: JournalTab[] = ['work', 'wrecks', 'notes', 'past'];

export function journalTabs(j: Journal): JournalTab[] {
  const filled: [JournalTab, number][] = [['work', j.work.length], ['wrecks', j.wrecks.length], ['notes', j.notes.length], ['past', j.past.length]];
  return filled.filter(([, n]) => n > 0).map(([tab]) => tab);
}

const OVER_SCENE = 'over-scene';

export class JournalScreen {
  readonly root = panel('modal');
  private tab: JournalTab | null = null;
  private opened: Partial<Record<JournalTab, string>> = {};
  private drawn = '';

  constructor(private host: UiHost) {
    this.root.classList.add('journal-screen');
    this.root.style.display = 'none';
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  sideForm(): boolean {
    return !narrowMode() && !this.root.classList.contains(OVER_SCENE);
  }

  toggle(): void {
    if (this.isOpen()) return this.close();
    this.root.style.display = '';
    this.drawn = '';
    this.render();
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
    this.drawn = '';
  }

  render(): void {
    if (!this.isOpen()) return;
    const w = this.host.world();
    const journal = journalEntries(w);
    const tabs = journalTabs(journal);
    const tab = this.tab ?? tabs[0] ?? 'work';
    const side = this.sideForm();
    const signature = JSON.stringify([side, tab, this.opened, w.turn, journal.work, journal.wrecks, journal.notes.map((n) => n.id), journal.past.length, journal.past[0]?.record.turn]);
    if (signature === this.drawn) return;
    this.drawn = signature;
    this.root.classList.toggle('modal', !side);
    this.root.classList.toggle('dialog', !side);
    this.root.classList.toggle('journal-side', side);
    this.root.replaceChildren(
      el('div', { class: 'journal-top' }, el('h3', { class: 'panel-title' }, createIcon('journal'), t('journal.title')), el('button', { class: 'close', title: keyTip(t('journal.close'), 'J'), onclick: () => this.close() }, t('journal.close'))),
      el('div', { class: 'tabs sub' }, ...ALL_TABS.map((id) => this.tabButton(id, id === tab))),
      el('div', { class: 'journal-body screen-block' }, this.page(w, journal, tab)),
    );
  }

  private tabButton(id: JournalTab, on: boolean): HTMLElement {
    return el('button', { class: on ? 'on' : '', onclick: (e: Event) => { this.tab = id; this.render(); (e.currentTarget as HTMLElement | null)?.blur(); } }, t(`journal.${id}`));
  }

  private open(tab: JournalTab, id: string): void {
    this.opened = { ...this.opened, [tab]: id };
    this.render();
  }

  private page(w: World, journal: Journal, tab: JournalTab): HTMLElement {
    if (journal[tab].length === 0) return el('div', { class: 'journal-idle' }, t('journal.empty'));
    if (tab === 'work') return this.workPage(w, journal.work);
    if (tab === 'wrecks') return el('div', { class: 'journal-list' }, ...journal.wrecks.map(wreckSquareEntry));
    if (tab === 'notes') return this.notesPage(journal.notes);
    return el('div', { class: 'jobs journal-past' }, ...journal.past.map(pastEntry));
  }

  private workPage(w: World, work: Contract[]): HTMLElement {
    const openId = this.openPlace(work);
    return el('div', { class: 'jobs' }, ...work.flatMap((c) => [heldContractRow(w, c), this.workDetail(w, c, openId)].filter((x) => x !== null)));
  }

  private openPlace(work: Contract[]): string | null {
    const chosen = this.opened.work;
    const ids = work.flatMap((c) => (c.kind === 'survey' ? c.points.map((p) => placeId(c, p)) : []));
    if (chosen !== undefined && ids.includes(chosen)) return chosen;
    const first = work.flatMap((c) => (c.kind === 'survey' ? c.points.filter((p) => !p.done).map((p) => placeId(c, p)) : []))[0];
    return first ?? null;
  }

  private workDetail(w: World, c: Contract, openId: string | null): HTMLElement | null {
    if (c.kind === 'survey') return el('div', { class: 'journal-detail survey' }, ...c.points.map((p) => this.surveyPlace(w, c, p, placeId(c, p) === openId)));
    if (c.kind === 'claim') return el('div', { class: 'journal-detail claim' }, el('div', { class: 'claim-clue' }, ...claimClueLines(c).map((line) => el('div', {}, line))), ...claimLeads(c).map(leadEntry));
    return null;
  }

  private surveyPlace(w: World, c: SurveyContract, point: SurveyPoint, open: boolean): HTMLElement {
    const clue = surveyClue(c, point);
    const cells = [el('span', { class: 'place-kind' }, t(`contract.look.${clue.type}`)), el('span', { class: 'place-square' }, gridSquareText(clue.square)), placeTag(point)];
    if (point.done) return el('div', { class: 'journal-place survey' }, el('div', { class: 'place-head done' }, ...cells));
    const head = el('button', { class: 'screen-line journal-head place-head', 'aria-expanded': open ? 'true' : 'false', onclick: (e: Event) => { this.open('work', placeId(c, point)); (e.currentTarget as HTMLElement | null)?.blur(); } }, ...cells);
    if (!open) return el('div', { class: 'journal-place survey' }, head);
    return el(
      'div',
      { class: 'journal-place survey open' },
      head,
      el('div', { class: 'place-body' }, surveyPictureEl(point.site), el('div', { class: 'place-text' }, el('div', {}, t('journal.placeLay', { lay: t(`contract.lay.${clue.lay}`) })), el('div', { class: 'dim' }, t(`contract.want.${clue.type}`)))),
      placeWay(w, c, point, clue),
    );
  }

  private notesPage(notes: JournalNote[]): HTMLElement {
    const chosen = this.opened.notes;
    const openId = notes.some((n) => n.id === chosen) ? chosen : notes[0]?.id;
    return el('div', { class: 'journal-list' }, ...notes.map((n) => this.noteEntry(n, n.id === openId)));
  }

  private noteEntry(e: JournalNote, open: boolean): HTMLElement {
    const head = el('button', { class: 'screen-line journal-head note-head', 'aria-expanded': open ? 'true' : 'false', onclick: (ev: Event) => { this.open('notes', e.id); (ev.currentTarget as HTMLElement | null)?.blur(); } }, el('b', {}, e.title), el('span', { class: 'dim' }, t('journal.day', { day: e.day })));
    return el('div', { class: `journal-note${open ? ' open' : ''}` }, head, open ? el('div', { class: 'dim' }, e.from) : null, open ? el('div', {}, e.body) : null);
  }
}

function placeId(c: SurveyContract, point: SurveyPoint): string {
  return `${c.id}:${point.site}`;
}

function placeTag(point: SurveyPoint): HTMLElement {
  if (point.done) return el('span', { class: 'tag' }, t('journal.survey.done'));
  return point.found ? el('span', { class: 'tag' }, t('journal.survey.found')) : el('span', {});
}

function placeWay(w: World, c: SurveyContract, point: SurveyPoint, clue: SurveyClue): HTMLElement {
  const way = surveyWay(w, c, point);
  const caption = el('div', { class: 'place-from dim' }, t('journal.from', { site: siteName(c.shop) }));
  if (!way) return el('div', { class: 'place-way' }, caption, el('div', {}, t('journal.placeBearing', { distance: distanceText(clue.tiles), dir: compassText(clue.rad), site: siteName(clue.landmark) })));
  return el('div', { class: 'place-way' }, caption, el('ol', { class: 'way-steps' }, ...directionsSteps(way).map((step) => el('li', {}, step))));
}

function leadEntry(lead: ClaimLeadNote): HTMLElement {
  return el('div', { class: 'journal-place journal-head' }, el('span', {}, lead.body), el('span', { class: 'dim' }, t('journal.entryHead', { day: lead.day, from: lead.from })));
}

function wreckSquareEntry({ square, count }: WreckSquareNote): HTMLElement {
  const words = count > 1 ? t('journal.wrecksInSquare', { square: gridSquareText(square), n: count }) : t('journal.wreckSquare', { square: gridSquareText(square) });
  return el('div', { class: 'journal-place' }, words);
}

const OUTCOME_TONE: Record<ContractEnd, 'good' | 'bad' | 'dim'> = { done: 'good', failed: 'bad', late: 'dim', lapsed: 'dim', released: 'dim' };

function pastEntry({ record, day }: PastEntry): HTMLElement {
  const c = record.contract;
  return el(
    'div',
    { class: 'job' },
    contractIcon(c.kind),
    el('div', { class: 'job-what' }, el('span', {}, postedSummary(c)), el('span', { class: 'dim' }, t('journal.entryHead', { day, from: siteName(c.shop) }))),
    el('span', { class: `tag ${OUTCOME_TONE[record.outcome]}` }, t(`journal.past.${record.outcome}`)),
    pastMoney(record),
  );
}

function pastMoney({ amount }: PastContract): HTMLElement {
  if (amount > 0) return el('span', { class: 'price good' }, PLUS, moneyEl(amount));
  return amount < 0 ? el('span', { class: 'price', title: t('journal.past.keptCargo') }, moneyEl(amount)) : el('span', {});
}
