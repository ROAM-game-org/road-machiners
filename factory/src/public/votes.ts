import { moveCard } from '../card-events';
import { VOTING_LABEL, type Ctx } from '../types';
import { isolated } from './isolate';
import type { Proposal, PublicStore } from './store';

export async function countVotes(ctx: Ctx, store: PublicStore): Promise<void> {
  const emoji = ctx.cfg.voteEmoji.split(/\s+/).filter((item) => item !== '');
  for (const proposal of store.openProposals()) {
    const votes = store.votes(proposal.issue, emoji);
    if (votes < ctx.cfg.minVotes) continue;
    store.closeProposal(proposal.issue, ctx.now());
    await isolated(ctx, proposal.issue, `the proposal passed with ${votes} votes but the card did not move, so move it to design by hand`, () => pass(ctx, proposal, votes));
  }
}

async function pass(ctx: Ctx, proposal: Proposal, votes: number): Promise<void> {
  await ctx.github.removeLabel(proposal.issue, VOTING_LABEL);
  await moveCard(ctx, proposal.issue, 'Design', 'voted');
  await ctx.telegram.sendMessage(proposal.chat!, `This proposal got ${votes} votes. The factory starts work on it now.`, proposal.messageId);
}
