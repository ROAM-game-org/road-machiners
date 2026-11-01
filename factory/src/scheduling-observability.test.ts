import { expect, it } from 'vitest';
import * as scheduling from './tick';
import { EMPTY_STATE, newPlaytest } from './state';
import { STUCK_LABEL, NEEDS_INFO_LABEL, type Card, type FactoryState, type Job } from './types';

const now = new Date('2026-10-04T12:00:00Z');
const config = { playtestHours: 12, wasteReviewDays: 7, maxJobsPerCard: 30, triageWorkers: 1, designWorkers: 1, implementWorkers: 1, verifyWorkers: 1, testWorkers: 1 };
function createCard(issue: number, column: Card['column'], labels: string[] = []): Card { return { issue, column, labels, itemId: String(issue) }; }
function createState(): FactoryState { return { ...structuredClone(EMPTY_STATE), lastRelease: now.toISOString(), release: { issue: 90, day: '2026-10-04', postId: null, candidate: null, removed: [], playtest: newPlaytest('2026-10-04') } }; }

it('explains both slot contention and an already running issue without changing selections', () => {
  expect(scheduling).toHaveProperty('evaluateSchedule');
  const state = createState();
  state.jobs = [{ id: 'job-1', stage: 'implement', issue: 1, pid: 123, log: '', startedAt: now.toISOString() } satisfies Job];
  const cards = [createCard(1, 'Implementation'), createCard(2, 'Implementation'), createCard(3, 'Design')];
  const result = scheduling.evaluateSchedule(state, cards, now, config);
  expect(result.picks).toEqual([{ stage: 'design', issue: 3 }]);
  expect(result.decisions.find(item => item.issue === 1)?.reasons).toEqual(['queue-full', 'issue-running']);
  expect(result.decisions.find(item => item.issue === 2)?.reasons).toEqual(['queue-full']);
});
it('explains author waits, failed work, approval waits and the card job limit', () => {
  expect(scheduling).toHaveProperty('evaluateSchedule');
  const state = createState();
  state.cardStarts = { 4: Array.from({ length: 30 }, () => now.toISOString()) };
  const result = scheduling.evaluateSchedule(state, [createCard(1, 'Triage', [NEEDS_INFO_LABEL]), createCard(2, 'Testing', [STUCK_LABEL]), createCard(3, 'Approval'), createCard(4, 'Design')], now, config);
  expect(result.picks).toEqual([]);
  expect(result.decisions.find(item => item.issue === 1)?.reasons).toContain('needs-info');
  expect(result.decisions.find(item => item.issue === 2)?.reasons).toContain('failed');
  expect(result.decisions.find(item => item.issue === 3)?.reasons).toContain('approval');
  expect(result.decisions.find(item => item.issue === 4)?.reasons).toContain('card-budget');
});
it('reports the same candidate gate used by selection', () => {
  expect(scheduling).toHaveProperty('readReleaseGate');
  const state = createState();
  state.release = { issue: 10, day: '2026-10-04', postId: null, removed: [], candidate: null, playtest: { seed: 1, runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null } };
  state.devBuild = 'dev0001';
  const cards = [createCard(10, 'Approval', ['release']), createCard(11, 'Testing')];
  expect(scheduling.readReleaseGate(state, cards)).toEqual({ reason: 'playtest', issues: [] });
  expect(scheduling.chooseJobs(state, cards, now, config, { dev: 'dev0001', main: null })).toEqual([{ stage: 'playtest', issue: 10 }]);
  state.release!.playtest.passed = { sha: 'rel0001', features: [] };
  expect(scheduling.readReleaseGate(state, cards)).toEqual({ reason: 'candidate', issues: [] });
  expect(scheduling.chooseJobs(state, cards, now, config, { dev: 'dev0001', main: null })).toContainEqual({ stage: 'candidate', issue: 10 });
  state.release!.candidate = { sha: 'rel0001', features: [] };
  state.release!.postId = 5;
  expect(scheduling.readReleaseGate(state, cards)).toEqual({ reason: 'ship-approval', issues: [] });
});
it('reports no release gate work while the release is unopened, missing its card or blocked', () => {
  const state: FactoryState = { ...createState(), release: null };
  expect(scheduling.readReleaseGate(state, [])).toEqual({ reason: 'unopened', issues: [] });
  state.release = { issue: 10, day: '2026-10-04', postId: null, removed: [], candidate: null, playtest: { seed: 1, runs: 0, lastStart: null, passed: null, fixes: null, blocked: { sha: 'x', reason: 'r' }, decision: null, work: null } };
  expect(scheduling.readReleaseGate(state, [])).toEqual({ reason: 'tracking-missing', issues: [] });
  expect(scheduling.readReleaseGate(state, [createCard(10, 'Approval', ['release'])])).toEqual({ reason: 'playtest-blocked', issues: [] });
});
