import { moveCard } from '../card-events';
import { readCommittee, telegramIds } from '../committee';
import { queueIncidents } from '../stages/incident';
import { readState } from '../state';
import { VOTING_LABEL, WONT_DO_LABEL, type Card, type Ctx } from '../types';
import { isolated } from './isolate';
import { ACCEPTED_BY_COMMITTEE, acceptedWith, CLOSED_CONCLUSION, netScore, proposalText, REJECTED_BY_COMMITTEE, signed, voteFooter, voteSides, type VoteSides } from './proposals';
import { openStore, type Proposal, type PublicStore, type Tally } from './store';

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
    await isolated(ctx, proposal.issue, `the proposal was ${outcome.kind}ed ${outcome.reason} but the card did not move, so move it by hand`, () => conclude(ctx, proposal, footer, outcome));
  }
}

function outcomeOf(ctx: Ctx, store: PublicStore, issue: number, tally: Tally, committee: string[], sides: VoteSides): Outcome | null {
  const byCommittee = (emoji: string[]): boolean => store.votersWith(issue, emoji).some((voter) => committee.includes(voter));
  if (byCommittee(sides.down)) return { kind: 'reject', reason: 'by a committee vote', conclusion: REJECTED_BY_COMMITTEE };
  if (byCommittee(sides.up)) return { kind: 'accept', reason: 'by a committee vote', conclusion: ACCEPTED_BY_COMMITTEE };
  const score = netScore(tally);
  if (score >= ctx.cfg.minVotes) return { kind: 'accept', reason: `with a net score of ${signed(score)}`, conclusion: acceptedWith(score) };
  return null;
}

export async function reviveVotes(ctx: Ctx, cards: Card[]): Promise<void> {
  const running = new Set(readState(ctx.statePath).jobs.map((job) => job.issue));
  const voting = cards.filter((card) => card.column === 'Triage' && card.labels.includes(VOTING_LABEL) && !running.has(card.issue));
  if (voting.length === 0) return;
  const store = openStore(ctx.cfg.home);
  try {
    for (const card of voting) await reviveVote(ctx, store, card.issue);
  } finally {
    store.close();
  }
}

async function reviveVote(ctx: Ctx, store: PublicStore, issue: number): Promise<void> {
  const proposal = store.proposal(issue);
  if (proposal === null) {
    await ctx.github.removeLabel(issue, VOTING_LABEL);
    ctx.log('public', issue, 'the card waits for votes but has no proposal, so the voting label is removed and triage runs again');
    return;
  }
  if (proposal.closedAt !== null && store.reopenUnattempted(issue)) ctx.log('public', issue, 'the proposal closed before any post attempt while the card still waits for votes, so it is open again and waits for its post');
}

export async function closeByHand(ctx: Ctx, store: PublicStore, issue: number): Promise<void> {
  const proposal = store.openProposals().find((open) => open.issue === issue);
  store.closeProposal(issue, ctx.now());
  if (proposal === undefined) return;
  const sides = voteSides(ctx);
  const final = `${voteFooter(ctx, store.tally(issue, sides.up, sides.down))}\n${CLOSED_CONCLUSION}`;
  store.setShownFooter(issue, final);
  await isolated(ctx, issue, 'the card moved by hand but its proposal post still shows the open vote text, so edit it by hand', () => editPost(ctx, proposal, final));
}

async function showFooter(ctx: Ctx, store: PublicStore, proposal: Proposal, footer: string): Promise<void> {
  if (store.shownFooter(proposal.issue) === footer) return;
  store.setShownFooter(proposal.issue, footer);
  await isolated(ctx, proposal.issue, 'the vote count on the proposal post did not update', () => editPost(ctx, proposal, footer));
}

async function conclude(ctx: Ctx, proposal: Proposal, footer: string, outcome: Outcome): Promise<void> {
  if (!(await stillVoting(ctx, proposal.issue))) {
    ctx.log('public', proposal.issue, 'the issue is closed, lost its voting label or left Triage, so its proposal closes without a card change');
    await editPost(ctx, proposal, `${footer}\n${CLOSED_CONCLUSION}`);
    return;
  }
  if (outcome.kind === 'accept') await moveCard(ctx, proposal.issue, 'Design', 'voted');
  else await reject(ctx, proposal.issue);
  await ctx.github.removeLabel(proposal.issue, VOTING_LABEL);
  await editPost(ctx, proposal, `${footer}\n${outcome.conclusion}`);
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
  queueIncidents(ctx, [issue]);
}

const editPost = (ctx: Ctx, proposal: Proposal, footer: string): Promise<void> =>
  ctx.telegram.editHtml(proposal.chat!, proposal.messageId!, proposalText(ctx, proposal.issue, proposal.pitch, footer));
