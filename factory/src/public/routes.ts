import { reportFailure } from '../fail';
import { markPost } from '../post-status';
import { routeFeedback } from '../stages/approval';
import { isQueued, readState } from '../state';
import { PUBLIC_SENDER, type Ctx } from '../types';
import { playerName, quote } from './digest';
import type { PublicStore, IssueComment } from './store';

function committeePost(ctx: Ctx, issue: number): number | null {
  const found = Object.entries(readState(ctx.statePath).approvalPosts).find(([, number]) => number === issue);
  return found === undefined ? null : Number(found[0]);
}

function hasCommitteeDecision(ctx: Ctx, issue: number): boolean {
  const state = readState(ctx.statePath);
  const approving = isQueued(state, 'approve', issue) || state.jobs.some((job) => job.stage === 'approve' && job.issue === issue);
  return approving || Object.values(state.unroutedReplies).some((reply) => reply.issue === issue);
}

function routeOf(comment: IssueComment): 'patch' | 'redesign' {
  if (comment.route !== 'patch' && comment.route !== 'redesign') throw new Error(`Comment ${comment.id} has route ${comment.route} and cannot route a card`);
  return comment.route;
}

async function sendBack(ctx: Ctx, store: PublicStore, comment: IssueComment, post: number): Promise<void> {
  const route = routeOf(comment);
  const text = `${playerName(comment.author)} wrote:\n${quote(comment.text)}`;
  await routeFeedback(ctx, comment.issue, PUBLIC_SENDER, text, route, post, 'player');
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
    if (hasCommitteeDecision(ctx, comment.issue)) {
      ctx.log('public', comment.issue, `comment ${comment.id} came after a committee approval or reply, so it does not route the card`);
      store.markRouted(comment.id, ctx.now());
      continue;
    }
    if (isOnOlderBuild(ctx, store, comment)) {
      ctx.log('public', comment.issue, `comment ${comment.id} is on the post of an older build, so it does not route the card`);
      store.markRouted(comment.id, ctx.now());
      continue;
    }
    if (!store.beginRoute(comment.issue, post, ctx.now())) {
      ctx.log('public', comment.issue, `comment ${comment.id} came after the route of committee post ${post}, so it does not route the card again`);
      store.markRouted(comment.id, ctx.now());
      continue;
    }
    await sendBackOnce(ctx, store, comment, post);
  }
}

function isOnOlderBuild(ctx: Ctx, store: PublicStore, comment: IssueComment): boolean {
  if (comment.source === 'game') return false;
  const current = readState(ctx.statePath).builds[String(comment.issue)];
  return store.openBuildPost(comment.issue)?.build !== current;
}

async function sendBackOnce(ctx: Ctx, store: PublicStore, comment: IssueComment, post: number): Promise<void> {
  try {
    await sendBack(ctx, store, comment, post);
  } catch (error) {
    store.markRouted(comment.id, ctx.now());
    await reportFailure(ctx, 'public', comment.issue, `player comment ${comment.id} could not route the card and is dropped from routing: ${error instanceof Error ? error.message : String(error)}`, null, []);
  }
}
