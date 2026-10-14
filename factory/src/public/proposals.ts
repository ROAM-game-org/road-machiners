import { bundleOf } from '../stages/bundle';
import { readState } from '../state';
import { VOTING_LABEL, type Ctx } from '../types';
import { isolated } from './isolate';
import type { PublicStore } from './store';

const DAY_MS = 24 * 3_600_000;

export const pitchTitle = (pitch: string): string => pitch.split('\n')[0]!.trim();

const issueLink = (ctx: Ctx, issue: number): string => `https://github.com/${ctx.cfg.repo}/issues/${issue}`;

export const voteCount = (ctx: Ctx, votes: number): string => `${votes}/${ctx.cfg.minVotes}`;

export const ACCEPTED_BY_COMMITTEE = '✅ Accepted by committee member';
export const REJECTED_BY_COMMITTEE = '❌ Rejected by committee member';
export const CLOSED_CONCLUSION = 'Closed';

export function composeProposal(ctx: Ctx, issues: number[], pitch: string, footer: string): string {
  const links = issues.map((number) => issueLink(ctx, number));
  const vote = `Vote with a thumbs-up reaction on this post. At ${ctx.cfg.minVotes} votes the factory builds it.`;
  return `${pitch.trim()}\n\n${links.join('\n')}\n\n${vote}\n\n${footer}`;
}

export const proposalText = (ctx: Ctx, issue: number, pitch: string, footer: string): string =>
  composeProposal(ctx, [issue, ...bundleOf(readState(ctx.statePath), issue)], pitch, footer);

export function longestProposalText(ctx: Ctx, issues: number[], pitch: string): string {
  const full = voteCount(ctx, ctx.cfg.minVotes);
  const texts = [ACCEPTED_BY_COMMITTEE, REJECTED_BY_COMMITTEE, CLOSED_CONCLUSION].map((conclusion) => composeProposal(ctx, issues, pitch, `${full}\n${conclusion}`));
  return texts.reduce((longest, text) => (text.length > longest.length ? text : longest));
}

export async function postProposal(ctx: Ctx, store: PublicStore): Promise<void> {
  const now = ctx.now();
  if (store.proposalPostAttemptsSince(new Date(now.getTime() - DAY_MS)) >= ctx.cfg.proposalsPerDay) return;
  for (const proposal of store.unpostedProposals()) {
    store.beginProposalPost(proposal.issue, now);
    let skipped = false;
    await isolated(ctx, proposal.issue, 'the proposal could not be posted and is closed without a post, so post it by hand or put the card to a vote again', async () => {
      const item = await ctx.github.issue(proposal.issue);
      if (item.state === 'CLOSED') {
        ctx.log('public', proposal.issue, 'the issue is closed, so its proposal is closed unposted');
        skipped = true;
      } else if (!item.labels.includes(VOTING_LABEL)) {
        ctx.log('public', proposal.issue, 'the issue lost its voting label, so its proposal is closed unposted');
        skipped = true;
      } else {
        const messageId = await ctx.telegram.sendMessage(ctx.cfg.proposalChat, proposalText(ctx, proposal.issue, proposal.pitch, voteCount(ctx, 0)));
        store.markProposalPosted(proposal.issue, ctx.cfg.proposalChat, messageId, now);
      }
    });
    if (!skipped) return;
    store.closeProposal(proposal.issue, now);
  }
}
