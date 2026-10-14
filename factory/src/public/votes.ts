import { moveCard } from '../card-events';
import { readCommittee, telegramIds } from '../committee';
import { VOTING_LABEL, type Ctx } from '../types';
import { isolated } from './isolate';
import type { Proposal, PublicStore } from './store';

type Verdict = { reason: string; reply: string };

export async function countVotes(ctx: Ctx, store: PublicStore): Promise<void> {
  const emoji = ctx.cfg.voteEmoji.split(/\s+/).filter((item) => item !== '');
  const { home, committeeBootstrapTelegram: telegram, committeeBootstrapGithub: github } = ctx.cfg;
  const committee = telegramIds(readCommittee(home, { telegram, github }));
  for (const proposal of store.openProposals()) {
    const verdict = verdictOf(ctx, store, proposal.issue, emoji, committee);
    if (verdict === null) continue;
    store.closeProposal(proposal.issue, ctx.now());
    await isolated(ctx, proposal.issue, `the proposal passed ${verdict.reason} but the card did not move, so move it to design by hand`, () => pass(ctx, proposal, verdict.reply));
  }
}

function verdictOf(ctx: Ctx, store: PublicStore, issue: number, emoji: string[], committee: string[]): Verdict | null {
  if (store.positiveVoters(issue, emoji).some((voter) => committee.includes(voter))) {
    return { reason: 'by a committee vote', reply: 'A committee member accepted this proposal. The factory starts work on it now.' };
  }
  const votes = store.votes(issue, emoji);
  if (votes < ctx.cfg.minVotes) return null;
  return { reason: `with ${votes} votes`, reply: `This proposal got ${votes} votes. The factory starts work on it now.` };
}

async function pass(ctx: Ctx, proposal: Proposal, reply: string): Promise<void> {
  await ctx.github.removeLabel(proposal.issue, VOTING_LABEL);
  await moveCard(ctx, proposal.issue, 'Design', 'voted');
  await ctx.telegram.sendMessage(proposal.chat!, reply, proposal.messageId);
}
