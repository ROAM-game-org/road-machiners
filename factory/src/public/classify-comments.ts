import type { Card, Column, Ctx } from '../types';
import { TransientFilterError, type Classify, type Decision, type FilterInput, type PublicFilter } from './decision';
import { isolated } from './isolate';
import type { Judged, KnownWork, PublicStore, StoredComment } from './store';
import { rankByWords } from './wiki';

const WORK_CANDIDATES = 6;

const OPEN_COLUMNS: Column[] = ['Triage', 'Design', 'Implementation', 'Testing', 'Approval', 'Hardening', 'Merging'];

const openWork = (card: Card): KnownWork[] => (OPEN_COLUMNS.includes(card.column) && card.title ? [{ issue: card.issue, text: card.title }] : []);

async function boardWork(ctx: Ctx): Promise<KnownWork[]> {
  try {
    return (await ctx.github.cards()).flatMap(openWork);
  } catch (error) {
    ctx.log('public', null, `the filter matches player comments without the board, which could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function withBoard(stored: KnownWork[], board: KnownWork[]): KnownWork[] {
  const known = new Set(stored.map((work) => work.issue));
  return [...stored, ...board.filter((work) => !known.has(work.issue))];
}

export async function classifyComments(ctx: Ctx, store: PublicStore, filter: PublicFilter): Promise<void> {
  const comments = store.unclassifiedComments(ctx.cfg.filterPerTick);
  if (comments.length === 0) return;
  const board = await boardWork(ctx);
  for (const comment of comments) {
    store.classify(comment.id, 'rejected', 'none', ctx.now());
    if (overLimit(ctx, store, comment)) {
      ctx.log('public', comment.issue, `player comment ${comment.id} is over the hourly limit of its sender, so it stays rejected`);
      continue;
    }
    await isolated(ctx, comment.issue, `the filter failed on player comment ${comment.id}, so it stays rejected`, () => classifyOrRetry(ctx, store, filter.classify, comment, board));
  }
}

const FILTER_ATTEMPTS = 3;

async function classifyOrRetry(ctx: Ctx, store: PublicStore, classify: Classify, comment: StoredComment, board: KnownWork[]): Promise<void> {
  try {
    await classifyOne(ctx, store, classify, comment, board);
  } catch (error) {
    if (!(error instanceof TransientFilterError) || comment.filterAttempts + 1 >= FILTER_ATTEMPTS) throw error;
    store.classifyLater(comment.id);
    if (comment.source === 'telegram' && comment.sender !== null) store.returnHit(`telegram:${comment.sender}`, ctx.now(), ctx.cfg.reportIpPerHour);
    ctx.log('public', comment.issue, `the filter failed for now on player comment ${comment.id}, so the next tick tries it again: ${error.message}`);
  }
}

function overLimit(ctx: Ctx, store: PublicStore, comment: StoredComment): boolean {
  if (comment.source !== 'telegram' || comment.sender === null) return false;
  return !store.takeHit(`telegram:${comment.sender}`, ctx.now(), ctx.cfg.reportIpPerHour).taken;
}

function candidateWork(store: PublicStore, comment: StoredComment, board: KnownWork[]): KnownWork[] {
  const known = withBoard(store.knownWork(), board).filter((work) => work.issue !== comment.issue);
  const ranked = rankByWords(known.map((work) => work.text), `${comment.text} ${comment.context ?? ''}`, WORK_CANDIDATES).map((index) => known[index]!);
  const newest = known.filter((work) => !ranked.includes(work)).sort((a, b) => b.issue - a.issue);
  return [...ranked, ...newest].slice(0, WORK_CANDIDATES);
}

function filterInput(store: PublicStore, comment: StoredComment, work: KnownWork[]): FilterInput {
  const judged = { text: comment.text, context: comment.context, work: work.map((known) => `#${known.issue} ${known.text}`), addressed: comment.addressed };
  if (comment.issue === null) return { source: 'message', ...judged };
  return { source: 'comment', parent: store.parentPitch(comment.issue), ...judged };
}

const keepsWork = (decision: Decision): boolean => decision.verdict === 'accept' && decision.kind !== 'chatter';

function pickedWork(decision: Decision, work: KnownWork[]): number | null {
  if (!keepsWork(decision) || decision.work === undefined) return null;
  return work[decision.work]?.issue ?? null;
}

const judgedOf = (decision: Decision, work: KnownWork[]): Judged => ({ workIssue: pickedWork(decision, work), language: decision.language ?? null, wantsFiling: decision.filing === true });

async function classifyOne(ctx: Ctx, store: PublicStore, classify: Classify, comment: StoredComment, board: KnownWork[]): Promise<void> {
  const work = candidateWork(store, comment, board);
  const decision = await classify(filterInput(store, comment, work));
  const kind = decision.verdict === 'reject' ? 'rejected' : decision.kind;
  store.classify(comment.id, kind, decision.route, ctx.now(), decision.relevance, judgedOf(decision, work));
}
