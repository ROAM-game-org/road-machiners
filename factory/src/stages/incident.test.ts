import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { AgentRun, Ctx, MergeStep } from '../types';
import { checkLog, queueIncidents, runStage } from './incident';

let home = '';
let calls: string[] = [];
let prompt = '';
let changed: string[] = [];
let queuedDuringRun: number[] = [];
let clone = '';

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-incident-');
  calls = [];
  prompt = '';
  clone = '';
  queuedDuringRun = [];
  changed = ['docs/incident-log.md'];
  writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), pendingIncidents: [7, 8] });
  ledger({ kind: 'card', issue: 7, step: 'patch', to: 'Testing', at: '2026-10-20T10:00:00.000Z' });
  ledger({ kind: 'card', issue: 8, step: 'denied', to: 'Done', at: '2026-10-20T11:00:00.000Z' });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const ledger = (line: Record<string, unknown>): void => appendFileSync(`${home}/ledger.jsonl`, `${JSON.stringify(line)}\n`);

const entry = (id: string, over: Record<string, string> = {}): string => {
  const fields = { ID: id, what: 'Something broke.', cost: 'Players paid a day.', ...over };
  return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n');
};
const log = (...entries: string[]): string => `# Incident log\n\nHeader prose.\n\n${entries.join('\n\n')}\n`;
const GOOD_LOG = log(entry('R6'), entry('R7'));

const titles: Record<number, string> = { 7: 'Slow sight checks', 8: 'Fishing', 9: 'Late issue' };

function fakeCtx(outcome: string | null, text = GOOD_LOG, max = 25): Ctx {
  const record = (name: string) => async (...args: unknown[]) => { calls.push(`${name} ${args.join(' ')}`); };
  const fake = {
    cfg: { home, designModel: 'opus', buildModel: 'sonnet', repo: 'o/r', incidentMaxEntries: max },
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
        clone = run.clone;
        mkdirSync(`${run.clone}/docs`, { recursive: true });
        writeFileSync(`${run.clone}/docs/incident-log.md`, text);
        if (outcome !== null) writeFileSync(`${run.clone}/${run.dir}/.factory/incident.json`, outcome);
        if (queuedDuringRun.length > 0) queueIncidents(fake as unknown as Ctx, queuedDuringRun);
      },
    },
    repo: {
      fetch: record('sync'), deleteBranch: record('delete'),
      merge: async (steps: MergeStep[]) => { calls.push(...steps.map((step) => `merge ${step.branch} ${step.into} ${step.message}`)); },
      fetchFromWork: async (...args: unknown[]) => { calls.push(`fetch ${args.join(' ')}`); return 'abc123'; },
      changedFiles: async () => changed,
      prepareWorkClone: async (_b: string, _base: string, dir: string) => { mkdirSync(dir, { recursive: true }); },
    },
  };
  return fake as unknown as Ctx;
}

const outcome = (over: Record<string, unknown> = {}): string => JSON.stringify({ changed: ['R6'], removed: [], reason: 'Both repeat a logged class.', ...over });
const mergeCalls = (): string[] => calls.filter((call) => call.startsWith('merge'));

