import { join } from 'node:path';
import { deployDev } from '../deploy';
import { withoutFailuresOf } from '../fail';
import { must } from '../exec';
import { JOB_ID_ENV } from '../jobs';
import { addConflictSpend, addSpend, closeLanding, landingSession, markMerged, openLanding, type LandingPlan } from '../landing-work';
import { readState, updateState } from '../state';
import { BRANCH, GAME_DIR, RELEASE_CANDIDATE_LABEL, RELEASE_TASK_LABEL, STUCK_LABEL, type Card, type Ctx, type FactoryState, type IssueMerge, type LandingStage, type LandingWork } from '../types';
import { withWorkFolder } from '../work-lock';
import { closeMerged } from './approval';
import { BaselineFailureError, BudgetError, runCost, untilPasses } from './checkpoint';
import { checkScript, checkUntilReal, runChecks } from './checks';
import { withoutBaseline } from './baseline';
import { ownWorkSettled } from './card-suite';
import { cardFlow, moveCard } from '../card-events';
import { remoteSuiteResult } from './remote-suite';
import { guardAgainstAll } from '../diff-guard';
import { labelStuckBatch } from '../stuck';
import { BASE_BRANCH, baseBranchFor, fillPrompt, isGameSource, playtestCommand, resetOutputs } from './common';
import { releaseLog } from './release-common';

const UNCHECKED = 'This card reached Merging with no green full suite on its own work, so it goes to Hardening, which runs the suite and then moves it back to Merging.';

export async function uncheckedMerges(ctx: Ctx): Promise<Card[]> {
  const state = readState(ctx.statePath);
  const kept = state.landings.merge?.cards ?? [];
  const waiting = waitingMerges(state, await ctx.github.cards()).filter((card) => !kept.includes(card.issue));
  const settled = await Promise.all(waiting.map((card) => ownWorkSettled(ctx, card.issue, baseBranchFor(ctx, card.labels))));
  return waiting.filter((_, index) => !settled[index]);
}

export async function merge(ctx: Ctx): Promise<void> {
  const unchecked = await uncheckedMerges(ctx);
  for (const card of unchecked) {
    await ctx.github.comment(card.issue, UNCHECKED);
    await moveCard(ctx, card.issue, 'Hardening', 'moved', cardFlow(card.labels));
  }
  const batch = await nextBatch(ctx, unchecked.map((card) => card.issue));
  if (batch === null) return ctx.log('merge', null, 'no card waits in Merging');
  try {
    await withWorkFolder(ctx, 'merge-queue', () => mergeBatch(ctx, batch.base, batch.cards));
  } catch (error) {
    await labelStuckBatch(ctx, batch.cards.map((card) => card.issue));
    if (error instanceof BaselineFailureError) await commentBaseline(ctx, batch.cards, error).catch((failed: unknown) => ctx.log('merge', null, `the baseline comment failed: ${failed instanceof Error ? failed.message : String(failed)}`));
    throw error;
  }
}

async function commentBaseline(ctx: Ctx, cards: Card[], error: BaselineFailureError): Promise<void> {
  const batch = cards.map((card) => `#${card.issue}`).join(', ');
  const tests = error.tests.map((test) => `- ${test}`).join('\n');
  for (const card of cards) await ctx.github.comment(card.issue, `The merge checks of ${batch} fail only on tests that also fail on ${error.into} at ${error.base}, so no fix round ran and nothing merged. The card waits for ${error.into} to pass them:\n${tests}`);
}

