import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Passage = { page: string; title: string; heading: string; anchor: string; text: string };
export type PickPassage = (question: string, candidates: string[]) => Promise<number | null>;
export type Ground = (question: string) => Promise<Passage | null>;

const WIKI_ROOT = 'game/docs/wiki';
export const WIKI_DIR = fileURLToPath(new URL(`../../../${WIKI_ROOT}`, import.meta.url));

const CANDIDATES = 8;
const BM25_K = 1.2;
const BM25_B = 0.75;
const PICK_CHARS = 600;
const MIN_WORD = 3;
const STOP_WORDS = new Set('the and for are but not you your can how what when where why who whom which does did has have had was were will would should could with this that these those there here from into about any all get got its our out than then them they their also just like some such very much many more most only own same too off yes'.split(' '));

const GENERATED = /<!-- wiki:([\w-]+) -->[\s\S]*?<!-- \/wiki:\1 -->/g;
const FENCE = /^```[\s\S]*?^```/gm;
const NUMBER_ROW = /^\| `([^`]+)` \| (.+?) \|$/gm;
const LIST_ITEM = /^\s*(?:[-*]|\d+\.)\s/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;

function pagesOf(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.md')).map((path) => path.split(sep).join('/')).sort();
}

function numbersOf(markdown: string): Map<string, string> {
  const block = /<!-- wiki:numbers -->([\s\S]*?)<!-- \/wiki:numbers -->/.exec(markdown)?.[1] ?? '';
  return new Map([...block.matchAll(NUMBER_ROW)].map((row) => [row[1]!, row[2]!.trim()]));
}

const anchorOf = (heading: string): string => heading.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');

function itemsOf(lines: string[]): string[][] {
  const items: string[][] = [];
  for (const line of lines) {
    if (LIST_ITEM.test(line) || items.length === 0) items.push([line.replace(LIST_ITEM, '')]);
    else items.at(-1)!.push(line);
  }
  return items;
}

function plain(lines: string[], numbers: Map<string, string>): string {
  return lines.map((line) => line.trim()).join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, (_code, name: string) => numbers.get(name) ?? name)
    .replace(/\*\*|__/g, '')
    .trim();
}

type Block = { level: string | null; heading: string | null; lines: string[] };

function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = [{ level: null, heading: null, lines: [] }];
  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading !== null) blocks.push({ level: heading[1]!, heading: heading[2]!, lines: [] });
    else if (line.trim() === '') blocks.push({ ...blocks.at(-1)!, lines: [] });
    else blocks.at(-1)!.lines.push(line);
  }
  return blocks;
}

const isProse = (block: Block): boolean => block.lines.length > 0 && !block.lines.some((line) => line.trimStart().startsWith('|'));

function sectionOf(block: Block, title: string): { heading: string; anchor: string } {
  if (block.heading === null || block.level === '#') return { heading: block.heading ?? title, anchor: '' };
  return { heading: block.heading, anchor: anchorOf(block.heading) };
}

function pagePassages(page: string, markdown: string): Passage[] {
  const numbers = numbersOf(markdown);
  const lines = markdown.replace(GENERATED, '').replace(FENCE, '').split('\n').filter((line) => !line.trimStart().startsWith('<!--'));
  const blocks = blocksOf(lines);
  const title = blocks.find((block) => block.level === '#')?.heading ?? page.replace(/\.md$/, '');
  const passages = blocks.filter(isProse).flatMap((block) => itemsOf(block.lines).map((item) => ({ page, title, ...sectionOf(block, title), text: plain(item, numbers) })));
  return passages.filter((passage) => passage.text !== '');
}

export function readWiki(dir: string): Passage[] {
  return pagesOf(dir).flatMap((page) => pagePassages(page, readFileSync(join(dir, page), 'utf8')));
}

function wordsOf(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((word) => word.length >= MIN_WORD && !STOP_WORDS.has(word));
  return kept.map((word) => (word.length > MIN_WORD + 1 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
}

function counted(words: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

export function rankByWords(texts: string[], query: string, limit: number): number[] {
  const docs = texts.map(wordsOf);
  const counts = docs.map(counted);
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length);
  const asked = [...new Set(wordsOf(query))];
  const weight = new Map(asked.map((word) => {
    const spread = counts.filter((count) => count.has(word)).length;
    return [word, Math.log(1 + (texts.length - spread + 0.5) / (spread + 0.5))];
  }));
  const score = (index: number): number => asked.reduce((sum, word) => {
    const often = counts[index]!.get(word) ?? 0;
    return sum + (weight.get(word)! * often * (BM25_K + 1)) / (often + BM25_K * (1 - BM25_B + (BM25_B * docs[index]!.length) / average));
  }, 0);
  const scored = texts.map((_text, index) => ({ index, score: score(index) }));
  return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.index);
}

export function searchWiki(passages: Passage[], question: string, limit: number): Passage[] {
  return rankByWords(passages.map((passage) => `${passage.title} ${passage.heading} ${passage.text}`), question, limit).map((index) => passages[index]!);
}

export function excerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(...['. ', '? ', '! ', '.\n'].map((mark) => cut.lastIndexOf(mark)));
  return end > max / 3 ? `${cut.slice(0, end + 1)} …` : `${cut.trimEnd()}…`;
}

export const passageLabel = (passage: Passage): string => (passage.heading === passage.title ? passage.title : `${passage.title}, ${passage.heading}`);

export function groundWith(pick: PickPassage, dir: string = WIKI_DIR): Ground {
  return async (question) => {
    const passages = readWiki(dir);
    if (passages.length === 0) throw new Error(`The game wiki at ${dir} has no passages.`);
    const candidates = searchWiki(passages, question, CANDIDATES);
    if (candidates.length === 0) return null;
    const index = await pick(question, candidates.map((passage) => `${passageLabel(passage)}: ${excerpt(passage.text, PICK_CHARS)}`));
    return index === null ? null : (candidates[index] ?? null);
  };
}

const pageLink = (repo: string, page: string): string => `https://github.com/${repo}/blob/main/${WIKI_ROOT}/${page}`;

export const passageLink = (repo: string, passage: Passage): string => `${pageLink(repo, passage.page)}${passage.anchor === '' ? '' : `#${passage.anchor}`}`;

