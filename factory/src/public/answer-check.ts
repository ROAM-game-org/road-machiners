import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../types';

export const ANSWER_FILE = 'answer.md';
export const TEXT_LIMIT = 3000;

export type AnswerChecks = { home: string; repo: string; publicUrl: string; secrets: string[] };

const SCHEME_LINK = /[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi;
const BARE_LINK = /(?<![\w.@-])(?:www\.\S+|t\.me\/\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|ru|su|online|xyz|info|app|gg|co|link|site|top|ly|to|cc|рф)(?![\w-]))/giu;
const TRAILING = /[.,;:!?)\]}'"»]+$/;
const TOKEN_SHAPES = [/\b(?:sk-ant-|sk-|sk_|ghp_|gho_|ghs_|ghu_|github_pat_|AIza)[A-Za-z0-9_-]{8,}/, /\bxox[a-z]-[A-Za-z0-9-]{8,}/, /\b\d{8,10}:[A-Za-z0-9_-]{30,}/];
const LONG_RUN = /[A-Za-z0-9+/=_-]{40,}/g;

function answerPath(home: string): string {
  const path = join(home, OUT_DIR, ANSWER_FILE);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) throw new Error(`The answer agent wrote no ${OUT_DIR}/${ANSWER_FILE}.`);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`The answer agent left ${OUT_DIR}/${ANSWER_FILE} as a link or an odd file, so it is not read.`);
  return path;
}

function textOf(home: string): string {
  const text = readFileSync(answerPath(home), 'utf8').trim();
  if (text === '') throw new Error(`The answer agent left ${OUT_DIR}/${ANSWER_FILE} empty.`);
  if (text.length > TEXT_LIMIT) throw new Error(`The answer has ${text.length} characters, over the ${TEXT_LIMIT} limit.`);
  return text;
}

const githubBase = (repo: string): string => `https://github.com/${repo}`;

function allowedLink(checks: AnswerChecks, link: string): boolean {
  const repo = githubBase(checks.repo);
  if (link === repo || link.startsWith(`${repo}/`)) return true;
  const origin = new URL(checks.publicUrl).origin;
  return link === origin || link.startsWith(`${origin}/`);
}

function withoutAllowedLinks(checks: AnswerChecks, text: string): string {
  const links = [...text.matchAll(SCHEME_LINK)].map((match) => match[0].replace(TRAILING, ''));
  const rest = links.filter((link) => allowedLink(checks, link)).reduce((left, link) => left.replace(link, ' '), text);
  if ([...rest.matchAll(SCHEME_LINK)].length > 0 || [...rest.matchAll(BARE_LINK)].length > 0) throw new Error(`The answer has a link that is neither ${checks.repo} on GitHub nor the public game.`);
  return rest;
}

const isCommitSha = (run: string): boolean => /^[0-9a-f]{40}$/i.test(run);
const looksRandom = (run: string): boolean => /\d/.test(run) && /[a-z]/.test(run) && /[A-Z]/.test(run);

function checkSecrets(checks: AnswerChecks, text: string, rest: string): void {
  if (checks.secrets.some((secret) => text.includes(secret))) throw new Error('The answer holds a configured secret.');
  if (TOKEN_SHAPES.some((shape) => shape.test(text))) throw new Error('The answer holds a token-shaped string.');
  const runs = [...rest.matchAll(LONG_RUN)].map((match) => match[0]);
  if (runs.some((run) => !isCommitSha(run) && looksRandom(run))) throw new Error('The answer holds a long token-shaped string.');
}

export function checkedAnswer(checks: AnswerChecks): string {
  const text = textOf(checks.home);
  checkSecrets(checks, text, withoutAllowedLinks(checks, text));
  return text;
}