async function mergeBatch(ctx: Ctx, base: string, cards: Card[]): Promise<void> {
  const dir = join(ctx.cfg.home, 'work', 'merge-queue');
  await ctx.repo.fetch();
  const { work, resumed } = openLanding(ctx, 'merge', dir, await batchPlan(ctx, base, cards), runningJobId());
  const clock = newClock();
  const land: Landing = { stage: 'merge', dir, into: base, guardAgainst: [base], agent: landingAgent(ctx, 'merge', dir, work, resumed), clock, staleBase: resumed };
  let merged = { merges: work.merges, conflicts: 0 };
  try {
    if (!resumed) merged = await mergeCards(ctx, land, cards);
    const fixList = cards.map((card) => `- #${card.issue} on ${BRANCH(card.issue)}`).join('\n');
    await checkAndPush(ctx, land, merged.conflicts, (failure) => fillPrompt('merge-fix', { into: base, cards: fixList, failure }));
  } finally {
    ctx.log('merge', null, `batch ${cards.map((card) => `#${card.issue}`).join(' ')} took ${clockLine(clock)}`);
  }
  closeLanding(ctx, 'merge', dir);
  recordMerges(ctx, base, merged.merges);
  await settle(ctx, base, cards, merged.merges);
}

export const runningJobId = (): string | null => process.env[JOB_ID_ENV] ?? null;

async function batchPlan(ctx: Ctx, base: string, cards: Card[]): Promise<LandingPlan> {
  const sources = await Promise.all(cards.map(async (card) => ({ branch: BRANCH(card.issue), sha: await ctx.repo.headHash(BRANCH(card.issue)) })));
  return { into: base, sources, cards: cards.map((card) => card.issue) };
}

async function mergeCards(ctx: Ctx, land: Landing, cards: Card[]): Promise<{ merges: IssueMerge[]; conflicts: number }> {
  await ctx.repo.prepareWorkClone(land.into, land.into, land.dir);
  resetOutputs(join(land.dir, GAME_DIR));
  const merges: IssueMerge[] = [];
  let conflicts = 0;
  for (const card of cards) {
    const title = (await ctx.github.issue(card.issue)).title;
    conflicts += await timed(land.clock, 'merges', () => mergeIn(ctx, land, { branch: BRANCH(card.issue), message: `Merge issue #${card.issue}: ${title}`, reason: `issue #${card.issue} was approved` }));
    merges.push({ issue: card.issue, title, sha: await ctx.repo.workHead(land.dir), into: land.into, reverted: [] });
  }
  markMerged(ctx, 'merge', merges);
  return { merges, conflicts };
}

function recordMerges(ctx: Ctx, base: string, merges: IssueMerge[]): void {
  updateState(ctx.statePath, (state) => {
    if (base === BASE_BRANCH) return { ...state, devMerges: [...state.devMerges, ...merges] };
    if (state.release?.branch !== base) throw new Error(`Merged into ${base}, but the open release is on ${state.release?.branch ?? 'no branch'}`);
    return { ...state, release: { ...state.release, merges: [...state.release.merges, ...merges] } };
  });
}

export type Landing = { stage: LandingStage; dir: string; into: string; guardAgainst: string[]; agent: (prompt: string) => Promise<string>; clock?: Clock; staleBase?: boolean };

type Phase = 'merges' | 'checks' | 'fixes' | 'remerges' | 'pushes';
type Clock = Record<Phase, { ms: number; count: number }>;
const PHASES: Phase[] = ['merges', 'checks', 'fixes', 'remerges', 'pushes'];

function newClock(): Clock {
  return Object.fromEntries(PHASES.map((phase) => [phase, { ms: 0, count: 0 }])) as Clock;
}

async function timed<T>(clock: Clock | undefined, phase: Phase, work: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await work();
  } finally {
    if (clock) clock[phase] = { ms: clock[phase].ms + Date.now() - start, count: clock[phase].count + 1 };
  }
}

function clockLine(clock: Clock): string {
  return PHASES.map((phase) => `${phase} ${Math.round(clock[phase].ms / 60_000)} min in ${clock[phase].count}`).join(', ');
}

