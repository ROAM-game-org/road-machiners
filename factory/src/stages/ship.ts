import { stepScript } from '../activity';
import { agentOutputPath } from '../agent-output';
import { moveCard } from '../card-events';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deployDev } from '../deploy';
import { must } from '../exec';
import { closeLanding, markMerged, openLanding } from '../landing-work';
import { releasePostDir } from '../release-post';
import { reportEnv, takeMaps } from '../sourcemaps';
import { updateState } from '../state';
import { BUG_LABEL, CANDIDATE_BRANCH, GAME_DIR, MAINTENANCE_LABEL, RELEASE_CANDIDATE_LABEL, type Ctx, type FactoryState, type IssueMerge, type ReleasePost, type ReleaseState, type RunResult } from '../types';
import { withWorkFolder } from '../work-lock';
import { closeBundle } from './bundle';
import { agentLog, fillPrompt, resetOutputs } from './common';
import { checkAndPush, landingAgent, mergeIn, runningJobId, type Landing } from './merge';
import { queueIncidents } from './incident';
import { mergeResolving } from './merge-resolve';
import { openRelease } from './release';
import { candidateDir, changelogText, readChanges, releaseLog, requireRelease, toFeatures, type Feature } from './release-common';
import { addCard } from '../card-events';

export type ItchKeys = { itchTarget: string; butlerKey: string };

export function itchKeys(ctx: Ctx): ItchKeys {
  const { itchTarget, butlerKey } = ctx.cfg;
  if (!itchTarget || !butlerKey) throw new Error('A release needs ITCH_TARGET in factory/settings.env and BUTLER_API_KEY in factory/.env.');
  return { itchTarget, butlerKey };
}

type Candidate = NonNullable<ReleaseState['candidate']>;

async function requireShippable(ctx: Ctx, issue: number, by: string | null): Promise<{ release: ReleaseState; candidate: Candidate }> {
  if (by === null) throw new Error('Nobody asked to ship. A ship needs a Ship from a committee member.');
  const release = requireRelease(ctx);
  if (release.issue !== issue) throw new Error(`Issue #${issue} is not the tracking issue of the open release, #${release.issue} is`);
  if (release.postId === null || release.candidate === null) throw new Error('The release has no current candidate post, so there is nothing to ship.');
  return { release, candidate: release.candidate };
}

async function requirePlayed(ctx: Ctx, candidate: Candidate): Promise<void> {
  const head = await ctx.repo.headHash(CANDIDATE_BRANCH);
  if (!head.startsWith(candidate.sha) && !candidate.sha.startsWith(head)) throw new Error(`${CANDIDATE_BRANCH} is at ${head} on GitHub, not at the candidate ${candidate.sha} the committee played, so nothing ships.`);
}

function landRelease(ctx: Ctx, release: ReleaseState, candidate: Candidate): Promise<void> {
  return withWorkFolder(ctx, 'ship-main', () => mergeRelease(ctx, release, candidate));
}

async function mergeRelease(ctx: Ctx, release: ReleaseState, candidate: Candidate): Promise<void> {
  const dir = join(ctx.cfg.home, 'work', 'ship-main');
  const plan = { into: 'main', sources: [{ branch: CANDIDATE_BRANCH, sha: candidate.sha }], cards: [release.issue] };
  const { work, resumed } = openLanding(ctx, 'ship', dir, plan, runningJobId());
  const land: Landing = { stage: 'ship', dir, into: 'main', guardAgainst: ['main', CANDIDATE_BRANCH], agent: landingAgent(ctx, 'ship', dir, work, resumed), staleBase: resumed };
  const conflicts = resumed ? 0 : await mergeReleaseIn(ctx, land, release);
  await checkAndPush(ctx, land, conflicts, (failure) => fillPrompt('ship-fix', { release: CANDIDATE_BRANCH, failure }));
  closeLanding(ctx, 'ship', dir);
}

async function mergeReleaseIn(ctx: Ctx, land: Landing, release: ReleaseState): Promise<number> {
  await ctx.repo.prepareWorkClone('main', 'main', land.dir);
  resetOutputs(join(land.dir, GAME_DIR));
  const conflicts = await mergeIn(ctx, land, { branch: CANDIDATE_BRANCH, message: `Release ${release.day}`, reason: `release ${release.day} ships` });
  markMerged(ctx, 'ship', []);
  return conflicts;
}

export function publish(ctx: Ctx, keys: ItchKeys, logName: string): Promise<void> {
  return withWorkFolder(ctx, 'release-main', () => buildAndPush(ctx, keys, logName));
}

