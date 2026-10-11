import { beforeEach, describe, expect, it } from 'vitest';
import { readLedger } from '../ledger';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { FactoryState, PendingSync, ReleaseState } from '../types';
import { fake, reset, type Fake } from './test-fakes';
import { syncDev } from './sync';

const BRANCH = 'release/2026-09-29';
const RELEASE: ReleaseState = { issue: 11, branch: BRANCH, day: '2026-09-29', postId: 42, removed: [], tasks: [], candidateSha: 'r0', playtest: { seed: 1, runs: 2, passed: 'r0', blocked: null, notes: [] } };
const ORDER: PendingSync = { by: 'Ann', reason: 'dev has the fix #438 needs', from: null };

type Remote = { release: string; dev: string; devIn: string; behind: number; fromHasDev: boolean };

function seed(f: Fake, state: Partial<FactoryState> = {}): void {
  writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE, pendingShip: 'Bob', pendingSync: ORDER, ...state });
}

function remote(f: Fake, start: Partial<Remote> = {}): Remote {
  const tips: Remote = { release: 'r0', dev: 'd1', devIn: 'd1', behind: 1, fromHasDev: false, ...start };
  const merge = f.ctx.repo.merge;
  f.ctx.repo.merge = async (steps, resolutions) => {
    await merge(steps, resolutions);
    tips.behind--;
    tips.release = `r${Number(tips.release.slice(1)) + 1}`;
  };
  f.ctx.repo.headHash = async (branch) => (branch === 'dev' ? tips.dev : tips.release);
  f.ctx.repo.forkPoint = async () => tips.devIn;
  f.ctx.repo.isMerged = async (base, branch) => (base === 'dev' && branch === BRANCH ? tips.behind <= 0 : tips.fromHasDev);
  return tips;
}

beforeEach(() => {
  reset();
});

describe('syncDev', () => {
  it('merges GitHub dev into the release, pushes only the release and withdraws the candidate', async () => {
    const f = fake();
    seed(f);
    remote(f);
    await syncDev(f.ctx, 11);
    expect(f.calls.filter((call) => call.startsWith('merge ') || call.startsWith('push '))).toEqual([`merge dev ${BRANCH}`, `push ${BRANCH}`]);
    const state = readState(f.ctx.statePath);
    expect(state.pendingShip).toBeNull();
    expect(state.release).toMatchObject({ postId: null, candidateSha: 'r0', playtest: { passed: 'r0' }, syncs: [{ dev: 'd1', head: 'r1', by: 'Ann', reason: ORDER.reason }] });
    expect(readLedger(f.ctx.cfg.home, new Date(0))).toContainEqual(expect.objectContaining({ kind: 'sync', issue: 11, branch: BRANCH, dev: 'd1', head: 'r1', by: 'Ann' }));
    const comment = f.calls.find((call) => call.startsWith('comment '));
    expect(comment).toContain(`Dev at d1 entered ${BRANCH}. The release moved from r0 to r1`);
    expect(comment).toContain('The earlier playtest pass covers only r0, so the release playtest plays r1 in full');
    expect(comment).toContain('Ordered by Ann. Reason: dev has the fix #438 needs');
    expect(f.calls).toContainEqual(expect.stringContaining('message committee - Dev at d1 is in release 2026-09-29'));
  });

  it('has an agent resolve a real conflict in the sync job and then pushes the release', async () => {
    const f = fake();
    seed(f);
    remote(f);
    f.mergeConflicts = [`dev ${BRANCH}`];
    await syncDev(f.ctx, 11);
    expect(f.calls.filter((call) => /^(merge|open|agent|close|push) /.test(`${call} `))).toEqual([`merge dev ${BRANCH}`, `open ${BRANCH}`, 'agent', `close ${BRANCH}`, `merge dev ${BRANCH}`, `push ${BRANCH}`]);
    expect(f.agentRuns[0].prompt).toContain(BRANCH);
    expect(readState(f.ctx.statePath).release?.syncs).toHaveLength(1);
  });

  it('merges again when dev moved during the merge, and says so when dev keeps moving', async () => {
    const f = fake();
    seed(f);
    const tips = remote(f, { behind: 5, dev: 'd9', devIn: 'd3' });
    await syncDev(f.ctx, 11);
    expect(f.calls.filter((call) => call.startsWith('merge '))).toHaveLength(3);
    expect(tips.release).toBe('r3');
    expect(f.calls.find((call) => call.startsWith('comment '))).toContain('Dev moved on to d9 during the sync, after 3 merges, and that is not in the release.');
    expect(readState(f.ctx.statePath).release?.syncs).toEqual([expect.objectContaining({ dev: 'd3', head: 'r3' })]);
  });

  it('changes no post, Ship or playtest when dev is already in the release', async () => {
    const f = fake();
    seed(f);
    remote(f, { behind: 0, fromHasDev: true });
    await syncDev(f.ctx, 11);
    expect(f.calls.some((call) => call.startsWith('merge ') || call.startsWith('push '))).toBe(false);
    const state = readState(f.ctx.statePath);
    expect(state.pendingShip).toBe('Bob');
    expect(state.release).toMatchObject({ postId: 42 });
    expect(state.release?.syncs).toBeUndefined();
    expect(f.calls.find((call) => call.startsWith('comment '))).toContain('Dev at d1 was already in release/2026-09-29 at r0, so the sync changed nothing.');
    expect(readLedger(f.ctx.cfg.home, new Date(0)).some((line) => line.kind === 'sync')).toBe(false);
  });

  it('records the dev head once when a run after the push retries the order', async () => {
    const f = fake();
    seed(f);
    const tips = remote(f);
    f.ctx.github.comment = async () => {
      throw new Error('killed after the push');
    };
    await expect(syncDev(f.ctx, 11)).rejects.toThrow('killed');
    expect(readState(f.ctx.statePath).pendingSync?.from).toBe('r0');
    const retry = fake();
    remote(retry, { ...tips });
    await syncDev(retry.ctx, 11);
    expect(retry.calls.some((call) => call.startsWith('merge '))).toBe(false);
    expect(retry.calls.find((call) => call.startsWith('comment '))).toContain('Dev at d1 entered release/2026-09-29. The release moved from r0 to r1');
    expect(readState(f.ctx.statePath).release?.syncs).toEqual([expect.objectContaining({ dev: 'd1', head: 'r1' })]);
  });

  it('takes a removed feature that dev merged again off the removed list', async () => {
    const f = fake();
    seed(f, { release: { ...RELEASE, removed: [5, 6] } });
    remote(f);
    f.changelog = ['Merge issue #5: Louder horn', 'Merge branch x'];
    await syncDev(f.ctx, 11);
    expect(readState(f.ctx.statePath).release?.removed).toEqual([6]);
    expect(f.calls.find((call) => call.startsWith('comment '))).toContain('Features from dev:\n- #5 Louder horn');
  });

  it('fails with no queued order, no open release or another issue', async () => {
    const f = fake();
    remote(f);
    seed(f, { pendingSync: null });
    await expect(syncDev(f.ctx, 11)).rejects.toThrow('No sync of dev');
    seed(f, { release: null });
    await expect(syncDev(f.ctx, 11)).rejects.toThrow('No release is open');
    seed(f);
    await expect(syncDev(f.ctx, 12)).rejects.toThrow('not the tracking issue');
    expect(f.calls.some((call) => call.startsWith('push '))).toBe(false);
  });
});
