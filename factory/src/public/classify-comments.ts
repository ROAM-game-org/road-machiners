import type { Ctx } from '../types';
import type { Classify, FilterInput, PublicFilter } from './decision';
import { isolated } from './isolate';
import type { PublicStore, StoredComment } from './store';

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
  return store.countHit(`telegram:${comment.sender}`, ctx.now()) > ctx.cfg.reportIpPerHour;
}

function filterInput(store: PublicStore, comment: StoredComment): FilterInput {
  if (comment.issue === null) return { source: 'message', text: comment.text };
  return { source: 'comment', text: comment.text, parent: store.parentPitch(comment.issue) };
}

async function classifyOne(ctx: Ctx, store: PublicStore, classify: Classify, comment: StoredComment): Promise<void> {
  const decision = await classify(filterInput(store, comment));
  store.classify(comment.id, decision.verdict === 'reject' ? 'rejected' : decision.kind, decision.route, ctx.now(), decision.relevance);
}
