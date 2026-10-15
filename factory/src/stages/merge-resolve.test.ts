import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MergeConflictError, type AgentRun, type Ctx, type MergeStep, type Resolution } from '../types';
import { mergeResolving } from './merge-resolve';

let home = '';
let agents = 0;
let merges = 0;

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-merge-resolve-');
  agents = 0;
  merges = 0;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function fakeCtx(): Ctx {
  const fake = {
    cfg: { home, buildModel: 'sonnet' },
    log: () => undefined,
    statePath: `${home}/state.json`,
    now: () => new Date('2026-10-09T19:00:00Z'),
    container: { agent: async (_run: AgentRun) => { agents += 1; return ''; } },
    repo: {
      merge: async ([step]: MergeStep[], resolutions: Resolution[] = []) => {
        merges += 1;
        if (resolutions.length === 0) throw new MergeConflictError(step, ['game/src/a.ts'], 'both changed it', 'b1', 's1');
      },
      openConflict: async (dir: string) => { mkdirSync(dir, { recursive: true }); },
      closeConflict: async () => ({ resolution: { base: 'b1', source: 's1', head: 'h1' }, diff: '', files: [] }),
    },
  };
  return fake as unknown as Ctx;
}

describe('mergeResolving', () => {
  it('rethrows a conflict of a step that carries an issue number', async () => {
    const step = { branch: 'x', into: 'dev', message: 'm', issue: 5 };
    await expect(mergeResolving(fakeCtx(), 'merge', [step])).rejects.toBeInstanceOf(MergeConflictError);
    expect(agents).toBe(0);
    expect(merges).toBe(1);
  });

  it('hands a conflict of a step with no issue to an agent, even when the branch is named like an issue branch', async () => {
    const step = { branch: 'factory/issue-5', into: 'dev', message: 'm', issue: null };
    await mergeResolving(fakeCtx(), 'merge', [step]);
    expect(agents).toBe(1);
    expect(merges).toBe(2);
  });
});
