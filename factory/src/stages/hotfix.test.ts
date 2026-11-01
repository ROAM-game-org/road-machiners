import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLedger } from '../ledger';
import { EMPTY_STATE, readState, writeState } from '../state';
import { MergeConflictError } from '../types';
import { fake, reset } from './test-fakes';

vi.mock('../deploy', () => ({ deployDev: async () => 'https://play.test/dev/' }));
const { shipHotfix } = await import('./hotfix');

const ANN = { by: 'Ann', at: '2026-09-29T09:00:00Z', build: 'abc1234', checked: ['abc1234'], reason: null };

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
  it('has an agent resolve a conflict of main into dev, pushes all branches once, and ships', async () => {
    const f = hotfixable();
    f.mergeConflicts = ['main dev'];
    await shipHotfix(f.ctx, 7, 'Big horn', ANN, 'abc1234');
    expect(f.calls.filter((call) => /^(merge|open|agent|close (dev|main|release)|push)/.test(call))).toEqual([
      'merge factory/issue-7 main', 'merge main dev', 'open dev', 'agent', 'close dev',
      'merge factory/issue-7 main', 'merge main dev', 'push main dev',
    ]);
    expect(f.calls.some((call) => call.startsWith('addLabel'))).toBe(false);
  });

  it('ships with a GitHub release and posts nothing to the public channel', async () => {
    const f = hotfixable();
    await shipHotfix(f.ctx, 7, 'Big horn', ANN, 'abc1234');
    expect(f.calls).toContain('release hotfix-2026-09-29-issue-7 main ROAM hotfix 2026-09-29\nROAM hotfix 2026-09-29\n\nFixed: #7 Big horn');
    expect(f.calls.filter((call) => /^(message|photo|album|buttons|document) /.test(call))).toEqual([]);
    expect(readLedger(f.ctx.cfg.home, new Date(0)).filter((entry) => entry.kind === 'post')).toEqual([]);
  });

  it('leaves the open release and its candidate post alone', async () => {
    const f = hotfixable();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { issue: 11, day: '2026-09-29', postId: 42, removed: [], candidate: null, playtest: { seed: 1, runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null } } });
    await shipHotfix(f.ctx, 7, 'Big horn', ANN, 'abc1234');
    expect(f.calls.some((call) => call.includes('release/2026-09-29'))).toBe(false);
    expect(readState(f.ctx.statePath).release?.postId).toBe(42);
  });

  it('closes the duplicates triage folded into the hotfix when it ships', async () => {
    const f = hotfixable();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), bundles: { 7: [21, 22] } });
    await shipHotfix(f.ctx, 7, 'Big horn', ANN, 'abc1234');
    expect(f.calls.filter((call) => call.endsWith('It shipped as part of #7.'))).toHaveLength(2);
    expect(f.calls.filter((call) => call === 'close completed')).toHaveLength(3);
    expect(readState(f.ctx.statePath).bundles).toEqual({});
  });

  it('leaves a conflict of the hotfix branch itself to the approval', async () => {
    const f = hotfixable();
    f.mergeConflicts = ['factory/issue-7 main'];
    const error = await shipHotfix(f.ctx, 7, 'Big horn', ANN, 'abc1234').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MergeConflictError);
    expect(f.calls.some((call) => call.startsWith('open') || call === 'agent')).toBe(false);
  });
});
