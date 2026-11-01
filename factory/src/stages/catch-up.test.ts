import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import { MergeConflictError, STUCK_LABEL, type AgentRun, type Card, type Ctx, type Failure, type Job, type MergeStep, type Resolution } from '../types';
import { catchUp } from './catch-up';

let home = '';
let cards: Card[] = [];
let calls: string[] = [];
let runs: AgentRun[] = [];
let merged = false;
let conflicts = 0;
let resolutionDiff = '';
let resolutionFiles: string[] = [];
let logs: string[] = [];

const card = (issue: number, labels: string[] = []): Card => ({ itemId: `i${issue}`, issue, column: 'Merging', labels });
const mergeJob = (batch: number[] | undefined): Job => ({ id: 'merge-x', stage: 'merge', issue: null, pid: 1, startedAt: '', log: '', batch });
const RELEASE = { issue: 20, day: '2026-10-09', postId: null, removed: [], candidate: null, playtest: { seed: 1, runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null } };

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-catch-up-');
  cards = [card(5), card(6), card(8)];
  calls = [];
  runs = [];
  merged = false;
  conflicts = 0;
  resolutionDiff = '';
  resolutionFiles = [];
  logs = [];
  writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), jobs: [mergeJob([5, 6])], release: RELEASE });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function fakeCtx(): Ctx {
  const fake = {
    cfg: { home, buildModel: 'sonnet' },
    log: (_stage: string, _issue: number | null, msg: string) => { logs.push(msg); },
    statePath: `${home}/state.json`,
    now: () => new Date('2026-10-09T19:00:00Z'),
    github: { cards: async () => cards },
    container: { agent: async (run: AgentRun) => { runs.push(run); calls.push('agent'); return ''; } },
    repo: {
      fetch: async () => { calls.push('fetch'); },
      headHash: async (branch: string) => `${branch}-head`,
      isMerged: async (base: string, branch: string) => { calls.push(`is-merged ${base} ${branch}`); return merged; },
      merge: async ([step]: MergeStep[], resolutions: Resolution[] = []) => {
        calls.push(`merge ${step.branch} into ${step.into} with ${resolutions.length} resolutions`);
        if (conflicts-- > 0) throw new MergeConflictError(step, ['game/src/a.ts'], 'both changed it', 'b1', 's1');
      },
      openConflict: async (dir: string) => { calls.push(`open ${dir.slice(home.length)}`); mkdirSync(dir, { recursive: true }); },
      closeConflict: async () => ({ resolution: { base: 'b1', source: 's1', head: 'h1' }, diff: resolutionDiff, files: resolutionFiles }),
    },
  };
  return fake as unknown as Ctx;
}

const caughtUp = (): Record<string, string> => readState(`${home}/state.json`).caughtUpTo;

describe('catchUp', () => {
  it('merges dev into a waiting card branch with no conflict and records the dev head it took', async () => {
    await catchUp(fakeCtx(), 8);
    expect(calls).toEqual(['fetch', 'is-merged dev factory/issue-8', 'merge dev into factory/issue-8 with 0 resolutions']);
    expect(caughtUp()).toEqual({ 8: 'dev-head' });
    expect(logs.at(-1)).toBe('factory/issue-8 took dev');
  });

  it('clears the earlier catch-up failure of the card once it catches up, and keeps its other failures', async () => {
    const row = (stage: 'catch-up' | 'verify', issue: number): Failure => ({ stage, issue, error: `${stage} failed`, cause: 'timeout', log: null, at: '2026-09-29T10:00:00.000Z' });
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), failures: [row('catch-up', 8), row('catch-up', 9), row('verify', 8)] });
    await catchUp(fakeCtx(), 8);
    expect(readState(`${home}/state.json`).failures).toEqual([row('catch-up', 9), row('verify', 8)]);
  });

  it('hands a conflict to an agent in its own work clone, then pushes the resolved merge to the issue branch only', async () => {
    conflicts = 1;
    await catchUp(fakeCtx(), 8);
    expect(calls).toEqual(['fetch', 'is-merged dev factory/issue-8', 'merge dev into factory/issue-8 with 0 resolutions', 'open /work/merge-factory-issue-8', 'agent', 'merge dev into factory/issue-8 with 1 resolutions']);
    expect(runs[0]!.prompt).toContain('game/src/a.ts');
  });

  it('pushes nothing when the issue branch already holds the base', async () => {
    merged = true;
    await catchUp(fakeCtx(), 8);
    expect(calls).toEqual(['fetch', 'is-merged dev factory/issue-8']);
    expect(caughtUp()).toEqual({ 8: 'dev-head' });
  });

  it('runs with no merge job running', async () => {
    writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), release: RELEASE });
    await catchUp(fakeCtx(), 8);
    expect(calls).toContain('merge dev into factory/issue-8 with 0 resolutions');
  });

  it('records nothing when the merge fails, so the tick sees the card behind', async () => {
    conflicts = 1;
    resolutionFiles = ['.github/workflows/ci.yml'];
    await expect(catchUp(fakeCtx(), 8)).rejects.toThrow();
    expect(caughtUp()).toEqual({});
  });

  it('takes dev for a maintenance card', async () => {
    cards = [card(8, ['maintenance'])];
    await catchUp(fakeCtx(), 8);
    expect(calls).toContain('merge dev into factory/issue-8 with 0 resolutions');
  });

  it('does nothing for a card of the running batch or a stuck card', async () => {
    const runs = async (jobs: Job[], issue: number): Promise<string[]> => {
      calls = [];
      writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), jobs });
      await catchUp(fakeCtx(), issue);
      return calls;
    };
    expect(await runs([mergeJob([5, 6, 8])], 8)).toEqual([]);
    cards = [card(8, [STUCK_LABEL])];
    expect(await runs([mergeJob([5, 6])], 8)).toEqual([]);
    expect(caughtUp()).toEqual({});
  });

  it('fails with the issue named when the agent resolution touches .github, and pushes nothing', async () => {
    conflicts = 1;
    resolutionFiles = ['.github/workflows/ci.yml'];
    await expect(catchUp(fakeCtx(), 8)).rejects.toThrow(/catch-up of #8 with dev failed, and its merge job merges it as before: .*may not push: .github\/workflows\/ci.yml/);
    expect(calls.filter((call) => call.startsWith('merge'))).toHaveLength(1);
  });
});
