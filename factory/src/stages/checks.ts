import { STEP_FUNCTION, stepCall } from '../activity';
import { cardFlow, moveCard } from '../card-events';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { CheckTimeoutError } from '../container';
import { readApproval, type Approval } from '../clone-checks';
import { readShown, type Shown } from '../evidence';
import { postWithEvidence } from '../evidence-post';
import { checkScope, publishBuild, recordBuild } from '../deploy';
import { reportFailure, stripAnsi } from '../fail';
import { postBuild } from '../public/build-post';
import { clearFeedback } from '../pending-feedback';
import { feedbackEnv } from '../sourcemaps';
import { readState, updateState } from '../state';
import { join } from 'node:path';
import { testPoolPin } from '../cpus';
import { isLocked, withLock } from '../lock';
import { BRANCH, GAME_DIR, OUT_DIR, type Ctx, type FactoryConfig, type InlineButton, type Pin, type Stage } from '../types';
import { bundleOf } from './bundle';
import { HOTFIX_BASE, agentHome, agentLog, baseBranchFor, playtestCommand, workDir } from './common';

export const CACHED_SUITE = `if grep -q '"test:cached"' package.json; then
  npm run test:cached -- --cache /test-cache
else
  echo "branch has no test:cached, full suite"
  npm test
fi`;

export const checkScript = (playtest: string) => `set -e
${STEP_FUNCTION}
mkdir -p tmp
${stepCall('npm ci')}
npm ci
${stepCall('tests and typecheck')}
npm run typecheck > tmp/typecheck.log 2>&1 &
typecheck=$!
${CACHED_SUITE}
${stepCall('tests done')}
if ! wait "$typecheck"; then cat tmp/typecheck.log; exit 1; fi
${stepCall('dev server')}
npm run dev -- --port 5173 --strictPort > tmp/dev-server.log 2>&1 &
server=$!
ready=0
for i in $(seq 1 60); do
  if curl -sf http://localhost:5173 > /dev/null; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then kill "$server"; exit 1; fi
${stepCall('playtest')}
set +e
${playtest}
code=$?
kill "$server"
if [ "$code" -ne 0 ]; then exit "$code"; fi
set -e
${stepCall('build')}
SAVE_SCOPE="$BUILD_SCOPE" npm run build
${stepCall('done')}
`;

export const previewScript = (playtest: string) => `set -e
${STEP_FUNCTION}
mkdir -p tmp
${stepCall('npm ci')}
npm ci
${stepCall('typecheck')}
npm run typecheck
${stepCall('dev server')}
npm run dev -- --port 5173 --strictPort > tmp/dev-server.log 2>&1 &
server=$!
ready=0
for i in $(seq 1 60); do
  if curl -sf http://localhost:5173 > /dev/null; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then kill "$server"; exit 1; fi
${stepCall('playtest')}
set +e
${playtest}
code=$?
kill "$server"
if [ "$code" -ne 0 ]; then exit "$code"; fi
set -e
${stepCall('build')}
SAVE_SCOPE="$BUILD_SCOPE" npm run build
${stepCall('done')}
`;

export const buildScript = `set -e
${STEP_FUNCTION}
mkdir -p tmp
${stepCall('npm ci')}
npm ci
${stepCall('build')}
SAVE_SCOPE="$BUILD_SCOPE" npm run build
${stepCall('done')}
`;

export async function runStage(ctx: Ctx, issue: number): Promise<void> {
  if (!readState(ctx.statePath).postOnly.includes(issue)) throw new Error(`Issue #${issue} is not waiting for a post with no checks`);
  const home = agentHome(workDir(ctx, issue), GAME_DIR);
  const item = await ctx.github.issue(issue);
  const base = baseBranchFor(ctx, item.labels);
  const build = await ctx.repo.headHash(BRANCH(issue));
  const failure = (await runScript(ctx, issue, base, build, buildScript))?.failure ?? null;
  if (failure !== null) throw new Error(`The build failed, no factory checks ran.\n${failure}`);
  await publishAndPost(ctx, issue, approvalOrDefault(home), home, base, build, true);
  updateState(ctx.statePath, (state) => ({ ...state, postOnly: state.postOnly.filter((n) => n !== issue) }));
}

const DEFAULT_APPROVAL: Approval = { description: 'No testing agent wrote notes for this build. The pull request shows what changed.', howToTry: 'Play the build and try the change the issue asks for.' };

function approvalOrDefault(home: string): Approval {
  return existsSync(`${home}/${OUT_DIR}/approval.json`) ? readApproval(home) : DEFAULT_APPROVAL;
}

export async function publishAndPost(ctx: Ctx, issue: number, approval: Approval, home: string, base: string, build: string, unchecked: boolean): Promise<void> {
  const url = publishBuild(ctx, checkDir(ctx, issue), build);
  recordBuild(ctx.statePath, issue, build);
  await post(ctx, issue, approval, readShown(home), url, base, build, unchecked);
  await moveCard(ctx, issue, 'Approval', 'posted', cardFlow((await ctx.github.issue(issue)).labels));
}

