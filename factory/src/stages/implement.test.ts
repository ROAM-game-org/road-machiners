import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATE, writeState } from '../state';
import type { AgentRun, Ctx } from '../types';
import { promptFile } from './common';
import { runStage } from './implement';
import { skillStream } from './test-fakes';

let home = '';
let streams: string[] = [];
const BUILT = skillStream(['up:uexecute', 'up:udocument']);

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-implement-');
  writeState(`${home}/state.json`, structuredClone(EMPTY_STATE));
  streams = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function fakeCtx(labels: string[], models: string[], prompts: string[] = [], runs: AgentRun[] = [], isMerged = async (_a: string, _b: string) => false): Ctx {
  const fake = {
    cfg: { home, designModel: 'opus', buildModel: 'sonnet' },
    log: () => undefined,
    statePath: `${home}/state.json`,
    now: () => new Date('2026-09-30T10:00:00Z'),
    github: { issue: async () => ({ labels, title: 'Oil spiller', body: 'Drop oil behind the truck.' }), comments: async () => [], move: async () => undefined },
    container: { agent: async (run: AgentRun) => { runs.push(run); models.push(run.model); prompts.push(run.prompt); mkdirSync(`${run.clone}/${run.dir}/.factory`, { recursive: true }); return streams.shift() ?? BUILT; } },
    repo: {
      prepareWorkClone: async (_b: string, _base: string, dir: string) => { mkdirSync(dir, { recursive: true }); },
      fetchFromWork: async () => 'w1', isMerged, untrackFactoryFiles: async () => [], diff: async () => '', changedFiles: async () => [], push: async () => undefined,
      fetch: async () => undefined, mergeBranchIntoWork: async () => ({ commit: null, conflicts: [] }),
    },
  };
  return fake as unknown as Ctx;
}

describe('implement stage model', () => {
  it.each([
    [[], 'sonnet'],
    [['design-sonnet'], 'sonnet'],
    [['implementation-opus'], 'opus'],
  ])('uses the model of labels %j: %s', async (labels, model) => {
    const models: string[] = [];
    await runStage(fakeCtx(labels, models), 7);
    expect(models).toEqual([model]);
  });

  it('turns subagents off and says so in the prompt', async () => {
    const prompts: string[] = [];
    const runs: AgentRun[] = [];
    await runStage(fakeCtx(['implementation-opus'], [], prompts, runs), 7);
    expect(runs[0].disallowedTools).toEqual(['Agent']);
    expect(prompts[0]).toContain('Subagents are off.');
  });
});

describe('implement stage end', () => {
  it('moves on when an earlier run already pushed the work, so this run added no commit', async () => {
    const pushed = async (_head: string, into: string) => into === 'factory/issue-7';
    await expect(runStage(fakeCtx([], [], [], [], pushed), 7)).resolves.toBeUndefined();
  });

  it('fails when the branch holds nothing beyond its base', async () => {
    await expect(runStage(fakeCtx([], [], [], [], async () => true), 7)).rejects.toThrow('with no commits beyond dev');
  });
});

describe('implement stage visual self-review', () => {
  it('asks for real screenshots read with the Read tool for any visible change, and gives the agent the issue text', async () => {
    const prompts: string[] = [];
    await runStage(fakeCtx([], [], prompts), 7);
    expect(prompts[0]).toContain('Visual self-review');
    expect(prompts[0]).toContain('Read every screenshot with the Read tool');
    expect(prompts[0]).toContain('Do not claim you are done before that');
    expect(readFileSync(`${home}/work/issue-7/game/.factory/issue.md`, 'utf8')).toContain('Drop oil behind the truck.');
  });

  it('keeps the exemption for a task nobody can see', async () => {
    const prompts: string[] = [];
    await runStage(fakeCtx([], [], prompts), 7);
    expect(prompts[0]).toContain('needs no screenshots');
    expect(prompts[0]).toContain('why nothing visible changed');
  });
});

describe('implement stage steps', () => {
  it('reads the game docs, installs, builds, typechecks, and ends with an up:udocument pass that commits its edits', async () => {
    const prompts: string[] = [];
    await runStage(fakeCtx([], [], prompts), 7);
    const prompt = prompts[0];
    const order = ['Your first step is to read the game docs', 'Run `npm ci && npm run hooks:install`.', 'Run up:uexecute on', 'run `npm run typecheck` once', 'run the ultrapack skill udocument', 'Commit the doc edits in their own commit on the current branch.'].map((step) => prompt.indexOf(step));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const docsStep = prompt.slice(prompt.indexOf('## Last step: the game docs'));
    expect(docsStep).toContain('When no doc is stale, edit nothing.');
    expect(docsStep.indexOf('Then stop.')).toBeGreaterThan(docsStep.indexOf('When no doc is stale'));
    expect(prompt.match(/Then stop\./g)).toHaveLength(1);
  });

  it('names the ultrapack skill udocument and its Skill tool name, and says the factory checks the call', async () => {
    const prompts: string[] = [];
    await runStage(fakeCtx([], [], prompts), 7);
    expect(prompts[0]).toContain('run the ultrapack skill udocument on the game docs that this change made stale.');
    expect(prompts[0]).toContain('Invoke it with the Skill tool as `up:udocument`');
    expect(prompts[0]).toContain('Never write that the skill ran unless you invoked it.');
  });

  it('keeps the docs step as the last section of the prompt template', () => {
    const template = promptFile('implement');
    expect(template.lastIndexOf('\n## ')).toBe(template.indexOf('\n## Last step: the game docs'));
    expect(template.endsWith('Then stop.')).toBe(true);
  });
});

describe('implement stage udocument check', () => {
  it('moves on without a follow-up when the session called up:udocument after up:uexecute', async () => {
    const prompts: string[] = [];
    await runStage(fakeCtx([], [], prompts), 7);
    expect(prompts).toHaveLength(1);
  });

  it('asks the same session once for the docs pass when the call is missing, then moves on', async () => {
    streams = [skillStream(['up:uexecute']), skillStream(['up:udocument'])];
    const prompts: string[] = [];
    const runs: AgentRun[] = [];
    await runStage(fakeCtx([], [], prompts, runs), 7);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('invoke the ultrapack skill udocument with the Skill tool as `up:udocument`');
    expect(runs[1].disallowedTools).toEqual(['Agent']);
  });

  it('fails the stage when the follow-up still invoked no up:udocument', async () => {
    streams = [skillStream(['up:udocument', 'up:uexecute']), skillStream([])];
    await expect(runStage(fakeCtx([], []), 7)).rejects.toThrow('The implement agent never invoked the Skill tool with up:udocument');
  });
});
