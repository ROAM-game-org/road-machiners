import { readState } from '../state';
import type { Ctx } from '../types';
import { pitchTitle, tallyText, voteSides } from './proposals';
import type { Proposal, PublicStore, StoredComment } from './store';

const RECENT_CHAT = 10;

function proposalRow(ctx: Ctx, store: PublicStore, proposal: Proposal): string {
  if (proposal.postedAt === null) return `#${proposal.issue} proposal not posted yet: ${pitchTitle(proposal.pitch)}`;
  const { up, down } = voteSides(ctx);
  const tally = tallyText(ctx, store.tally(proposal.issue, up, down));
  return `#${proposal.issue} proposal posted ${proposal.postedAt}, ${tally} of ${ctx.cfg.minVotes}: ${pitchTitle(proposal.pitch)}`;
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

function placeOf(comment: StoredComment): string {
  if (comment.issue === null) return 'no thread';
  if (comment.linked) return `linked to #${comment.issue}`;
  return comment.relevance === 'other' ? `off-topic under #${comment.issue}` : `on #${comment.issue}`;
}

function chatRow(comment: StoredComment): string {
  const filed = comment.filedIssue === null ? [] : [`filed as #${comment.filedIssue}`];
  const replied = comment.replyId === null ? 'no reply' : `replied ${comment.replyId}`;
  return `chat message ${comment.messageId} ${comment.at}: ${[comment.kind, placeOf(comment), ...filed, replied].join(', ')}`;
}

export function publicRows(ctx: Ctx, store: PublicStore): string[] {
  const proposals = [...store.unpostedProposals(), ...store.openProposals()];
  const chat = store.recentChat(RECENT_CHAT).map(chatRow);
  return [...proposals.map((proposal) => proposalRow(ctx, store, proposal)), ...buildRows(ctx, store, proposals), ...chat];
}