export async function checkAndPush(ctx: Ctx, land: Landing, conflictUsd: number, fixPrompt: (failure: string) => string): Promise<void> {
  let conflicts = conflictUsd;
  let fixes = keptSpend(ctx, land.stage);
  let recheck = true;
  for (;;) {
    if (recheck) fixes = await fixUntilPasses(ctx, land, fixes, conflicts, fixPrompt);
    const unpushed = await timed(land.clock, 'pushes', () => pushed(ctx, land));
    if (unpushed === null) return;
    conflicts += await timed(land.clock, 'remerges', () => mergeIn(ctx, land, { branch: land.into, message: undefined, reason: `${land.into} moved on GitHub while the checks ran` }));
    recheck = (await ctx.repo.changedInWork(land.dir, unpushed)).some(isGameSource);
    if (!recheck) ctx.log(land.stage, null, `${land.into} moved by docs only, so the checks that passed still hold`);
  }
}

async function fixUntilPasses(ctx: Ctx, land: Landing, fixes: number, conflicts: number, fixPrompt: (failure: string) => string): Promise<number> {
  const checkHead = checksOnceEachHead(ctx, land, () => timed(land.clock, 'checks', () => mergedChecks(ctx, land)));
  const check = async (): Promise<string | null> => {
    await refreshKeptBase(ctx, land);
    return checkHead();
  };
  try {
    return await untilPasses(ctx.cfg.mergingBudgetUsd, fixes, check, (failure) => timed(land.clock, 'fixes', () => keptFix(ctx, land, fixPrompt(failure))));
  } catch (error) {
    if (error instanceof BudgetError) throw new BudgetError(`${error.message}\nThe budget counts only fix rounds. The job also spent $${conflicts.toFixed(2)} on conflicts.`);
    throw error;
  }
}

function checksOnceEachHead(ctx: Ctx, land: Landing, checks: () => Promise<string | null>): () => Promise<string | null> {
  let checked: { head: string; failure: string | null } | null = null;
  return async () => {
    const dirty = await dirtyClone(ctx, land);
    if (dirty !== null) return dirty;
    const head = await ctx.repo.workHead(land.dir);
    if (checked !== null && checked.head === head) {
      ctx.log(land.stage, null, `the fix round made no commit, so ${head} keeps its failure and the checks do not run again`);
      return `${checked.failure}\n\nYour last round made no commit, so the head is still ${head} and the factory did not run the checks again. The failure above still stands. Commit the fix. Changes left uncommitted are never tested.`;
    }
    checked = { head, failure: await checks() };
    return checked.failure;
  };
}

const MERGE_BATCH_CARDS = 3;

async function nextBatch(ctx: Ctx, movedOut: number[]): Promise<{ base: string; cards: Card[] } | null> {
  const cards = (await ctx.github.cards()).filter((card) => !movedOut.includes(card.issue));
  let taken: { base: string; cards: Card[] } | null = null;
  updateState(ctx.statePath, (state) => {
    const batchCards = nextBatchCards(state, cards, (card) => baseBranchFor(ctx, card.labels));
    if (batchCards.length > 0) taken = { base: baseBranchFor(ctx, batchCards[0]!.labels), cards: batchCards };
    const batch = batchCards.map((card) => card.issue);
    return { ...state, jobs: state.jobs.map((job) => (job.stage === 'merge' ? { ...job, batch } : job)) };
  });
  return taken;
}

export function nextBatchCards(state: FactoryState, cards: Card[], baseOf: (card: Card) => string): Card[] {
  const waiting = waitingMerges(state, cards).filter((card) => !state.jobs.some((job) => job.issue === card.issue));
  if (waiting.length === 0) return [];
  const kept = keptBatch(state, waiting);
  if (kept !== null) return kept;
  const base = baseOf(waiting[0]!);
  return waiting.filter((card) => baseOf(card) === base).slice(0, MERGE_BATCH_CARDS);
}

function keptBatch(state: FactoryState, waiting: Card[]): Card[] | null {
  const kept = state.landings.merge?.cards;
  if (kept === undefined) return null;
  const batch = kept.map((issue) => waiting.find((card) => card.issue === issue));
  return batch.every((card) => card !== undefined) ? batch : null;
}

