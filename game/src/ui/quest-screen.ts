
import { localOfQuest } from '../sim/dialogue-rules';
import { chooseQuestOption, leaveQuest, QUESTS, questView, type QuestView } from '../sim/quests';
import type { QuestLine, QuestLive, World } from '../sim/types';
import { createIcon } from './cards';
import { localName, localRole } from '../text/names';
import { t, verbatim, type Msg } from '../text/msg';
import { el, isBrowserChord, panel } from './dom';
import { commandFailure } from './format';
import { AssetUnreachable, fetchAsset } from '../fetch-asset';
import { questArt, questArtUrl } from '../data/quest-art';
import type { UiHost } from './host';
import { choiceButtons, drawLines, lastTagged, pagesOf, paragraphsOf, type Drawn } from './quest-lines';
import { renderLine, TermTip, type Reveal } from './quest-text';
import { MONEY_STAT } from '../data/quests';
import { UNITS } from '../data/units';
import { token } from './tokens';
import { uiSize } from './ui-size';

const KEY_DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

export function askOf(shown: QuestLive | null, live: QuestLive, ask: string | null): string | null {
  return shown?.quest === live.quest ? ask : null;
}

export function questPageStacks(width: number, frame: number): boolean {
  const gutters = parseFloat(token('--space-10')) * 2;
  const columns = parseFloat(token('--quest-text-min')) + parseFloat(token('--quest-side-width'));
  return width - gutters - frame - columns < parseFloat(token('--quest-art-min'));
}

function moneyChange(cents: number): Msg {
  const amount = Math.round(Math.abs(cents) / UNITS.centsPerM);
  return cents > 0 ? t('quest.moneyGained', { amount }) : t('quest.moneyPaid', { amount });
}

function statRow(stat: QuestView['stats'][number], change: number, cents: number): HTMLElement {
  const delta = change === 0 ? null : el('span', { class: change > 0 ? 'quest-delta good' : 'quest-delta bad' }, moneyChange(change));
  const value = stat.name === MONEY_STAT ? t('call.money', { amount: Math.floor(cents / UNITS.centsPerM) }) : verbatim(stat.value);
  const label = stat.name === MONEY_STAT ? null : el('span', {}, verbatim(stat.label));
  return el('div', { class: change === 0 ? 'quest-stat' : 'quest-stat new' }, label, el('b', {}, delta, value));
}

class QuestArtStage {
  private images = new Map<string, HTMLImageElement>();
  private shown: string | null = null;
  private shownAt = 0;

  frame(art: readonly string[], key: string | null): HTMLElement {
    this.hold(art);
    if (key !== this.shown) this.shownAt = performance.now();
    this.shown = key;
    const img = key === null ? null : this.image(key);
    if (img) img.style.animationDelay = `${this.shownAt - performance.now()}ms`;
    return el('div', { class: 'quest-frame' }, img);
  }

  clear(): void {
    this.hold([]);
    this.shown = null;
  }

  private image(key: string): HTMLImageElement {
    const img = this.images.get(key);
    if (!img) throw new Error(`Quest art ${key} is not held`);
    return img;
  }

  private hold(keys: readonly string[]): void {
    for (const [key, img] of this.images) {
      if (keys.includes(key)) continue;
      img.onerror = null;
      if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
      img.removeAttribute('src');
      this.images.delete(key);
    }
    for (const key of keys) if (!this.images.has(key)) this.images.set(key, loadArt(key, (img) => this.images.get(key) === img));
  }
}

export function loadArt(key: string, isHeld: (img: HTMLImageElement) => boolean = () => true): HTMLImageElement {
  const focus = `${questArt(key).focusX}% 50%`;
  const img = document.createElement('img');
  img.decoding = 'sync';
  img.setAttribute('aria-hidden', 'true');
  img.style.objectPosition = focus;
  img.style.transformOrigin = focus;
  img.onerror = () => {
    img.style.visibility = 'hidden';
  };
  void showArt(img, key, isHeld);
  return img;
}

async function showArt(img: HTMLImageElement, key: string, isHeld: (img: HTMLImageElement) => boolean): Promise<void> {
  let bytes: ArrayBuffer;
  try {
    bytes = await fetchAsset('Quest art', questArtUrl(key));
  } catch (e) {
    if (!(e instanceof AssetUnreachable)) throw e;
    img.hidden = true;
    console.warn(`${e.label} ${e.url} did not arrive after ${e.attempts} attempts`);
    return;
  }
  if (!isHeld(img)) return;
  img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
  await img.decode().catch(() => undefined);
}

