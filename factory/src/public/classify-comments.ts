import type { Ctx } from '../types';
import type { Classify } from './decision';
import type { PublicStore } from './store';

export async function classifyComments(ctx: Ctx, store: PublicStore, classify: Classify): Promise<void> {
  for (const comment of store.unclassifiedComments()) {
    const decision = await classify({ source: 'comment', text: comment.text, kind: null });
    store.classify(comment.id, decision.verdict === 'reject' ? 'rejected' : decision.kind, decision.route, ctx.now());
  }
}
