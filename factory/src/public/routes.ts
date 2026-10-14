import { reportFailure } from '../fail';
import { markPost } from '../post-status';
import { routeFeedback } from '../stages/approval';
import { readState } from '../state';
import { PLAYER_REPORT_HEADING, PUBLIC_SENDER, type Ctx } from '../types';
import { oneLine, quote } from './digest';
import type { PublicStore, StoredComment } from './store';

function committeePost(ctx: Ctx, issue: number): number | null {
  const found = Object.entries(readState(ctx.statePath).approvalPosts).find(([, number]) => number === issue);
  return found === undefined ? null : Number(found[0]);
}

function routeOf(comment: StoredComment): 'patch' | 'redesign' {
  if (comment.route !== 'patch' && comment.route !== 'redesign') throw new Error(`Comment ${comment.id} has route ${comment.route} and cannot route a card`);
  return comment.route;
}

async function sendBack(ctx: Ctx, store: PublicStore, comment: StoredComment, post: number): Promise<void> {
  const route = routeOf(comment);
  const text = `${oneLine(comment.author)} wrote:\n${quote(comment.text)}`;
  await routeFeedback(ctx, comment.issue, PUBLIC_SENDER, text, route, post, PLAYER_REPORT_HEADING);
  store.closeBuildPosts(comment.issue);
  store.markRouted(comment.id, ctx.now());
  const command = { kind: route, issue: comment.issue, text: comment.text, by: PUBLIC_SENDER, byName: null, chat: ctx.cfg.committeeChat, messageId: null, postId: post };
  await markPost(ctx, command, PUBLIC_SENDER);
}

export async function routeReports(ctx: Ctx, store: PublicStore): Promise<void> {
  for (const comment of store.pendingRoutes()) {
    const post = committeePost(ctx, comment.issue);
    if (post === null) {
      ctx.log('public', comment.issue, `comment ${comment.id} came too late, the card has no open committee post`);
      store.markRouted(comment.id, ctx.now());
      continue;
    }
    await sendBackOnce(ctx, store, comment, post);
  }
}

async function sendBackOnce(ctx: Ctx, store: PublicStore, comment: StoredComment, post: number): Promise<void> {
  try {
    await sendBack(ctx, store, comment, post);
  } catch (error) {
    store.markRouted(comment.id, ctx.now());
    await reportFailure(ctx, 'public', comment.issue, `player comment ${comment.id} could not route the card and is dropped from routing: ${error instanceof Error ? error.message : String(error)}`, null, []);
  }
}
