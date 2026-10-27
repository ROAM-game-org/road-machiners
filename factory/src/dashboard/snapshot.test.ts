import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { EMPTY_STATE, writeState } from '../state';
import { appendLedger } from '../ledger';
import { buildOperations, PublicGitHub, SnapshotCollector } from './snapshot';
import { HostSampler, type HostLoad } from './host';
import { AnalyticsRunner } from './analytics';
import type { DashboardConfig } from './config';
import type { FactoryState, Run } from '../types';

it('publishes only explicit operational fields, never private state or raw errors', () => {
  const state: FactoryState = { ...structuredClone(EMPTY_STATE),
    jobs: [{ id: 'private-job-id', stage: 'adhoc', issue: 3, pid: 123, log: '/PRIVATE/log', startedAt: '2026-01-01T00:00:00Z' }],
    lastTickError: 'PRIVATE error',
    postCaptions: { '1': 'PRIVATE caption' },
  };
  const result = buildOperations(state, false, { triageWorkers: 1, designWorkers: 2, implementWorkers: 2, verifyWorkers: 2, testWorkers: 2, publicUrl: 'https://example.org' });
  expect(result.status).toBe('blocked');
  expect(result.jobs).toEqual([{ key: expect.stringMatching(/^[a-f0-9]{64}$/), stage: 'adhoc', issue: null, startedAt: '2026-01-01T00:00:00Z', queue: 'implement' }]);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(JSON.stringify(result)).not.toContain('private-job-id');
  expect(result.queues.implement).toEqual({ busy: 1, total: 2 });
});

it('stays idle on a catch-up failure, which blocks no card, and turns blocked on any other failure', () => {
  const config = { triageWorkers: 1, designWorkers: 2, implementWorkers: 2, verifyWorkers: 2, testWorkers: 2, publicUrl: 'https://example.org' };
  const failure = { stage: 'catch-up' as const, issue: 8, error: 'e', cause: 'error' as const, log: null, at: '2026-01-01T00:00:00Z' };
  expect(buildOperations({ ...structuredClone(EMPTY_STATE), failures: [failure] }, false, config).status).toBe('idle');
  expect(buildOperations({ ...structuredClone(EMPTY_STATE), failures: [failure, { ...failure, stage: 'merge' }] }, false, config).status).toBe('blocked');
});

it('only publishes a candidate link while the current candidate is valid', () => {
  const state: FactoryState = { ...structuredClone(EMPTY_STATE), release: { issue: 3, branch: 'release/day', day: '2026-01-01', postId: null, removed: [], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } }, builds: { '3': 'rc' } };
  const config = { triageWorkers: 1, designWorkers: 2, implementWorkers: 2, verifyWorkers: 2, testWorkers: 2, publicUrl: 'https://example.org' };
  expect(buildOperations(state, false, config).candidateUrl).toBeNull();
  state.release!.postId = 10;
  expect(buildOperations(state, false, config).candidateUrl).toBe('https://example.org/rc/');
});

describe('next release features', () => {
  const config = { triageWorkers: 1, designWorkers: 2, implementWorkers: 2, verifyWorkers: 2, testWorkers: 2, publicUrl: 'https://example.org' };
  const merge = (issue: number, title: string) => ({ issue, title, sha: 'a'.repeat(40), into: 'dev', reverted: [] });
  const release = (over: Partial<NonNullable<FactoryState['release']>>): FactoryState['release'] => ({ issue: 3, branch: 'release/day', day: '2026-01-01', postId: null, removed: [], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] }, ...over });

  it('lists the dev merges while no release is open', () => {
    const state: FactoryState = { ...structuredClone(EMPTY_STATE), devMerges: [merge(7, 'Included'), merge(8, 'Also')] };
    expect(buildOperations(state, false, config).features).toEqual([{ issue: 7, title: 'Included' }, { issue: 8, title: 'Also' }]);
  });
  it('lists the release merges without the removed ones while a release is open', () => {
    const state: FactoryState = { ...structuredClone(EMPTY_STATE), devMerges: [merge(9, 'Later')], release: release({ merges: [merge(7, 'Included'), merge(8, 'Removed')], removed: [8] }) };
    expect(buildOperations(state, false, config).features).toEqual([{ issue: 7, title: 'Included' }]);
  });
});

