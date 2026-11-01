import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { withLockSync } from './lock';
import type { FactoryState, Failure, Job, JobStage, PlaytestState, StuckRecord } from './types';

export const EMPTY_STATE: FactoryState = { jobs: [], approvalPosts: {}, lastRelease: null, pendingPlaytest: null, devMerges: [], release: null, releasePost: null, pendingShip: null, pendingRemovals: [], pendingApprovals: {}, approvedResolving: {}, caughtUpTo: {}, keptApprovals: {},pendingIncidents: [], pendingAnswers: [], bundles: {}, adhocReplies: {}, lastTickError: null, failures: [], builds: {}, suiteCleared: {}, cardStarts: {}, postCaptions: {}, devBuild: null, devFailed: null, devError: null, interrupted: [], retried: [], postOnly: [], unroutedReplies: {}, textPosts: [], lastWasteReview: null, held: {}, stuck: {}, sweepError: null, asked: {}, questionPosts: {}, pendingFeedback: {}, routed: [], landings: {} };

const STATE_LOCK_MS = 30_000;

type OldFailure = Omit<Failure, 'cause'> & { cause?: Failure['cause']; decision?: boolean };
type OldStuck = Omit<StuckRecord, 'cause' | 'error'> & { cause: string; decision: boolean };
type OldFields = { job?: Omit<Job, 'id'> | null; testPhase?: Record<string, string>; patching?: unknown; visualSendBacks?: unknown; jobStarts?: unknown; pendingChanges?: unknown; pendingCut?: unknown };
type SavedState = Partial<FactoryState> & OldFields;

export function readState(path: string): FactoryState {
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);
  const { job, testPhase, patching: _patching, visualSendBacks: _visualSendBacks, jobStarts: _jobStarts, pendingChanges: _pendingChanges, pendingCut: _pendingCut, ...saved } = JSON.parse(readFileSync(path, 'utf8')) as SavedState;
  requireNoReleaseBranch(path, saved.release);
  const jobs = (saved.jobs ?? (job ? [{ ...job, id: basename(job.log, '.log') }] : [])).map(renameTesting);
  return { ...structuredClone(EMPTY_STATE), ...saved, jobs, ...fillHealth(saved), postOnly: saved.postOnly ?? postPhases(testPhase) };
}

function requireNoReleaseBranch(path: string, release: unknown): void {
  if (typeof release === 'object' && release !== null && 'branch' in release) throw new Error(`${path} holds a release with a release branch. The factory releases from dev now, so ship or close that release on the old code before this one runs.`);
}

function fillHealth(saved: SavedState): Pick<FactoryState, 'failures' | 'stuck'> {
  const failures = ((saved.failures ?? []) as OldFailure[]).map(fillFailure);
  return { failures, stuck: Object.fromEntries(Object.entries(saved.stuck ?? {}).map(([issue, record]) => [issue, fillStuck(record)])) };
}

function fillFailure(failure: OldFailure): Failure {
  const { decision, ...rest } = failure;
  return { ...rest, cause: failure.cause !== undefined ? failure.cause : decision === true ? 'decision' : null };
}

function fillStuck(record: StuckRecord | OldStuck): StuckRecord {
  if (!('decision' in record)) return record;
  const { decision, cause, ...rest } = record;
  return { ...rest, error: cause, cause: decision ? 'decision' : null };
}

function postPhases(testPhase: Record<string, string> | undefined): number[] {
  return Object.entries(testPhase ?? {}).filter(([, phase]) => phase === 'post').map(([issue]) => Number(issue));
}

export function newPlaytest(day: string): PlaytestState {
  return { seed: Number(day.replaceAll('-', '')), runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null };
}

function renameTesting(job: Job): Job {
  return (job.stage as string) === 'testing' ? { ...job, stage: 'verify' } : job;
}

export function writeState(path: string, state: FactoryState): void {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, path);
}

export function updateState(path: string, change: (state: FactoryState) => FactoryState): FactoryState {
  return withLockSync(join(dirname(path), 'state.lock'), STATE_LOCK_MS, () => {
    const next = change(readState(path));
    writeState(path, next);
    return next;
  });
}

const omit = (record: Record<string, string>, key: string): Record<string, string> => Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

const CLEARS: Partial<Record<JobStage, (state: FactoryState, issue: number | null) => FactoryState>> = {
  approve: (state, issue) => ({ ...state, pendingApprovals: omit(state.pendingApprovals, String(issue)) }),
  incident: (state, issue) => (issue === null ? state : { ...state, pendingIncidents: withoutFirst(state.pendingIncidents, [issue]) }),
  ship: (state) => ({ ...state, pendingShip: null }),
  playtest: (state) => ({ ...state, pendingPlaytest: null }),
  remove: (state, issue) => {
    const first = state.pendingRemovals.findIndex((item) => item.issue === issue);
    return { ...state, pendingRemovals: state.pendingRemovals.filter((_, index) => index !== first) };
  },
};

export function clearQueued(state: FactoryState, stage: JobStage, issue: number | null): FactoryState {
  const cleared = CLEARS[stage]?.(state, issue) ?? state;
  return { ...cleared, retried: cleared.retried.filter((key) => key !== orderKey(stage, issue)) };
}

export function withoutFirst(list: number[], items: number[]): number[] {
  const rest = [...list];
  for (const item of items) {
    const index = rest.indexOf(item);
    if (index !== -1) rest.splice(index, 1);
  }
  return rest;
}

const QUEUED: Partial<Record<JobStage, (state: FactoryState, issue: number | null) => boolean>> = {
  approve: (state, issue) => Object.hasOwn(state.pendingApprovals, String(issue)),
  remove: (state, issue) => state.pendingRemovals.some((item) => item.issue === issue),
  ship: (state) => state.pendingShip !== null,
  playtest: (state) => state.pendingPlaytest !== null,
  incident: (state, issue) => issue !== null && state.pendingIncidents.includes(issue),
};

export function isQueued(state: FactoryState, stage: JobStage, issue: number | null): boolean {
  return QUEUED[stage]?.(state, issue) ?? false;
}

export const orderKey =(stage: JobStage, issue: number | null): string => `${stage}:${issue ?? '-'}`;
