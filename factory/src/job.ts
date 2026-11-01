import { withActiveRun } from './active-run';
import { rebuildDev } from './deploy';
import { failureIssue, reportFailure, summarizeError } from './fail';
import { UsageLimitError } from './pause';
import { CARD_JOBS } from './position';
import { BudgetError } from './stages/checkpoint';
import { CommitteeDecisionError, ForeignBaseError } from './diff-guard';
import { rebuildOnOwnBase } from './stages/rebuild';
import { adhoc } from './stages/adhoc';
import { approve } from './stages/approval';
import { runStage as design } from './stages/design';
import { runStage as implement } from './stages/implement';
import { candidate } from './stages/candidate';
import { playtest } from './stages/playtest';
import { release } from './stages/release';
import { runStage as incident } from './stages/incident';
import { answer } from './stages/answer';
import { remove } from './stages/remove';
import { ship } from './stages/ship';
import { runStage as checks } from './stages/checks';
import { merge } from './stages/merge';
import { catchUp } from './stages/catch-up';
import { runStage as verify } from './stages/verify';
import { runStage as harden } from './stages/harden';
import { runStage as waste } from './stages/waste';
import { runStage as triage } from './stages/triage';
import { chargeJobSpend } from './landing-work';
import { recordJob, type JobOutcome } from './ledger';
import { clearSessions, markResumed, resumedStage } from './sessions';
import { clearQueued, readState, updateState } from './state';
import { QUEUE_OF, type Ctx, type Job, type JobStage } from './types';

type Handler = (ctx: Ctx, issue: number) => Promise<void>;

const HANDLERS: Record<Exclude<JobStage, 'release' | 'dev' | 'waste' | 'merge' | 'answer'>, Handler> = {
  triage, design, implement, verify, harden, checks, adhoc, playtest, candidate, remove, incident,
  'catch-up': catchUp,
  ship: (ctx, issue) => ship(ctx, issue, readState(ctx.statePath).pendingShip),
  approve: (ctx, issue) => approve(ctx, issue, readState(ctx.statePath).pendingApprovals[String(issue)] ?? 'the committee'),
};

const CARD_STAGE_NAMES: Partial<Record<JobStage, string>> = { triage: 'Triage', design: 'Design', implement: 'Implementation', verify: 'Testing', harden: 'Hardening', checks: 'Post' };

export function failureNote(ctx: Ctx, stage: JobStage, startedAt: string | null): string {
  const minutes = startedAt ? Math.round((ctx.now().getTime() - new Date(startedAt).getTime()) / 60_000) : null;
  const took = minutes === null ? '' : ` after ${minutes} min`;
  return `${CARD_STAGE_NAMES[stage]} failed${took}. Hermes is looking into it.`;
}

async function noteFailure(ctx: Ctx, stage: JobStage, issue: number | null, job: Job | null): Promise<void> {
  if (issue === null || !(stage in CARD_STAGE_NAMES)) return;
  await ctx.github.comment(issue, failureNote(ctx, stage, job?.startedAt ?? null));
}

function retriesItself(ctx: Ctx, stage: JobStage, issue: number | null, error: unknown): issue is number {
  if (issue === null || !CARD_JOBS.includes(stage)) return false;
  if (error instanceof BudgetError || error instanceof UsageLimitError || error instanceof CommitteeDecisionError) return false;
  return !readState(ctx.statePath).interrupted.includes(issue);
}

function resumeOnce(ctx: Ctx, stage: JobStage, issue: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  markResumed(ctx.cfg.home, issue, stage, summarizeError(message));
  updateState(ctx.statePath, (state) => ({ ...state, interrupted: [...state.interrupted, issue] }));
  ctx.log(stage, issue, `stopped on an error, it resumes once: ${message}`);
}

function keepFailedSessions(ctx: Ctx, stage: JobStage, issue: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  markResumed(ctx.cfg.home, issue, stage, summarizeError(message));
  ctx.log(stage, issue, 'failed, its agent sessions stay for the next start of this stage');
}

function ownJob(ctx: Ctx, stage: JobStage, issue: number | null): Job | null {
  return readState(ctx.statePath).jobs.find((job) => job.stage === stage && job.issue === issue) ?? null;
}

export function runJob(ctx: Ctx, stage: JobStage, issue: number | null): Promise<void> {
  return withActiveRun(ctx, stage, issue, () => runLockedJob(ctx, stage, issue));
}

