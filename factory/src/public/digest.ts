import { PLAYER_COMMENTS_HEADING, type Ctx } from '../types';
import { isolated } from './isolate';
import type { PublicStore, IssueComment } from './store';

const MINUTE_MS = 60_000;

export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const quote = (text: string): string => text.split(/\r\n|\r|\n/).map((line) => `> ${line}`).join('\n');

function digestLine(comment: IssueComment): string {
  return `From ${oneLine(comment.author)}, ${comment.kind}:\n${quote(comment.text)}`;
}

function groupByIssue(comments: IssueComment[]): Map<number, IssueComment[]> {
  const groups = new Map<number, IssueComment[]>();
  for (const comment of comments) groups.set(comment.issue, [...(groups.get(comment.issue) ?? []), comment]);
  return groups;
}

export async function sendDigests(ctx: Ctx, store: PublicStore): Promise<void> {
  const now = ctx.now();
  for (const [issue, comments] of groupByIssue(store.unsentComments())) {
    const last = store.lastDigest(issue);
    if (last !== null && now.getTime() - last.getTime() < ctx.cfg.publicDigestMinutes * MINUTE_MS) continue;
    store.recordDigest(issue, now);
    await isolated(ctx, issue, 'the player comment digest failed and waits for the next digest time', () => sendDigest(ctx, store, issue, comments));
  }
}

async function sendDigest(ctx: Ctx, store: PublicStore, issue: number, comments: IssueComment[]): Promise<void> {
  await ctx.github.comment(issue, `${PLAYER_COMMENTS_HEADING}\n\n${comments.map(digestLine).join('\n\n')}`);
  store.markSent(comments.map((comment) => comment.id), ctx.now());
}
