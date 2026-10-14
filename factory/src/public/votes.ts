import { moveCard } from '../card-events';
import { readCommittee, telegramIds } from '../committee';
import { VOTING_LABEL, WONT_DO_LABEL, type Ctx } from '../types';
import { isolated } from './isolate';
import { ACCEPTED_BY_COMMITTEE, CLOSED_CONCLUSION, REJECTED_BY_COMMITTEE, proposalText, voteCount } from './proposals';
import type { Proposal, PublicStore } from './store';

type Outcome = { kind: 'accept' | 'reject'; reason: string; conclusion: string };

const emojiOf = (list: string): string[] => list.split(/\s+/).filter((item) => item !== '');

export async function countVotes(ctx: Ctx, store: PublicStore): Promise<void> {
  const { home, committeeBootstrapTelegram: telegram, committeeBootstrapGithub: github } = ctx.cfg;
  const committee = telegramIds(readCommittee(home, { telegram, github }));
  for (const proposal of store.openProposals()) {
    const votes = store.votes(proposal.issue, emojiOf(ctx.cfg.voteEmoji));
    const outcome = outcomeOf(ctx, store, proposal.issue, votes, committee);
    if (outcome === null) {
      await showCount(ctx, store, proposal, votes);
      continue;
    }
    store.closeProposal(proposal.issue, ctx.now());
    store.setShownVotes(proposal.issue, votes);
    await isolated(ctx, proposal.issue, `the proposal was ${outcome.kind}ed ${outcome.reason} but the card did not move, so move it by hand`, () => conclude(ctx, proposal, votes, outcome));
  }
}

function outcomeOf(ctx: Ctx, store: PublicStore, issue: number, votes: number, committee: string[]): Outcome | null {
  const byCommittee = (emoji: string): boolean => store.votersWith(issue, emojiOf(emoji)).some((voter) => committee.includes(voter));
  if (byCommittee(ctx.cfg.vetoEmoji)) return { kind: 'reject', reason: 'by a committee vote', conclusion: REJECTED_BY_COMMITTEE };
  if (byCommittee(ctx.cfg.voteEmoji)) return { kind: 'accept', reason: 'by a committee vote', conclusion: ACCEPTED_BY_COMMITTEE };
  if (votes >= ctx.cfg.minVotes) return { kind: 'accept', reason: `with ${votes} votes`, conclusion: `✅ Accepted with ${votes} votes` };
  return null;
}

async function showCount(ctx: Ctx, store: PublicStore, proposal: Proposal, votes: number): Promise<void> {
  if (store.shownVotes(proposal.issue) === votes) return;
  store.setShownVotes(proposal.issue, votes);
  await isolated(ctx, proposal.issue, 'the vote count on the proposal post did not update', () => editPost(ctx, proposal, voteCount(ctx, votes)));
}

async function conclude(ctx: Ctx, proposal: Proposal, votes: number, outcome: Outcome): Promise<void> {
  if (!(await stillVoting(ctx, proposal.issue))) {
    ctx.log('public', proposal.issue, 'the issue is closed, lost its voting label or left Triage, so its proposal closes without a card change');
    await editPost(ctx, proposal, `${voteCount(ctx, votes)}\n${CLOSED_CONCLUSION}`);
    return;
  }
  if (outcome.kind === 'accept') await moveCard(ctx, proposal.issue, 'Design', 'voted');
  else await reject(ctx, proposal.issue);
  await ctx.github.removeLabel(proposal.issue, VOTING_LABEL);
  await editPost(ctx, proposal, `${voteCount(ctx, votes)}\n${outcome.conclusion}`);
}

async function stillVoting(ctx: Ctx, issue: number): Promise<boolean> {
  const item = await ctx.github.issue(issue);
  if (item.state !== 'OPEN' || !item.labels.includes(VOTING_LABEL)) return false;
  const card = (await ctx.github.cards()).find((candidate) => candidate.issue === issue);
  return card?.column === 'Triage';
}

async function reject(ctx: Ctx, issue: number): Promise<void> {
  await ctx.github.comment(issue, 'A committee member rejected this proposal in the player chat.');
  await ctx.github.addLabel(issue, WONT_DO_LABEL);
  await ctx.github.close(issue, 'not planned');
  await moveCard(ctx, issue, 'Done', 'denied');
}

const editPost = (ctx: Ctx, proposal: Proposal, footer: string): Promise<void> =>
  ctx.telegram.editText(proposal.chat!, proposal.messageId!, proposalText(ctx, proposal.issue, proposal.pitch, footer));
