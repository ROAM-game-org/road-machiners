import { describe, expect, it } from 'vitest';
import { newPlaytest, readState, updateState } from '../state';
import { openTasks } from '../stages/release-common';
import { readReleaseGate } from '../tick';
import type { ReleaseState } from '../types';
import { taskCandidateReports } from './candidate-tasks';
import { publicFake } from './public-fakes';

const RELEASE: ReleaseState = { issue: 40, branch: 'release/2026-10-30', day: '2026-10-30', postId: null, candidateSha: null, removed: [], tasks: [], merges: [], playtest: newPlaytest('2026-10-30') };
const AT = '2026-10-14T09:00:00.000Z';

function withReports(release: Partial<ReleaseState> | null = {}) {
  const f = publicFake();
  updateState(f.ctx.statePath, (state) => ({ ...state, release: release === null ? null : { ...RELEASE, ...release } }));
  const report = { address: 'a', build: 'rc', version: 'v', kind: 'bug', text: 'The truck sinks', verdict: 'accept' as const, intent: 'sincere', sincere: 0.9, at: AT };
  f.store.addReport({ ...report, issue: 40, createdIssue: 601 });
  f.store.addReport({ ...report, issue: 40, createdIssue: 601 });
  f.store.addReport({ ...report, issue: 40, createdIssue: 602 });
  f.store.addReport({ ...report, issue: 33, createdIssue: 603 });
  f.store.addReport({ ...report, issue: 40, createdIssue: null, verdict: 'reject' });
  return f;
}

describe('taskCandidateReports', () => {
  it('makes each issue filed from a candidate report a task of its release once, and says so on the tracking issue', async () => {
    const f = withReports();
    await taskCandidateReports(f.ctx, f.store);
    expect(readState(f.ctx.statePath).release?.tasks).toEqual([601, 602]);
    expect(f.comments.map((comment) => comment.issue)).toEqual([40, 40]);
    expect(f.comments[0]!.body).toContain('filed as #601, a task of this release');
    expect(f.store.untaskedCandidateReports(40)).toEqual([]);
    await taskCandidateReports(f.ctx, f.store);
    expect(f.comments).toHaveLength(2);
  });

  it('holds the playtest and Ship until the filed task is done, with no committee post on the tracking card', async () => {
    const f = withReports();
    await taskCandidateReports(f.ctx, f.store);
    const state = readState(f.ctx.statePath);
    const cards = [{ itemId: 't', issue: 40, column: 'Approval' as const, labels: ['release'] }, { itemId: 'r', issue: 601, column: 'Triage' as const, labels: ['bug', 'player-report'] }];
    expect(state.approvalPosts).toEqual({});
    expect(readReleaseGate(state, cards, 'head')).toEqual({ reason: 'release-tasks', issues: [601, 602] });
    expect(openTasks([...cards, { itemId: 'd', issue: 602, column: 'Done', labels: [] }], state.release!.tasks)).toEqual([601]);
  });

  it('keeps a task forgotten by triage forgotten', async () => {
    const f = withReports();
    await taskCandidateReports(f.ctx, f.store);
    updateState(f.ctx.statePath, (state) => ({ ...state, release: { ...state.release!, tasks: [602] } }));
    await taskCandidateReports(f.ctx, f.store);
    expect(readState(f.ctx.statePath).release?.tasks).toEqual([602]);
  });

  it('records nothing while no release is open or the release ships, and keeps the reports for no later release', async () => {
    const closed = withReports(null);
    await taskCandidateReports(closed.ctx, closed.store);
    expect(closed.store.untaskedCandidateReports(40)).toEqual([601, 602]);
    const shipping = withReports({ shipping: { sha: 'abc', features: [] } });
    await taskCandidateReports(shipping.ctx, shipping.store);
    expect(readState(shipping.ctx.statePath).release?.tasks).toEqual([]);
    expect(shipping.comments).toEqual([]);
    const next = withReports({ issue: 50 });
    await taskCandidateReports(next.ctx, next.store);
    expect(readState(next.ctx.statePath).release?.tasks).toEqual([]);
  });
});
