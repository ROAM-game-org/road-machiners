import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Asked, FilterConfig, Ground, Grounded, ReplyLanguage } from './decision';
import { excerpt, passageLabel, readDocs, searchDocs, type Passage } from './wiki';

export type Composed = { answer: string; sources: number[] };
export type Compose = (asked: Asked, sources: string[]) => Promise<Composed>;

const ENDPOINT = 'https://api.openai.com/v1/responses';
const RULES = readFileSync(fileURLToPath(new URL('../../prompts/chat-answer.md', import.meta.url)), 'utf8').trim();
const CANDIDATES = 8;
const SOURCE_CHARS = 800;
const SCHEME = /[a-z][\w+.-]*:\/\//i;
const LINKABLE = /@\w+|[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.\p{L}{2,}\b/gu;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'sources'],
  properties: {
    answer: { type: 'string' },
    sources: { type: 'array', items: { type: 'integer' } },
  },
};

const sourceText = (passage: Passage): string => `${passage.page}, ${passageLabel(passage)}: ${excerpt(passage.text, SOURCE_CHARS)}`;

function cited(composed: Composed, candidates: Passage[]): Passage[] {
  const picked = [...new Set(composed.sources)].map((number) => candidates[number - 1]).filter((passage) => passage !== undefined);
  if (picked.length === 0) throw new Error(`The chat answer cites no offered source: ${JSON.stringify(composed.sources)}.`);
  return picked;
}

function unsourcedLinks(text: string, candidates: Passage[]): string[] {
  const sources = candidates.map(sourceText).join('\n').toLowerCase();
  return (text.match(LINKABLE) ?? []).filter((token) => !sources.includes(token.toLowerCase()));
}

function checked(composed: Composed, candidates: Passage[]): Grounded | null {
  const text = composed.answer.trim();
  if (text === '') return null;
  if (SCHEME.test(text)) throw new Error('The chat answer holds a link, so it is not sent.');
  const unsourced = unsourcedLinks(text, candidates);
  if (unsourced.length > 0) throw new Error(`The chat answer holds a link or handle no offered source has, so it is not sent: ${unsourced.join(', ')}.`);
  return { text, passages: cited(composed, candidates) };
}

export function groundWith(compose: Compose, dir: string): Ground {
  return async (asked) => {
    const passages = readDocs(dir);
    if (passages.length === 0) throw new Error(`The game docs at ${dir} have no passages.`);
    const candidates = searchDocs(passages, `${asked.text} ${asked.context ?? ''}`, CANDIDATES);
    if (candidates.length === 0) return null;
    return checked(await compose(asked, candidates.map(sourceText)), candidates);
  };
}

const languageName = (language: ReplyLanguage | null): string => (language === 'ru' ? 'Russian' : 'English');

function inputText(asked: Asked, sources: string[]): string {
  const numbered = sources.map((source, index) => `[${index + 1}] ${source}`).join('\n\n');
  const replying = asked.context ? `Replying to: ${asked.context}\n\n` : '';
  return `Sources:\n${numbered}\n\nReply language: ${languageName(asked.language)}\n\n${replying}Player question: ${asked.text}`;
}

type Content = { type?: unknown; text?: unknown; refusal?: unknown };

function outputText(body: unknown): string {
  const output = (body as { output?: unknown } | null)?.output;
  if (!Array.isArray(output)) throw new Error('The chat answer response has no output.');
  const contents = output.flatMap((item: { content?: unknown }) => (Array.isArray(item.content) ? (item.content as Content[]) : []));
  const refusal = contents.find((content) => content.type === 'refusal');
  if (refusal !== undefined) throw new Error(`The chat answer model refused: ${String(refusal.refusal)}.`);
  const text = contents.find((content) => content.type === 'output_text')?.text;
  if (typeof text !== 'string') throw new Error('The chat answer response has no text.');
  return text;
}

function composedOf(text: string): Composed {
  const parsed = JSON.parse(text) as { answer?: unknown; sources?: unknown };
  const sources = Array.isArray(parsed.sources) ? parsed.sources.filter((source): source is number => Number.isInteger(source)) : [];
  if (typeof parsed.answer !== 'string') throw new Error('The chat answer has no answer field.');
  return { answer: parsed.answer, sources };
}

export function composeWith(cfg: FilterConfig, fetch: typeof globalThis.fetch): Compose {
  return async (asked, sources) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(cfg.filterTimeoutSeconds * 1000),
      headers: { authorization: `Bearer ${cfg.openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.filterModel, instructions: RULES, input: inputText(asked, sources), text: { format: { type: 'json_schema', name: 'chat_answer', strict: true, schema: SCHEMA } } }),
    });
    if (response.status !== 200) throw new Error(`The chat answer call failed with status ${response.status}.`);
    return composedOf(outputText(await response.json()));
  };
}
