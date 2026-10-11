import { appendLedger } from '../ledger';
import { readState, updateState } from '../state';
import type { Ctx, PendingSync, ReleaseState } from '../types';
import { BASE_BRANCH } from './common';
import { mergeResolving } from './merge-resolve';
import { featureLine, featureMerges, requireRelease, type Feature } from './release-common';

const SYNC_ROUNDS = 3;

export async function syncDev(ctx: Ctx, issue: number): Promise<void> {
  const release = requireRelease(ctx);
  if (release.issue !== issue) throw new Error(`Issue #${issue} is not the tracking issue of the open release, #${release.issue} is`);
  await ctx.repo.fetch();
  const order = await startOrder(ctx, release);
  const rounds = await mergeDev(ctx, release, order);
  await ctx.repo.fetch();
  const dev = await ctx.repo.forkPoint(BASE_BRANCH, release.branch);
  const head = await ctx.repo.headHash(release.branch);
  const devNow = await ctx.repo.headHash(BASE_BRANCH);
  const moved = devNow === dev ? '' : ` Dev moved on to ${devNow} during the sync, after ${rounds} merges, and that is not in the release.`;
  if (await ctx.repo.isMerged(dev, order.from)) {
    await ctx.github.comment(issue, `Dev at ${dev} was already in ${release.branch} at ${order.from}, so the sync changed nothing.${moved}\n\nOrdered by ${order.by}. Reason: ${order.reason}`);
    return ctx.log('sync', issue, `dev at ${dev} was already in ${release.branch}, nothing changed`);
  }
  if (recorded(release, dev)) return ctx.log('sync', issue, `dev at ${dev} is already recorded in ${release.branch}, the order is done`);
  const features = featureMerges(await ctx.repo.mergeLog(dev, order.from));
  await ctx.github.comment(issue, entered(release, order, dev, head, features, moved));
  record(ctx, order, dev, head, features);
  appendLedger(ctx.cfg.home, { kind: 'sync', issue, branch: release.branch, dev, head, by: order.by, reason: order.reason, at: ctx.now().toISOString() });
  await ctx.telegram.sendMessage(ctx.cfg.committeeChat, `Dev at ${dev} is in release ${release.day}, ordered by ${order.by}. The candidate post is withdrawn, the playtest plays ${head} and a new candidate follows.`);
  ctx.log('sync', issue, `merged dev at ${dev} into ${release.branch}, head ${head}`);
}

async function startOrder(ctx: Ctx, release: ReleaseState): Promise<PendingSync & { from: string }> {
  const order = readState(ctx.statePath).pendingSync;
  if (order === null) throw new Error('No sync of dev into the release is queued');
  if (order.release !== release.issue) throw new Error(`The queued sync was ordered for release #${order.release}, not the open release #${release.issue}. Drop it with factory drop sync.`);
  if (order.from !== null) return { ...order, from: order.from };
  const from = await ctx.repo.headHash(release.branch);
  updateState(ctx.statePath, (state) => ({ ...state, pendingSync: state.pendingSync && { ...state.pendingSync, from } }));
  return { ...order, from };
}

async function mergeDev(ctx: Ctx, release: ReleaseState, order: PendingSync): Promise<number> {
  let rounds = 0;
  while (rounds < SYNC_ROUNDS && !(await ctx.repo.isMerged(BASE_BRANCH, release.branch))) {
    rounds++;
    await mergeResolving(ctx, 'sync', [{ branch: BASE_BRANCH, into: release.branch, message: `Merge dev into ${release.branch}, ordered by ${order.by}` }]);
    await ctx.repo.fetch();
  }
  return rounds;
}

function recorded(release: ReleaseState, dev: string): boolean {
  return (release.syncs ?? []).some((sync) => sync.dev === dev);
}

function record(ctx: Ctx, order: PendingSync, dev: string, head: string, features: Feature[]): void {
  const entries = features.map((feature) => feature.issue);
  updateState(ctx.statePath, (state) => {
    if (state.release === null) throw new Error('The release closed while dev was synced into it');
    const known = state.release.syncs ?? [];
    const syncs = known.some((sync) => sync.dev === dev) ? known : [...known, { dev, head, by: order.by, reason: order.reason, at: ctx.now().toISOString() }];
    const removed = state.release.removed.filter((n) => !entries.includes(n));
    return { ...state, pendingShip: null, release: { ...state.release, postId: null, removed, syncs } };
  });
}

function entered(release: ReleaseState, order: PendingSync, dev: string, head: string, features: Feature[], moved: string): string {
  const list = features.length === 0 ? 'No feature merges came with it.' : `Features from dev:\n${features.map((feature) => `- ${featureLine(feature)}`).join('\n')}`;
  const passed = release.playtest.passed === null ? 'No earlier play passed this release' : `The earlier playtest pass covers only ${release.playtest.passed}`;
  return [
    `Dev at ${dev} entered ${release.branch}. The release moved from ${order.from} to ${head}, and its own commits stay.${moved}`,
    list,
    `The candidate post and any queued Ship are dropped. ${passed}, so the release playtest plays ${head} in full, and a new candidate builds from the commit it passes. Ship still needs a member.`,
    `Ordered by ${order.by}. Reason: ${order.reason}`,
  ].join('\n\n');
}
