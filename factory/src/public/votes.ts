import { moveCard } from '../card-events';
import { VOTING_LABEL, type Ctx } from '../types';
import type { PublicStore } from './store';

export async function countVotes(ctx: Ctx, store: PublicStore): Promise<void> {
  const emoji = ctx.cfg.voteEmoji.split(/\s+/).filter((item) => item !== '');
  for (const proposal of store.openProposals()) {
    const votes = store.votes(proposal.issue, emoji);
    if (votes < ctx.cfg.minVotes) continue;
    await ctx.github.removeLabel(proposal.issue, VOTING_LABEL);
    await moveCard(ctx, proposal.issue, 'Design', 'voted');
    store.markPassed(proposal.issue, ctx.now());
    await ctx.telegram.sendMessage(proposal.chat!, `This proposal got ${votes} votes. The factory starts work on it now.`, proposal.messageId);
  }
}
