import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { ReleaseState } from '../types';
import { fake, issueMerge, reset } from './test-fakes';

vi.mock('../deploy', () => ({ deployDev: async () => 'https://play.test/dev/' }));
const { remove } = await import('./remove');

const RELEASE: ReleaseState = { issue: 11, branch: 'release/2026-09-29', day: '2026-09-29', postId: 42, removed: [], tasks: [], merges: [issueMerge(5, 'Too loud')], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } };

beforeEach(() => {
  reset();
  writeState(fake().ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE, pendingRemovals: [{ issue: 5, by: 'Ann', text: 'remove #5 too loud' }] });
});

describe('remove', () => {
  it('reverts on the release branch and dev, pushes both, deletes the branch, reopens and sends the issue to design', async () => {
    const f = fake();
    await remove(f.ctx, 5);
    expect(f.calls).toEqual([
      'fetch',
      'revert 5 release/2026-09-29',
      'revert 5 dev',
      'delete factory/issue-5',
      'reopen 5',
      'removeLabel 5 release-candidate',
      expect.stringContaining('comment ## Committee feedback\n\nRemoved from release 2026-09-29 by Ann:\n\nremove #5 too loud'),
      'move Design',
      expect.stringContaining('message committee - Issue #5 is out of release'),
    ]);
    const state = readState(f.ctx.statePath);
    expect(state.release).toMatchObject({ postId: null, removed: [5], merges: [{ issue: 5, reverted: ['release/2026-09-29', 'dev'] }] });
    expect(state.pendingFeedback).toEqual({ 5: { source: 'committee', body: '## Committee feedback\n\nRemoved from release 2026-09-29 by Ann:\n\nremove #5 too loud' } });
  });

  it('reverts the recorded merge commit', async () => {
    const f = fake();
    const reverted: unknown[] = [];
    f.ctx.repo.revertMerge = async (merge, branch) => { reverted.push([merge.issue, merge.sha, branch]); };
    await remove(f.ctx, 5);
    const sha = issueMerge(5, 'Too loud').sha;
    expect(reverted).toEqual([[5, sha, 'release/2026-09-29'], [5, sha, 'dev']]);
  });

  it('reverts only the release branch for a merge made on the release branch', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, merges: [issueMerge(5, 'Too loud', { into: 'release/2026-09-29' })] }, pendingRemovals: [{ issue: 5, by: 'Ann', text: 't' }] });
    await remove(f.ctx, 5);
    expect(f.calls.filter((call) => call.startsWith('revert'))).toEqual(['revert 5 release/2026-09-29']);
    expect(readState(f.ctx.statePath).release).toMatchObject({ removed: [5], merges: [{ issue: 5, reverted: ['release/2026-09-29'] }] });
  });

  it('has an agent resolve a conflicting revert and goes on with the removal', async () => {
    const f = fake();
    f.revertConflicts = ['dev'];
    await remove(f.ctx, 5);
    expect(f.calls.slice(0, 7)).toEqual(['fetch', 'revert 5 release/2026-09-29', 'revert 5 dev', 'open dev', 'agent', 'close dev', 'revert 5 dev']);
    expect(f.agentRuns[0].prompt).toContain('takes issue 5 out of this branch');
    expect(f.calls).toContain('reopen 5');
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: null, removed: [5] });
  });

  it('clears postId and pendingShip once the release branch is reverted, even when the dev revert fails', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE, pendingShip: 'Bob', pendingRemovals: [{ issue: 5, by: 'Ann', text: 't' }] });
    f.ctx.repo.revertMerge = async (merge, branch) => {
      f.calls.push(`revert ${merge.issue} ${branch}`);
      if (branch === 'dev') throw new Error('revert failed. Conflicting files: a.ts');
    };
    await expect(remove(f.ctx, 5)).rejects.toThrow('Conflicting files');
    const state = readState(f.ctx.statePath);
    expect(state.release).toMatchObject({ postId: null, removed: [], merges: [{ issue: 5, reverted: ['release/2026-09-29'] }] });
    expect(state.pendingShip).toBeNull();
  });

  it('finishes a retried removal that already reverted the release branch by reverting only dev', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, postId: null, merges: [issueMerge(5, 'Too loud', { reverted: ['release/2026-09-29'] })] }, pendingRemovals: [{ issue: 5, by: 'Ann', text: 't' }] });
    await remove(f.ctx, 5);
    expect(f.calls.filter((call) => call.startsWith('revert'))).toEqual(['revert 5 dev']);
    expect(f.calls).toContain('reopen 5');
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: null, removed: [5] });
  });

  it('goes on with a removal run again after both reverts were pushed and the job stopped', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), release: { ...RELEASE, removed: [5], merges: [issueMerge(5, 'Too loud', { reverted: ['release/2026-09-29', 'dev'] })] } });
    await remove(f.ctx, 5);
    expect(f.calls.some((call) => call.startsWith('revert'))).toBe(false);
    expect(f.calls).toContain('reopen 5');
    expect(readState(f.ctx.statePath).release?.removed).toEqual([5]);
  });

  it('records the removed issue as soon as both reverts are pushed', async () => {
    const f = fake();
    f.ctx.github.reopen = async () => { throw new Error('killed'); };
    await expect(remove(f.ctx, 5)).rejects.toThrow('killed');
    expect(readState(f.ctx.statePath).release?.removed).toEqual([5]);
  });

  it('throws when the release has no recorded merge of the issue, and changes nothing', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, merges: [] }, pendingRemovals: [{ issue: 5, by: 'Ann', text: 't' }] });
    await expect(remove(f.ctx, 5)).rejects.toThrow('has no recorded merge of issue #5');
    expect(f.calls.some((call) => call.startsWith('push') || call.startsWith('delete') || call.startsWith('reopen'))).toBe(false);
  });

  it('throws when the release merges are not migrated yet', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, merges: null }, pendingRemovals: [{ issue: 5, by: 'Ann', text: 't' }] });
    await expect(remove(f.ctx, 5)).rejects.toThrow('not filled yet');
    expect(f.calls.some((call) => call.startsWith('revert'))).toBe(false);
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