describe('incident stage', () => {
  it('runs the agent once for the whole batch and merges the log with a message naming every batch issue', async () => {
    await runStage(fakeCtx(outcome()), 7);
    expect(calls.filter((call) => call.startsWith('agent'))).toEqual(['agent opus']);
    expect(mergeCalls()).toEqual(['merge abc123 dev Update the incident log from issues #7, #8']);
    expect(prompt).not.toContain('{{');
    expect(prompt).toContain('25');
  });

  it('writes each batch issue text and a list with its title and source read from the ledger', async () => {
    ledger({ kind: 'card', issue: 8, step: 'merged', to: 'Done', at: '2026-10-21T11:00:00.000Z' });
    let seen: Record<string, string> = {};
    const ctx = fakeCtx(outcome());
    const run = ctx.container.agent;
    ctx.container.agent = async (options: AgentRun) => {
      const result = await run(options);
      const dir = `${options.clone}/${options.dir}/.factory`;
      seen = { list: readFileSync(`${dir}/incidents.md`, 'utf8'), seven: readFileSync(`${dir}/incidents/issue-7.md`, 'utf8'), eight: readFileSync(`${dir}/incidents/issue-8.md`, 'utf8') };
      return result;
    };
    await runStage(ctx, 7);
    expect(seen.list).toContain('#7 Slow sight checks, patch');
    expect(seen.list).toContain('#8 Fishing, shipped');
    expect(seen.seven).toContain('Body of 7');
    expect(seen.seven).toContain('Committee words on 7');
    expect(seen.eight).toContain('Body of 8');
  });

  it('removes only the batch from the queue and keeps an issue queued during the run', async () => {
    queuedDuringRun = [9];
    await runStage(fakeCtx(outcome()), 7);
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([9]);
  });

  it('removes the batch when the agent changed nothing, and merges nothing', async () => {
    await runStage(fakeCtx(outcome({ changed: [] })), 7);
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([]);
    expect(calls.filter((call) => call.startsWith('merge') || call.startsWith('fetch'))).toEqual([]);
  });

  it('writes no issue comment', async () => {
    await runStage(fakeCtx(outcome()), 7);
    expect(calls.filter((call) => call.startsWith('comment'))).toEqual([]);
  });

  it('keeps the batch queued when the job fails', async () => {
    await expect(runStage(fakeCtx(null), 7)).rejects.toThrow('wrote no .factory/incident.json');
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([7, 8]);
  });

  it('fails when a batch issue has no source line in the ledger', async () => {
    writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), pendingIncidents: [9] });
    await expect(runStage(fakeCtx(outcome()), 9)).rejects.toThrow('no patch, redesign, denied or merged line');
  });

  it('throws on a malformed output file', async () => {
    await expect(runStage(fakeCtx('{"changed": "R6", "removed": [], "reason": "x"}'), 7)).rejects.toThrow('changed as a list');
    await expect(runStage(fakeCtx(outcome({ removed: ['seven'] })), 7)).rejects.toThrow('ids like R7');
    await expect(runStage(fakeCtx(outcome({ reason: ' ' })), 7)).rejects.toThrow('non-empty reason');
    await expect(runStage(fakeCtx('not json'), 7)).rejects.toThrow();
    expect(mergeCalls()).toEqual([]);
  });

  it('throws before the merge when the branch touches more than the log', async () => {
    changed = ['docs/incident-log.md', 'game/src/sim/vision.ts'];
    await expect(runStage(fakeCtx(outcome()), 7)).rejects.toThrow('must commit docs/incident-log.md alone');
    expect(mergeCalls()).toEqual([]);
  });

  it('throws when a changed id is missing from the log or a removed id is still there', async () => {
    await expect(runStage(fakeCtx(outcome({ changed: ['R9'] })), 7)).rejects.toThrow('no entry with ID: R9');
    await expect(runStage(fakeCtx(outcome({ removed: ['R7'] })), 7)).rejects.toThrow('still has ID: R7');
    expect(mergeCalls()).toEqual([]);
  });

  it('throws before the merge when the log is over the cap or malformed', async () => {
    await expect(runStage(fakeCtx(outcome(), GOOD_LOG, 1), 7)).rejects.toThrow('2 entries, more than 1');
    await expect(runStage(fakeCtx(outcome(), log(entry('R6').replace('cost:', 'seen:'))), 7)).rejects.toThrow('R6');
    expect(mergeCalls()).toEqual([]);
    expect(clone).not.toBe('');
  });
});

describe('checkLog', () => {
  it('accepts entries with the three lines in order and ignores the header prose', () => {
    expect(() => checkLog(GOOD_LOG, 2)).not.toThrow();
  });

  it('fails above the cap', () => {
    expect(() => checkLog(GOOD_LOG, 1)).toThrow('2 entries, more than 1');
  });

  it.each(['what', 'cost'])('fails when an entry lacks the %s line', (key) => {
    const lines = entry('R1').split('\n').filter((line) => !line.startsWith(`${key}:`));
    expect(() => checkLog(log(lines.join('\n')), 5)).toThrow(`R1`);
  });

  it('fails when the lines are out of order or an extra line is added', () => {
    const lines = entry('R1').split('\n');
    expect(() => checkLog(log([lines[0], lines[2], lines[1], ...lines.slice(3)].join('\n')), 5)).toThrow('R1');
    expect(() => checkLog(log(`${entry('R1')}\nextra: line`), 5)).toThrow('R1');
  });

  it('fails when an entry has no ID line', () => {
    expect(() => checkLog(log(entry('R1').split('\n').slice(1).join('\n')), 5)).toThrow('has no ID line');
  });

  it('fails on an extra old-format line, an empty value and a repeated id', () => {
    expect(() => checkLog(log(`${entry('R1')}\nrule: A rule.`), 5)).toThrow('R1');
    expect(() => checkLog(log(entry('R1', { cost: ' ' })), 5)).toThrow('empty line');
    expect(() => checkLog(log(entry('R1'), entry('R1')), 5)).toThrow('repeats ID R1');
  });
});

describe('queueIncidents', () => {
  it('adds each issue once', () => {
    const ctx = fakeCtx(null);
    queueIncidents(ctx, [7, 8]);
    queueIncidents(ctx, [8, 9]);
    queueIncidents(ctx, []);
    expect(readState(ctx.statePath).pendingIncidents).toEqual([7, 8, 9]);
  });
});
