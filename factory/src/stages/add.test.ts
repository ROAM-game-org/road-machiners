import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import { readReleaseGate } from '../tick';
import type { Card, PickStart, ReleaseState } from '../types';
import { fake, reset, type Fake } from './test-fakes';

const { add } = await import('./add');

const MERGE = '380abcd'.padEnd(40, '0');
const RELEASE: ReleaseState = { issue: 11, branch: 'release/2026-10-11', day: '2026-10-11', postId: 42, removed: [], tasks: [], candidateSha: 'abc1234', playtest: { seed: 1, runs: 1, passed: 'abc1234', blocked: null, notes: [] } };
const TRACKING: Card = { itemId: 'i11', issue: 11, column: 'Approval', labels: ['release'] };

beforeEach(() => {
  reset();
  writeState(fake().ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE, pendingShip: 'Bob', pendingAdditions: [{ issue: 380, by: 'Ann', text: 'missed the cut' }] });
});

function addable(pick: PickStart = { present: false, tip: 'tip', conflicts: [] }): Fake {
  const f = fake();
  f.ctx.cfg.mergingBudgetUsd = 5;
  f.ctx.github.issue = async (n) => ({ number: n, title: 'Night driving', body: '', labels: ['release-candidate'], createdAt: '', state: 'OPEN', author: '', thumbsUp: [] });
  f.ctx.repo.issueMerges = async (issue, branch) => { f.calls.push(`issueMerges ${issue} ${branch}`); return [MERGE]; };
  f.ctx.repo.startPick = async (_dir, merge) => { f.calls.push(`startPick ${merge.slice(0, 7)}`); return pick; };
  f.ctx.repo.wrapPick = async (_dir, { tip, merge }, message) => { f.calls.push(`wrapPick ${tip} ${merge.slice(0, 7)} ${message}`); };
  f.ctx.repo.headHash = async () => 'def5678';
  return f;
}

const branchCalls = (f: Fake) => f.calls.filter((call) => /^(prepare|startPick|wrapPick|agent|shell|push|mergeWork)/.test(call)).map((call) => call.split(' ').slice(0, 2).join(' '));

