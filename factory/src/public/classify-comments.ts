import type { Ctx } from '../types';
import { FilterRefusalError, TransientFilterError, type Classify, type FilterInput, type PublicFilter } from './decision';
import { isolated } from './isolate';
import type { PublicStore, StoredComment } from './store';

const FILTER_ATTEMPTS = 3;

export async function classifyThreadComments(ctx: Ctx, store: PublicStore, filter: PublicFilter): Promise<void> {
  for (const comment of store.unclassifiedThreadComments(ctx.cfg.filterPerTick)) {
    store.classify(comment.id, 'rejected', 'none', ctx.now());
    if (overLimit(ctx, store, comment)) {
      ctx.log('public', comment.issue, `thread reply ${comment.id} is over the hourly limit of its sender, so it stays rejected`);
      continue;
    }
    await isolated(ctx, comment.issue, `the filter failed on thread reply ${comment.id}, so it stays rejected`, () => classifyOrRetry(ctx, store, filter.classify, comment));
  }
}

async function classifyOrRetry(ctx: Ctx, store: PublicStore, classify: Classify, comment: StoredComment): Promise<void> {
  try {
    await classifyOne(ctx, store, classify, comment);
  } catch (error) {
    if (error instanceof FilterRefusalError && error.junk) return keepJunkRejected(ctx, comment, error);
    retryLater(ctx, store, comment, error);
  }
}

function keepJunkRejected(ctx: Ctx, comment: StoredComment, error: FilterRefusalError): void {
  ctx.log('public', comment.issue, `the filter refused ${error.refused.join(', ')} on thread reply ${comment.id}, which it scores as junk, so it stays rejected`);
}

function retryLater(ctx: Ctx, store: PublicStore, comment: StoredComment, error: unknown): void {
  if (!(error instanceof TransientFilterError) || comment.filterAttempts + 1 >= FILTER_ATTEMPTS) throw error;
  store.classifyLater(comment.id);
  if (comment.sender !== null) store.returnHit(`telegram:${comment.sender}`, ctx.now(), ctx.cfg.reportIpPerHour);
  ctx.log('public', comment.issue, `the filter failed for now on thread reply ${comment.id}, so the next tick tries it again: ${error.message}`);
}

function overLimit(ctx: Ctx, store: PublicStore, comment: StoredComment): boolean {
  if (comment.sender === null) return false;
  return !store.takeHit(`telegram:${comment.sender}`, ctx.now(), ctx.cfg.reportIpPerHour).taken;
}

function filterInput(store: PublicStore, comment: StoredComment): FilterInput {
  const parent = comment.issue === null ? null : store.parentPitch(comment.issue);
  return { origin: 'chat', source: 'comment', parent, text: comment.text, context: comment.context };
}

async function classifyOne(ctx: Ctx, store: PublicStore, classify: Classify, comment: StoredComment): Promise<void> {
  const decision = await classify(filterInput(store, comment));
  const kind = decision.verdict === 'reject' ? 'rejected' : decision.kind;
  store.classify(comment.id, kind, 'none', ctx.now(), decision.relevance);
}
