import { PLAYER_COMMENTS_HEADING, type Ctx } from '../types';
import { COMMENT_TEXT_LIMIT, fitComment } from '../stages/common';
import { defang } from './defang';
import { isolated } from './isolate';
import { committeeIds } from '../committee';
import type { ChatMedia, PublicStore, IssueComment } from './store';

const MINUTE_MS = 60_000;

export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const quote = (text: string): string => defang(text).split(/\r\n|\r|\n/).map((line) => `> ${line}`).join('\n');

export const playerName = (name: string): string => defang(oneLine(name));

export const authorOf = (comment: { author: string; sender: string | null }, members: string[]): string =>
  `${playerName(comment.author)}${comment.sender !== null && members.includes(comment.sender) ? ', committee member' : ''}`;

const ORIGIN_TEXT = { message: 'the message', reply: 'the message it replies to' };

export function imageLines(media: ChatMedia[]): string[] {
  return media.map((item) => item.image === null
    ? `- An image on ${ORIGIN_TEXT[item.origin]} is not available: ${item.reason ?? 'it was not fetched'}.`
    : `- An image on ${ORIGIN_TEXT[item.origin]}: ${item.image.type}, ${item.image.width}x${item.image.height}, ${item.image.bytes} bytes, sha256 ${item.image.sha256}. The agents get it in the issue's media folder, and it is not posted here.`);
}

function digestLine(comment: IssueComment, media: ChatMedia[], members: string[]): string {
  return [`From ${authorOf(comment, members)}, ${comment.kind}:\n${quote(comment.text)}`, ...imageLines(media)].join('\n');
}

function groupByIssue(comments: IssueComment[]): Map<number, IssueComment[]> {
  const groups = new Map<number, IssueComment[]>();
  for (const comment of comments) groups.set(comment.issue, [...(groups.get(comment.issue) ?? []), comment]);
  return groups;
}

export async function sendDigests(ctx: Ctx, store: PublicStore): Promise<void> {
  const now = ctx.now();
  const dropped = store.dropCommentsOnClosedPosts(now);
  if (dropped > 0) ctx.log('public', null, `${dropped} player comments were on closed posts, so no digest carries them`);
  for (const [issue, comments] of groupByIssue(store.unsentComments())) {
    const last = store.lastDigest(issue);
    if (last !== null && now.getTime() - last.getTime() < ctx.cfg.publicDigestMinutes * MINUTE_MS) continue;
    store.recordDigest(issue, now);
    await isolated(ctx, issue, 'the player comment digest failed and waits for the next digest time', () => sendDigest(ctx, store, issue, comments, committeeIds(ctx)));
  }
}

const DIGEST_JOIN = '\n\n';
const DIGEST_START = `${PLAYER_COMMENTS_HEADING}${DIGEST_JOIN}`;

type DigestPart = { ids: number[]; lines: string[]; length: number };

function splitDigests(store: PublicStore, comments: IssueComment[], members: string[]): DigestPart[] {
  const parts: DigestPart[] = [];
  let open: DigestPart | null = null;
  for (const comment of comments) {
    const line = fitComment(digestLine(comment, store.mediaOf(comment.id), members), 'the factory comment store');
    if (open !== null && open.length + DIGEST_JOIN.length + line.length <= COMMENT_TEXT_LIMIT) {
      open.ids.push(comment.id);
      open.lines.push(line);
      open.length += DIGEST_JOIN.length + line.length;
      continue;
    }
    open = { ids: [comment.id], lines: [line], length: DIGEST_START.length + line.length };
    parts.push(open);
  }
  return parts;
}

async function sendDigest(ctx: Ctx, store: PublicStore, issue: number, comments: IssueComment[], members: string[]): Promise<void> {
  for (const part of splitDigests(store, comments, members)) {
    await ctx.github.comment(issue, `${DIGEST_START}${part.lines.join(DIGEST_JOIN)}`);
    store.markSent(part.ids, ctx.now());
  }
}
