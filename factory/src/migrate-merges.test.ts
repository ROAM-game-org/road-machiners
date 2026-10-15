import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, readState, writeState } from './state';
import { migrateMerges } from './migrate-merges';
import { fake, reset } from './stages/test-fakes';
import type { FactoryState, IssueMerge, ReleaseState } from './types';

beforeEach(reset);

const sha = (name: string): string => name.padEnd(40, '0');
const RELEASE: ReleaseState = { issue: 20, branch: 'release/2026-09-29', day: '2026-09-29', postId: null, removed: [], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } };

function withGit(history: Record<string, { sha: string; subject: string }[]>, onDev: string[] = []) {
  const f = fake();
  const asked: string[] = [];
  Object.assign(f.ctx.repo, {
    legacyMerges: async (from: string, to: string) => { asked.push(`${from}..${to}`); return history[`${from}..${to}`] ?? []; },
    containsCommit: async (branch: string, commit: string) => branch === 'dev' && onDev.includes(commit),
  });
  return { f, asked };
}

const seed = (f: ReturnType<typeof fake>, over: Partial<FactoryState>): void => writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), ...over });

describe('migrateMerges', () => {
  it('fills the dev merges from legacy subjects, oldest first, and skips merges that are not issues', async () => {
    const { f, asked } = withGit({ 'dev..main': [
      { sha: sha('c'), subject: 'Merge issue #7: third' },
      { sha: sha('b'), subject: 'Merge main into dev after release 2026-09-22' },
      { sha: sha('a'), subject: 'Merge issue #3: faster trucks' },
    ] });
    seed(f, { devMerges: null });
    await migrateMerges(f.ctx);
    expect(readState(f.ctx.statePath).devMerges).toEqual([
      { issue: 3, title: 'faster trucks', sha: sha('a'), into: 'dev', reverted: [] },
      { issue: 7, title: 'third', sha: sha('c'), into: 'dev', reverted: [] },
    ]);
    expect(asked).toEqual(['dev..main']);
  });

  it('reads dev merges against the release branch when a release is open', async () => {
    const { f, asked } = withGit({ [`dev..${RELEASE.branch}`]: [{ sha: sha('a'), subject: 'Merge issue #3: late' }] });
    seed(f, { devMerges: null, release: RELEASE });
    await migrateMerges(f.ctx);
    expect(readState(f.ctx.statePath).devMerges).toMatchObject([{ issue: 3, sha: sha('a') }]);
    expect(asked).toContain(`dev..${RELEASE.branch}`);
  });

  it('leaves an existing dev list alone', async () => {
    const { f, asked } = withGit({ 'dev..main': [{ sha: sha('a'), subject: 'Merge issue #3: x' }] });
    const kept: IssueMerge[] = [{ issue: 9, title: 'kept', sha: sha('k'), into: 'dev', reverted: [] }];
    seed(f, { devMerges: kept });
    await migrateMerges(f.ctx);
    expect(readState(f.ctx.statePath).devMerges).toEqual(kept);
    expect(asked).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it('fills the release merges, with dev as the branch for a commit that dev holds', async () => {
    const { f } = withGit({ [`${RELEASE.branch}..main`]: [
      { sha: sha('b'), subject: 'Merge issue #5: only in release' },
      { sha: sha('a'), subject: 'Merge issue #3: also on dev' },
    ] }, [sha('a')]);
    seed(f, { devMerges: [], release: { ...RELEASE, merges: null } });
    await migrateMerges(f.ctx);
    expect(readState(f.ctx.statePath).release?.merges).toEqual([
      { issue: 3, title: 'also on dev', sha: sha('a'), into: 'dev', reverted: [] },
      { issue: 5, title: 'only in release', sha: sha('b'), into: RELEASE.branch, reverted: [] },
    ]);
  });

  it('fills the release list even when the dev list is already there', async () => {
    const { f } = withGit({ [`${RELEASE.branch}..main`]: [{ sha: sha('a'), subject: 'Merge issue #3: x' }] });
    const kept: IssueMerge[] = [{ issue: 9, title: 'kept', sha: sha('k'), into: 'dev', reverted: [] }];
    seed(f, { devMerges: kept, release: { ...RELEASE, merges: null } });
    await migrateMerges(f.ctx);
    const state = readState(f.ctx.statePath);
    expect(state.devMerges).toEqual(kept);
    expect(state.release?.merges).toHaveLength(1);
  });

  it('logs once and a second call does nothing', async () => {
    const { f, asked } = withGit({ 'dev..main': [{ sha: sha('a'), subject: 'Merge issue #3: x' }] });
    seed(f, { devMerges: null });
    await migrateMerges(f.ctx);
    const after = readState(f.ctx.statePath);
    const asks = asked.length;
    await migrateMerges(f.ctx);
    expect(readState(f.ctx.statePath)).toEqual(after);
    expect(asked).toHaveLength(asks);
    expect(f.logs.filter((line) => line.includes('merge records'))).toHaveLength(1);
  });
});
