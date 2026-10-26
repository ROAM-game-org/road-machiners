import { noteBody, noteFrom, noteTitle, fullName, siteName } from '../text/names';
import { t, PLUS, type Msg } from '../text/msg';
import { keyLabel } from './input-mode';
import { leadOf } from '../sim/claims';
import { clockOf } from '../sim/sun';
import type { ClaimContract } from '../sim/salvage';
import type { World } from '../sim/types';
import { toldWrecks } from '../sim/rumors';
import { gridSquareOf, type GridSquare } from '../sim/map-grid';
import type { Contract, ContractEnd, PastContract } from '../sim/market';
import { surveyClue, type SurveyContract, type SurveyPoint } from '../sim/survey';
import { gridSquareText, postedSummary, surveyWayText } from './format';
import { createIcon } from './cards';
import { surveyPictureEl } from './survey-picture';
import { contractIcon, heldContractRow } from './contract-row';
import { el, panel } from './dom';
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

export class JournalScreen {
  readonly root = panel('modal');

  constructor(private host: UiHost) {
    this.root.classList.add('journal-screen');
    this.root.style.display = 'none';
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  toggle(): void {
    if (this.isOpen()) return this.close();
    this.root.style.display = '';
    this.render();
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }

  render(): void {
    if (!this.isOpen()) return;
    const w = this.host.world();
    const journal = journalEntries(w);
    const groups = [workGroup(w, journal.work), wrecksGroup(journal.wrecks), notesGroup(journal), pastGroup(journal.past)].filter((g) => g !== null);
    this.root.replaceChildren(
      el('button', { class: 'close', onclick: () => this.close() }, keyLabel(t('journal.close'), 'J')),
      el('h3', {}, createIcon('journal'), t('journal.title')),
      groups.length ? el('div', { class: 'journal' }, ...groups) : el('div', { class: 'dim' }, t('journal.empty')),
    );
  }
}

function group(kind: string, head: Msg | null, ...body: HTMLElement[]): HTMLElement {
  return el('section', { class: `journal-group journal-${kind}` }, head ? el('h4', {}, head) : null, ...body);
}

function workGroup(w: World, work: Contract[]): HTMLElement | null {
  if (work.length === 0) return null;
  return group('work', t('journal.work'), el('div', { class: 'jobs' }, ...work.flatMap((c) => [heldContractRow(w, c), workDetail(w, c)].filter((x) => x !== null))));
}

function workDetail(w: World, c: Contract): HTMLElement | null {
  if (c.kind === 'survey') return el('div', { class: 'journal-detail' }, ...c.points.map((p) => surveyPlace(w, c, p)));
  if (c.kind === 'claim' && c.leads.length > 0) return el('div', { class: 'journal-detail' }, ...claimLeads(c).map(leadEntry));
  return null;
}

function surveyPlace(w: World, c: SurveyContract, point: SurveyPoint): HTMLElement {
  const clue = surveyClue(c, point);
  return el(
    'div',
    { class: 'journal-place survey' },
    surveyPictureEl(point.site),
    el(
      'div',
      { class: 'journal-place-text' },
      el('div', { class: 'journal-head' }, el('span', {}, t(`contract.look.${clue.type}`)), placeTag(point)),
      el('div', {}, surveyWayText(w, c, point)),
      el('div', { class: 'dim' }, t(`contract.want.${clue.type}`)),
    ),
  );
}

function placeTag(point: SurveyPoint): HTMLElement | null {
  if (point.done) return el('span', { class: 'tag good' }, t('journal.survey.done'));
  return point.found ? el('span', { class: 'tag' }, t('journal.survey.found')) : null;
}

function leadEntry(lead: ClaimLeadNote): HTMLElement {
  return el('div', { class: 'journal-place journal-head' }, el('span', {}, lead.body), el('span', { class: 'dim' }, t('journal.entryHead', { day: lead.day, from: lead.from })));
}

function wrecksGroup(wrecks: WreckSquareNote[]): HTMLElement | null {
  if (wrecks.length === 0) return null;
  return group('wrecks', t('journal.wrecks'), ...wrecks.map(wreckSquareEntry));
}

function wreckSquareEntry({ square, count }: WreckSquareNote): HTMLElement {
  const words = count > 1 ? t('journal.wrecksInSquare', { square: gridSquareText(square), n: count }) : t('journal.wreckSquare', { square: gridSquareText(square) });
  return el('div', { class: 'journal-place' }, words);
}

function notesGroup(journal: Journal): HTMLElement | null {
  if (journal.notes.length === 0) return null;
  const alone = journal.work.length === 0 && journal.wrecks.length === 0 && journal.past.length === 0;
  return group('notes', alone ? null : t('journal.notes'), ...journal.notes.map(noteEntry));
}

function noteEntry(e: JournalNote): HTMLElement {
  return el(
    'div',
    { class: 'journal-note' },
    el('div', { class: 'journal-head' }, el('b', {}, e.title), el('span', { class: 'dim' }, t('journal.entryHead', { day: e.day, from: e.from }))),
    el('div', {}, e.body),
  );
}

function pastGroup(past: PastEntry[]): HTMLElement | null {
  if (past.length === 0) return null;
  return group('past', t('journal.past'), el('div', { class: 'jobs' }, ...past.map(pastEntry)));
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
