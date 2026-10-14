import { bundleOf } from '../stages/bundle';
import { readState } from '../state';
import type { Ctx } from '../types';
import type { PublicStore } from './store';

const DAY_MS = 24 * 3_600_000;

export const pitchTitle = (pitch: string): string => pitch.split('\n')[0]!.trim();

const issueLink = (ctx: Ctx, issue: number): string => `https://github.com/${ctx.cfg.repo}/issues/${issue}`;

function proposalText(ctx: Ctx, issue: number, pitch: string): string {
  const links = [issue, ...bundleOf(readState(ctx.statePath), issue)].map((number) => issueLink(ctx, number));
  const vote = `Vote with a thumbs-up reaction on this post. At ${ctx.cfg.minVotes} votes the factory builds it.`;
  return `${pitch.trim()}\n\n${links.join('\n')}\n\n${vote}`;
}

export async function postProposal(ctx: Ctx, store: PublicStore): Promise<void> {
  const now = ctx.now();
  if (store.proposalsPostedSince(new Date(now.getTime() - DAY_MS)) >= ctx.cfg.proposalsPerDay) return;
  for (const proposal of store.unpostedProposals()) {
    const item = await ctx.github.issue(proposal.issue);
    if (item.state === 'CLOSED') {
      ctx.log('public', proposal.issue, 'the issue is closed, so its proposal is closed unposted');
      store.closeProposal(proposal.issue, now);
      continue;
    }
    const messageId = await ctx.telegram.sendMessage(ctx.cfg.proposalChat, proposalText(ctx, proposal.issue, proposal.pitch));
    store.markProposalPosted(proposal.issue, ctx.cfg.proposalChat, messageId, now);
    return;
  }
}