async function buildAndPush(ctx: Ctx, keys: ItchKeys, logName: string): Promise<void> {
  const dir = join(ctx.cfg.home, 'work', 'release-main');
  rmSync(dir, { recursive: true, force: true });
  await ctx.repo.prepareWorkClone('main', 'main', dir);
  const log = releaseLog(ctx, logName);
  await ctx.container.shell('build', dir, stepScript('Building the release', [['npm ci', 'npm ci'], ['build', 'npm run build']]), log, { SAVE_SCOPE: '', ...reportEnv(ctx.cfg, 'release') });
  await takeMaps(ctx, dir, 'release');
  const version = await ctx.repo.headHash('main');
  const args = ['push', join(dir, GAME_DIR, 'dist'), `${keys.itchTarget}:html5`, '--userversion', version];
  const pushed = await ctx.run('butler', args, { activity: 'publish', env: { BUTLER_API_KEY: keys.butlerKey }, logPath: log });
  if (!alreadyOnItch(pushed, version)) must(pushed, 'butler push');
}

function alreadyOnItch(result: RunResult, version: string): boolean {
  return result.code !== 0 && `${result.stdout}${result.stderr}`.includes(`already exist with version ${version}`);
}

export async function ship(ctx: Ctx, issue: number, by: string | null): Promise<void> {
  const keys = itchKeys(ctx);
  const { release, candidate } = await requireShippable(ctx, issue, by);
  const home = join(candidateDir(ctx), GAME_DIR);
  const screenshot = agentOutputPath(home, 'screenshot.png');
  const notesPath = agentOutputPath(home, 'release.json');
  if (screenshot === null || notesPath === null) throw new Error('The candidate screenshot or notes are gone from its work clone, so the public post cannot be made.');
  await ctx.repo.fetch();
  await requirePlayed(ctx, candidate);
  const features = toFeatures(candidate.features);
  const changelog = changelogText(readChanges(readFileSync(notesPath, 'utf8'), features));
  await landRelease(ctx, release, candidate);
  await mergeResolving(ctx, 'ship', [{ branch: 'main', into: 'dev', message: `Merge main into dev after release ${release.day}`, issue: null }]);
  await publish(ctx, keys, 'ship');
  const kept = join(releasePostDir(ctx.cfg.home, release.day), 'screenshot.png');
  mkdirSync(dirname(kept), { recursive: true });
  copyFileSync(screenshot, kept);
  const post: ReleasePost = { issue, day: release.day, changelog, screenshot: kept, postId: null, draft: null };
  await ctx.github.createRelease(`release-${release.day}`, 'main', `ROAM release ${release.day}`, changelog);
  await deployDev(ctx, agentLog(ctx, issue, 'ship'));
  queueIncidents(ctx, await closeFeatures(ctx, release.day, features));
  await ctx.github.comment(issue, `Shipped by ${by} in the committee chat. Release ${release.day} is on main and itch.io.`);
  await ctx.github.close(issue, 'completed');
  await moveCard(ctx, issue, 'Done', 'shipped', 'release');
  updateState(ctx.statePath, (state) => dropShipped(state, issue, candidate.features, post, ctx.now()));
  await openRelease(ctx);
  await openCleanupTasks(ctx, release.day);
  await ctx.telegram.sendMessage(ctx.cfg.committeeChat, `Release ${release.day} shipped with ${features.length} changes.`);
  ctx.log('ship', issue, `shipped ${features.length} changes`);
}

async function closeFeatures(ctx: Ctx, day: string, features: Feature[]): Promise<number[]> {
  const bugs: number[] = [];
  for (const feature of features) {
    const shipped = `Shipped in release ${day}. It is on main and itch.io.`;
    await ctx.github.comment(feature.issue, shipped);
    await ctx.github.removeLabel(feature.issue, RELEASE_CANDIDATE_LABEL);
    await ctx.github.close(feature.issue, 'completed');
    const bundled = await closeBundle(ctx, feature.issue, shipped);
    if (await anyBug(ctx, [feature.issue, ...bundled])) bugs.push(feature.issue);
  }
  return bugs;
}

function dropShipped(state: FactoryState, tracking: number, shipped: IssueMerge[], post: ReleasePost, now: Date): FactoryState {
  const builds = { ...state.builds };
  for (const done of [tracking, ...shipped.map((merge) => merge.issue)]) delete builds[String(done)];
  const devMerges = state.devMerges.filter((merge) => !shipped.some((done) => done.issue === merge.issue && done.sha === merge.sha));
  return { ...state, release: null, devMerges, pendingShip: null, releasePost: post, lastRelease: now.toISOString(), builds };
}

const CLEANUP_TASKS = [
  { title: 'Optimize against the speed budget', prompt: 'release-optimize' },
  { title: 'Code janitor pass', prompt: 'release-janitor' },
] as const;

async function openCleanupTasks(ctx: Ctx, day: string): Promise<void> {
  for (const task of CLEANUP_TASKS) {
    const n = await ctx.github.createIssue(`${task.title} (after release ${day})`, fillPrompt(task.prompt, {}), [MAINTENANCE_LABEL]);
    await addCard(ctx, n, 'Design', ctx.now().toISOString());
  }
}

async function anyBug(ctx: Ctx, issues: number[]): Promise<boolean> {
  for (const issue of issues) if ((await ctx.github.issue(issue)).labels.includes(BUG_LABEL)) return true;
  return false;
}
