import { PLAYER_COMMENTS_HEADING, type Ctx } from '../types';
import type { PublicStore, StoredComment } from './store';

const MINUTE_MS = 60_000;

export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const quote = (text: string): string => text.split(/\r\n|\r|\n/).map((line) => `> ${line}`).join('\n');

function digestLine(comment: StoredComment): string {
  return `From ${oneLine(comment.author)}, ${comment.kind}:\n${quote(comment.text)}`;
}

function groupByIssue(comments: StoredComment[]): Map<number, StoredComment[]> {
  const groups = new Map<number, StoredComment[]>();
  for (const comment of comments) groups.set(comment.issue, [...(groups.get(comment.issue) ?? []), comment]);
  return groups;
}

export async function sendDigests(ctx: Ctx, store: PublicStore): Promise<void> {
  const now = ctx.now();
  for (const [issue, comments] of groupByIssue(store.unsentComments())) {
    const last = store.lastDigest(issue);
    if (last !== null && now.getTime() - last.getTime() < ctx.cfg.publicDigestMinutes * MINUTE_MS) continue;
    await ctx.github.comment(issue, `${PLAYER_COMMENTS_HEADING}\n\n${comments.map(digestLine).join('\n\n')}`);
    store.markSent(comments.map((comment) => comment.id), now);
    store.recordDigest(issue, now);
  }
}
