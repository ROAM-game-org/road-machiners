
import type { NoteId } from '../data/locals';
import { noteBody, noteFrom, noteTitle, siteName } from '../text/names';
import { t } from '../text/msg';
import { clockOf } from '../sim/sun';
import type { World } from '../sim/types';
import { surveyClue, type SurveyContract, type SurveyPoint } from '../sim/survey';
import { surveyClueText } from './format';
import { createIcon } from './cards';
import { el, panel } from './dom';
import type { UiHost } from './host';

export type JournalEntry = { kind: 'note'; id: NoteId; day: number } | { kind: 'survey'; contract: SurveyContract; day: number };

export function journalEntries(world: World): JournalEntry[] {
  const surveys = world.player.contracts.flatMap((c): JournalEntry[] => (c.kind === 'survey' ? [{ kind: 'survey', contract: c, day: clockOf(c.deadline - c.window).day }] : []));
  const notes = world.player.notes
    .map((n, k) => ({ n, k }))
    .sort((a, b) => b.n.turn - a.n.turn || b.k - a.k)
    .map(({ n }): JournalEntry => ({ kind: 'note', id: n.id, day: clockOf(n.turn).day }));
  return [...surveys, ...notes];
}

export class JournalScreen {
  private root = panel('modal');

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
    const entries = journalEntries(this.host.world());
    this.root.replaceChildren(
      el('button', { class: 'close', onclick: () => this.close() }, t('journal.close')),
      el('h3', {}, createIcon('journal'), t('journal.title')),
      entries.length ? el('div', { class: 'journal' }, ...entries.map(entry)) : el('div', { class: 'dim' }, t('journal.empty')),
    );
  }
}

function entry(e: JournalEntry): HTMLElement {
  return e.kind === 'survey' ? surveyEntry(e.contract, e.day) : noteEntry(e.id, e.day);
}

function surveyEntry(c: SurveyContract, day: number): HTMLElement {
  return el(
    'div',
    { class: 'journal-note' },
    el('div', { class: 'journal-head' }, el('b', {}, t('journal.survey.title', { site: siteName(c.shop) })), el('span', { class: 'dim' }, t('journal.survey.taken', { day }))),
    ...c.points.map((p) => surveyPlace(c, p)),
  );
}

function surveyPlace(c: SurveyContract, point: SurveyPoint): HTMLElement {
  const clue = surveyClue(c, point);
  return el(
    'div',
    { class: 'journal-place' },
    el('div', { class: 'journal-head' }, el('span', {}, t(`contract.look.${clue.type}`)), placeTag(point)),
    el('div', {}, surveyClueText(clue)),
    el('div', { class: 'dim' }, t(`contract.want.${clue.type}`)),
  );
}

function placeTag(point: SurveyPoint): HTMLElement | null {
  if (point.done) return el('span', { class: 'tag good' }, t('journal.survey.done'));
  return point.found ? el('span', { class: 'tag' }, t('journal.survey.found')) : null;
}

function noteEntry(id: NoteId, day: number): HTMLElement {
  return el(
    'div',
    { class: 'journal-note' },
    el('div', { class: 'journal-head' }, el('b', {}, noteTitle(id)), el('span', { class: 'dim' }, t('journal.entryHead', { day, from: noteFrom(id) }))),
    el('div', {}, noteBody(id)),
  );
}
