import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, clearQueued, readState, writeState } from '../state';
import type { AgentRun, Ctx, MergeStep } from '../types';
import { queueIncidents, runStage } from './incident';

let home = '';
let calls: string[] = [];
let prompt = '';
let changed: string[] = [];
let queuedDuringRun: number[] = [];
let inputs: Record<string, string> = {};

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-incident-');
  calls = [];
  prompt = '';
  inputs = {};
  queuedDuringRun = [];
  changed = ['docs/incident-log.md'];
  writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), pendingIncidents: [7, 8] });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const titles: Record<number, string> = { 7: 'Slow sight checks', 8: 'Fishing', 9: 'Late issue' };

function fakeCtx(): Ctx {
  const record = (name: string) => async (...args: unknown[]) => { calls.push(`${name} ${args.join(' ')}`); };
  const fake = {
    cfg: { home, designModel: 'opus', buildModel: 'sonnet', repo: 'o/r' },
    statePath: `${home}/state.json`,
    log: () => undefined,
    github: {
      issue: async (number: number) => ({ number, title: titles[number], body: `Body of ${number}`, labels: ['bug'], createdAt: '', state: 'CLOSED', author: 'anna' }),
      comments: async (number: number) => [{ login: 'bob', body: `Committee words on ${number}` }],
      comment: record('comment'),
    },
    container: {
      agent: async (run: AgentRun) => {
        calls.push(`agent ${run.model}`);
        prompt = run.prompt;
        const dir = `${run.clone}/${run.dir}/.factory`;
        inputs = { list: readFileSync(`${dir}/incidents.md`, 'utf8'), seven: readFileSync(`${dir}/incidents/issue-7.md`, 'utf8'), eight: readFileSync(`${dir}/incidents/issue-8.md`, 'utf8') };
        if (queuedDuringRun.length > 0) queueIncidents(fake as unknown as Ctx, queuedDuringRun);
      },
    },
    repo: {
      fetch: record('sync'),
      merge: async (steps: MergeStep[]) => { calls.push(...steps.map((step) => `merge ${step.branch} ${step.into} ${step.message}`)); },
      fetchFromWork: async () => 'abc123',
      changedFiles: async () => changed,
      prepareWorkClone: async (_b: string, _base: string, dir: string) => { mkdirSync(dir, { recursive: true }); },
    },
  };
  return fake as unknown as Ctx;
}

const mergeCalls = (): string[] => calls.filter((call) => call.startsWith('merge'));

describe('incident stage', () => {
  it('runs the agent once for the whole batch and merges the log with a message naming every batch issue', async () => {
    await runStage(fakeCtx(), 7);
    expect(calls.filter((call) => call.startsWith('agent'))).toEqual(['agent opus']);
    expect(mergeCalls()).toEqual(['merge abc123 dev Update the incident log from issues #7, #8']);
    expect(prompt).not.toContain('{{');
  });

  it('writes each batch issue text and a list with its title', async () => {
    await runStage(fakeCtx(), 7);
    expect(inputs.list).toContain('#7 Slow sight checks');
    expect(inputs.list).toContain('#8 Fishing');
    expect(inputs.seven).toContain('Committee words on 7');
    expect(inputs.eight).toContain('Body of 8');
  });

  it('removes the batch it saw and leaves the lead for the job end, so a critique queued during the run stays queued', async () => {
    queuedDuringRun = [9, 8, 7];
    await runStage(fakeCtx(), 7);
    const left = readState(`${home}/state.json`).pendingIncidents;
    expect(left).toEqual([7, 9, 8, 7]);
    expect(clearQueued(readState(`${home}/state.json`), 'incident', 7).pendingIncidents).toEqual([9, 8, 7]);
  });

  it('merges nothing when the agent committed nothing', async () => {
    changed = [];
    await runStage(fakeCtx(), 7);
    expect(mergeCalls()).toEqual([]);
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([7]);
  });

  it('writes no issue comment', async () => {
    await runStage(fakeCtx(), 7);
    expect(calls.filter((call) => call.startsWith('comment'))).toEqual([]);
  });

  it('throws before the merge when the branch touches more than the log', async () => {
    changed = ['docs/incident-log.md', 'game/src/sim/vision.ts'];
    await expect(runStage(fakeCtx(), 7)).rejects.toThrow('must commit docs/incident-log.md alone');
    expect(mergeCalls()).toEqual([]);
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([7, 8]);
  });
});

describe('queueIncidents', () => {
  it('appends each critique, so a second rejection of an issue stays queued', () => {
    const ctx = fakeCtx();
    queueIncidents(ctx, [8, 9]);
    queueIncidents(ctx, []);
    expect(readState(ctx.statePath).pendingIncidents).toEqual([7, 8, 8, 9]);
  });
});