async function runLockedJob(ctx: Ctx, stage: JobStage, issue: number | null): Promise<void> {
  const job = ownJob(ctx, stage, issue);
  const entry = ledgerEntry(ctx, job, stage, issue);
  let outcome: JobOutcome = 'failed';
  let retry = false;
  if (!resuming(ctx, stage, issue)) clearSessionsOf(ctx, stage, issue);
  try {
    await dispatch(ctx, stage, issue, job);
    outcome = 'done';
    ctx.log(stage, issue, 'done');
  } catch (error) {
    retry = await failed(ctx, stage, issue, job, error);
  } finally {
    chargeJobSpend(ctx.statePath, entry, recordJob(ctx.cfg.home, ctx.cfg.tokenPrices, ctx.now(), withBatch(ctx, entry, job), outcome));
    clearJob(ctx, stage, issue, retry);
    if (!retry && !keepsSessions(stage, outcome)) clearSessionsOf(ctx, stage, issue);
  }
}

const keepsSessions = (stage: JobStage, outcome: JobOutcome): boolean => outcome !== 'done' && CARD_JOBS.includes(stage);

async function rebuilt(ctx: Ctx, stage: JobStage, issue: number | null, error: unknown): Promise<boolean> {
  if (!(error instanceof ForeignBaseError) || issue === null || !CARD_JOBS.includes(stage)) return false;
  await rebuildOnOwnBase(ctx, stage, issue, error);
  return true;
}

async function failed(ctx: Ctx, stage: JobStage, issue: number | null, job: Job | null, error: unknown): Promise<boolean> {
  return !(await rebuilt(ctx, stage, issue, error)) && failedForGood(ctx, stage, issue, job, error);
}

async function failedForGood(ctx: Ctx, stage: JobStage, issue: number | null, job: Job | null, error: unknown): Promise<boolean> {
  const retry = retriesItself(ctx, stage, issue, error);
  if (retry) {
    resumeOnce(ctx, stage, issue, error);
    return true;
  }
  if (issue !== null && CARD_JOBS.includes(stage)) keepFailedSessions(ctx, stage, issue, error);
  await reportFailure(ctx, stage, failureIssue(stage, issue, readState(ctx.statePath)), error, job?.log ?? null, batchOf(ctx, job));
  await noteFailure(ctx, stage, issue, job);
  return false;
}

function batchOf(ctx: Ctx, job: Job | null): number[] {
  if (job === null) return [];
  return readState(ctx.statePath).jobs.find((other) => other.id === job.id)?.batch ?? [];
}

function withBatch<T extends object>(ctx: Ctx, entry: T, job: Job | null): T & { batch?: number[] } {
  const batch = job === null ? undefined : readState(ctx.statePath).jobs.find((other) => other.id === job.id)?.batch;
  return batch === undefined ? entry : { ...entry, batch };
}

function ledgerEntry(
  ctx: Ctx,
  job: Job | null,
  stage: JobStage,
  issue: number | null,
): {
  id: string | null;
  stage: JobStage;
  issue: number | null;
  startedAt: string;
  log?: string;
} {
  if (job === null) return { id: null, stage, issue, startedAt: ctx.now().toISOString() };
  return { id: job.id, stage, issue, startedAt: job.startedAt, log: job.log };
}

function resuming(ctx: Ctx, stage: JobStage, issue: number | null): boolean {
  return issue !== null && resumedStage(ctx.cfg.home, issue) === stage;
}

function clearSessionsOf(ctx: Ctx, stage: JobStage, issue: number | null): void {
  if (issue !== null && QUEUE_OF[stage] !== 'branch') clearSessions(ctx.cfg.home, issue);
}

const ISSUELESS: Record<'release' | 'dev' | 'waste' | 'merge' | 'answer', (ctx: Ctx, job: Job | null) => Promise<unknown>> = {
  release: (ctx) => release(ctx),
  waste: (ctx) => waste(ctx),
  answer: (ctx) => answer(ctx),
  merge: (ctx) => merge(ctx),
  dev: (ctx, job) => rebuildDev(ctx, job?.log ?? `${ctx.cfg.home}/logs/dev-build.log`),
};

const isIssueless = (stage: JobStage): stage is keyof typeof ISSUELESS => stage in ISSUELESS;

async function dispatch(ctx: Ctx, stage: JobStage, issue: number | null, job: Job | null): Promise<void> {
  if (isIssueless(stage)) return void (await ISSUELESS[stage](ctx, job));
  if (issue === null) throw new Error(`Job ${stage} needs an issue or change id`);
  return HANDLERS[stage](ctx, issue);
}

function clearJob(ctx: Ctx, stage: JobStage, issue: number | null, resumes: boolean): void {
  updateState(ctx.statePath, (state) => {
    const jobs = state.jobs.filter((job) => job.stage !== stage || job.issue !== issue);
    const interrupted = QUEUE_OF[stage] === 'branch' || resumes ? state.interrupted : state.interrupted.filter((item) => item !== issue);
    return { ...clearQueued(state, stage, issue), jobs, interrupted };
  });
}
