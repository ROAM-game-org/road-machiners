
import { CONFIG } from '../config';
import { QUEST_ART } from '../data/quest-art';
import { TERM_IDS, type TermId } from '../data/locals';
import { verbatim } from '../text/msg';
import { termText } from '../text/names';
import { el, uiRoot } from './dom';
import { uiSize, type LayerRect } from './ui-size';

export type Mark = { name: string; value: string | null };
export type Span = { text: string; marks: Mark[]; pauses: number };
export type Reveal = 'all' | 'word' | 'char';
export type Speed = 'slow' | 'normal' | 'fast';
export type LineStyle = { reveal: Reveal; speed: Speed; img: string | null; speaker: string | null; place: string | null; flags: string[] };
export type Unit = { text: string; marks: Mark[]; delayMs: number };
export type TermRun = { term: string | null; units: Unit[] };

type MarkDef = { values: readonly string[] | null };
type TagDef = { kind: 'value'; values: readonly string[] | null } | { kind: 'art' } | { kind: 'flag' };

export const QUEST_COLORS = ['rust', 'sand', 'blood', 'sky', 'ash'] as const;
export const ROW_CELL = ';';

export const MARKS: Record<string, MarkDef> = {
  b: { values: null },
  i: { values: null },
  shake: { values: null },
  pop: { values: null },
  now: { values: null },
  color: { values: QUEST_COLORS },
  term: { values: TERM_IDS },
};

const REVEALS: readonly Reveal[] = ['all', 'word', 'char'];
const SPEEDS: Record<Speed, number> = { slow: 2, normal: 1, fast: 0.5 };

export const LINE_TAGS: Record<string, TagDef> = {
  reveal: { kind: 'value', values: REVEALS },
  speed: { kind: 'value', values: Object.keys(SPEEDS) },
  img: { kind: 'art' },
  speaker: { kind: 'value', values: null },
  place: { kind: 'value', values: null },
  work_offer: { kind: 'flag' },
  page: { kind: 'flag' },
  row: { kind: 'flag' },
  head: { kind: 'flag' },
};

export const PLAIN_STYLE: LineStyle = { reveal: 'all', speed: 'normal', img: null, speaker: null, place: null, flags: [] };

const PAUSE = 'pause';
const TAG = /<(\/?)([a-z_]+)(?:=([a-z0-9_-]+))?>/g;

export function parseMarkup(text: string): Span[] {
  const spans: Span[] = [];
  const open: Mark[] = [];
  let last = 0;
  let pauses = 0;
  const take = (chunk: string): void => {
    if (chunk === '') return;
    spans.push({ text: chunk, marks: [...open], pauses });
    pauses = 0;
  };
  for (const m of text.matchAll(TAG)) {
    take(text.slice(last, m.index));
    pauses += applyTag(open, m, text);
    last = m.index + m[0].length;
  }
  take(text.slice(last));
  if (open.length > 0) throw new Error(`Markup <${open[open.length - 1].name}> is never closed in "${text}"`);
  if (pauses > 0) throw new Error(`Markup <${PAUSE}> has no text after it in "${text}"`);
  return spans;
}

function applyTag(open: Mark[], tag: RegExpMatchArray, text: string): number {
  const [, closing, name, value] = tag;
  if (closing) closeMark(open, name, text);
  else if (name === PAUSE) return pauseMark(value ?? null, text);
  else open.push(openMark(name, value ?? null, text));
  return 0;
}

function pauseMark(value: string | null, text: string): number {
  if (value !== null) throw new Error(`Markup <${PAUSE}> takes no value in "${text}"`);
  return 1;
}

export function plainText(text: string): string {
  return parseMarkup(text).map((s) => s.text).join('');
}

function openMark(name: string, value: string | null, text: string): Mark {
  const def = MARKS[name];
  if (!def) throw new Error(`Unknown markup <${name}> in "${text}". Known: ${Object.keys(MARKS).join(', ')}`);
  if (def.values === null) {
    if (value !== null) throw new Error(`Markup <${name}> takes no value in "${text}"`);
  } else if (!fitsValues(value, def.values)) throw new Error(`Markup <${name}=${value ?? ''}> needs one of ${def.values.join(', ')} in "${text}"`);
  return { name, value };
}

function fitsValues(value: string | null, values: readonly string[]): boolean {
  return value !== null && values.includes(value);
}

function closeMark(open: Mark[], name: string, text: string): void {
  const top = open.pop();
  if (top?.name !== name) throw new Error(`Markup </${name}> closes ${top ? `<${top.name}>` : 'nothing'} in "${text}"`);
}

export function lineStyle(tags: readonly string[]): LineStyle {
  return tags.reduce<LineStyle>((style, tag) => withTag(style, tag), { ...PLAIN_STYLE, flags: [] });
}

function withTag(style: LineStyle, tag: string): LineStyle {
  const [key, ...rest] = tag.split(':');
  const value = rest.join(':').trim();
  const def = LINE_TAGS[key.trim()];
  if (!def) throw new Error(`Unknown line tag # ${tag}. Known: ${Object.keys(LINE_TAGS).join(', ')}`);
  if (def.kind === 'flag') return { ...style, flags: [...style.flags, key.trim()] };
  checkTagValue(tag, value, def.kind === 'art' ? Object.keys(QUEST_ART) : def.values);
  return { ...style, [key.trim()]: value };
}

