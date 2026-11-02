
import { questArtUrl } from '../data/quest-art';
import { townWork } from '../sim/dialogue-rules';
import { skillLevel } from '../sim/progress';
import type { QuestView } from '../sim/quests';
import type { QuestLine, World } from '../sim/types';
import { t, verbatim } from '../text/msg';
import { skillName } from '../text/names';
import { el } from './dom';
import { contractSummary, contractWindow } from './format';
import { lineStyle, renderLine, rowCells, type LineStyle, type Reveal } from './quest-text';
import { moneyMsg } from './units';

export type Drawn = { nodes: HTMLElement[]; endMs: number };
type Options = { inlineArt: boolean; offers: boolean; reveal: Reveal };

export function pagesOf(lines: readonly QuestLine[]): QuestLine[][] {
  const pages: QuestLine[][] = [[]];
  for (const line of lines) {
    if (lineStyle(line.tags).flags.includes('page') && pages[pages.length - 1].length > 0) pages.push([]);
    pages[pages.length - 1].push(line);
  }
  return pages;
}

export function paragraphsOf(lines: readonly QuestLine[]): QuestLine[][] {
  const paragraphs: QuestLine[][] = [];
  for (const line of lines) {
    const last = paragraphs.at(-1);
    if (last && rowKind(line) !== null && rowKind(last[last.length - 1]) !== null) last.push(line);
    else paragraphs.push([line]);
  }
  return paragraphs;
}

export function lastTagged(lines: readonly QuestLine[], key: 'img' | 'place'): string | null {
  return lines.reduce<string | null>((found, line) => lineStyle(line.tags)[key] ?? found, null);
}

export function drawLines(w: World, lines: readonly QuestLine[], startMs: number, options: Options): Drawn {
  const nodes: HTMLElement[] = [];
  let at = startMs;
  for (const line of lines) {
    const head = rowKind(line);
    if (head === null) at = drawLine(nodes, w, line, at, options);
    else tableAt(nodes, at).append(tableRow(line.text, head));
  }
  return { nodes, endMs: at };
}

function rowKind(line: QuestLine): boolean | null {
  const flags = lineStyle(line.tags).flags;
  if (flags.includes('head')) return true;
  return flags.includes('row') ? false : null;
}

function tableAt(nodes: HTMLElement[], atMs: number): HTMLElement {
  const last = nodes[nodes.length - 1];
  if (last?.tagName === 'TABLE') return last;
  const table = el('table', { class: 'qt-table qt-unit', style: `animation-delay: ${atMs}ms` });
  nodes.push(table);
  return table;
}

function tableRow(text: string, head: boolean): HTMLElement {
  return el('tr', {}, ...rowCells(text).map((cell) => el(head ? 'th' : 'td', {}, verbatim(cell))));
}

function revealOf(style: LineStyle, options: Options): Reveal {
  return style.speaker ? 'word' : options.reveal;
}

function drawLine(nodes: HTMLElement[], w: World, line: QuestLine, atMs: number, options: Options): number {
  const style = lineStyle(line.tags);
  if (style.img && options.inlineArt) nodes.push(el('img', { class: 'qt-img qt-unit', src: questArtUrl(style.img), 'aria-hidden': 'true', style: `animation-delay: ${atMs}ms` }));
  const drawn = renderLine(line.text, [`reveal:${revealOf(style, options)}`, ...line.tags], atMs);
  if (style.speaker) drawn.el.prepend(el('b', { class: 'qt-speaker' }, t('quest.speaker', { name: verbatim(style.speaker) })));
  nodes.push(drawn.el);
  if (options.offers && style.flags.includes('work_offer')) nodes.push(offerCard(w, drawn.endMs));
  return drawn.endMs;
}

function offerCard(w: World, atMs: number): HTMLElement {
  const offer = townWork(w);
  if (!offer) throw new Error('A work offer line showed with no work on the board');
  return el('div', { class: 'talk-offer qt-unit', style: `animation-delay: ${atMs}ms` }, t('quest.offer', { summary: contractSummary(offer), pay: moneyMsg(offer.reward), window: contractWindow(offer) }));
}

export function choiceButtons(w: World, view: QuestView, pick: (index: number) => void): HTMLElement[] {
  return view.choices.map((text, i) => {
    const locked = view.locked[i];
    const held = locked ? el('span', { class: 'quest-held' }, moneyMsg(w.player.money)) : null;
    const check = view.checks[i];
    const tested = check ? el('span', { class: 'quest-check' }, t('quest.check', { skill: skillName(check.skill), level: check.level, have: skillLevel(w, check.skill) })) : null;
    return el('button', { class: view.seen[i] ? 'quest-choice seen' : 'quest-choice', 'data-choice': String(i), disabled: locked, onclick: () => pick(i) }, tested, t('quest.choice', { n: i + 1, text: verbatim(text) }), held);
  });
}