function createConfig(home: string): DashboardConfig {
  return { home, repo: 'owner/game', projectOwner: 'owner', projectNumber: 1, githubAppId: '42', githubRetries: 3, githubRetryBaseSeconds: 15, githubTimeoutSeconds: 60, publicUrl: 'https://example.org', playUrl: 'https://owner.itch.io/game', channelUrl: 'https://t.me/fixture_channel_not_real', publicChannel: '@fixture_channel_not_real', socket: null, port: 8787, refreshMs: 2000, githubRefreshMs: 60000, analyticsRefreshMs: 0, commandTimeoutMs: 15000, observationHeartbeatMs: 10000, tickIntervalMs: 60000, triageWorkers: 1, designWorkers: 2, implementWorkers: 2, verifyWorkers: 2, testWorkers: 2 };
}
class FixtureGithub extends PublicGitHub {
  failed = false;
  override async read(state: FactoryState) {
    if (this.failed) throw new Error('PRIVATE credential failure');
    return { cards: { value: [], error: null }, mergeQueue: { value: [], error: null } };
  }
}
const analyticsRunner = await AnalyticsRunner.open();
class FixtureHost extends HostSampler {
  override async sample(): Promise<HostLoad> {
    const reading = { value: null, at: null, status: 'unavailable' as const, error: 'Unavailable' };
    return { cpu: reading, ram: reading, gpu: reading, ssd: reading };
  }
}
it('retains the last good snapshot with stale markers when its sources fail', async () => {
  mkdirSync('tmp', { recursive: true });
  const home = mkdtempSync(resolve('tmp/snapshot-'));
  try {
    mkdirSync(join(home, 'state'));
    const path = join(home, 'state', 'state.json');
    writeState(path, structuredClone(EMPTY_STATE));
    const config = createConfig(home);
    const github = new FixtureGithub(config, async () => { throw new Error('No network'); });
    const collector = new SnapshotCollector(config, github, new FixtureHost(home, 100), analyticsRunner);
    await collector.refreshLocal();
    await collector.refreshGithub();
    const good = collector.getSnapshot();
    expect(good.labels.columns.Merging).toBe('Merge');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    expect(collector.getSnapshot().operations.status).toBe('stale');
    vi.useRealTimers();
    writeFileSync(path, 'corrupt PRIVATE');
    github.failed = true;
    await collector.refreshLocal();
    await collector.refreshGithub();
    const stale = collector.getSnapshot();
    expect(stale.operations.status).toBe('stale');
    expect(stale.operations.value).toEqual(good.operations.value);
    expect(stale.github.status).toBe('stale');
    expect(stale.github.value).toEqual(good.github.value);
    expect(JSON.stringify(stale)).not.toContain('PRIVATE');
  } finally { vi.useRealTimers(); rmSync(home, { recursive: true, force: true }); }
});
it('reports a safe pause reason and clears it when the pause is removed', async () => {
  const home = mkdtempSync(resolve('tmp/snapshot-'));
  try {
    mkdirSync(join(home, 'state'));
    writeState(join(home, 'state', 'state.json'), structuredClone(EMPTY_STATE));
    const config = createConfig(home);
    const collector = new SnapshotCollector(config, new FixtureGithub(config, async () => { throw new Error('No network'); }), new FixtureHost(home, 100), analyticsRunner);
    const pause = join(home, 'paused');
    writeFileSync(pause, JSON.stringify({ kind: 'usage-limit', note: 'PRIVATE committee notes', by: 'factory', at: '2026-01-01T00:00:00.000Z' }));
    await collector.refreshLocal();
    expect(collector.getSnapshot().operations.value).toMatchObject({ status: 'paused', pauseReason: 'agent-usage-limit' });
    expect(JSON.stringify(collector.getSnapshot())).not.toContain('PRIVATE');
    writeFileSync(pause, JSON.stringify({ kind: 'factory', note: 'PRIVATE operator investigation', by: 'cli', at: '2026-01-01T00:00:00.000Z' }));
    await collector.refreshLocal();
    expect(collector.getSnapshot().operations.value).toMatchObject({ status: 'paused', pauseReason: 'operator' });
    expect(JSON.stringify(collector.getSnapshot())).not.toContain('PRIVATE');
    rmSync(pause);
    await collector.refreshLocal();
    expect(collector.getSnapshot().operations.value).toMatchObject({ status: 'idle', pauseReason: null });
  } finally { rmSync(home, { recursive: true, force: true }); }
});
it('does not expose committee posts when Telegram is hidden', async () => {
  const home = mkdtempSync(resolve('tmp/snapshot-'));
  try {
    mkdirSync(join(home, 'state'));
    writeState(join(home, 'state', 'state.json'), structuredClone(EMPTY_STATE));
    appendLedger(home, { kind: 'post', id: 7, channel: '-1001', text: 'PRIVATE committee post', at: new Date().toISOString() });
    const config = { ...createConfig(home), channelUrl: null, publicChannel: null };
    const collector = new SnapshotCollector(config, new FixtureGithub(config, async () => { throw new Error('No network'); }), new FixtureHost(home, 100), analyticsRunner);
    await collector.refreshLocal();
    const snapshot = collector.getSnapshot();
    expect(snapshot.channelUrl).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
it('publishes delivery numbers from card lines in every range with no committee text', async () => {
  const home = mkdtempSync(resolve('tmp/snapshot-'));
  try {
    mkdirSync(join(home, 'state'));
    writeState(join(home, 'state', 'state.json'), structuredClone(EMPTY_STATE));
    const hour = 3_600_000;
    const at = (hoursAgo: number): string => new Date(Date.now() - hoursAgo * hour).toISOString();
    appendLedger(home, { kind: 'card', issue: 5, step: 'entered', to: 'Triage', at: at(5) });
    appendLedger(home, { kind: 'card', issue: 5, step: 'accepted', to: 'Design', at: at(4) });
    appendLedger(home, { kind: 'route', issue: 5, route: 'redesign', by: 'PRIVATE member', at: at(3) });
    appendLedger(home, { kind: 'control', action: 'move', issue: 5, by: 'PRIVATE', reason: 'PRIVATE reason', at: at(3) });
    const config = createConfig(home);
    const collector = new SnapshotCollector(config, new FixtureGithub(config, async () => { throw new Error('No network'); }), new FixtureHost(home, 100), analyticsRunner);
    await collector.refreshLocal();
    const snapshot = collector.getSnapshot();
    const ranges = snapshot.analytics.value?.delivery_coverage.ranges;
    expect([ranges?.[1][0].issues, ranges?.[7][0].issues, ranges?.[30][0].issues]).toEqual([1, 1, 1]);
    expect(snapshot.analytics.value?.dwell.ranges?.[1].find((row) => row.stage === 'triage')?.count).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
it('reruns the analytics only when the ledger grows', async () => {
  const home = mkdtempSync(resolve('tmp/snapshot-'));
  try {
    mkdirSync(join(home, 'state'));
    writeState(join(home, 'state', 'state.json'), structuredClone(EMPTY_STATE));
    appendLedger(home, { kind: 'card', issue: 5, step: 'entered', to: 'Triage', at: new Date().toISOString() });
    const config = createConfig(home);
    const read = vi.spyOn(analyticsRunner, 'read');
    const collector = new SnapshotCollector(config, new FixtureGithub(config, async () => { throw new Error('No network'); }), new FixtureHost(home, 100), analyticsRunner);
    await collector.refreshLocal();
    await collector.refreshLocal();
    expect(read).toHaveBeenCalledTimes(1);
    expect(collector.getSnapshot().analytics.status).toBe('ok');
    appendLedger(home, { kind: 'card', issue: 5, step: 'accepted', to: 'Design', at: new Date().toISOString() });
    await collector.refreshLocal();
    expect(read).toHaveBeenCalledTimes(2);
    expect(collector.getSnapshot().analytics.value?.delivery_coverage.ranges?.[1][0].issues).toBe(1);
    read.mockRestore();
  } finally { rmSync(home, { recursive: true, force: true }); }
});

it('reads a grown ledger again only after the analytics interval', async () => {
  const home = mkdtempSync(resolve('tmp/snapshot-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    mkdirSync(join(home, 'state'));
    writeState(join(home, 'state', 'state.json'), structuredClone(EMPTY_STATE));
    appendLedger(home, { kind: 'card', issue: 5, step: 'entered', to: 'Triage', at: new Date().toISOString() });
    const config = { ...createConfig(home), analyticsRefreshMs: 300_000 };
    const read = vi.spyOn(analyticsRunner, 'read');
    const collector = new SnapshotCollector(config, new FixtureGithub(config, async () => { throw new Error('No network'); }), new FixtureHost(home, 100), analyticsRunner);
    await collector.refreshLocal();
    appendLedger(home, { kind: 'card', issue: 5, step: 'accepted', to: 'Design', at: new Date().toISOString() });
    vi.advanceTimersByTime(299_000);
    await collector.refreshLocal();
    expect(read).toHaveBeenCalledTimes(1);
    expect(collector.getSnapshot().analytics.status).toBe('ok');
    vi.advanceTimersByTime(1_000);
    await collector.refreshLocal();
    expect(read).toHaveBeenCalledTimes(2);
    read.mockRestore();
  } finally {
    vi.useRealTimers();
    rmSync(home, { recursive: true, force: true });
  }
});

it('refuses to collect a private repository before reading its issues', async () => {
  const calls: string[][] = [];
  const run: Run = async (_command, args) => { calls.push(args); return { code: 0, stdout: 'private', stderr: '' }; };
  await expect(new PublicGitHub(createConfig('/unused'), run).read(structuredClone(EMPTY_STATE))).rejects.toThrow('public repository');
  expect(calls).toHaveLength(1);
});
