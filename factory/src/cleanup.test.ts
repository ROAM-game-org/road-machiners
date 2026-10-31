import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { removalCandidates, sweepLogs, sweepWork } from './cleanup';
import { EMPTY_STATE } from './state';
import type { Card, FactoryState, Job } from './types';

const state = (over: Partial<FactoryState> = {}): FactoryState => ({ ...structuredClone(EMPTY_STATE), ...over });
const card = (issue: number, column: Card['column']): Card => ({ itemId: `i${issue}`, issue, column, labels: [] });
const running = (stage: Job['stage'], issue: number | null): Job => ({ id: `${stage}-${issue}`, stage, issue, pid: 1, startedAt: '', log: '' });

function work(...names: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'work-'));
  for (const name of names) {
    mkdirSync(join(root, name, 'game', '.factory-tasks'), { recursive: true });
    writeFileSync(join(root, name, 'game', '.factory-tasks', 'task.md'), 'plan');
    mkdirSync(join(root, name, 'node_modules'), { recursive: true });
    mkdirSync(join(root, name, 'game', 'node_modules'), { recursive: true });
  }
  return root;
}

const has = (root: string, path: string): boolean => existsSync(join(root, path));

describe('sweepWork', () => {
  it('keeps an open card clone with its task file and drops its packages', () => {
    const root = work('issue-3');
    const swept = sweepWork(root, `${root}-locks`,state(), [card(3, 'Approval')]);
    expect(swept).toEqual({ removed: [], stripped: ['issue-3'], unknown: [] });
    expect([has(root, 'issue-3/game/.factory-tasks/task.md'), has(root, 'issue-3/node_modules'), has(root, 'issue-3/game/node_modules')]).toEqual([true, false, false]);
  });

  it('removes the clones of Done cards, issues off the board, merged changes and finished builds', () => {
    const root = work('issue-1', 'issue-2', 'adhoc-4', 'check-issue-3', 'change-1790000000000', 'incident-6', 'dev-build', 'release-main', 'release-candidate', 'waste');
    const swept = sweepWork(root, `${root}-locks`,state(), [card(1, 'Done'), card(3, 'Testing'), card(4, 'Done')]);
    expect(swept.removed.sort()).toEqual(['adhoc-4', 'change-1790000000000', 'check-issue-3', 'dev-build', 'incident-6', 'issue-1', 'issue-2', 'release-candidate', 'release-main', 'waste']);
  });

  it('keeps the merge and ship clones while a landing record names them, and removes them without one', () => {
    const work0 = { into: 'dev', sources: [], cards: [5], session: 's', spentUsd: 0, job: null, jobUsd: 0, merged: true, merges: [], since: '' };
    const kept = work('merge-queue', 'ship-main');
    expect(sweepWork(kept, `${kept}-locks`, state({ landings: { merge: work0, ship: { ...work0, into: 'main' } } }), []).removed).toEqual([]);
    expect([has(kept, 'merge-queue/game/.factory-tasks/task.md'), has(kept, 'ship-main/game/.factory-tasks/task.md')]).toEqual([true, true]);
    const done = work('merge-queue', 'ship-main');
    expect(sweepWork(done, `${done}-locks`, state(), []).removed.sort()).toEqual(['merge-queue', 'ship-main']);
  });

  it('keeps every clone a running or interrupted job works in, packages included', () => {
    const root = work('issue-5', 'check-issue-5', 'issue-7', 'dev-build', 'release-candidate', 'waste');
    const swept = sweepWork(root, `${root}-locks`,state({ jobs: [running('verify', 5), running('ship', 20), running('waste', null)], interrupted: [7] }), [card(5, 'Done'), card(7, 'Done')]);
    expect(swept).toEqual({ removed: ['dev-build'], stripped: [], unknown: [] });
    expect([has(root, 'issue-5/node_modules'), has(root, 'check-issue-5/node_modules'), has(root, 'issue-7/node_modules'), has(root, 'release-candidate/node_modules')]).toEqual([true, true, true, true]);
  });

  it('keeps the clone of a held card with its packages, since Hermes works in it', () => {
    const root = work('issue-8');
    const hold = { by: 'hermes', reason: 'fix the text', at: '2026-10-21T16:05:00.000Z', stage: null };
    const swept = sweepWork(root, `${root}-locks`, state({ held: { 8: hold } }), [card(8, 'Merging')]);
    expect(swept).toEqual({ removed: [], stripped: [], unknown: [] });
    expect(has(root, 'issue-8/game/node_modules')).toBe(true);
  });

  it('keeps queued incidents and the candidate of an open release, and removes clones of the retired change job', () => {
    const root = work('change-12', 'incident-6', 'release-candidate');
    const release = { issue: 20, branch: 'release/2026-01-05', day: '2026-01-05', postId: null, removed: [], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } };
    const swept = sweepWork(root, `${root}-locks`,state({ pendingIncidents: [6], release }), []);
    expect(swept.removed).toEqual(['change-12']);
    expect(swept.stripped.sort()).toEqual(['incident-6', 'release-candidate']);
  });

  it('keeps every issue clone when the board has no card at all', () => {
    const root = work('issue-1', 'adhoc-2');
    expect(sweepWork(root, `${root}-locks`,state(), []).removed).toEqual([]);
  });

  it('leaves unknown folders, the merge worktree and files alone', () => {
    const root = work('scratch', 'land');
    writeFileSync(join(root, 'notes.txt'), 'x');
    const swept = sweepWork(root, `${root}-locks`,state(), [card(1, 'Design')]);
    expect(swept).toEqual({ removed: [], stripped: [], unknown: ['scratch'] });
    expect([has(root, 'scratch/node_modules'), has(root, 'land/node_modules'), has(root, 'notes.txt')]).toEqual([true, true, true]);
  });

  it('does nothing without a work root', () => {
    expect(sweepWork(join(tmpdir(), 'no-such-work-root'), join(tmpdir(), 'no-such-locks'), state(), [])).toEqual({ removed: [], stripped: [], unknown: [] });
  });

  it('skips a clone whose lock a live process holds', () => {
    const root = work('issue-3', 'issue-4');
    mkdirSync(join(`${root}-locks`, 'issue-3'), { recursive: true });
    writeFileSync(join(`${root}-locks`, 'issue-3', 'owner'), String(process.pid));
    const swept = sweepWork(root, `${root}-locks`, state(), [card(3, 'Done'), card(4, 'Done')]);
    expect(swept.removed).toEqual(['issue-4']);
    expect(has(root, 'issue-3/node_modules')).toBe(true);
  });

  it('keeps the clone of an issue a direct run works on, though no scheduler job, interrupted or hold names it', () => {
    const root = work('issue-892', 'issue-893', 'adhoc-892');
    mkdirSync(join(`${root}-locks`, 'run-issue-892'), { recursive: true });
    writeFileSync(join(`${root}-locks`, 'run-issue-892', 'owner'), String(process.pid));
    const swept = sweepWork(root, `${root}-locks`, state(), [card(1, 'Done')]);
    expect(swept.removed).toEqual(['issue-893']);
    expect([has(root, 'issue-892/node_modules'), has(root, 'adhoc-892/node_modules')]).toEqual([true, true]);
  });

  it('removes a clone whose run lock belongs to a dead process', () => {
    const root = work('issue-892');
    mkdirSync(join(`${root}-locks`, 'run-issue-892'), { recursive: true });
    writeFileSync(join(`${root}-locks`, 'run-issue-892', 'owner'), '2147483646');
    expect(sweepWork(root, `${root}-locks`, state(), [card(1, 'Done')]).removed).toEqual(['issue-892']);
  });

  it('keeps a shared folder a direct stage run works in', () => {
    const root = work('release-candidate', 'dev-build');
    mkdirSync(join(`${root}-locks`, 'run-stage-candidate'), { recursive: true });
    writeFileSync(join(`${root}-locks`, 'run-stage-candidate', 'owner'), String(process.pid));
    expect(sweepWork(root, `${root}-locks`, state(), []).removed).toEqual(['dev-build']);
  });

  it('keeps the clone of an issue whose card the board could not confirm off the board', () => {
    const root = work('issue-892', 'issue-893');
    const swept = sweepWork(root, `${root}-locks`, state(), [card(1, 'Done')], new Set([892]));
    expect(swept.removed).toEqual(['issue-893']);
    expect(has(root, 'issue-892/game/.factory-tasks/task.md')).toBe(true);
  });

  it('names the issue and adhoc clones whose card the board list does not show open', () => {
    const root = work('issue-1', 'issue-2', 'issue-3', 'adhoc-4', 'check-issue-5', 'dev-build');
    expect(removalCandidates(root, state(), [card(1, 'Design'), card(2, 'Done')]).sort()).toEqual([2, 3, 4]);
    expect(removalCandidates(root, state(), [])).toEqual([]);
    expect(removalCandidates(join(tmpdir(), 'no-such-work-root'), state(), [card(1, 'Done')])).toEqual([]);
  });

  it('skips a shared folder that any job locks, like a merge building dev', () => {
    const root = work('dev-build', 'release-main');
    mkdirSync(join(`${root}-locks`, 'dev-build'), { recursive: true });
    writeFileSync(join(`${root}-locks`, 'dev-build', 'owner'), String(process.pid));
    const swept = sweepWork(root, `${root}-locks`, state(), []);
    expect(swept.removed).toEqual(['release-main']);
    expect(has(root, 'dev-build/node_modules')).toBe(true);
  });
});

describe('sweepLogs', () => {
  const NOW = new Date('2026-01-30T00:00:00Z');

  function logs(...entries: [string, number][]): string {
    const root = mkdtempSync(join(tmpdir(), 'logs-'));
    for (const [name, daysOld] of entries) {
      writeFileSync(join(root, name), 'log');
      const at = new Date(NOW.getTime() - daysOld * 24 * 3_600_000);
      utimesSync(join(root, name), at, at);
    }
    return root;
  }

  it('removes job logs older than the limit and keeps the rest', () => {
    const root = logs(['design-1-old.log', 20], ['design-2-new.log', 2], ['tick.log', 30], ['update.log', 30]);
    expect(sweepLogs(root, state(), NOW, 14)).toEqual(['design-1-old.log']);
    expect(['design-2-new.log', 'tick.log', 'update.log'].map((name) => has(root, name))).toEqual([true, true, true]);
  });

  it('keeps an old log that a failure names', () => {
    const root = logs(['checks-5-old.log', 20]);
    const failures = [{ stage: 'checks' as const, issue: 5, error: 'e', cause: 'error' as const, log: join(root, 'checks-5-old.log'), at: '' }];
    expect(sweepLogs(root, state({ failures }), NOW, 14)).toEqual([]);
  });
});