export function waitingMerges(state: FactoryState, cards: Card[]): Card[] {
  const shipping = state.jobs.some((job) => job.stage === 'ship');
  const merging = state.jobs.filter((job) => job.stage === 'merge').flatMap((job) => job.batch ?? []);
  return cards.filter((card) =>
    card.column === 'Merging' && !card.labels.includes(STUCK_LABEL) && !(String(card.issue) in state.held) && !(shipping && card.labels.includes(RELEASE_TASK_LABEL)) && !merging.includes(card.issue));
}

function keptSpend(ctx: Ctx, stage: LandingStage): number {
  const work = readState(ctx.statePath).landings[stage];
  if (work === undefined) throw new Error(`The ${stage} job checks work that has no landing record`);
  return work.spentUsd;
}

async function refreshKeptBase(ctx: Ctx, land: Landing): Promise<void> {
  if (land.staleBase !== true || (await uncommitted(ctx, land.dir)) !== '') return;
  land.staleBase = false;
  await mergeIn(ctx, land, { branch: land.into, message: undefined, reason: `${land.into} may have moved while this work was kept` });
}

async function keptFix(ctx: Ctx, land: Landing, prompt: string): Promise<string> {
  const output = await land.agent(prompt);
  addSpend(ctx, land.stage, runCost(output));
  return output;
}

export const LANDING_RESUME_NOTE = 'An earlier job on this same work stopped before it pushed, and this job continues it. The clone keeps your commits and your uncommitted changes, so read git log and git status first and carry on from there. Do not redo work that is already in the clone.';

export function landingAgent(ctx: Ctx, stage: LandingStage, dir: string, work: LandingWork, resumed: boolean): (prompt: string) => Promise<string> {
  const session = landingSession(ctx, stage, work);
  const log = releaseLog(ctx, `${stage}-${work.into.replaceAll('/', '-')}`);
  let note = resumed;
  return (prompt) => {
    const run = { dir: session.dir, id: session.id, resume: session.resume };
    const full = note ? `${LANDING_RESUME_NOTE}\n\n${prompt}` : prompt;
    session.resume = true;
    note = false;
    return ctx.container.agent({ clone: dir, dir: GAME_DIR, model: ctx.cfg.buildModel, prompt: full, log, session: run });
  };
}

type Incoming = { branch: string; message: string | undefined; reason: string };

export async function mergeIn(ctx: Ctx, land: Landing, { branch, message, reason }: Incoming): Promise<number> {
  const { commit, conflicts } = await ctx.repo.mergeBranchIntoWork(land.dir, branch, message);
  if (commit === null || conflicts.length === 0) return 0;
  ctx.log(land.stage, null, `${branch} conflicts with ${land.into} in ${conflicts.join(', ')}, an agent resolves it`);
  const cost = runCost(await land.agent(fillPrompt('merge-branches', { into: land.into, branch, reason, files: conflicts.map((file) => `- ${file}`).join('\n') })));
  addConflictSpend(ctx, land.stage, cost);
  if ((await ctx.repo.mergeBranchIntoWork(land.dir, branch)).commit !== null) throw new Error(`The ${land.stage} agent left the merge of ${branch} into ${land.into} unfinished.`);
  return cost;
}

async function testedInWork(ctx: Ctx, land: Landing): Promise<boolean> {
  return (await ctx.repo.changedInWork(land.dir, `origin/${land.into}`)).some(isGameSource);
}

async function dirtyClone(ctx: Ctx, land: Landing): Promise<string | null> {
  const dirty = await testedInWork(ctx, land) ? await uncommitted(ctx, land.dir) : '';
  return dirty === '' ? null : `The clone has changes that are not committed, so the full suite cannot test them. Commit them or remove them:\n${dirty}`;
}

