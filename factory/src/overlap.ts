import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { readState, updateState } from './state';
import { BRANCH, HOTFIX_LABEL, RELEASE_LABEL, type BranchCommit, type Card, type Ctx, type FactoryState, type OverlapState } from './types';

export const OVERLAP_FILE = 'overlap-pending';
export const OVERLAP_BRANCHES = ['main', 'dev'] as const;
export type OverlapBranch = (typeof OVERLAP_BRANCHES)[number];
export type OverlapHeads = Record<OverlapBranch, string>;
export type MergedCommit = BranchCommit & { branch: OverlapBranch };
export type CardWork = { issue: number; title: string; files: string[] };
export type Nomination = { issue: number; commit: string; branch: OverlapBranch; why: string; key: string };

const COMMITS_PER_BRANCH = 50;
const FILES_SHOWN = 3;
const HOUR_MS = 3_600_000;
const NOISE = [/(^|\/)\.factory(-tasks|-media)?\//, /(^|\/)docs\/tasks\//, /(^|\/)package-lock\.json$/];

const isWork = (file: string): boolean => !NOISE.some((pattern) => pattern.test(file));
const shortHash = (hash: string): string => hash.slice(0, 7);
const issuesNamed = (subject: string): number[] => [...subject.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));

export function comparableTitle(text: string): string {
  return text.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

function subjectTitle(subject: string): string {
  const named = subject.match(/#\d+:\s*(.*)$/);
  return named === null ? '' : comparableTitle(named[1]);
}

export function overlapCandidates(state: FactoryState, cards: Card[]): Card[] {
  const approved = (card: Card): boolean => String(card.issue) in state.approvedResolving || String(card.issue) in state.pendingApprovals;
  return cards.filter((card) => card.column !== 'Done' && !card.labels.includes(RELEASE_LABEL) && !approved(card));
}

function reason(work: CardWork, commit: MergedCommit): string | null {
  const merged = new Set(commit.files.filter(isWork));
  const shared = work.files.filter((file) => isWork(file) && merged.has(file));
  if (shared.length > 0) return `shares ${shared.slice(0, FILES_SHOWN).join(', ')}${shared.length > FILES_SHOWN ? ` and ${shared.length - FILES_SHOWN} more` : ''}`;
  const title = subjectTitle(commit.subject);
  return title !== '' && title === comparableTitle(work.title) ? 'has the same title' : null;
}

export function nominate(works: CardWork[], commits: MergedCommit[]): Nomination[] {
  return works.flatMap((work) =>
    commits.flatMap((commit) => {
      if (issuesNamed(commit.subject).includes(work.issue)) return [];
      const why = reason(work, commit);
      if (why === null) return [];
      const key = `${work.issue}:${shortHash(commit.hash)}`;
      return [{ issue: work.issue, commit: shortHash(commit.hash), branch: commit.branch, why, key }];
    }),
  );
}

export function overlapLine(item: Nomination): string {
  return `overlap #${item.issue} with ${item.commit} on ${item.branch}: ${item.why}`;
}

export type OverlapDue = 'baseline' | 'wait' | 'unchanged' | 'scan';

export function overlapWaits(overlap: OverlapState, now: Date, hours: number): boolean {
  return overlap.at !== null && now.getTime() - new Date(overlap.at).getTime() < hours * HOUR_MS;
}

export function overlapDue(overlap: OverlapState, heads: OverlapHeads, now: Date, hours: number): OverlapDue {
  if (overlap.at === null || overlap.main === null || overlap.dev === null) return 'baseline';
  if (overlapWaits(overlap, now, hours)) return 'wait';
  return OVERLAP_BRANCHES.every((branch) => overlap[branch] === heads[branch]) ? 'unchanged' : 'scan';
}

async function mergedSince(ctx: Ctx, overlap: OverlapState, heads: OverlapHeads): Promise<MergedCommit[]> {
  const commits: MergedCommit[] = [];
  for (const branch of OVERLAP_BRANCHES) {
    const from = overlap[branch];
    if (from === null || from === heads[branch]) continue;
    for (const commit of await ctx.repo.newCommits(from, branch, COMMITS_PER_BRANCH)) commits.push({ ...commit, branch });
  }
  return commits;
}

async function branchFiles(ctx: Ctx, card: Card): Promise<string[]> {
  try {
    await ctx.repo.headHash(BRANCH(card.issue));
  } catch {
    return [];
  }
  return ctx.repo.changedFiles(card.labels.includes(HOTFIX_LABEL) ? 'main' : 'dev', BRANCH(card.issue));
}

async function cardWork(ctx: Ctx, card: Card): Promise<CardWork> {
  const { title } = await ctx.github.issue(card.issue);
  return { issue: card.issue, title, files: await branchFiles(ctx, card) };
}

async function nominations(ctx: Ctx, state: FactoryState, cards: Card[], heads: OverlapHeads): Promise<Nomination[]> {
  const commits = await mergedSince(ctx, state.overlap, heads);
  if (commits.length === 0) return [];
  const works: CardWork[] = [];
  for (const card of overlapCandidates(state, cards)) works.push(await cardWork(ctx, card));
  return nominate(works, commits);
}

async function readHeads(ctx: Ctx): Promise<OverlapHeads> {
  return { main: await ctx.repo.headHash('main'), dev: await ctx.repo.headHash('dev') };
}

function errorLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0];
}

