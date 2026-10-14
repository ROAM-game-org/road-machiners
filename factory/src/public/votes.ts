import { moveCard } from '../card-events';
import { readCommittee, telegramIds } from '../committee';
import { VOTING_LABEL, WONT_DO_LABEL, type Ctx } from '../types';
import { isolated } from './isolate';
import { netScore, proposalText, signed, voteFooter, voteSides, type VoteSides } from './proposals';
import type { Proposal, PublicStore, Tally } from './store';

type Outcome = { kind: 'accept' | 'reject'; reason: string; conclusion: string };

export async function countVotes(ctx: Ctx, store: PublicStore): Promise<void> {
  const { home, committeeBootstrapTelegram: telegram, committeeBootstrapGithub: github } = ctx.cfg;
  const committee = telegramIds(readCommittee(home, { telegram, github }));
  const sides = voteSides(ctx);
  for (const proposal of store.openProposals()) {
    const tally = store.tally(proposal.issue, sides.up, sides.down);
    const footer = voteFooter(ctx, tally);
    const outcome = outcomeOf(ctx, store, proposal.issue, tally, committee, sides);
    if (outcome === null) {
      await showFooter(ctx, store, proposal, footer);
      continue;
    }
    const final = `${footer}\n${outcome.conclusion}`;
    store.closeProposal(proposal.issue, ctx.now());
    store.setShownFooter(proposal.issue, final);
    await isolated(ctx, proposal.issue, `the proposal was ${outcome.kind}ed ${outcome.reason} but the card did not move, so move it by hand`, () => conclude(ctx, proposal, final, outcome));
  }
}

function outcomeOf(ctx: Ctx, store: PublicStore, issue: number, tally: Tally, committee: string[], sides: VoteSides): Outcome | null {
  const byCommittee = (emoji: string[]): boolean => store.votersWith(issue, emoji).some((voter) => committee.includes(voter));
  if (byCommittee(sides.down)) return { kind: 'reject', reason: 'by a committee vote', conclusion: '❌ Rejected by committee member' };
  if (byCommittee(sides.up)) return { kind: 'accept', reason: 'by a committee vote', conclusion: '✅ Accepted by committee member' };
  const score = netScore(tally);
  if (score >= ctx.cfg.minVotes) return { kind: 'accept', reason: `with a net score of ${signed(score)}`, conclusion: `✅ Accepted with net ${signed(score)}` };
  return null;
}

async function showFooter(ctx: Ctx, store: PublicStore, proposal: Proposal, footer: string): Promise<void> {
  if (store.shownFooter(proposal.issue) === footer) return;
  store.setShownFooter(proposal.issue, footer);
  await isolated(ctx, proposal.issue, 'the vote count on the proposal post did not update', () => editPost(ctx, proposal, footer));
}

async function conclude(ctx: Ctx, proposal: Proposal, footer: string, outcome: Outcome): Promise<void> {
  await ctx.github.removeLabel(proposal.issue, VOTING_LABEL);
  if (outcome.kind === 'accept') await moveCard(ctx, proposal.issue, 'Design', 'voted');
  else await reject(ctx, proposal.issue);
  await editPost(ctx, proposal, footer);
}

async function reject(ctx: Ctx, issue: number): Promise<void> {
  await ctx.github.comment(issue, 'A committee member rejected this proposal in the player chat.');
  await ctx.github.addLabel(issue, WONT_DO_LABEL);
  await ctx.github.close(issue, 'not planned');
  await moveCard(ctx, issue, 'Done', 'denied');
}

const editPost = (ctx: Ctx, proposal: Proposal, footer: string): Promise<void> =>
  ctx.telegram.editHtml(proposal.chat!, proposal.messageId!, proposalText(ctx, proposal.issue, proposal.pitch, footer));