describe('add', () => {
  it('picks the dev merge onto the release, checks it, pushes once and tells the issue, the tracking issue and the committee', async () => {
    const f = addable();
    await add(f.ctx, 380);
    expect(f.calls).toContain('issueMerges 380 dev');
    expect(branchCalls(f)).toEqual(['prepare release/2026-10-11', 'startPick 380abcd', 'wrapPick tip', 'shell', 'push work-head']);
    expect(f.calls).toContain('wrapPick tip 380abcd Merge issue #380: Night driving');
    expect(f.calls).toContain('push work-head release/2026-10-11');
    expect(f.calls.find((call) => call.startsWith('comment Added to release 2026-10-11 by Ann'))).toContain('dev merge 380abcd is now on release/2026-10-11 at def5678');
    expect(f.calls.some((call) => call.startsWith('comment Issue #380 Night driving: Added'))).toBe(true);
    expect(f.calls.at(-1)).toContain('message committee - Issue #380 Night driving is in release 2026-10-11');
  });

  it('drops the stale candidate post and queued Ship, so the playtest replays the new head before any candidate', async () => {
    const f = addable();
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), release: { ...RELEASE, removed: [380, 5] } });
    await add(f.ctx, 380);
    const state = readState(f.ctx.statePath);
    expect(state.pendingShip).toBeNull();
    expect(state.release).toMatchObject({ postId: null, candidateSha: 'abc1234', removed: [5] });
    expect(readReleaseGate(state, [TRACKING], 'def5678').reason).toBe('playtest');
  });

  it('changes nothing when the release already holds the commit', async () => {
    const f = addable({ present: true });
    await add(f.ctx, 380);
    expect(branchCalls(f)).toEqual(['prepare release/2026-10-11', 'startPick 380abcd']);
    expect(f.calls.some((call) => call.startsWith('comment Release 2026-10-11 already holds'))).toBe(true);
    expect(f.calls.some((call) => call.startsWith('message'))).toBe(false);
    const state = readState(f.ctx.statePath);
    expect(state.pendingShip).toBe('Bob');
    expect(state.release).toMatchObject({ postId: 42 });
  });

  it('has an agent resolve a conflicting pick with only the issue, then checks and pushes', async () => {
    const f = addable({ present: false, tip: 'tip', conflicts: ['game/src/sim/sun.ts'] });
    await add(f.ctx, 380);
    expect(branchCalls(f)).toEqual(['prepare release/2026-10-11', 'startPick 380abcd', 'agent', 'wrapPick tip', 'shell', 'push work-head']);
    expect(f.agentRuns[0].prompt).toContain('cherry-picks only that issue');
    expect(f.agentRuns[0].prompt).toContain('- game/src/sim/sun.ts');
    expect(f.agentRuns[0].prompt).toContain(MERGE);
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: null });
  });

  it('merges a release that moved during the checks into the work and pushes again', async () => {
    const f = addable();
    let rejects = 1;
    f.ctx.repo.push = async (commit, branch) => {
      f.calls.push(`push ${commit} ${branch}`);
      if (rejects-- > 0) throw new Error('rejected: fetch first');
    };
    f.ctx.repo.isMerged = async () => false;
    f.ctx.repo.mergeBranchIntoWork = async (_dir, branch) => { f.calls.push(`mergeWork ${branch}`); return { commit: null, conflicts: [] }; };
    await add(f.ctx, 380);
    expect(branchCalls(f)).toEqual(['prepare release/2026-10-11', 'startPick 380abcd', 'wrapPick tip', 'shell', 'push work-head', 'mergeWork release/2026-10-11', 'shell', 'push work-head']);
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: null });
  });

  it('gives failed checks to the agent, and pushes nothing and keeps the candidate when its budget is spent', async () => {
    const f = addable();
    f.ctx.cfg.mergingBudgetUsd = 1;
    f.ctx.container.shell = async () => {
      f.calls.push('shell');
      throw new Error('tests failed');
    };
    await expect(add(f.ctx, 380)).rejects.toThrow('budget');
    expect(branchCalls(f)).toEqual(['prepare release/2026-10-11', 'startPick 380abcd', 'wrapPick tip', 'shell', 'agent', 'shell']);
    expect(f.agentRuns[0].prompt).toContain('#380, picked from dev commit 380abcd');
    const state = readState(f.ctx.statePath);
    expect(state.pendingShip).toBe('Bob');
    expect(state.release).toMatchObject({ postId: 42 });
  });

  it('refuses an issue that is not an open release-candidate before it touches git', async () => {
    const f = addable();
    f.ctx.github.issue = async (n) => ({ number: n, title: 'T', body: '', labels: [], createdAt: '', state: 'OPEN', author: '', thumbsUp: [] });
    await expect(add(f.ctx, 380)).rejects.toThrow('not an open release-candidate');
    expect(f.calls).toEqual([]);
  });

  it('refuses when dev has no unreverted merge of the issue, or more than one', async () => {
    const f = addable();
    f.ctx.repo.issueMerges = async () => [];
    await expect(add(f.ctx, 380)).rejects.toThrow('dev has no merge of issue #380');
    f.ctx.repo.issueMerges = async () => ['aaaaaaa1', 'bbbbbbb2'];
    await expect(add(f.ctx, 380)).rejects.toThrow('2 merges of issue #380 since main (aaaaaaa, bbbbbbb)');
    expect(branchCalls(f)).toEqual([]);
  });

  it('refuses with no queued order, no open release or a shipping release', async () => {
    const f = addable();
    await expect(add(f.ctx, 381)).rejects.toThrow('No addition of issue #381');
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), release: { ...RELEASE, shipping: { sha: 'abc1234', features: [] } } });
    await expect(add(f.ctx, 380)).rejects.toThrow('is shipping');
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), release: null });
    await expect(add(f.ctx, 380)).rejects.toThrow('No release is open');
    expect(f.calls).toEqual([]);
  });
});
