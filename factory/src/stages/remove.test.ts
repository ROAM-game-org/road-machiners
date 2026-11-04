import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { FactoryState, ReleaseState } from '../types';
import { fake, issueMerge, reset } from './test-fakes';

vi.mock('../deploy', () => ({ deployDev: async () => 'https://play.test/dev/' }));
const { remove } = await import('./remove');

const LOUD = issueMerge(5, 'Too loud');
const RELEASE: ReleaseState = { issue: 11, day: '2026-09-29', postId: 42, removed: [], candidate: { sha: 'abc1234', features: [LOUD] }, playtest: { seed: 1, runs: 0, lastStart: null, passed: { sha: 'abc1234', features: [LOUD] }, fixes: null, blocked: null, decision: null, work: null } };
const seed = (over: Partial<FactoryState> = {}): void => writeState(fake().ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE, devMerges: [LOUD], pendingRemovals: [{ issue: 5, by: 'Ann', text: 'remove #5 too loud' }], ...over });

beforeEach(() => {
  reset();
  seed();
});

describe('remove', () => {
  it('reverts on dev alone, deletes the branch, reopens and sends the issue to design', async () => {
    const f = fake();
    await remove(f.ctx, 5);
    expect(f.calls).toEqual([
      'fetch',
      'revert 5 dev',
      'delete factory/issue-5',
      'reopen 5',
      'removeLabel 5 release-candidate',
      expect.stringContaining('comment ## Committee feedback\n\nRemoved from release 2026-09-29 by Ann:\n\nremove #5 too loud'),
      'move Design',
      expect.stringContaining('message committee - Issue #5 is out of release'),
    ]);
    const state = readState(f.ctx.statePath);
    expect(state.pendingFeedback).toEqual({ 5: { source: 'committee', body: '## Committee feedback\n\nRemoved from release 2026-09-29 by Ann:\n\nremove #5 too loud' } });
  });

  it('drops the candidate post, the queued ship and the pass that holds the feature, and forgets the dev merge', async () => {
    const f = fake();
    seed({ pendingShip: 'Bob', devMerges: [LOUD, issueMerge(6, 'Other')] });
    await remove(f.ctx, 5);
    const state = readState(f.ctx.statePath);
    expect(state.release).toMatchObject({ postId: null, candidate: null, removed: [5], playtest: { passed: null } });
    expect(state.pendingShip).toBeNull();
    expect(state.devMerges.map((merge) => merge.issue)).toEqual([6]);
  });

  it('reverts the recorded merge commit', async () => {
    const f = fake();
    const reverted: unknown[] = [];
    f.ctx.repo.revertMerge = async (merge, branch) => { reverted.push([merge.issue, merge.sha, branch]); };
    await remove(f.ctx, 5);
    expect(reverted).toEqual([[5, LOUD.sha, 'dev']]);
  });

  it('reverts the newest merge of an issue that merged twice', async () => {
    const f = fake();
    const second = issueMerge(5, 'Too loud', { sha: 'second5'.padEnd(40, '0') });
    seed({ devMerges: [LOUD, second] });
    const reverted: string[] = [];
    f.ctx.repo.revertMerge = async (merge) => { reverted.push(merge.sha); };
    await remove(f.ctx, 5);
    expect(reverted).toEqual([second.sha]);
  });

  it('has an agent resolve a conflicting revert and goes on with the removal', async () => {
    const f = fake();
    f.revertConflicts = ['dev'];
    await remove(f.ctx, 5);
    expect(f.calls.slice(0, 5)).toEqual(['fetch', 'revert 5 dev', 'open dev', 'agent', 'close dev']);
    expect(f.agentRuns[0].prompt).toContain('takes issue 5 out of this branch');
    expect(f.calls).toContain('reopen 5');
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: null, removed: [5] });
  });

  it('keeps the candidate and the queued ship when the dev revert fails, so nothing half-removed is lost', async () => {
    const f = fake();
    seed({ pendingShip: 'Bob' });
    f.ctx.repo.revertMerge = async () => { throw new Error('revert failed. Conflicting files: a.ts'); };
    await expect(remove(f.ctx, 5)).rejects.toThrow('Conflicting files');
    const state = readState(f.ctx.statePath);
    expect(state.release).toMatchObject({ postId: 42, removed: [] });
    expect(state.devMerges).toEqual([LOUD]);
  });

  it('goes on with a removal run again after the revert was pushed and the job stopped', async () => {
    const f = fake();
    seed({ devMerges: [issueMerge(5, 'Too loud', { reverted: ['dev'] })] });
    await remove(f.ctx, 5);
    expect(f.calls.some((call) => call.startsWith('revert'))).toBe(false);
    expect(f.calls).toContain('reopen 5');
    expect(readState(f.ctx.statePath).release?.removed).toEqual([5]);
  });

  it('finishes a removal run again after the merge record was already forgotten', async () => {
    const f = fake();
    seed({ devMerges: [], release: { ...RELEASE, removed: [5] } });
    await remove(f.ctx, 5);
    expect(f.calls.some((call) => call.startsWith('revert'))).toBe(false);
    expect(f.calls).toContain('reopen 5');
  });

  it('records the removed issue as soon as the revert is pushed', async () => {
    const f = fake();
    f.ctx.github.reopen = async () => { throw new Error('killed'); };
    await expect(remove(f.ctx, 5)).rejects.toThrow('killed');
    expect(readState(f.ctx.statePath).release?.removed).toEqual([5]);
  });

  it('throws when dev has no recorded merge of the issue, and changes nothing', async () => {
    const f = fake();
    seed({ devMerges: [] });
    await expect(remove(f.ctx, 5)).rejects.toThrow('Dev has no recorded merge of issue #5');
    expect(f.calls.some((call) => call.startsWith('push') || call.startsWith('delete') || call.startsWith('reopen'))).toBe(false);
  });

  it('pushes nothing after a conflicting revert and keeps the branch and issue as they are', async () => {
    const f = fake();
    f.ctx.repo.revertMerge = async () => { throw new Error('revert failed. Conflicting files: a.ts'); };
    await expect(remove(f.ctx, 5)).rejects.toThrow('Conflicting files');
    expect(f.calls.some((call) => call.startsWith('push') || call.startsWith('delete') || call.startsWith('reopen'))).toBe(false);
  });

  it('throws when the removal is not queued or no release is open', async () => {
    const f = fake();
    await expect(remove(f.ctx, 9)).rejects.toThrow('No removal of issue #9 is queued');
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), pendingRemovals: [{ issue: 5, by: 'Ann', text: 't' }] });
    await expect(remove(f.ctx, 5)).rejects.toThrow('No release is open');
  });
});