function checkDir(ctx: Ctx, issue: number): string {
  return `${ctx.cfg.home}/work/check-issue-${issue}`;
}

export async function postCheckpoint(ctx: Ctx, issue: number, base: string, build: string, kind: 'docs' | 'preview' | 'full'): Promise<string | null> {
  if (kind === 'docs') return (await runScript(ctx, issue, base, build, buildScript))?.failure ?? null;
  return checkUntilReal(checkRun(ctx, issue, base, build, kind), (run) => ctx.log('verify', issue, `the checks only timed out, run ${run} of ${CHECK_RUNS}, running them again`));
}

function checkRun(ctx: Ctx, issue: number, base: string, build: string, kind: 'preview' | 'full'): () => Promise<CheckOutcome> {
  const playtest = playtestCommand(ctx.cfg, false);
  if (kind === 'preview') return () => runScript(ctx, issue, base, build, previewScript(playtest), 'verify');
  return () => oneSuiteAtATime(ctx, { stage: 'verify', issue }, () => runScript(ctx, issue, base, build, checkScript(playtest), 'verify', testPoolPin(ctx.cfg)));
}

export async function oneSuiteAtATime<T>(ctx: Ctx, at: { stage: Stage; issue: number | null }, work: () => Promise<T>): Promise<T> {
  const lock = join(ctx.cfg.home, 'locks', 'full-suite');
  if (isLocked(lock)) ctx.log(at.stage, at.issue, 'waits for the full suite of another job, since one runs at a time');
  const longestJobMinutes = Math.max(ctx.cfg.verifyTimeoutMinutes, ctx.cfg.mergeTimeoutMinutes, ctx.cfg.playtestTimeoutMinutes);
  return withLock(lock, longestJobMinutes * 60_000, work);
}

export function suiteEnv(cfg: FactoryConfig): Record<string, string> {
  return { TEST_STALL_MINUTES: String(cfg.testStallMinutes) };
}

export function testCacheMount(ctx: Ctx): Record<string, string> {
  const cache = `${ctx.cfg.home}/test-cache`;
  mkdirSync(cache, { recursive: true });
  return { [cache]: '/test-cache' };
}

async function runScript(ctx: Ctx, issue: number, base: string, build: string, script: string, stage: Stage = 'checks', pin?: Pin): Promise<CheckOutcome> {
  checkScope(build);
  const dir = checkDir(ctx, issue);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${ctx.cfg.home}/work`, { recursive: true });
  await ctx.repo.prepareWorkClone(BRANCH(issue), base, dir);
  return runChecks(ctx, { stage, issue }, dir, script, agentLog(ctx, issue, 'checks'), { BUILD_SCOPE: build, ...feedbackEnv(ctx.cfg) }, pin);
}

const PROGRESS_MS = 5 * 60_000;

export async function runChecks(ctx: Ctx, at: { stage: Stage; issue: number | null }, dir: string, script: string, log: string, env: Record<string, string>, pin?: Pin): Promise<CheckOutcome> {
  const started = Date.now();
  const from = existsSync(log) ? statSync(log).size : 0;
  const progress = setInterval(() => ctx.log(at.stage, at.issue, checksProgress(log, started)), PROGRESS_MS);
  try {
    await ctx.container.shell('checks', dir, script, log, { ...env, ...suiteEnv(ctx.cfg) }, testCacheMount(ctx), ctx.cfg.checksTimeoutMinutes, pin);
    return null;
  } catch (error) {
    return checkFailure(log, error, from);
  } finally {
    clearInterval(progress);
  }
}

export function checksProgress(log: string, started: number): string {
  const minutes = Math.round((Date.now() - started) / 60_000);
  if (!existsSync(log)) return `the checks still run after ${minutes} min, with no log yet`;
  return `the checks still run after ${minutes} min, log ${Math.round(statSync(log).size / 1024)} KB`;
}

const TIMEOUT_LINE = /(Test|Hook) timed out in \d+ms|Timeout calling "onTaskUpdate"/;

export type CheckOutcome = { failure: string; timedOut: boolean } | null;

export function timeoutOnly(outcome: NonNullable<CheckOutcome>): boolean {
  const errors = outcome.failure.split('\n').filter((line) => /Error:|timed out in/.test(line));
  return (outcome.timedOut || errors.length > 0) && errors.every((line) => TIMEOUT_LINE.test(line));
}

export const CHECK_RUNS = 3;

export async function checkUntilReal(check: () => Promise<CheckOutcome>, onTimeout: (run: number) => void): Promise<string | null> {
  for (let run = 1; ; run++) {
    const outcome = await check();
    if (outcome === null) return null;
    if (!timeoutOnly(outcome)) return outcome.failure;
    if (run === CHECK_RUNS) throw new Error(`The factory checks timed out ${CHECK_RUNS} times, under load or in a hung step. No test failed for another reason.\n${outcome.failure}`);
    onTimeout(run);
  }
}

const FAILURE_TAIL_LINES = 150;

function checkFailure(log: string, error: unknown, from: number): NonNullable<CheckOutcome> {
  const message = error instanceof Error ? error.message : String(error);
  const written = existsSync(log) ? readFileSync(log).subarray(from).toString('utf8') : '';
  const tail = written.trim() === '' ? message : written.split('\n').slice(-FAILURE_TAIL_LINES).join('\n');
  return { failure: stripAnsi(tail), timedOut: error instanceof CheckTimeoutError };
}

export const POST_MARK = 'Ready for approval:';

export const CAPTION_LIMIT = 1024;
const TRIM_MARK = '…';

export async function post(ctx: Ctx, issue: number, approval: Approval, shown: Shown, url: string, base: string, build: string, unchecked = false): Promise<void> {
  const { evidence, problem } = shown;
  const item = await ctx.github.issue(issue);
  const link = `https://github.com/${ctx.cfg.repo}/issues/${issue}`;
  const pr = await pullRequestUrl(ctx, issue, item.title, approval, base);
  const notice = `${problem === null ? '' : `⚠️ ${problem}\n\n`}${unchecked ? `${UNCHECKED_NOTICE}\n\n` : ''}`;
  await ctx.github.comment(issue, `${POST_MARK} ${url}\n\n${notice}${approval.description}\n\nHow to try: ${approval.howToTry}`);
  clearFeedback(ctx.statePath, issue);
  const caption = approvalCaption(`#${issue} ${item.title}`, url, link, pr, approval, base, evidence === null, unchecked);
  const track = {
    add: (id: number) => updateState(ctx.statePath, (state) => ({ ...state, approvalPosts: { ...state.approvalPosts, [id]: issue }, postCaptions: { ...state.postCaptions, [id]: caption }, textPosts: evidence === null ? [...state.textPosts, String(id)] : state.textPosts })),
  };
  if (evidence !== null) await postWithEvidence(ctx, evidence, caption, approvalButtons(issue, base), track, { stage: 'checks', issue });
  else track.add(await ctx.telegram.sendButtons(ctx.cfg.committeeChat, caption, approvalButtons(issue, base)));
  await postPublicBuild(ctx, issue, build, url, approval.description);
}

