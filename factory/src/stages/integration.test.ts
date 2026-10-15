import { describe, expect, it } from 'vitest';
import type { Evidence, Step } from '../check-evidence';
import { integrationChecks, type Revision } from './integration';

const FULL: Step[] = ['typecheck', 'suite', 'playtest', 'build'];

function evidence(commit: string, ran: Step[] = FULL): Evidence {
  return { tree: `tree-${commit}`, commit, toolchain: 'k', ran, reused: [], by: 'testing', issue: 7, at: '' };
}

function revision(commit: string, passed: Evidence | null = evidence(commit)): Revision {
  return { commit, tree: `tree-${commit}`, evidence: passed };
}

const base = { merged: revision('merged0', null), hotfix: revision('hotfix0'), main: revision('main000'), conflicted: false, shared: [] };

describe('integrationChecks', () => {
  it('runs nothing when main brought no change, even with no evidence on record', () => {
    const plan = integrationChecks({ ...base, merged: { ...revision('merged0', null), tree: 'tree-hotfix0' }, hotfix: revision('hotfix0', null) });
    expect(plan.steps).toEqual([]);
    expect(plan.reused).toEqual([]);
  });

  it('runs nothing for a merge whose exact code passed before, and names that evidence', () => {
    const plan = integrationChecks({ ...base, merged: revision('merged0', evidence('merged0', ['typecheck', 'suite'])) });
    expect(plan).toMatchObject({ steps: [], reused: ['merged0'] });
  });

  it('runs only the typecheck and the cached suite on a clean merge of two checked revisions with no shared file', () => {
    expect(integrationChecks(base)).toMatchObject({ steps: ['typecheck', 'suite'], reused: ['hotfix0', 'main000'] });
  });

  it('adds the playtest when both sides changed a same file', () => {
    const plan = integrationChecks({ ...base, shared: ['game/src/truck.ts'] });
    expect(plan.steps).toEqual(['typecheck', 'suite', 'playtest']);
    expect(plan.reason).toContain('game/src/truck.ts');
  });

  it('adds the playtest when an agent resolved a conflict', () => {
    expect(integrationChecks({ ...base, conflicted: true }).steps).toEqual(['typecheck', 'suite', 'playtest']);
  });

  it('runs the full checks and reuses nothing when either side has no passing typecheck and suite on record', () => {
    for (const plan of [integrationChecks({ ...base, hotfix: revision('hotfix0', null) }), integrationChecks({ ...base, main: revision('main000', evidence('main000', ['build'])) })]) {
      expect(plan.steps).toEqual(FULL);
      expect(plan.reused).toEqual([]);
    }
  });
});
