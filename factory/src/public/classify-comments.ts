import type { Ctx } from '../types';
import type { Classify } from './decision';
import { isolated } from './isolate';
import type { PublicStore, StoredComment } from './store';

export async function classifyComments(ctx: Ctx, store: PublicStore, classify: Classify): Promise<void> {
  for (const comment of store.unclassifiedComments()) {
    store.classify(comment.id, 'rejected', 'none', ctx.now());
    await isolated(ctx, comment.issue, `the filter failed on player comment ${comment.id}, so it stays rejected`, () => classifyOne(ctx, store, classify, comment));
  }
}

async function classifyOne(ctx: Ctx, store: PublicStore, classify: Classify, comment: StoredComment): Promise<void> {
  const decision = await classify({ source: 'comment', text: comment.text, kind: null });
  store.classify(comment.id, decision.verdict === 'reject' ? 'rejected' : decision.kind, decision.route, ctx.now());
}
