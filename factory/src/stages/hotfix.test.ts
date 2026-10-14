import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import { MergeConflictError } from '../types';
import { fake, reset } from './test-fakes';

vi.mock('../deploy', () => ({ deployDev: async () => 'https://play.test/dev/' }));
const { shipHotfix, publishHotfixes } = await import('./hotfix');

beforeEach(() => {
  reset();
  writeState(fake().ctx.statePath, structuredClone(EMPTY_STATE));
});

function hotfixable() {
  const f = fake();
  Object.assign(f.ctx.cfg, { itchTarget: 'u/g', butlerKey: 'secret' });
  return f;
}

describe('hotfix fan-out', () => {
  it('has an agent resolve a conflict of main into dev, pushes all branches once, and queues the upload', async () => {
    const f = hotfixable();
    f.mergeConflicts = ['main dev'];
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(f.calls.filter((call) => /^(merge|open|agent|close (dev|main|release)|push)/.test(call))).toEqual([
      'merge factory/issue-7 main', 'merge main dev', 'open dev', 'agent', 'close dev',
      'merge factory/issue-7 main', 'merge main dev', 'push main dev',
    ]);
    expect(f.calls.some((call) => call.startsWith('run butler'))).toBe(false);
    expect(f.calls.some((call) => call.startsWith('addLabel'))).toBe(false);
  });

  it('queues the issue for the next upload without building, publishing, releasing or closing it', async () => {
    const f = hotfixable();
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    await shipHotfix(f.ctx, 8, 'Low tire', 'Ann');
    expect(readState(f.ctx.statePath).pendingPublish).toEqual([7, 8]);
    expect(f.calls.filter((call) => /^(run butler|shell|release|close|message)/.test(call))).toEqual([]);
    expect(f.calls).toContain('comment Approved by Ann in the committee chat. It is merged into main and goes to itch.io with the next hotfix upload.');
  });

  it('leaves the open release and its candidate post alone', async () => {
    const f = hotfixable();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { issue: 11, branch: 'release/2026-09-29', day: '2026-09-29', postId: 42, removed: [], tasks: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } } });
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(f.calls.some((call) => call.includes('release/2026-09-29'))).toBe(false);
    expect(readState(f.ctx.statePath).release?.postId).toBe(42);
  });

  it('leaves a conflict of the hotfix branch itself to the approval', async () => {
    const f = hotfixable();
    f.mergeConflicts = ['factory/issue-7 main'];
    const error = await shipHotfix(f.ctx, 7, 'Big horn', 'Ann').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MergeConflictError);
    expect(f.calls.some((call) => call.startsWith('open') || call === 'agent')).toBe(false);
  });
});

describe('hotfix upload', () => {
  function queued(issues: number[]) {
    const f = hotfixable();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), pendingPublish: issues });
    return f;
  }

  it('builds and pushes main once, releases once and closes each issue of the batch', async () => {
    const f = queued([7, 8]);
    await publishHotfixes(f.ctx);
    expect(f.calls.filter((call) => call.startsWith('run butler'))).toHaveLength(1);
    expect(f.calls.filter((call) => call.startsWith('release'))).toEqual(['release hotfix-2026-09-29-abc1234 main ROAM hotfix 2026-09-29\nROAM hotfix 2026-09-29\n\nFixed: #7 T\nFixed: #8 T']);
    expect(f.calls.filter((call) => call.startsWith('close'))).toEqual(['close completed', 'close completed']);
    expect(f.calls.filter((call) => call.startsWith('comment'))).toEqual(Array(2).fill('comment Shipped as a hotfix. It is on main and itch.io.'));
    expect(f.calls.filter((call) => call.startsWith('message'))).toEqual(['message committee - Hotfix upload is on itch.io: #7 T, #8 T.']);
    const state = readState(f.ctx.statePath);
    expect(state.pendingPublish).toEqual([]);
    expect(state.pendingIncidents).toEqual([7, 8]);
  });

  it('keeps issues queued while it runs', async () => {
    const f = queued([7]);
    f.ctx.github.close = async () => { writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), pendingPublish: [7, 9] }); };
    await publishHotfixes(f.ctx);
    expect(readState(f.ctx.statePath).pendingPublish).toEqual([9]);
  });

  it('keeps the queue when the upload fails', async () => {
    const f = queued([7, 8]);
    f.ctx.run = async () => ({ code: 1, stdout: '', stderr: 'channel html5 is still processing' });
    await expect(publishHotfixes(f.ctx)).rejects.toThrow();
    expect(readState(f.ctx.statePath).pendingPublish).toEqual([7, 8]);
    expect(f.calls.some((call) => call.startsWith('close') || call.startsWith('release'))).toBe(false);
  });
});
