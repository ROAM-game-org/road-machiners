import type { Ctx } from '../types';
import type { Classify, Decision, FilterInput, PublicFilter } from './decision';
import { isolated } from './isolate';
import type { Judged, KnownWork, PublicStore, StoredComment } from './store';
import { rankByWords } from './wiki';

const WORK_CANDIDATES = 6;

export async function classifyComments(ctx: Ctx, store: PublicStore, filter: PublicFilter): Promise<void> {
  for (const comment of store.unclassifiedComments(ctx.cfg.filterPerTick)) {
    store.classify(comment.id, 'rejected', 'none', ctx.now());
    if (overLimit(ctx, store, comment)) {
      ctx.log('public', comment.issue, `player comment ${comment.id} is over the hourly limit of its sender, so it stays rejected`);
      continue;
    }
    await isolated(ctx, comment.issue, `the filter failed on player comment ${comment.id}, so it stays rejected`, () => classifyOne(ctx, store, filter.classify, comment));
  }
}

function overLimit(ctx: Ctx, store: PublicStore, comment: StoredComment): boolean {
  if (comment.source !== 'telegram' || comment.sender === null) return false;
  return !store.takeHit(`telegram:${comment.sender}`, ctx.now(), ctx.cfg.reportIpPerHour).taken;
}

function candidateWork(store: PublicStore, comment: StoredComment): KnownWork[] {
  const known = store.knownWork().filter((work) => work.issue !== comment.issue);
  const ranked = rankByWords(known.map((work) => work.text), `${comment.text} ${comment.context ?? ''}`, WORK_CANDIDATES).map((index) => known[index]!);
  const newest = known.filter((work) => !ranked.includes(work)).sort((a, b) => b.issue - a.issue);
  return [...ranked, ...newest].slice(0, WORK_CANDIDATES);
}

function filterInput(store: PublicStore, comment: StoredComment, work: KnownWork[]): FilterInput {
  const judged = { text: comment.text, context: comment.context, work: work.map((known) => `#${known.issue} ${known.text}`) };
  if (comment.issue === null) return { source: 'message', ...judged };
  return { source: 'comment', parent: store.parentPitch(comment.issue), ...judged };
}

const keepsWork = (decision: Decision): boolean => decision.verdict === 'accept' && decision.kind !== 'chatter';

function pickedWork(decision: Decision, work: KnownWork[]): number | null {
  if (!keepsWork(decision) || decision.work === undefined) return null;
  return work[decision.work]?.issue ?? null;
}

const judgedOf = (decision: Decision, work: KnownWork[]): Judged => ({ workIssue: pickedWork(decision, work), language: decision.language ?? null });

async function classifyOne(ctx: Ctx, store: PublicStore, classify: Classify, comment: StoredComment): Promise<void> {
  const work = candidateWork(store, comment);
  const decision = await classify(filterInput(store, comment, work));
  const kind = decision.verdict === 'reject' ? 'rejected' : decision.kind;
  store.classify(comment.id, kind, decision.route, ctx.now(), decision.relevance, judgedOf(decision, work));
}
