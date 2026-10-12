import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readState, updateState } from '../state';
import { GAME_DIR, RELEASE_CANDIDATE_LABEL, type Ctx, type ReleaseState } from '../types';
import { withWorkFolder } from '../work-lock';
import { runCost } from './checkpoint';
import { BASE_BRANCH, fillPrompt, resetOutputs } from './common';
import { checkAndPush, landingAgent, type Landing } from './merge';
import { requireRelease } from './release-common';

type Addition = { issue: number; title: string; merge: string };

export async function add(ctx: Ctx, issue: number): Promise<void> {
  const order = readState(ctx.statePath).pendingAdditions.find((item) => item.issue === issue);
  if (!order) throw new Error(`No addition of issue #${issue} is queued`);
  const release = requireAddable(ctx, issue);
  const { title, state, labels } = await ctx.github.issue(issue);
  if (state !== 'OPEN' || !labels.includes(RELEASE_CANDIDATE_LABEL)) throw new Error(`Issue #${issue} is not an open ${RELEASE_CANDIDATE_LABEL}, so it is not approved and merged waiting for a release`);
  await ctx.repo.fetch();
  const addition = { issue, title, merge: await devMerge(ctx, issue) };
  const head = await withWorkFolder(ctx, 'add-release', () => addTo(ctx, release, addition));
  const commit = addition.merge.slice(0, 7);
  if (head === null) {
    await ctx.github.comment(issue, `Release ${release.day} already holds this issue's dev merge ${commit}. Nothing changed.`);
    return ctx.log('add', issue, `release ${release.branch} already holds ${commit}`);
  }
  updateState(ctx.statePath, (next) => ({ ...next, pendingShip: null, release: next.release && { ...next.release, postId: null, removed: next.release.removed.filter((n) => n !== issue) } }));
  const note = `Added to release ${release.day} by ${order.by}: dev merge ${commit} is now on ${release.branch} at ${head.slice(0, 7)}, and it passed the merge checks. The release playtest plays the new head before a new candidate.`;
  await ctx.github.comment(issue, note);
  await ctx.github.comment(release.issue, `Issue #${issue} ${title}: ${note}`);
  await ctx.telegram.sendMessage(ctx.cfg.committeeChat, `Issue #${issue} ${title} is in release ${release.day}. The current candidate is dropped, and a new one follows the playtest.`);
}

function requireAddable(ctx: Ctx, issue: number): ReleaseState {
  const release = requireRelease(ctx);
  if (release.shipping) throw new Error(`Release ${release.day} is shipping, so it takes no new issue`);
  if (release.issue === issue) throw new Error(`Issue #${issue} is the release tracking issue`);
  return release;
}

async function devMerge(ctx: Ctx, issue: number): Promise<string> {
  const merges = await ctx.repo.issueMerges(issue, BASE_BRANCH);
  if (merges.length === 0) throw new Error(`${BASE_BRANCH} has no merge of issue #${issue} since main that is not reverted`);
  if (merges.length > 1) throw new Error(`${BASE_BRANCH} has ${merges.length} merges of issue #${issue} since main (${merges.map((hash) => hash.slice(0, 7)).join(', ')}). Bring it over by hand`);
  return merges[0];
}

async function addTo(ctx: Ctx, release: ReleaseState, addition: Addition): Promise<string | null> {
  const dir = join(ctx.cfg.home, 'work', 'add-release');
  rmSync(dir, { recursive: true, force: true });
  await ctx.repo.prepareWorkClone(release.branch, release.branch, dir);
  resetOutputs(join(dir, GAME_DIR));
  const land: Landing = { stage: 'add', dir, into: release.branch, guardAgainst: [release.branch], agent: landingAgent(ctx, 'add', dir, release.branch) };
  const pick = await ctx.repo.startPick(dir, addition.merge);
  if (pick.present) return null;
  let conflicts = 0;
  if (pick.conflicts.length > 0) {
    ctx.log('add', addition.issue, `the pick of ${addition.merge.slice(0, 7)} conflicts with ${release.branch} in ${pick.conflicts.join(', ')}, an agent resolves it`);
    const files = pick.conflicts.map((file) => `- ${file}`).join('\n');
    conflicts = runCost(await land.agent(fillPrompt('pick-merge', { into: release.branch, issue: `#${addition.issue}`, merge: addition.merge, files })));
  }
  await ctx.repo.wrapPick(dir, { tip: pick.tip, merge: addition.merge }, `Merge issue #${addition.issue}: ${addition.title}`);
  const cards = `- #${addition.issue}, picked from ${BASE_BRANCH} commit ${addition.merge.slice(0, 7)}`;
  await checkAndPush(ctx, land, conflicts, (failure) => fillPrompt('merge-fix', { into: release.branch, cards, failure }));
  rmSync(dir, { recursive: true, force: true });
  return ctx.repo.headHash(release.branch);
}
