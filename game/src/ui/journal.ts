import { noteBody, noteFrom, noteTitle, fullName, partName } from '../text/names';
import { t, type Msg } from '../text/msg';
import { leadOf } from '../sim/claims';
import { clockOf } from '../sim/sun';
import type { ClaimContract } from '../sim/salvage';
import type { World } from '../sim/types';
import { createIcon } from './cards';
import { el, panel } from './dom';
import type { UiHost } from './host';
import { compassText, distanceText } from './units';

export type JournalEntry = { id: string; day: number; title: Msg; from: Msg; body: Msg };

type Dated = { turn: number; order: number; entry: (day: number) => JournalEntry };

function noteEntries(world: World): Dated[] {
  return world.player.notes.map((n, k) => ({ turn: n.turn, order: k, entry: (day) => ({ id: n.id, day, title: noteTitle(n.id), from: noteFrom(n.id), body: noteBody(n.id) }) }));
}

function leadEntries(world: World): Dated[] {
  const claims = world.player.contracts.filter((c): c is ClaimContract => c.kind === 'claim');
  return claims.flatMap((c) =>
    c.leads.map((lead, k) => {
      const { angle, distance } = leadOf(c.at, lead.from);
      const body = t('journal.claimLead', { bearing: compassText(angle), distance: distanceText(distance) });
      return { turn: lead.turn, order: k, entry: (day: number) => ({ id: `${c.id}:${lead.driver}`, day, title: partName(c.defId), from: fullName(lead.driver), body }) };
    }),
  );
}

export function journalEntries(world: World): JournalEntry[] {
  const dated = [...noteEntries(world), ...leadEntries(world)];
  return dated.sort((a, b) => b.turn - a.turn || b.order - a.order).map((d) => d.entry(clockOf(d.turn).day));
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
  return el(
    'div',
    { class: 'journal-note' },
    el('div', { class: 'journal-head' }, el('b', {}, e.title), el('span', { class: 'dim' }, t('journal.entryHead', { day: e.day, from: e.from }))),
    el('div', {}, e.body),
  );
}