async function postPublicBuild(ctx: Ctx, issue: number, build: string, url: string, description: string): Promise<void> {
  try {
    await postBuild(ctx, issue, build, url, description);
  } catch (error) {
    await reportFailure(ctx, 'public', issue, `the public build post failed, the committee post stands: ${error instanceof Error ? error.message : String(error)}`, null, []);
  }
}

async function pullRequestUrl(ctx: Ctx, issue: number, title: string, approval: Approval, base: string): Promise<string> {
  const open = await ctx.github.pullRequestFor(BRANCH(issue));
  if (open !== null) return open;
  const closes = [issue, ...bundleOf(readState(ctx.statePath), issue)].map((n) => `#${n}`).join(', ');
  const body = `Closes ${closes}.\n\n${approval.description}\n\nHow to try: ${approval.howToTry}\n\nThe factory merges it after the committee approves it and it passes hardening and the merge checks.`;
  return ctx.github.openPullRequest(BRANCH(issue), base, `#${issue} ${title}`, body);
}

export function approvalButtons(issue: number, base: string): InlineButton[][] {
  const approveText = base === HOTFIX_BASE ? 'Approve and ship to players' : 'Approve';
  return [[{ text: approveText, data: `factory:approve:${issue}` }, { text: 'Deny', data: `factory:deny:${issue}` }]];
}

const UNCHECKED_NOTICE = '⚠️ No factory checks ran on this build.';

function warningsOf(base: string, noScreenshot: boolean, unchecked: boolean): string {
  const hotfix = base === HOTFIX_BASE ? '⚠️ HOTFIX. Approve merges into main and ships to players at once. Play it with care.\n\n' : '';
  const unseen = noScreenshot ? '⚠️ No screenshot. Judge it by playing.\n\n' : '';
  const unverified = unchecked ? `${UNCHECKED_NOTICE}\n\n` : '';
  return `${hotfix}${unseen}${unverified}`;
}

export function approvalCaption(title: string, url: string, link: string, pr: string, approval: Approval, base: string, noScreenshot = false, unchecked = false): string {
  const warning = warningsOf(base, noScreenshot, unchecked);
  const head = `${warning}${title}\n\nPlay: ${url}\nIssue: ${link}\nPR: ${pr}`;
  const room = CAPTION_LIMIT - head.length - '\n\n'.repeat(2).length - 'How to try: '.length;
  const [description, howToTry] = fitBoth(approval.description, approval.howToTry, room);
  return [head, description, `How to try: ${howToTry}`].join('\n\n');
}

function fitBoth(first: string, second: string, room: number): [string, string] {
  if (first.length + second.length <= room) return [first, second];
  const half = Math.floor(room / 2);
  const firstRoom = Math.max(half, room - second.length);
  const cutFirst = cut(first, firstRoom);
  return [cutFirst, cut(second, room - cutFirst.length)];
}

export function cut(text: string, room: number): string {
  return text.length <= room ? text : `${text.slice(0, room - TRIM_MARK.length).trimEnd()}${TRIM_MARK}`;
}
