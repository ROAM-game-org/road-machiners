import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { withLockSync } from './lock';
import type { FactoryState, Failure, Job, JobStage, PlaytestState, ReleaseState, StuckRecord } from './types';

export const EMPTY_STATE: FactoryState = { jobs: [], approvalPosts: {}, lastRelease: null, devMerges: [], release: null, releasePost: null, pendingShip: null, pendingRemovals: [], pendingApprovals: {}, approvedResolving: {}, caughtUpTo: {}, keptApprovals: {},pendingIncidents: [], pendingAnswers: [], bundles: {}, adhocReplies: {}, lastTickError: null, failures: [], builds: {}, cardStarts: {}, postCaptions: {}, devBuild: null, devFailed: null, devError: null, interrupted: [], retried: [], postOnly: [], unroutedReplies: {}, textPosts: [], lastWasteReview: null, held: {}, stuck: {}, sweepError: null, asked: {}, questionPosts: {}, pendingFeedback: {}, routed: [] };

const STATE_LOCK_MS = 30_000;

type OldFailure = Omit<Failure, 'cause'> & { cause?: Failure['cause']; decision?: boolean };
type OldStuck = Omit<StuckRecord, 'cause' | 'error'> & { cause: string; decision: boolean };
type OldFields = { job?: Omit<Job, 'id'> | null; testPhase?: Record<string, string>; patching?: unknown; visualSendBacks?: unknown; jobStarts?: unknown; pendingChanges?: unknown };
type SavedState = Partial<FactoryState> & OldFields;

export function readState(path: string): FactoryState {
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);
  const { job, testPhase, patching: _patching, visualSendBacks: _visualSendBacks, jobStarts: _jobStarts, pendingChanges: _pendingChanges, ...saved } = JSON.parse(readFileSync(path, 'utf8')) as SavedState;
  const jobs = (saved.jobs ?? (job ? [{ ...job, id: basename(job.log, '.log') }] : [])).map(renameTesting);
  return { ...structuredClone(EMPTY_STATE), ...saved, release: saved.release ? fillRelease(saved.release) : null, jobs, ...fillHealth(saved), postOnly: saved.postOnly ?? postPhases(testPhase) };
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
  return { seed: Number(day.replaceAll('-', '')), runs: 0, passed: null, blocked: null, notes: [] };
}

function fillRelease(release: Partial<ReleaseState> & Pick<ReleaseState, 'day'>): ReleaseState {
  return { ...release, candidateSha: release.candidateSha ?? null, tasks: release.tasks ?? [], playtest: release.playtest ? dropStreak(release.playtest) : newPlaytest(release.day) } as ReleaseState;
}

function dropStreak(playtest: PlaytestState & { streak?: number }): PlaytestState {
  const { streak: _streak, ...rest } = playtest;
  return rest;
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

export function clearQueued(state: FactoryState, stage: JobStage, issue: number | null): FactoryState {
  const pendingApprovals = { ...state.pendingApprovals };
  if (stage === 'approve') delete pendingApprovals[String(issue)];
  const pendingIncidents = stage === 'incident' ? state.pendingIncidents.filter((n) => n !== issue) : state.pendingIncidents;
  const pendingShip = stage === 'ship' ? null : state.pendingShip;
  const first = stage === 'remove' ? state.pendingRemovals.findIndex((item) => item.issue === issue) : -1;
  const pendingRemovals = state.pendingRemovals.filter((_, index) => index !== first);
  return {
    ...state,
    pendingApprovals,
    pendingIncidents,
    pendingShip,
    pendingRemovals,
    retried: state.retried.filter((key) => key !== orderKey(stage, issue)),
  };
}

export function isQueued(state: FactoryState, stage: JobStage, issue: number | null): boolean {
  if (stage === 'approve') return Object.hasOwn(state.pendingApprovals, String(issue));
  if (stage === 'remove') return state.pendingRemovals.some((item) => item.issue === issue);
  if (stage === 'ship') return state.pendingShip !== null;
  if (stage === 'incident') return issue !== null && state.pendingIncidents.includes(issue);
  return false;
}

export const orderKey =(stage: JobStage, issue: number | null): string => `${stage}:${issue ?? '-'}`;
