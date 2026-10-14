import { readState } from '../state';
import type { Ctx } from '../types';
import { pitchTitle } from './proposals';
import type { Proposal, PublicStore } from './store';

function proposalRow(ctx: Ctx, store: PublicStore, proposal: Proposal): string {
  if (proposal.postedAt === null) return `#${proposal.issue} proposal not posted yet: ${pitchTitle(proposal.pitch)}`;
  const votes = store.votes(proposal.issue, ctx.cfg.voteEmoji.split(/\s+/));
  return `#${proposal.issue} proposal posted ${proposal.postedAt}, ${votes} of ${ctx.cfg.minVotes} votes: ${pitchTitle(proposal.pitch)}`;
}

function buildRows(ctx: Ctx, store: PublicStore, proposals: Proposal[]): string[] {
  const issues = new Set([...proposals.map((proposal) => proposal.issue), ...Object.values(readState(ctx.statePath).approvalPosts)]);
  const rows: string[] = [];
  for (const issue of [...issues].sort((a, b) => a - b)) {
    const post = store.openBuildPost(issue);
    if (post !== null) rows.push(`#${issue} open build post ${post.build} posted ${post.postedAt}`);
  }
  return rows;
}

export function publicRows(ctx: Ctx, store: PublicStore): string[] {
  const proposals = [...store.unpostedProposals(), ...store.openProposals()];
  return [...proposals.map((proposal) => proposalRow(ctx, store, proposal)), ...buildRows(ctx, store, proposals)];
}
