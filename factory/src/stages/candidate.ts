import { STEP_FUNCTION, phaseLine, stepCall } from '../activity';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAndDeploy, recordBuild } from '../deploy';
import { readShown, type Evidence } from '../evidence';
import { postWithEvidence } from '../evidence-post';
import { readState, updateState } from '../state';
import { CANDIDATE_BRANCH, GAME_DIR, OUT_DIR, type Ctx, type IssueMerge, type ReleaseState } from '../types';
import { bundleOf } from './bundle';
import { agentHome, fillPrompt, playtestCommand, readOutput, resetOutputs } from './common';
import { candidateDir, changelogText, featureLine, passedForCandidate, readChanges, releaseLog, requireRelease, trackingLink, type Feature } from './release-common';

export const CANDIDATE_SCOPE = 'rc';

const SERVER_TRIES = 60;

const playtestScript = (playtest: string) => `set -u
${STEP_FUNCTION}
${phaseLine('Playing the candidate')}
mkdir -p ${OUT_DIR}
${stepCall('npm ci')}
npm ci
${stepCall('dev server')}
npm run dev > ${OUT_DIR}/dev-server.log 2>&1 &
server=$!
ready=0
for i in $(seq 1 ${SERVER_TRIES}); do
  if curl -sf http://localhost:5173 > /dev/null; then ready=1; break; fi
  sleep 1
done
status=1
if [ "$ready" = 1 ]; then
  status=0
  ${stepCall('playtest')}
  env -u TEST_TIMEOUTS ${playtest} || status=$?
else
  echo "dev server did not start in ${SERVER_TRIES} seconds"
fi
kill "$server" || true
[ "$status" = 0 ] || exit "$status"
shot=$(ls -t .playtest/*.png | head -n 1)
cp "$shot" ${OUT_DIR}/screenshot.png
${stepCall('done')}
`;

export async function candidate(ctx: Ctx, issue: number): Promise<void> {
  const release = requireRelease(ctx);
  if (release.issue !== issue) throw new Error(`Issue #${issue} is not the tracking issue of the open release, #${release.issue} is`);
  const { sha, features } = requirePlaytested(release);
  const dir = candidateDir(ctx);
  rmSync(dir, { recursive: true, force: true });
  await ctx.repo.fetch();
  await ctx.repo.replaceBranch(await ctx.repo.fullHash(sha), CANDIDATE_BRANCH);
  await ctx.repo.fetch();
  await ctx.repo.prepareWorkClone(CANDIDATE_BRANCH, CANDIDATE_BRANCH, dir);
  const home = agentHome(dir, GAME_DIR);
  resetOutputs(home);
  writeFileSync(join(home, OUT_DIR, 'changelog.md'), await changelogInput(ctx, features));
  const log = releaseLog(ctx, 'candidate');
  await ctx.container.shell('checks', dir, playtestScript(playtestCommand(ctx.cfg, true)), log);
  await ctx.container.agent({ clone: dir, dir: GAME_DIR, model: ctx.cfg.designModel, prompt: fillPrompt('release', {}), log });
  const changes = changelogText(readChanges(readOutput(home, 'release.json'), features)) || 'No changes in this candidate.';
  const url = await buildAndDeploy(ctx, dir, CANDIDATE_SCOPE, log, 'candidate');
  recordBuild(ctx.statePath, issue, CANDIDATE_SCOPE);
  const pr = (await ctx.github.pullRequestFor(CANDIDATE_BRANCH)) ?? await ctx.github.openPullRequest(CANDIDATE_BRANCH, 'main', `Release ${release.day}`, `The release candidate of ${release.day}. The factory merges it when the committee presses Ship.`);
  if (staleBuild(ctx, sha)) return;
  await ctx.github.comment(issue, `Release candidate: ${url}\n\n${changes}`);
  const caption = candidateCaption(release.day, url, trackingLink(ctx, issue), pr, features.length);
  const buttons = [[{ text: 'Ship', data: `factory:ship:${issue}` }]];
  const evidence = candidateEvidence(ctx, issue, home);
  const photoId = await postWithEvidence(ctx, evidence, caption, buttons, {
    add: (id) => updateState(ctx.statePath, (state) => ({ ...state, release: state.release && { ...state.release, postId: id, candidate: { sha, features } }, postCaptions: { ...state.postCaptions, [id]: caption } })),
  }, { stage: 'candidate', issue });
  await ctx.telegram.sendMessage(ctx.cfg.committeeChat, changes, photoId);
}

function requirePlaytested(release: ReleaseState): { sha: string; features: IssueMerge[] } {
  const passed = passedForCandidate(release);
  if (passed === null) throw new Error('The release playtest has passed no commit that still holds only wanted features, so no candidate builds');
  return passed;
}

function staleBuild(ctx: Ctx, sha: string): boolean {
  const release = requireRelease(ctx);
  if (readState(ctx.statePath).pendingShip !== null) {
    ctx.log('candidate', release.issue, 'not posted, a ship was ordered during the build');
    return true;
  }
  const passed = passedForCandidate(release);
  if (passed?.sha === sha) return false;
  ctx.log('candidate', release.issue, `not posted, the playtest pass moved from ${sha} to ${passed?.sha ?? 'no commit'} during the build`);
  return true;
}

function candidateEvidence(ctx: Ctx, issue: number, home: string): Evidence {
  const { evidence, problem } = readShown(home);
  if (problem !== null) ctx.log('candidate', issue, problem);
  if (evidence === null) throw new Error(`The release agent wrote no usable .factory/screenshot.png: ${problem ?? 'no reason'}`);
  return evidence;
}

async function changelogInput(ctx: Ctx, features: Feature[]): Promise<string> {
  const state = readState(ctx.statePath);
  const lines: string[] = [];
  for (const feature of features) {
    lines.push(featureLine(feature));
    for (const bundled of bundleOf(state, feature.issue)) lines.push(`  bundled: #${bundled} ${(await ctx.github.issue(bundled)).title}`);
  }
  return `${lines.join('\n')}\n`;
}

export function candidateCaption(day: string, url: string, link: string, pr: string, count: number): string {
  const head = `ROAM release candidate ${day}\n\nPlay: ${url}\nPR: ${pr}\nIssue: ${link}`;
  const changes = count === 0 ? 'No changes in this candidate.' : `${count} changes, listed in the message under this post.`;
  return [head, changes].join('\n\n');
}