export class QuestScreen {
  private root = panel('modal');
  private shown: QuestLive | null = null;
  private asked: string | null = null;
  private lastAsk: string | null = null;
  private error: Msg | null = null;
  private page = 0;
  private paragraph = 0;
  private artBefore: string | null = null;
  private placeBefore: string | null = null;
  private factsBefore: Set<string> | null = null;
  private factsShown: string[] = [];
  private moneyBefore: number | null = null;
  private moneyShown: number | null = null;
  private revealEnd = 0;
  private termTip = new TermTip(this.root);
  private artStage = new QuestArtStage();

  constructor(private host: UiHost) {
    this.root.classList.add('quest-screen');
    this.root.style.display = 'none';
    this.root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('resize', () => this.restack());
    uiSize().subscribe(() => this.restack());
  }

  private restack(): void {
    const width = uiSize().layerSize().width;
    if (!(width > 0)) return;
    const style = getComputedStyle(this.root);
    const frame = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    this.root.classList.toggle('stacked', this.root.classList.contains('quest-page') && questPageStacks(width, frame));
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
    this.paragraph = 0;
    this.draw();
  }

  jump(picks: readonly number[], page: number): void {
    for (const index of picks) {
      this.render();
      this.choose(index);
      if (this.error) throw new Error(`Quest jump pick ${index + 1} failed: ${String(this.error)}`);
    }
    this.render();
    const pages = pagesOf(questView(this.host.world(), QUESTS).lines).length;
    if (page >= pages) throw new Error(`Quest jump page ${page + 1} is past the last page ${pages}`);
    this.page = page;
    this.paragraph = 0;
    this.draw();
  }

  private carry(live: QuestLive): void {
    const shown = this.shown;
    if (shown?.quest !== live.quest || this.asked === null) return this.forget();
    const before = shown.lines;
    this.artBefore = lastTagged(before, 'img') ?? this.artBefore;
    this.placeBefore = lastTagged(before, 'place') ?? this.placeBefore;
    this.factsBefore = new Set(this.factsShown);
    this.moneyBefore = this.moneyShown;
  }

  private forget(): void {
    this.artBefore = null;
    this.placeBefore = null;
    this.factsBefore = null;
    this.moneyBefore = null;
  }

  private hide(): void {
    this.shown = null;
    this.lastAsk = null;
    this.error = null;
    this.root.style.display = 'none';
    this.root.replaceChildren();
    this.termTip.hide();
    this.artStage.clear();
  }

  private draw(): void {
    this.termTip.hide();
    const w = this.host.world();
    const view = questView(w, QUESTS);
    this.root.style.display = '';
    this.root.classList.remove('qt-done');
    this.root.classList.toggle('quest-page', view.view === 'page');
    this.restack();
    const endMs = view.view === 'page' ? this.drawPage(w, view) : this.drawTalk(w, view);
    this.revealEnd = performance.now() + endMs;
  }

  private drawTalk(w: World, view: QuestView): number {
    this.artStage.clear();
    const drawn = this.drawParagraphs(w, pagesOf(view.lines)[this.page], true);
    const ask = this.page === 0 && this.lastAsk !== null ? el('div', { class: 'talk-ask' }, verbatim(this.lastAsk)) : null;
    const text = el('div', { class: 'quest-talk' }, ask, ...drawn.nodes);
    this.root.replaceChildren(this.head(view.quest), text, this.pageEnd(w, view, drawn.endMs), this.errorLine());
    return drawn.endMs;
  }

  private drawParagraphs(w: World, lines: readonly QuestLine[], talk: boolean): Drawn {
    const inlineArt = talk;
    const reveal: Reveal = talk ? 'word' : 'all';
    const paragraphs = paragraphsOf(lines);
    const read = drawLines(w, paragraphs.slice(0, this.paragraph).flat(), 0, { inlineArt, offers: true, reveal });
    for (const node of read.nodes) node.classList.add('qt-done');
    const fresh = drawLines(w, paragraphs[this.paragraph] ?? [], 0, { inlineArt, offers: true, reveal });
    return { nodes: [...read.nodes, ...fresh.nodes], endMs: fresh.endMs };
  }

