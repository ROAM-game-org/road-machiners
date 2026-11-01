import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import { fake, reset } from './test-fakes';
import { openPendingRelease, openRelease } from './release';

beforeEach(reset);

describe('open release', () => {
  it('opens the tracking issue, adds its card in Approval and sets the release with a seed from the day', async () => {
    const f = fake();
    await openRelease(f.ctx);
    expect(f.calls).toEqual(['createIssue Release 2026-09-29', 'addCard Approval']);
    expect(f.created.map((issue) => issue.labels)).toEqual([['release']]);
    expect(readState(f.ctx.statePath).release).toEqual({ issue: 11, day: '2026-09-29', postId: null, candidate: null, removed: [], playtest: { seed: 20260929, runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null } });
  });

  it('cuts no branch, opens no cleanup task and leaves dev merges and the last release time alone', async () => {
    const f = fake();
    const merge = { issue: 3, title: 'faster trucks', sha: 'a'.repeat(40), into: 'dev', reverted: [] };
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), devMerges: [merge], lastRelease: '2026-09-01T00:00:00.000Z' });
    await openRelease(f.ctx);
    expect(f.calls.some((call) => call.startsWith('branch') || call.startsWith('merge'))).toBe(false);
    expect(f.created).toHaveLength(1);
    const state = readState(f.ctx.statePath);
    expect(state.devMerges).toEqual([merge]);
    expect(state.lastRelease).toBe('2026-09-01T00:00:00.000Z');
  });

  it('refuses to open a second release', async () => {
    const f = fake();
    await openRelease(f.ctx);
    await expect(openRelease(f.ctx)).rejects.toThrow('Release 2026-09-29 is open on #11');
    expect(f.created).toHaveLength(1);
  });

  it('sets no release when the tracking issue cannot be opened', async () => {
    const f = fake();
    f.ctx.github.createIssue = async () => { throw new Error('gh down'); };
    await expect(openRelease(f.ctx)).rejects.toThrow('gh down');
    expect(readState(f.ctx.statePath).release).toBeNull();
  });

  it('keeps the release set when its card cannot be added, so the failure names the tracking issue', async () => {
    const f = fake();
    f.ctx.github.addCard = async () => { throw new Error('board down'); };
    await expect(openRelease(f.ctx)).rejects.toThrow('board down');
    expect(readState(f.ctx.statePath).release?.issue).toBe(11);
  });
});

describe('open pending release', () => {
  it('opens the cleanup cards a failed Ship left due, on an open release, and clears them', async () => {
    const f = fake();
    await openRelease(f.ctx);
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), pendingCleanup: '2026-09-20' });
    await openPendingRelease(f.ctx);
    expect(f.created.map((issue) => issue.title)).toEqual(['Release 2026-09-29', 'Optimize against the speed budget (after release 2026-09-20)', 'Code janitor pass (after release 2026-09-20)']);
    expect(readState(f.ctx.statePath).pendingCleanup).toBeNull();
  });

  it('keeps the cleanup due when a cleanup card cannot be opened', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), pendingCleanup: '2026-09-20' });
    let made = 0;
    const create = f.ctx.github.createIssue;
    f.ctx.github.createIssue = async (...args) => {
      if (made++ === 1) throw new Error('gh down');
      return create(...args);
    };
    await expect(openPendingRelease(f.ctx)).rejects.toThrow('gh down');
    const state = readState(f.ctx.statePath);
    expect(state.release?.issue).toBe(11);
    expect(state.pendingCleanup).toBe('2026-09-20');
  });
});
