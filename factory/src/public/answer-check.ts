import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectType, imageSize, MAX_BYTES, validSize } from '../media';
import { MESSAGE_LIMIT } from '../telegram-limits';
import { OUT_DIR, type AlbumPhoto, type FactoryConfig } from '../types';
import type { ReplyLanguage } from './decision';

export const ANSWER_FILE = 'answer.json';
export const ANSWER_IMAGES = 'answer-images';
export const TEXT_LIMIT = 3000;
export const CAPTION_LIMIT = 200;
export const IMAGE_LIMIT = 4;

export type AnswerKind = 'answer' | 'clarify';
export type RefBranch = 'main' | 'dev';
export type FindRef = (kind: 'commit' | 'file', ref: string) => Promise<RefBranch | null>;
export type AnswerChecks = { clone: string; dir: string; repo: string; publicUrl: string; secrets: string[]; language: ReplyLanguage | null; findRef: FindRef; issueExists: (issue: number) => Promise<boolean> };
export type CheckedAnswer = { kind: AnswerKind; message: string; images: AlbumPhoto[] };

type RawSource = { type?: unknown; ref?: unknown };
type RawImage = { file?: unknown; caption?: unknown };
type RawAnswer = { kind?: unknown; text?: unknown; sources?: unknown; images?: unknown };

const SOURCES_HEADING: Record<ReplyLanguage, string> = { en: 'Sources:', ru: 'Источники:' };
const ISSUE_REF = /^#?([1-9]\d{0,6})$/;
const COMMIT_REF = /^[0-9a-f]{7,40}$/i;
const PATH_PART = /^[A-Za-z0-9_@+-][A-Za-z0-9._@+-]*$/;
const IMAGE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const SCHEME_LINK = /[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi;
const BARE_LINK = /(?<![\w.-])(?:www\.\S+|t\.me\/\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|ru|su|online|xyz|info|app|gg|co|link|site|top|ly|to|cc|рф)(?![\w-]))/giu;
const TRAILING = /[.,;:!?)\]}'"»]+$/;
const TOKEN_SHAPES = [/\b(?:sk-ant-|sk-|sk_|ghp_|gho_|ghs_|ghu_|github_pat_|AIza)[A-Za-z0-9_-]{8,}/, /\bxox[a-z]-[A-Za-z0-9-]{8,}/, /\b\d{8,10}:[A-Za-z0-9_-]{30,}/];
const LONG_RUN = /[A-Za-z0-9+/=_-]{40,}/g;

export function configSecrets(cfg: Pick<FactoryConfig, 'oauthToken' | 'elevenlabsKey' | 'geminiKey' | 'telegramToken' | 'openaiKey' | 'butlerKey'>): string[] {
  const values = [cfg.oauthToken, cfg.elevenlabsKey, cfg.geminiKey, cfg.telegramToken, cfg.openaiKey, cfg.butlerKey];
  return values.filter((value): value is string => typeof value === 'string' && value.trim() !== '').map((value) => value.trim());
}

function plainPath(root: string, parts: string[], what: string): string {
  let path = root;
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat === undefined) throw new Error(`The answer agent wrote no ${parts.slice(1, index + 1).join('/')}, so ${what} is missing.`);
    const plain = index === parts.length - 1 ? stat.isFile() : stat.isDirectory();
    if (stat.isSymbolicLink() || !plain) throw new Error(`The answer agent left ${parts.slice(0, index + 1).join('/')} as a link or an odd file, so ${what} is not read.`);
  }
  return path;
}

function readRaw(checks: AnswerChecks): RawAnswer {
  const path = plainPath(checks.clone, [checks.dir, OUT_DIR, ANSWER_FILE], `${OUT_DIR}/${ANSWER_FILE}`);
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error(`${ANSWER_FILE} is not an object.`);
  return data as RawAnswer;
}

function kindOf(raw: RawAnswer): AnswerKind {
  if (raw.kind !== 'answer' && raw.kind !== 'clarify') throw new Error(`${ANSWER_FILE} needs kind answer or clarify.`);
  return raw.kind;
}

function textOf(raw: RawAnswer): string {
  if (typeof raw.text !== 'string' || raw.text.trim() === '') throw new Error(`${ANSWER_FILE} needs a non-empty text.`);
  const text = raw.text.trim();
  if (text.length > TEXT_LIMIT) throw new Error(`The answer text has ${text.length} characters, over the ${TEXT_LIMIT} limit.`);
  return text;
}

