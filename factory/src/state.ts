import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { withLockSync } from './lock';
import type { FactoryState, Job, JobStage, PlaytestState, ReleaseState } from './types';

export const EMPTY_STATE: FactoryState = { jobs: [], approvalPosts: {}, lastRelease: null, release: null, releasePost: null, pendingShip: null, pendingSync: null, pendingRemovals: [], pendingApprovals: {}, approvedResolving: {}, pendingChanges: [], pendingIncidents: [], bundles: {}, adhocReplies: {}, lastTickError: null, failures: [], builds: {}, cardStarts: {}, postCaptions: {}, devBuild: null, devFailed: null, devError: null, interrupted: [], retried: [], postOnly: [], unroutedReplies: {}, textPosts: [], lastWasteReview: null, held: {}, stuck: {}, sweepError: null };

const STATE_LOCK_MS = 30_000;

type OldFields = { job?: Omit<Job, 'id'> | null; testPhase?: Record<string, string>; patching?: unknown; visualSendBacks?: unknown; jobStarts?: unknown };
type SavedState = Partial<FactoryState> & OldFields;

export function readState(path: string): FactoryState {
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);
  const { job, testPhase, patching: _patching, visualSendBacks: _visualSendBacks, jobStarts: _jobStarts, ...saved } = JSON.parse(readFileSync(path, 'utf8')) as SavedState;
  const jobs = (saved.jobs ?? (job ? [{ ...job, id: basename(job.log, '.log') }] : [])).map(renameTesting);
  const release = saved.release ? fillRelease(saved.release) : null;
  return { ...structuredClone(EMPTY_STATE), ...saved, jobs, release, postOnly: saved.postOnly ?? postPhases(testPhase) };
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

type Order = { has: (state: FactoryState, issue: number | null) => boolean; clear: (state: FactoryState, issue: number | null) => FactoryState };

const ORDERS: Partial<Record<JobStage, Order>> = {
  approve: {
    has: (state, issue) => Object.hasOwn(state.pendingApprovals, String(issue)),
    clear: (state, issue) => ({ ...state, pendingApprovals: Object.fromEntries(Object.entries(state.pendingApprovals).filter(([key]) => key !== String(issue))) }),
  },
  change: { has: () => false, clear: (state, issue) => ({ ...state, pendingChanges: state.pendingChanges.filter((item) => item.id !== issue) }) },
  incident: {
    has: (state, issue) => issue !== null && state.pendingIncidents.includes(issue),
    clear: (state, issue) => ({ ...state, pendingIncidents: state.pendingIncidents.filter((n) => n !== issue) }),
  },
  ship: { has: (state) => state.pendingShip !== null, clear: (state) => ({ ...state, pendingShip: null }) },
  sync: { has: (state) => state.pendingSync !== null, clear: (state) => ({ ...state, pendingSync: null }) },
  remove: {
    has: (state, issue) => state.pendingRemovals.some((item) => item.issue === issue),
    clear: (state, issue) => {
      const first = state.pendingRemovals.findIndex((item) => item.issue === issue);
      return { ...state, pendingRemovals: state.pendingRemovals.filter((_, index) => index !== first) };
    },
  },
};

export function clearQueued(state: FactoryState, stage: JobStage, issue: number | null): FactoryState {
  const cleared = ORDERS[stage]?.clear(state, issue) ?? state;
  return { ...cleared, retried: state.retried.filter((key) => key !== orderKey(stage, issue)) };
}

export function isQueued(state: FactoryState, stage: JobStage, issue: number | null): boolean {
  return ORDERS[stage]?.has(state, issue) ?? false;
}

export const orderKey =(stage: JobStage, issue: number | null): string => `${stage}:${issue ?? '-'}`;