  private drawPage(w: World, view: QuestView): number {
    const pages = pagesOf(view.lines);
    const shown = [...pages.slice(0, this.page).flat(), ...paragraphsOf(pages[this.page]).slice(0, this.paragraph + 1).flat()];
    const drawn = this.drawParagraphs(w, pages[this.page], false);
    const place = lastTagged(shown, 'place') ?? this.placeBefore ?? view.scene.place;
    const text = el('div', { class: 'quest-text' }, place ? el('h2', { class: 'quest-place' }, verbatim(place)) : null, ...drawn.nodes, this.pageEnd(w, view, drawn.endMs), this.errorLine());
    this.root.replaceChildren(this.art(view.quest, lastTagged(shown, 'img') ?? this.artBefore ?? view.scene.img), text, this.side(w, view));
    return drawn.endMs;
  }

  private art(quest: string, key: string | null): HTMLElement {
    return el('div', { class: 'quest-art' }, this.artStage.frame(QUESTS.quests[quest].art, key));
  }

  private side(w: World, view: QuestView): HTMLElement {
    const gained = this.moneyBefore === null ? 0 : w.player.money - this.moneyBefore;
    this.moneyShown = w.player.money;
    const stats = view.stats.map((s) => statRow(s, s.name === MONEY_STAT ? gained : 0, w.player.money));
    this.factsShown = view.facts;
    const facts = view.facts.map((f) => el('div', { class: this.factsBefore === null || this.factsBefore.has(f) ? 'quest-fact' : 'quest-fact new' }, renderLine(f, ['reveal:all'], 0).el));
    return el('div', { class: 'quest-side' }, el('div', { class: 'quest-stats' }, ...stats), el('div', { class: 'quest-facts' }, ...facts));
  }

  private head(quest: string): HTMLElement {
    const local = localOfQuest(quest);
    return el('div', { class: 'talk-head' }, createIcon('driver'), local ? el('b', {}, localName(local.id)) : null, local ? el('span', { class: 'dim' }, localRole(local.id)) : null);
  }

  private errorLine(): HTMLElement {
    return el('div', { class: 'error' }, this.error);
  }

  private pageEnd(w: World, view: QuestView, atMs: number): HTMLElement {
    if (this.onLastPage(view) && this.onLastParagraph(view)) return this.choices(w, view, atMs);
    return el('button', { class: 'quest-next qt-unit', style: `animation-delay: ${atMs}ms`, onclick: () => this.advance() }, t('quest.next'));
  }

  private onLastParagraph(view: QuestView): boolean {
    return this.paragraph >= paragraphsOf(pagesOf(view.lines)[this.page]).length - 1;
  }

  private advance(): void {
    const view = questView(this.host.world(), QUESTS);
    if (!this.onLastParagraph(view)) {
      this.paragraph += 1;
      return this.draw();
    }
    if (!this.onLastPage(view)) this.nextPage();
  }

  private choices(w: World, view: QuestView, atMs: number): HTMLElement {
    const buttons = view.ended ? [el('button', { class: 'quest-choice', onclick: () => this.leave() }, t('quest.leave'))] : choiceButtons(w, view, (i) => this.choose(i));
    return el('div', { class: 'quest-choices qt-unit', style: `animation-delay: ${atMs}ms` }, ...buttons);
  }

  private nextPage(): void {
    this.page += 1;
    this.paragraph = 0;
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
    if (this.revealing()) return this.root.classList.add('qt-done');
    this.advance();
  }

  private revealing(): boolean {
    return !this.root.classList.contains('qt-done') && performance.now() < this.revealEnd;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen() || isBrowserChord(e)) return;
    e.stopImmediatePropagation();
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') return this.skip(e);
    const index = KEY_DIGITS.indexOf(e.code);
    if (index >= 0) this.pickKey(index);
  }

  private onLastPage(view: QuestView): boolean {
    return this.page === pagesOf(view.lines).length - 1;
  }

  private pickKey(index: number): void {
    const view = questView(this.host.world(), QUESTS);
    if (!this.onLastPage(view) || !this.onLastParagraph(view)) return;
    if (view.ended) return this.leave();
    if (index < view.choices.length) this.choose(index);
  }

  private skip(e: KeyboardEvent): void {
    e.preventDefault();
    if (this.revealing()) return this.root.classList.add('qt-done');
    const view = questView(this.host.world(), QUESTS);
    if (!this.onLastPage(view) || !this.onLastParagraph(view)) return this.advance();
    if (!view.ended && view.choices.length === 1) this.choose(0);
  }
}