async function mergedChecks(ctx: Ctx, land: Landing): Promise<string | null> {
  const log = releaseLog(ctx, `${land.stage}-checks-${land.into.replaceAll('/', '-')}`);
  const tested = await testedInWork(ctx, land);
  const { suite } = tested ? await suiteOnHead(ctx, land) : { suite: Promise.resolve(null) };
  const script = checkScript(playtestCommand(ctx.cfg, false), '');
  const at = { stage: land.stage, issue: null };
  const failure = await checkUntilReal(() => runChecks(ctx, at, land.dir, script, log, { BUILD_SCOPE: land.stage }), (run) => ctx.log(land.stage, null, `the checks only timed out, run ${run}, running them again`));
  return failure ?? await suite;
}

async function uncommitted(ctx: Ctx, dir: string): Promise<string> {
  return must(await ctx.run('git', ['-C', dir, 'status', '--porcelain'], { activity: 'git' }), 'git status in the merge clone').trim();
}

async function suiteOnHead(ctx: Ctx, land: Landing): Promise<{ suite: Promise<string | null> }> {
  const head = await guardedHead(ctx, land);
  await ctx.repo.replaceBranch(head, `factory/suite-${land.stage}-${land.into.replaceAll('/', '-')}`);
  const check = { stage: land.stage, into: land.into, base: await ctx.repo.headHash(land.into), head };
  const suite = remoteSuiteResult(ctx, { stage: land.stage, issue: null }, head).then((result) => (result.failure === null ? null : withoutBaseline(ctx, check, result)));
  suite.catch(() => undefined);
  return { suite };
}

async function guardedHead(ctx: Ctx, land: Landing): Promise<string> {
  const head = await ctx.repo.fetchFromWork(land.dir, land.into);
  guardAgainstAll(await Promise.all(land.guardAgainst.map(async (branch) => ({ files: await ctx.repo.changedFiles(branch, head), diff: await ctx.repo.diff(branch, head) }))));
  return head;
}

async function pushed(ctx: Ctx, land: Landing): Promise<string | null> {
  const head = await guardedHead(ctx, land);
  try {
    await ctx.repo.push(head, land.into);
    return null;
  } catch (error) {
    await ctx.repo.fetch();
    if (await ctx.repo.isMerged(land.into, head)) throw error;
    ctx.log(land.stage, null, `${land.into} moved during the checks, merging it in again`);
    return head;
  }
}

async function settle(ctx: Ctx, base: string, cards: Card[], merges: IssueMerge[]): Promise<void> {
  const where = base === BASE_BRANCH ? 'dev' : `the release branch ${base}`;
  for (const [index, card] of cards.entries()) await settleCard(ctx, card, cards, merges[index]!, where);
  if (base === BASE_BRANCH) await deployDev(ctx, releaseLog(ctx, 'merge-dev-build'));
  else updateState(ctx.statePath, (next) => (next.release ? { ...next, pendingShip: null, release: { ...next.release, postId: null, removed: next.release.removed.filter((n) => !cards.some((card) => card.issue === n)) } } : next));
}

async function settleCard(ctx: Ctx, card: Card, cards: Card[], merge: IssueMerge, where: string): Promise<void> {
  const by = readState(ctx.statePath).approvedResolving[String(card.issue)] ?? 'the factory';
  const others = cards.filter((other) => other.issue !== card.issue).map((other) => `#${other.issue}`);
  const batch = others.length > 0 ? ` It merged together with ${others.join(', ')}, and the checks passed on the result.` : '';
  await ctx.github.comment(card.issue, `Approved by ${by} and merged into ${where}.${batch} It closes when its release ships.`);
  await ctx.github.addLabel(card.issue, RELEASE_CANDIDATE_LABEL);
  updateState(ctx.statePath, (state) => ({ ...state, failures: withoutFailuresOf(state.failures, card.issue) }));
  await closeMerged(ctx, card.issue, card.labels, null, { into: merge.into, sha: merge.sha });
}