function checkTagValue(tag: string, value: string, allowed: readonly string[] | null): void {
  if (allowed !== null && !allowed.includes(value)) throw new Error(`Line tag # ${tag} needs one of ${allowed.join(', ') || 'nothing yet'}`);
}

export function markupProblems(text: string, tags: readonly string[]): string[] {
  return [() => parseMarkup(text), () => lineStyle(tags)].flatMap((check) => {
    try {
      check();
      return [];
    } catch (err) {
      return [err instanceof Error ? err.message : String(err)];
    }
  });
}

export function rowCells(text: string): string[] {
  return text.split(ROW_CELL).map((cell) => cell.trim());
}

export function revealUnits(spans: readonly Span[], style: LineStyle, startMs: number): Unit[] {
  const step = style.reveal === 'all' ? 0 : (style.reveal === 'char' ? CONFIG.questCharMs : CONFIG.questWordMs) * SPEEDS[style.speed];
  let at = startMs;
  return spans.flatMap((span) => {
    at += span.pauses * CONFIG.questPauseMs;
    const now = span.marks.some((m) => m.name === 'now');
    return splitUnits(span.text, now ? 'all' : style.reveal).map((text) => {
      const unit = { text, marks: span.marks, delayMs: at };
      at += step;
      return unit;
    });
  });
}

function splitUnits(text: string, reveal: Reveal): string[] {
  if (reveal === 'all') return [text];
  if (reveal === 'char') return [...text];
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export function renderLine(text: string, tags: readonly string[], startMs: number): { el: HTMLElement; endMs: number } {
  const style = lineStyle(tags);
  const units = revealUnits(parseMarkup(text), style, startMs);
  const line = el('div', { class: `qt-line qt-reveal-${style.reveal}` });
  for (const run of termRuns(units)) {
    const holder = run.term === null ? line : termElement(run.term);
    holder.append(...run.units.map(unitElement));
    if (holder !== line) line.append(holder);
  }
  const endMs = units.length > 0 ? units[units.length - 1].delayMs + (style.reveal === 'all' ? CONFIG.questLineMs : CONFIG.questWordMs) : startMs;
  return { el: line, endMs };
}

export function termRuns(units: readonly Unit[]): TermRun[] {
  const runs: TermRun[] = [];
  for (const unit of units) {
    const term = termOf(unit);
    const last = runs.at(-1);
    if (term !== null && last?.term === term) last.units.push(unit);
    else runs.push({ term, units: [unit] });
  }
  return runs;
}

function termOf(unit: Unit): string | null {
  return unit.marks.find((m) => m.name === 'term')?.value ?? null;
}

function termElement(id: string): HTMLElement {
  return el('span', { class: 'qt-term', 'data-term': id, tabindex: '0' });
}

function termId(id: string): TermId {
  const term = TERM_IDS.find((t) => t === id);
  if (term === undefined) throw new Error(`No term "${id}" in TERM_IDS`);
  return term;
}

function unitElement(unit: Unit): HTMLElement {
  const classes = ['qt-unit', ...unit.marks.filter((m) => m.name !== 'term').map((m) => (m.value === null ? `qt-${m.name}` : `qt-${m.name}-${m.value}`))];
  return el('span', { class: classes.join(' '), style: `animation-delay: ${unit.delayMs}ms` }, verbatim(unit.text));
}


export class TermTip {
  private tip = el('div', { class: 'tooltip term-tip', role: 'tooltip' });

  constructor(source: HTMLElement) {
    this.tip.style.display = 'none';
    uiRoot().append(this.tip);
    source.addEventListener('pointerover', (e) => this.follow(e.target));
    source.addEventListener('focusin', (e) => this.follow(e.target));
    source.addEventListener('pointerout', (e) => this.leave(e.relatedTarget));
    source.addEventListener('focusout', (e) => this.leave(e.relatedTarget));
  }

  hide(): void {
    this.tip.style.display = 'none';
  }

  private follow(target: EventTarget | null): void {
    const term = termAt(target);
    if (term) this.show(term);
  }

  private leave(next: EventTarget | null): void {
    if (!termAt(next)) this.hide();
  }

  private show(term: HTMLElement): void {
    const id = term.dataset.term;
    if (id === undefined) throw new Error('A term element has no data-term');
    this.tip.replaceChildren(el('span', {}, termText(termId(id))));
    this.tip.style.display = '';
    this.place(uiSize().layerRect(term));
  }

  private place(anchor: LayerRect): void {
    const width = this.tip.offsetWidth;
    const layer = uiSize().layerSize();
    const left = Math.min(Math.max(anchor.left, 0), layer.width - width);
    const below = anchor.bottom + this.tip.offsetHeight <= layer.height;
    this.tip.style.left = `${left}px`;
    this.tip.style.top = below ? `${anchor.bottom}px` : `${anchor.top - this.tip.offsetHeight}px`;
  }
}

function termAt(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('.qt-term') : null;
}