function keptKeys(reported: string[], cards: Card[], fresh: Nomination[]): string[] {
  const open = new Set(cards.filter((card) => card.column !== 'Done').map((card) => String(card.issue)));
  return [...reported.filter((key) => open.has(key.split(':')[0])), ...fresh.map((item) => item.key)];
}

export async function checkOverlaps(ctx: Ctx, cards: Card[]): Promise<void> {
  try {
    const state = readState(ctx.statePath);
    if (overlapWaits(state.overlap, ctx.now(), ctx.cfg.overlapCheckHours)) return;
    const heads = await readHeads(ctx);
    const due = overlapDue(state.overlap, heads, ctx.now(), ctx.cfg.overlapCheckHours);
    if (due === 'wait') return;
    const found = due === 'scan' ? await nominations(ctx, state, cards, heads) : [];
    const fresh = found.filter((item) => !state.overlap.reported.includes(item.key));
    if (fresh.length > 0) appendFileSync(join(ctx.cfg.home, OVERLAP_FILE), fresh.map((item) => `${overlapLine(item)}\n`).join(''));
    updateState(ctx.statePath, (current) => ({
      ...current,
      overlap: { at: ctx.now().toISOString(), ...heads, reported: keptKeys(current.overlap.reported, cards, fresh), error: null },
    }));
    ctx.log('tick', null, `overlap check (${due}) of main ${heads.main} and dev ${heads.dev}: ${fresh.length} new of ${found.length} found`);
  } catch (error) {
    const message = errorLine(error);
    ctx.log('tick', null, `overlap check failed, its heads stay for the next tick: ${message}`);
    updateState(ctx.statePath, (current) => ({ ...current, overlap: { ...current.overlap, error: message } }));
  }
}

export async function previewOverlaps(ctx: Ctx, cards: Card[]): Promise<string[]> {
  await ctx.repo.fetch();
  const state = readState(ctx.statePath);
  const heads = await readHeads(ctx);
  if (state.overlap.main === null || state.overlap.dev === null) return [`No overlap check ran yet. The first one records main ${heads.main} and dev ${heads.dev} and nominates nothing.`];
  const found = await nominations(ctx, state, cards, heads);
  const head = `Commits since main ${state.overlap.main} and dev ${state.overlap.dev}, to main ${heads.main} and dev ${heads.dev}. Nothing is written.`;
  return [head, ...found.map((item) => `${overlapLine(item)}${state.overlap.reported.includes(item.key) ? ' [reported]' : ''}`)];
}