function listOf<T>(value: unknown, name: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${ANSWER_FILE} needs ${name} as a list.`);
  return value as T[];
}

const githubBase = (repo: string): string => `https://github.com/${repo}`;

async function issueLink(checks: AnswerChecks, ref: string): Promise<string> {
  const match = ISSUE_REF.exec(ref);
  if (match === null || !(await checks.issueExists(Number(match[1])))) throw new Error(`An issue source is not an issue of ${checks.repo}.`);
  return `${githubBase(checks.repo)}/issues/${match[1]}`;
}

async function commitLink(checks: AnswerChecks, ref: string): Promise<string> {
  const sha = ref.toLowerCase();
  if (!COMMIT_REF.test(sha) || (await checks.findRef('commit', sha)) === null) throw new Error('A commit source is on neither origin/main nor origin/dev.');
  return `${githubBase(checks.repo)}/commit/${sha}`;
}

const isRepoPath = (path: string): boolean => path.split('/').every((part) => PATH_PART.test(part) && !/^\.+$/.test(part));

async function fileLink(checks: AnswerChecks, ref: string): Promise<string> {
  const branch = isRepoPath(ref) ? await checks.findRef('file', ref) : null;
  if (branch === null) throw new Error('A file source is tracked on neither origin/main nor origin/dev.');
  return `${githubBase(checks.repo)}/blob/${branch}/${ref}`;
}

const SOURCE_LINKS: Record<string, (checks: AnswerChecks, ref: string) => Promise<string>> = { issue: issueLink, commit: commitLink, file: fileLink };

async function sourceLink(checks: AnswerChecks, source: RawSource): Promise<string> {
  const link = typeof source?.type === 'string' ? SOURCE_LINKS[source.type] : undefined;
  if (link === undefined || typeof source.ref !== 'string') throw new Error('Each source needs a type of issue, commit or file and a ref.');
  return link(checks, source.ref.trim());
}

async function sourceLinks(checks: AnswerChecks, raw: RawAnswer, kind: AnswerKind): Promise<string[]> {
  const sources = listOf<RawSource>(raw.sources, 'sources');
  if (kind === 'answer' && sources.length === 0) throw new Error('An answer needs at least one source.');
  const links: string[] = [];
  for (const source of sources) links.push(await sourceLink(checks, source));
  return [...new Set(links)];
}

function allowedLink(checks: AnswerChecks, link: string): boolean {
  const repo = githubBase(checks.repo);
  if (link === repo || link.startsWith(`${repo}/`)) return true;
  const origin = new URL(checks.publicUrl).origin;
  return link === origin || link.startsWith(`${origin}/`);
}

function checkLinks(checks: AnswerChecks, text: string, where: string): void {
  const links = [...text.matchAll(SCHEME_LINK)].map((match) => match[0].replace(TRAILING, ''));
  const rest = links.filter((link) => allowedLink(checks, link)).reduce((left, link) => left.replace(link, ' '), text);
  if ([...rest.matchAll(SCHEME_LINK)].length > 0 || [...rest.matchAll(BARE_LINK)].length > 0) throw new Error(`The ${where} has a link that is neither ${checks.repo} on GitHub nor the public game.`);
}

const isCommitSha = (run: string): boolean => /^[0-9a-f]{40}$/i.test(run);
const looksRandom = (run: string): boolean => /\d/.test(run) && /[a-z]/.test(run) && /[A-Z]/.test(run);

function checkSecrets(checks: AnswerChecks, text: string, where: string): void {
  if (checks.secrets.some((secret) => text.includes(secret))) throw new Error(`The ${where} holds a configured secret.`);
  if (TOKEN_SHAPES.some((shape) => shape.test(text))) throw new Error(`The ${where} holds a token-shaped string.`);
  const runs = [...text.matchAll(LONG_RUN)].map((match) => match[0]);
  if (runs.some((run) => !isCommitSha(run) && looksRandom(run))) throw new Error(`The ${where} holds a long token-shaped string.`);
}

function checkPublic(checks: AnswerChecks, text: string, where: string): void {
  checkLinks(checks, text, where);
  checkSecrets(checks, text, where);
}

const isImageName = (name: unknown): name is string => typeof name === 'string' && IMAGE_NAME.test(name) && !/^\.+$/.test(name);

function checkImageBytes(data: Buffer, name: string): void {
  const type = detectType(data);
  if (type !== 'png' && type !== 'jpeg') throw new Error(`The image ${name} is not a PNG or JPEG file.`);
  if (data.length > MAX_BYTES || !validSize(imageSize(data, type))) throw new Error(`The image ${name} is over ${MAX_BYTES} bytes or does not decode.`);
}

function imageFile(checks: AnswerChecks, name: unknown): string {
  if (!isImageName(name)) throw new Error('An image name is not a plain file name in the answer image folder.');
  const path = plainPath(checks.clone, [checks.dir, OUT_DIR, ANSWER_IMAGES, name], `the image ${name}`);
  checkImageBytes(readFileSync(path), name);
  return path;
}

function captionOf(checks: AnswerChecks, caption: unknown): string {
  if (typeof caption !== 'string') throw new Error('Each image needs a caption, empty or not.');
  if (caption.length > CAPTION_LIMIT) throw new Error(`An image caption has ${caption.length} characters, over the ${CAPTION_LIMIT} limit.`);
  checkPublic(checks, caption, 'image caption');
  return caption.trim();
}

function imagesOf(checks: AnswerChecks, raw: RawAnswer): AlbumPhoto[] {
  const images = listOf<RawImage>(raw.images, 'images');
  if (images.length > IMAGE_LIMIT) throw new Error(`The answer has ${images.length} images, at most ${IMAGE_LIMIT} go out.`);
  if (new Set(images.map((item) => item?.file)).size !== images.length) throw new Error('The answer names one image twice.');
  return images.map((item) => ({ path: imageFile(checks, item?.file), caption: captionOf(checks, item?.caption) }));
}

function render(checks: AnswerChecks, text: string, links: string[]): string {
  const message = links.length === 0 ? text : `${text}\n\n${SOURCES_HEADING[checks.language ?? 'en']}\n${links.join('\n')}`;
  if (message.length > MESSAGE_LIMIT) throw new Error(`The answer with its sources has ${message.length} characters, over the Telegram limit of ${MESSAGE_LIMIT}.`);
  return message;
}

export async function checkAnswer(checks: AnswerChecks): Promise<CheckedAnswer> {
  const raw = readRaw(checks);
  const kind = kindOf(raw);
  const text = textOf(raw);
  checkPublic(checks, text, 'answer text');
  const links = await sourceLinks(checks, raw, kind);
  return { kind, message: render(checks, text, links), images: imagesOf(checks, raw) };
}
