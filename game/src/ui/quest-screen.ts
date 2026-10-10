
import { localOfQuest } from '../sim/dialogue-rules';
import { chooseQuestOption, leaveQuest, QUESTS, questView, type QuestView } from '../sim/quests';
import type { QuestLive, World } from '../sim/types';
import { createIcon } from './cards';
import { localName, localRole } from '../text/names';
import { t, verbatim, type Msg } from '../text/msg';
import { el, isBrowserChord, panel } from './dom';
import { commandFailure } from './format';
import { questArtUrl } from '../data/quest-art';
import type { UiHost } from './host';
import { choiceButtons, drawLines, lastTagged, pagesOf } from './quest-lines';
import { renderLine } from './quest-text';

const KEY_DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

export function askOf(shown: QuestLive | null, live: QuestLive, ask: string | null): string | null {
  return shown?.quest === live.quest ? ask : null;
}

export class QuestScreen {
  private root = panel('modal');
  private shown: QuestLive | null = null;
  private asked: string | null = null;
  private lastAsk: string | null = null;
  private error: Msg | null = null;
  private page = 0;
  private artBefore: string | null = null;
  private placeBefore: string | null = null;
  private factsBefore = new Set<string>();
  private factsShown: string[] = [];
  private revealEnd = 0;

  constructor(private host: UiHost) {
    this.root.classList.add('quest-screen');
    this.root.style.display = 'none';
    this.root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  isOpen(): boolean {
    return this.host.world().player.quests.live !== null;
  }

  render(): void {
    const live = this.host.world().player.quests.live;
    if (!live) return this.hide();
    if (live.quest === this.shown?.quest && live.ink === this.shown.ink) return;
    this.carry(live);
    this.lastAsk = askOf(this.shown, live, this.asked);
    this.shown = live;
    this.asked = null;
    this.page = 0;
    this.draw();
  }

  private carry(live: QuestLive): void {
    const shown = this.shown;
    if (shown?.quest !== live.quest || this.asked === null) return this.forget();
    const before = shown.lines;
    this.artBefore = lastTagged(before, 'img') ?? this.artBefore;
    this.placeBefore = lastTagged(before, 'place') ?? this.placeBefore;
    this.factsBefore = new Set(this.factsShown);
  }

  private forget(): void {
    this.artBefore = null;
    this.placeBefore = null;
    this.factsBefore = new Set();
  }

  private hide(): void {
    this.shown = null;
    this.lastAsk = null;
    this.error = null;
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }

  private draw(): void {
    const w = this.host.world();
    const view = questView(w, QUESTS);
    this.root.style.display = '';
    this.root.classList.remove('qt-done');
    this.root.classList.toggle('quest-page', view.view === 'page');
    const endMs = view.view === 'page' ? this.drawPage(w, view) : this.drawTalk(w, view);
    this.revealEnd = performance.now() + endMs;
  }

  private drawTalk(w: World, view: QuestView): number {
    const drawn = drawLines(w, pagesOf(view.lines)[this.page], 0, { inlineArt: true, offers: true });
    const ask = this.page === 0 && this.lastAsk !== null ? el('div', { class: 'talk-ask' }, verbatim(this.lastAsk)) : null;
    const text = el('div', { class: 'quest-talk' }, ask, ...drawn.nodes);
    this.root.replaceChildren(this.head(view.quest), text, this.pageEnd(w, view, drawn.endMs), this.errorLine());
    return drawn.endMs;
  }

  private drawPage(w: World, view: QuestView): number {
    const pages = pagesOf(view.lines);
    const shown = pages.slice(0, this.page + 1).flat();
    const drawn = drawLines(w, pages[this.page], 0, { inlineArt: false, offers: true });
    const place = lastTagged(shown, 'place') ?? this.placeBefore;
    const text = el('div', { class: 'quest-text' }, place ? el('h2', { class: 'quest-place' }, verbatim(place)) : null, ...drawn.nodes, this.pageEnd(w, view, drawn.endMs), this.errorLine());
    this.root.replaceChildren(this.art(lastTagged(shown, 'img') ?? this.artBefore), text, this.side(view));
    return drawn.endMs;
  }

  private art(key: string | null): HTMLElement {
    return el('div', { class: 'quest-art' }, el('div', { class: 'quest-frame' }, key ? el('img', { src: questArtUrl(key), 'aria-hidden': 'true' }) : null));
  }

  private side(view: QuestView): HTMLElement {
    const stats = view.stats.map((s) => el('div', { class: 'quest-stat' }, el('span', {}, verbatim(s.label)), el('b', {}, verbatim(s.value))));
    this.factsShown = view.facts;
    const facts = view.facts.map((f) => el('div', { class: this.factsBefore.has(f) ? 'quest-fact' : 'quest-fact new' }, renderLine(f, ['reveal:all'], 0).el));
    return el('div', { class: 'quest-side' }, this.leaveButton(), el('div', { class: 'quest-stats' }, ...stats), el('div', { class: 'quest-facts' }, ...facts));
  }

  private head(quest: string): HTMLElement {
    const local = localOfQuest(quest);
    return el('div', { class: 'talk-head' }, createIcon('driver'), local ? el('b', {}, localName(local.id)) : null, local ? el('span', { class: 'dim' }, localRole(local.id)) : null, this.leaveButton());
  }

  private leaveButton(): HTMLElement {
    return el('button', { class: 'close', onclick: () => this.leave() }, t('quest.leaveKey'));
  }

  private errorLine(): HTMLElement {
    return el('div', { class: 'error' }, this.error);
  }

  private pageEnd(w: World, view: QuestView, atMs: number): HTMLElement {
    if (this.onLastPage(view)) return this.choices(w, view, atMs);
    return el('button', { class: 'quest-next qt-unit', style: `animation-delay: ${atMs}ms`, onclick: () => this.nextPage() }, t('quest.next'));
  }

  private choices(w: World, view: QuestView, atMs: number): HTMLElement {
    const buttons = view.ended ? [el('button', { class: 'quest-choice', onclick: () => this.leave() }, t('quest.leave'))] : choiceButtons(w, view, (i) => this.choose(i));
    return el('div', { class: 'quest-choices qt-unit', style: `animation-delay: ${atMs}ms` }, ...buttons);
  }

  private nextPage(): void {
    this.page += 1;
    this.draw();
  }

  private choose(index: number): void {
    const view = questView(this.host.world(), QUESTS);
    if (view.locked[index]) return;
    this.asked = view.choices[index];
    this.run((w) => chooseQuestOption(w, QUESTS, index));
  }

  private leave(): void {
    this.run((w) => leaveQuest(w));
  }

  private run(cmd: (w: World) => World): void {
    this.error = null;
    try {
      this.host.announce(cmd(this.host.world()));
    } catch (e) {
      this.asked = null;
      this.error = commandFailure(this.host.world(), e);
      if (this.host.world().player.quests.live) this.draw();
    }
  }

  private onClick(e: MouseEvent): void {
    if (!(e.target instanceof HTMLElement) || e.target.closest('button')) return;
    this.root.classList.add('qt-done');
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen() || isBrowserChord(e)) return;
    e.stopImmediatePropagation();
    if (e.code === 'Escape') return this.leave();
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') return this.skip(e);
    const index = KEY_DIGITS.indexOf(e.code);
    if (index >= 0) this.pickKey(index);
  }

  private onLastPage(view: QuestView): boolean {
    return this.page === pagesOf(view.lines).length - 1;
  }

  private pickKey(index: number): void {
    const view = questView(this.host.world(), QUESTS);
    if (!this.onLastPage(view)) return;
    if (view.ended) return this.leave();
    if (index < view.choices.length) this.choose(index);
  }

  private skip(e: KeyboardEvent): void {
    e.preventDefault();
    const revealing = !this.root.classList.contains('qt-done') && performance.now() < this.revealEnd;
    if (revealing) this.root.classList.add('qt-done');
    else if (!this.onLastPage(questView(this.host.world(), QUESTS))) this.nextPage();
  }
}
