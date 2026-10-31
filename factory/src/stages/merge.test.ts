import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLedger } from '../ledger';
import { EMPTY_STATE, readState, updateState, writeState } from '../state';
import { RELEASE_TASK_LABEL, STUCK_LABEL, type AgentRun, type Card, type Ctx, type FailedTest, type Failure, type SuiteFailures, type SuiteScope } from '../types';
import { CheckTimeoutError } from '../container';
import { causeOf } from '../fail';
import { BaselineFailureError, BudgetError } from './checkpoint';

const deployed: string[] = [];
vi.mock('../deploy', () => ({ deployDev: async () => { deployed.push('dev'); return 'https://play.test/dev/'; } }));
const { merge } = await import('./merge');

let home = '';
let calls: string[] = [];
let comments: string[] = [];
let runs: AgentRun[] = [];
let cards: Card[] = [];
let merges: Record<string, { commit: string | null; conflicts: string[] }[]> = {};
let shellFailures: string[] = [];
let pushFailures = 0;
let diff = '';
let files: string[] = [];
let messages: string[] = [];
let limits: (number | undefined)[] = [];
let logs: string[] = [];
let costs: number[] = [];
let changed: string[] = [];
let movedBy: string[] = [];
let scripts: string[] = [];
let heads = 0;
let suites: string[] = [];
let failingSuites = 0;
let suitePlan: { passed: boolean; record: SuiteFailures | null }[] = [];
let baselineDown = false;
let suiteDown = false;
let replaced: string[] = [];
let dirty: string[] = [];
const PASS = 'pass';
const HUNG = 'the checks ran past their 45 minute limit, and the factory removed their container.';

const card = (issue: number, labels: string[] = []): Card => ({ itemId: `i${issue}`, issue, column: 'Merging', labels });
const result = (cost = 1) => `${JSON.stringify({ type: 'result', total_cost_usd: cost, duration_ms: 1000 })}\n`;

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-merge-');
  calls = [];
  comments = [];
  runs = [];
  cards = [card(5), card(6)];
  merges = {};
  shellFailures = [];
  pushFailures = 0;
  diff = '';
  files = [];
  messages = [];
  limits = [];
  logs = [];
  costs = [];
  changed = [];
  movedBy = ['game/src/sim/world.ts'];
  scripts = [];
  heads = 0;
  suites = [];
  failingSuites = 0;
  suitePlan = [];
  baselineDown = false;
  suiteDown = false;
  replaced = [];
  dirty = [];
  deployed.length = 0;
  writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), approvedResolving: { 5: 'Ann', 6: 'Bob' }, release: { issue: 20, branch: 'release/2026-09-29', day: '2026-09-29', postId: 300, removed: [9], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } }, pendingShip: 'ann' });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function fakeCtx(budget = 5): Ctx {
  const fake = {
    cfg: { home, buildModel: 'sonnet', mergingBudgetUsd: budget, checksTimeoutMinutes: 45, gpu: false, publicUrl: 'https://play.test', committeeChat: 'chat', suiteStartMinutes: 15, suitePollSeconds: 0 },
    log: (_stage: string, _issue: number | null, msg: string) => { logs.push(msg); },
    statePath: `${home}/state.json`,
    now: () => new Date('2026-09-30T10:00:00Z'),
    run: async () => ({ code: 0, stdout: dirty.shift() ?? '', stderr: '' }),
    github: {
      cards: async () => cards,
      issue: async (issue: number) => ({ number: issue, title: `Card ${issue}`, labels: cards.find((c) => c.issue === issue)?.labels ?? [] }),
      comment: async (issue: number, body: string) => { comments.push(`${issue} ${body}`); },
      addLabel: async (issue: number, label: string) => { calls.push(`label ${issue} ${label}`); },
      move: async (issue: number, column: string) => { calls.push(`move ${issue} ${column}`); },
      dispatchSuite: async (sha: string, scope?: SuiteScope) => {
        if (suiteDown || (scope !== undefined && baselineDown)) throw new Error('HTTP 503');
        calls.push(scope === undefined ? `suite ${sha}` : `rerun ${sha} ${scope.files.join(',')} workers ${scope.workers}`);
        return suites.push(sha);
      },
      suiteRun: async (id: number) => {
        const failed = suitePlan.length > 0 ? !suitePlan[id - 1]!.passed : id <= failingSuites;
        return { done: true, started: true, passed: !failed, testsFailed: failed, conclusion: failed ? 'failure' : 'success', url: `https://github.com/o/r/actions/runs/${id}` };
      },
      suiteLog: async (id: number) => `FAIL src/sim/raid.test.ts in run ${id}`,
      suiteFailures: async (id: number) => suitePlan[id - 1]?.record ?? null,
    },
    telegram: { sendMessage: async (_chat: string, text: string) => { calls.push(`message ${text}`); return 1; } },
    container: {
      agent: async (run: AgentRun) => { runs.push(run); calls.push('agent'); return result(costs.shift()); },
      shell: async (_kind: string, _dir: string, script: string, _log: string, _env?: Record<string, string>, _mounts?: Record<string, string>, limit?: number) => {
        calls.push('checks');
        scripts.push(script);
        limits.push(limit);
        const failure = shellFailures.shift();
        if (failure !== undefined && failure !== PASS) throw failure.includes(HUNG) ? new CheckTimeoutError(failure) : new Error(failure);
      },
    },
    repo: {
      fetch: async () => { calls.push('fetch'); },
      prepareWorkClone: async (branch: string, base: string, dir: string) => { calls.push(`clone ${branch} ${base}`); mkdirSync(dir, { recursive: true }); },
      mergeBranchIntoWork: async (_dir: string, branch: string, message?: string) => {
        calls.push(`merge ${branch}`);
        if (message !== undefined) messages.push(message);
        return merges[branch]?.shift() ?? { commit: null, conflicts: [] };
      },
      fetchFromWork: async () => 'head1',
      headHash: async (branch: string) => `${branch}-tip`,
      fullHash: async (commit: string) => commit,
      changedInWork: async (_dir: string, from: string) => (from === 'head1' ? movedBy : changed),
      workHead: async () => `merged${++heads}`,
      diff: async () => diff,
      changedFiles: async () => files,
      push: async (commit: string, branch: string) => {
        calls.push(`push ${commit} ${branch}`);
        if (pushFailures-- > 0) throw new Error('rejected: non-fast-forward');
      },
      isMerged: async () => false,
      replaceBranch: async (commit: string, branch: string) => { replaced.push(`${commit} ${branch}`); },
    },
  };
  return fake as unknown as Ctx;
}

describe('merge queue', () => {
  it('merges every Merging card of one base, checks the result once, pushes it and settles each card', async () => {
    await merge(fakeCtx());
    expect(calls.filter((call) => !call.startsWith('label') && !call.startsWith('move') && !call.startsWith('message'))).toEqual([
      'fetch', 'clone dev dev', 'merge factory/issue-5', 'merge factory/issue-6', 'checks', 'push head1 dev',
    ]);
    expect(runs).toEqual([]);
    expect(messages).toEqual(['Merge issue #5: Card 5', 'Merge issue #6: Card 6']);
    expect(comments).toEqual([
      '5 Approved by Ann and merged into dev. It merged together with #6, and the checks passed on the result. It closes when its release ships.',
      '6 Approved by Bob and merged into dev. It merged together with #5, and the checks passed on the result. It closes when its release ships.',
    ]);
    expect(calls).toContain('label 5 release-candidate');
    expect(calls).toContain('move 5 Done');
    expect(calls).toContain('move 6 Done');
    expect(deployed).toEqual(['dev']);
    expect(calls.filter((call) => call.startsWith('message'))).toEqual([]);
    expect(readState(`${home}/state.json`).approvedResolving).toEqual({});
  });

  it('clears the earlier failures of each merged card, and keeps a batch row for a member that did not merge', async () => {
    const row = (over: Partial<Failure>): Failure => ({ stage: 'merge', issue: null, error: 'timed out', cause: 'timeout', log: null, at: '2026-09-29T10:00:00.000Z', ...over });
    updateState(`${home}/state.json`, (state) => ({ ...state, failures: [
      row({ batch: [5, 6] }),
      row({ batch: [5, 7] }),
      row({ stage: 'catch-up', issue: 5, error: 'catch-up timed out' }),
      row({ stage: 'verify', issue: 8, error: 'other card' }),
    ] }));
    await merge(fakeCtx());
    expect(readState(`${home}/state.json`).failures).toEqual([
      row({ batch: [5, 7], cleared: [5] }),
      row({ stage: 'verify', issue: 8, error: 'other card' }),
    ]);
  });

  it('runs the full suite on GitHub Actions for the merged head, and only the playtest and build on the server', async () => {
    changed = ['game/src/sim/fuel.ts', 'game/docs/notes.md'];
    await merge(fakeCtx());
    expect(replaced).toEqual(['head1 factory/suite-merge-dev']);
    expect(calls.filter((call) => /^(suite|checks|push)/.test(call))).toEqual(['suite head1', 'checks', 'push head1 dev']);
    expect(scripts[0]).not.toContain('test:cached');
    expect(scripts[0]).toContain('npm run build');
    expect(existsSync(join(home, 'locks', 'full-suite'))).toBe(false);
  });

  it('names the suite branch of a release batch after its base', async () => {
    cards = [card(5, [RELEASE_TASK_LABEL])];
    changed = ['game/src/sim/fuel.ts'];
    await merge(fakeCtx());
    expect(replaced).toEqual(['head1 factory/suite-merge-release-2026-09-29']);
  });

  it('hands a failed suite to the merge session and runs the suite again on its fix', async () => {
    changed = ['game/src/sim/fuel.ts'];
    failingSuites = 1;
    await merge(fakeCtx());
    expect(runs).toHaveLength(1);
    expect(runs[0]!.prompt).toContain('The full suite failed on GitHub Actions for head1');
    expect(runs[0]!.prompt).toContain('FAIL src/sim/raid.test.ts in run 1');
    expect(calls.filter((call) => /^(suite|checks|agent|push)/.test(call))).toEqual(['suite head1', 'checks', 'agent', 'suite head1', 'checks', 'push head1 dev']);
  });

  it('runs no checks after a fix round that made no commit, and gives the session the same failure back', async () => {
    changed = ['game/src/sim/fuel.ts'];
    failingSuites = 1;
    const ctx = fakeCtx();
    const commits = ['card5', 'card6', 'merged1', 'merged1', 'merged2'];
    ctx.repo.workHead = async () => commits.shift() ?? 'merged2';
    await merge(ctx);
    expect(calls.filter((call) => /^(suite|checks|agent|push)/.test(call))).toEqual(['suite head1', 'checks', 'agent', 'agent', 'suite head1', 'checks', 'push head1 dev']);
    expect(runs[1]!.prompt).toContain('FAIL src/sim/raid.test.ts in run 1');
    expect(runs[1]!.prompt).toContain('made no commit, so the head is still merged1');
    expect(logs).toContain('the fix round made no commit, so merged1 keeps its failure and the checks do not run again');
  });

  it('ends at the budget when every fix round commits nothing, with one run of the checks', async () => {
    changed = ['game/src/sim/fuel.ts'];
    failingSuites = 9;
    costs = [3, 3];
    const ctx = fakeCtx(5);
    ctx.repo.workHead = async () => 'merged1';
    await expect(merge(ctx)).rejects.toBeInstanceOf(BudgetError);
    expect(calls.filter((call) => /^(suite|checks|agent)/.test(call))).toEqual(['suite head1', 'checks', 'agent', 'agent']);
  });

  it('sends a fix left uncommitted back first, and then the unchanged head keeps its suite failure', async () => {
    changed = ['game/src/sim/fuel.ts'];
    dirty = ['', ' M game/src/sim/fuel.ts\n', '', ''];
    failingSuites = 1;
    const ctx = fakeCtx();
    const commits = ['card5', 'card6', 'merged1', 'merged1', 'merged2'];
    ctx.repo.workHead = async () => commits.shift() ?? 'merged2';
    await merge(ctx);
    expect(runs[1]!.prompt).toContain('changes that are not committed');
    expect(runs[2]!.prompt).toContain('FAIL src/sim/raid.test.ts in run 1');
    expect(runs[2]!.prompt).toContain('made no commit');
    expect(calls.filter((call) => /^(suite|checks|agent|push)/.test(call))).toEqual(['suite head1', 'checks', 'agent', 'agent', 'agent', 'suite head1', 'checks', 'push head1 dev']);
  });

  describe('failures the base also has (#1103)', () => {
    const RAID = { file: 'src/sim/raid.test.ts', test: 'raids > reach 5' };
    const FUEL = { file: 'src/sim/fuel.test.ts', test: 'burns fuel' };
    const failing = (...failed: FailedTest[]) => ({ passed: false, record: { failed, unfinished: [], unhandledErrors: 0 } });
    const ledgerBaselines = () => readLedger(home, new Date(0)).filter((line) => line.kind === 'baseline');

    it('fails with the baseline cause and no fix round when every failed test fails on the base too', async () => {
      changed = ['game/src/sim/fuel.ts'];
      suitePlan = [failing(RAID), failing(RAID)];
      const error = await merge(fakeCtx()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BaselineFailureError);
      expect(causeOf(error)).toBe('baseline');
      expect(runs).toEqual([]);
      expect(calls.filter((call) => /^(suite|rerun|agent|push)/.test(call))).toEqual(['suite head1', 'rerun dev-tip src/sim/raid.test.ts workers 1']);
      expect(calls).toContain('label 5 factory-stuck');
      expect(calls).toContain('label 6 factory-stuck');
      expect(comments.filter((comment) => comment.includes('fail only on tests that also fail on dev at dev-tip'))).toHaveLength(2);
      expect(comments[0]).toContain('- src/sim/raid.test.ts > raids > reach 5');
      expect(ledgerBaselines()).toMatchObject([{ stage: 'merge', into: 'dev', base: 'dev-tip', head: 'head1', excluded: [RAID], failing: [] }]);
    });

    it('sends only the new failures to the session, names the base ones, and still fails on the base ones alone after the fix', async () => {
      changed = ['game/src/sim/fuel.ts'];
      suitePlan = [failing(RAID, FUEL), failing(RAID), failing(RAID), failing(RAID)];
      await expect(merge(fakeCtx())).rejects.toBeInstanceOf(BaselineFailureError);
      expect(runs).toHaveLength(1);
      expect(runs[0]!.prompt).toContain('Leave them alone: src/sim/raid.test.ts > raids > reach 5.');
      expect(runs[0]!.prompt).toContain('Fix these, which fail only here: src/sim/fuel.test.ts > burns fuel.');
      expect(calls.filter((call) => /^(suite|rerun|agent|push)/.test(call))).toEqual([
        'suite head1', 'rerun dev-tip src/sim/fuel.test.ts,src/sim/raid.test.ts workers 1', 'agent', 'suite head1', 'rerun dev-tip src/sim/raid.test.ts workers 1',
      ]);
      expect(ledgerBaselines().map((line) => line.kind === 'baseline' && line.failing)).toEqual([[FUEL], []]);
    });

    it('never counts a file that failed as a whole as the base\'s, so its own failures reach the session', async () => {
      changed = ['game/src/sim/fuel.ts'];
      const whole = { file: 'src/sim/raid.test.ts', test: null };
      suitePlan = [failing(whole), failing(whole), { passed: true, record: null }];
      await merge(fakeCtx());
      expect(runs).toHaveLength(1);
      expect(runs[0]!.prompt).not.toContain('Leave them alone');
      expect(ledgerBaselines()).toEqual([]);
    });

    it('labels the cards stuck and keeps the baseline cause when the card comment fails', async () => {
      changed = ['game/src/sim/fuel.ts'];
      suitePlan = [failing(RAID), failing(RAID)];
      const ctx = fakeCtx();
      ctx.github.comment = async () => { throw new Error('gh: HTTP 502'); };
      const error = await merge(ctx).catch((caught: unknown) => caught);
      expect(causeOf(error)).toBe('baseline');
      expect(calls).toContain('label 5 factory-stuck');
      expect(calls).toContain('label 6 factory-stuck');
    });

    it('keeps the whole failure when the base passes the failed tests', async () => {
      changed = ['game/src/sim/fuel.ts'];
      suitePlan = [failing(RAID), { passed: true, record: { failed: [], unfinished: [], unhandledErrors: 0 } }, { passed: true, record: null }];
      await merge(fakeCtx());
      expect(runs).toHaveLength(1);
      expect(runs[0]!.prompt).not.toContain('Leave them alone');
      expect(calls).toContain('push head1 dev');
      expect(ledgerBaselines()).toEqual([]);
    });

    it('keeps the whole failure, with no rerun, when the run left no record or unhandled errors', async () => {
      changed = ['game/src/sim/fuel.ts'];
      suitePlan = [{ passed: false, record: null }, { passed: false, record: { failed: [RAID], unfinished: [], unhandledErrors: 1 } }, { passed: true, record: null }];
      await merge(fakeCtx());
      expect(runs).toHaveLength(2);
      expect(calls.some((call) => call.startsWith('rerun'))).toBe(false);
    });

    it('keeps the whole failure, with no rerun, when a test file never finished, since its failures are unknown', async () => {
      changed = ['game/src/sim/fuel.ts'];
      suitePlan = [{ passed: false, record: { failed: [RAID], unfinished: ['src/sim/slow.test.ts'], unhandledErrors: 0 } }, { passed: true, record: null }];
      await merge(fakeCtx());
      expect(runs).toHaveLength(1);
      expect(runs[0]!.prompt).toContain('Test files that never finished, 1:\n- src/sim/slow.test.ts');
      expect(calls.some((call) => call.startsWith('rerun'))).toBe(false);
    });

    it('keeps the whole failure when the rerun on the base cannot run or leaves no record', async () => {
      changed = ['game/src/sim/fuel.ts'];
      baselineDown = true;
      suitePlan = [failing(RAID), { passed: true, record: null }];
      await merge(fakeCtx());
      expect(runs).toHaveLength(1);
      expect(logs.some((line) => line.includes('could not run, so every failure counts'))).toBe(true);
      baselineDown = false;
      runs = [];
      calls = [];
      suites = [];
      suitePlan = [failing(RAID), { passed: false, record: null }, { passed: true, record: null }];
      await merge(fakeCtx());
      expect(runs).toHaveLength(1);
      expect(runs[0]!.prompt).not.toContain('Leave them alone');
    });
  });

  it('sends a fix left uncommitted back to the merge session before any suite runs', async () => {
    changed = ['game/src/sim/fuel.ts'];
    dirty = [' M game/src/sim/fuel.ts\n'];
    await merge(fakeCtx());
    expect(runs).toHaveLength(1);
    expect(runs[0]!.prompt).toContain('changes that are not committed');
    expect(runs[0]!.prompt).toContain('M game/src/sim/fuel.ts');
    expect(calls.filter((call) => /^(suite|checks|agent|push)/.test(call))).toEqual(['agent', 'suite head1', 'checks', 'push head1 dev']);
  });

  it('fails the batch with no agent round and no push when the suite cannot run', async () => {
    changed = ['game/src/sim/fuel.ts'];
    suiteDown = true;
    await expect(merge(fakeCtx())).rejects.toThrow('The full suite on GitHub Actions could not run');
    expect(runs).toEqual([]);
    expect(calls.some((call) => call.startsWith('push'))).toBe(false);
    expect(calls).toContain('label 5 factory-stuck');
  });

  it('pushes no suite branch for a result that touches a protected path', async () => {
    changed = ['game/src/sim/fuel.ts'];
    files = ['.github/workflows/x.yml'];
    await expect(merge(fakeCtx())).rejects.toThrow('paths an agent may not push');
    expect(replaced).toEqual([]);
    expect(suites).toEqual([]);
  });

  it('runs no suite when the batch changes only game docs', async () => {
    changed = ['game/docs/notes.md'];
    await merge(fakeCtx());
    expect(suites).toEqual([]);
    expect(replaced).toEqual([]);
    expect(scripts[0]).toContain('npm run build');
  });

  it('records each merge commit of a dev batch in devMerges and on its ledger line', async () => {
    await merge(fakeCtx());
    expect(readState(`${home}/state.json`).devMerges).toEqual([
      { issue: 5, title: 'Card 5', sha: 'merged1', into: 'dev', reverted: [] },
      { issue: 6, title: 'Card 6', sha: 'merged2', into: 'dev', reverted: [] },
    ]);
    const lines = readLedger(home, new Date(0)).filter((line) => line.kind === 'card' && line.step === 'merged');
    expect(lines).toMatchObject([{ issue: 5, to: 'Done', into: 'dev', sha: 'merged1' }, { issue: 6, to: 'Done', into: 'dev', sha: 'merged2' }]);
    expect(readState(`${home}/state.json`).release?.merges).toEqual([]);
  });

  it('records the merge commits of a release batch in the release and leaves devMerges alone', async () => {
    cards = [card(5, ['release-task'])];
    await merge(fakeCtx());
    const state = readState(`${home}/state.json`);
    expect(state.release?.merges).toEqual([{ issue: 5, title: 'Card 5', sha: 'merged1', into: 'release/2026-09-29', reverted: [] }]);
    expect(state.devMerges).toEqual([]);
    expect(readLedger(home, new Date(0))).toContainEqual(expect.objectContaining({ issue: 5, step: 'merged', into: 'release/2026-09-29', sha: 'merged1' }));
  });

  it('records nothing when the batch fails', async () => {
    shellFailures = ['boom', 'boom', 'boom', 'boom', 'boom', 'boom'];
    await merge(fakeCtx(0.5)).catch(() => undefined);
    expect(readState(`${home}/state.json`).devMerges).toEqual([]);
  });

  it('takes only the cards of the first card base, and a release batch drops the candidate post', async () => {
    cards = [card(5, ['release-task']), card(6), card(7, ['release-task'])];
    await merge(fakeCtx());
    expect(calls).toContain('clone release/2026-09-29 release/2026-09-29');
    expect(calls).toContain('merge factory/issue-7');
    expect(calls).not.toContain('merge factory/issue-6');
    expect(deployed).toEqual([]);
    const state = readState(`${home}/state.json`);
    expect(state.release?.postId).toBeNull();
    expect(state.pendingShip).toBeNull();
  });

  it('takes at most three cards of the first card base, oldest first, and the next job takes the rest', async () => {
    cards = [card(5), card(6, ['release-task']), card(7), card(8), card(9), card(10)];
    const job = { id: 'merge---x', stage: 'merge' as const, issue: null, pid: 1, startedAt: '', log: '' };
    updateState(`${home}/state.json`, (state) => ({ ...state, jobs: [job] }));
    await merge(fakeCtx());
    expect(calls.filter((call) => call.startsWith('merge '))).toEqual(['merge factory/issue-5', 'merge factory/issue-7', 'merge factory/issue-8']);
    expect(readState(`${home}/state.json`).jobs[0].batch).toEqual([5, 7, 8]);
    cards = cards.filter((c) => ![5, 7, 8].includes(c.issue));
    calls = [];
    await merge(fakeCtx());
    expect(calls.filter((call) => call.startsWith('merge '))).toEqual(['merge factory/issue-6']);
  });

  it('keeps an earlier batch pushed and settled when a later batch fails, and labels only the failed batch', async () => {
    cards = [card(5), card(6), card(7), card(8)];
    await merge(fakeCtx());
    expect(calls.filter((call) => /^(merge factory|checks|push)/.test(call))).toEqual(['merge factory/issue-5', 'merge factory/issue-6', 'merge factory/issue-7', 'checks', 'push head1 dev']);
    cards = [card(8)];
    calls = [];
    shellFailures = Array(9).fill('FAIL a.test.ts');
    await expect(merge(fakeCtx(0))).rejects.toThrow(BudgetError);
    expect(calls.filter((call) => call.startsWith('label') && call.endsWith(STUCK_LABEL))).toEqual(['label 8 factory-stuck']);
    expect(calls.some((call) => call.startsWith('push'))).toBe(false);
    expect(comments.filter((text) => text.includes('merged into dev')).map((text) => text.split(' ')[0])).toEqual(['5', '6', '7']);
  });

  it('has an agent resolve a conflict, and fails when the merge stays unfinished', async () => {
    merges = { 'factory/issue-6': [{ commit: 'c6', conflicts: ['game/src/a.ts'] }] };
    await merge(fakeCtx());
    expect(runs).toHaveLength(1);
    expect(runs[0]!.prompt).toContain('- game/src/a.ts');
    expect(runs[0]!.model).toBe('sonnet');
    merges = { 'factory/issue-6': [{ commit: 'c6', conflicts: ['game/src/a.ts'] }, { commit: 'c6', conflicts: ['game/src/a.ts'] }] };
    await expect(merge(fakeCtx())).rejects.toThrow('left the merge of factory/issue-6 into dev unfinished');
  });

  it('hands failed checks to one continued agent session until they pass', async () => {
    shellFailures = ['FAIL a.test.ts: expected 1 to be 2', 'FAIL b.test.ts'];
    await merge(fakeCtx());
    expect(runs).toHaveLength(2);
    expect(runs[0]!.prompt).toContain('expected 1 to be 2');
    expect(runs[0]!.prompt).toContain('- #5 on factory/issue-5');
    expect(runs[0]!.session?.resume).toBe(false);
    expect(runs[1]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(calls.filter((call) => call === 'checks')).toHaveLength(3);
    expect(calls).toContain('push head1 dev');
  });

  it('labels every card of the batch stuck and pushes nothing once the budget is spent', async () => {
    shellFailures = Array(9).fill('FAIL a.test.ts');
    await expect(merge(fakeCtx(2))).rejects.toThrow(BudgetError);
    expect(calls).toContain('label 5 factory-stuck');
    expect(calls).toContain('label 6 factory-stuck');
    expect(calls.some((call) => call.startsWith('push'))).toBe(false);
  });

  it('leaves a batch card that reached Done during the job unlabeled when the batch fails', async () => {
    shellFailures = Array(9).fill('FAIL a.test.ts');
    const ctx = fakeCtx(2);
    let reads = 0;
    ctx.github.cards = async () => (reads++ === 0 ? cards : [{ ...card(5), column: 'Done' as const }, card(6)]);
    await expect(merge(ctx)).rejects.toThrow(BudgetError);
    expect(calls).not.toContain('label 5 factory-stuck');
    expect(calls).toContain('label 6 factory-stuck');
  });

  it('gives a failing checkpoint to the merge session even when its conflicts cost more than the budget, and pushes only after checks pass', async () => {
    merges = { 'factory/issue-5': [{ commit: 'c5', conflicts: ['game/src/a.ts'] }], 'factory/issue-6': [{ commit: 'c6', conflicts: ['game/src/b.ts'] }] };
    costs = [15, 15, 2];
    shellFailures = ['FAIL combat-harness.test.ts\nAssertionError: expected 3 to be 4'];
    await merge(fakeCtx(5));
    expect(runs).toHaveLength(3);
    expect(runs[2]!.prompt).toContain('expected 3 to be 4');
    expect(runs[2]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(calls.filter((call) => /^(agent|checks|push)/.test(call))).toEqual(['agent', 'agent', 'checks', 'agent', 'checks', 'push head1 dev']);
    expect(calls).not.toContain('label 5 factory-stuck');
  });

  it('fails with nothing pushed once the fixes alone spent the budget, and names the conflict spend apart', async () => {
    merges = { 'factory/issue-5': [{ commit: 'c5', conflicts: ['game/src/a.ts'] }] };
    costs = [30, 2, 2, 2];
    shellFailures = Array(9).fill('FAIL contracts.test.ts');
    await expect(merge(fakeCtx(5))).rejects.toThrow(/\$6\.00 of its \$5 budget[\s\S]*\$30\.00 on conflicts/);
    expect(calls.filter((call) => call === 'agent')).toHaveLength(4);
    expect(calls.some((call) => call.startsWith('push'))).toBe(false);
    expect(calls).toContain('label 5 factory-stuck');
  });

  it('stops a repeated failure after the fix budget, with a full checkpoint after every fix', async () => {
    costs = [2, 2, 2, 2];
    shellFailures = Array(9).fill('FAIL a.test.ts');
    await expect(merge(fakeCtx(5))).rejects.toThrow(BudgetError);
    expect(calls.filter((call) => /^(agent|checks)/.test(call))).toEqual(['checks', 'agent', 'checks', 'agent', 'checks', 'agent', 'checks']);
  });

  it('never takes a timeout after expensive conflicts as a pass, and runs the checks again with no agent round', async () => {
    merges = { 'factory/issue-5': [{ commit: 'c5', conflicts: ['game/src/a.ts'] }] };
    costs = [30];
    shellFailures = [HUNG, HUNG, HUNG];
    await expect(merge(fakeCtx(5))).rejects.toThrow('timed out 3 times');
    expect(runs).toHaveLength(1);
    expect(calls.some((call) => call.startsWith('push'))).toBe(false);
  });

  it('keeps the conflicts of a moved base out of the fix budget, and keeps counting fixes across the recheck', async () => {
    pushFailures = 1;
    merges = { dev: [{ commit: 'd1', conflicts: ['game/src/a.ts'] }] };
    costs = [3, 30, 3, 3];
    shellFailures = ['FAIL a.test.ts', PASS, 'FAIL b.test.ts', 'FAIL c.test.ts'];
    await expect(merge(fakeCtx(5))).rejects.toThrow(/\$6\.00 of its \$5 budget[\s\S]*\$30\.00 on conflicts/);
    expect(calls.filter((call) => /^(agent|checks|push|merge dev)/.test(call))).toEqual(['checks', 'agent', 'checks', 'push head1 dev', 'merge dev', 'agent', 'merge dev', 'checks', 'agent', 'checks']);
  });

  it('runs each checks run with the time limit, and runs a timed-out run again before it pushes', async () => {
    shellFailures = [HUNG];
    await merge(fakeCtx());
    expect(limits).toEqual([45, 45]);
    expect(runs).toEqual([]);
    expect(logs).toContain('the checks only timed out, run 1, running them again');
    expect(calls.filter((call) => /^(checks|push)/.test(call))).toEqual(['checks', 'checks', 'push head1 dev']);
  });

  it('fails the batch after three timed-out runs, with no agent round and no push', async () => {
    shellFailures = [HUNG, HUNG, HUNG];
    await expect(merge(fakeCtx())).rejects.toThrow('timed out 3 times, under load or in a hung step');
    expect(runs).toEqual([]);
    expect(calls.some((call) => call.startsWith('push'))).toBe(false);
    expect(calls).toContain('label 5 factory-stuck');
  });

  it('hands a real test failure to the agent even when the run then hung', async () => {
    shellFailures = [`FAIL a.test.ts\nAssertionError: expected 1 to be 2\n${HUNG}`];
    await merge(fakeCtx());
    expect(runs).toHaveLength(1);
    expect(runs[0]!.prompt).toContain('expected 1 to be 2');
    expect(calls).toContain('push head1 dev');
  });

  it('judges each run by its own lines of the shared checks log, so a real failure after a hung run reaches the agent', async () => {
    const outputs = [HUNG, "src/a.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'."];
    const ctx = fakeCtx();
    ctx.container.shell = async (_kind: string, _dir: string, _script: string, log: string) => {
      calls.push('checks');
      const output = outputs.shift();
      if (output === undefined) return;
      appendFileSync(log, `${output}\n`);
      throw output === HUNG ? new CheckTimeoutError(HUNG) : new Error('shell failed with exit 2');
    };
    await merge(ctx);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.prompt).toContain('error TS2322');
    expect(runs[0]!.prompt).not.toContain('ran past their');
    expect(calls.filter((call) => call === 'checks')).toHaveLength(3);
  });

  it('lets a slow run that ends inside its limit pass, and notes its progress every 5 minutes', async () => {
    vi.useFakeTimers();
    try {
      const ctx = fakeCtx();
      ctx.container.shell = async () => { calls.push('checks'); await new Promise((done) => setTimeout(done, 38 * 60_000)); };
      const merged = merge(ctx);
      await vi.advanceTimersByTimeAsync(38 * 60_000);
      await merged;
      expect(logs.filter((line) => line.startsWith('the checks still run after'))).toHaveLength(7);
      expect(logs).toContain('the checks still run after 35 min, with no log yet');
      expect(calls).toContain('push head1 dev');
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges the moved base again and checks again when GitHub rejects the push', async () => {
    pushFailures = 1;
    await merge(fakeCtx());
    expect(calls.filter((call) => /^(merge dev|checks|push)/.test(call))).toEqual(['checks', 'push head1 dev', 'merge dev', 'checks', 'push head1 dev']);
  });

  it('pushes again with no checks when the base moved only by docs', async () => {
    pushFailures = 1;
    movedBy = ['game/docs/incidents/2026-10-15.md', 'factory/src/tick.ts'];
    await merge(fakeCtx());
    expect(calls.filter((call) => /^(merge dev|checks|push)/.test(call))).toEqual(['checks', 'push head1 dev', 'merge dev', 'push head1 dev']);
    expect(logs).toContain('dev moved by docs only, so the checks that passed still hold');
  });

  it('checks again when the base moved by a tested wiki page', async () => {
    pushFailures = 1;
    movedBy = ['game/docs/wiki/mechanics/fuel.md'];
    await merge(fakeCtx());
    expect(calls.filter((call) => /^(merge dev|checks|push)/.test(call))).toEqual(['checks', 'push head1 dev', 'merge dev', 'checks', 'push head1 dev']);
  });

  it('refuses a result that touches a protected path', async () => {
    files = ['.github/workflows/x.yml'];
    await expect(merge(fakeCtx())).rejects.toThrow('paths an agent may not push');
    expect(calls.some((call) => call.startsWith('push'))).toBe(false);
  });

  it('leaves a stuck or held card out of the batch', async () => {
    cards = [card(5, [STUCK_LABEL]), card(6), card(7)];
    updateState(`${home}/state.json`, (state) => ({ ...state, held: { 7: { by: 'Ann', reason: 'wait', at: '2026-09-30T09:00:00Z', stage: null } } }));
    await merge(fakeCtx());
    expect(calls.filter((call) => call.startsWith('merge '))).toEqual(['merge factory/issue-6']);
  });

  it('leaves release task cards out while a ship runs, and merges dev cards', async () => {
    cards = [card(6), card(7, [RELEASE_TASK_LABEL])];
    const ship = { id: 'ship-20-x', stage: 'ship' as const, issue: 20, pid: 1, startedAt: '', log: '' };
    updateState(`${home}/state.json`, (state) => ({ ...state, jobs: [ship], release: { issue: 20, branch: 'release/2026-01-05', day: '2026-01-05', postId: null, removed: [], tasks: [], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } } }));
    await merge(fakeCtx());
    expect(calls.filter((call) => call.startsWith('merge '))).toEqual(['merge factory/issue-6']);
  });

  it('records the batch on its own job entry, without the stuck and held cards', async () => {
    cards = [card(5, [STUCK_LABEL]), card(6), card(7)];
    const job = { id: 'merge---x', stage: 'merge' as const, issue: null, pid: 1, startedAt: '', log: '' };
    updateState(`${home}/state.json`, (state) => ({ ...state, jobs: [job], held: { 7: { by: 'Ann', reason: 'wait', at: '2026-09-30T09:00:00Z', stage: null } } }));
    let batch: number[] | undefined;
    const ctx = fakeCtx();
    ctx.container.shell = async () => { batch = readState(`${home}/state.json`).jobs[0].batch; return { code: 0, stdout: '', stderr: '' } as never; };
    await merge(ctx);
    expect(batch).toEqual([6]);
  });

  it('logs how long the batch spent merging, checking, fixing, merging the moved base again and pushing, also when it fails', async () => {
    pushFailures = 1;
    await merge(fakeCtx());
    expect(logs).toContain('batch #5 #6 took merges 0 min in 2, checks 0 min in 2, fixes 0 min in 0, remerges 0 min in 1, pushes 0 min in 2');
    logs = [];
    shellFailures = ['FAIL a.test.ts'];
    await expect(merge(fakeCtx(0))).rejects.toThrow(BudgetError);
    expect(logs).toContain('batch #5 #6 took merges 0 min in 2, checks 0 min in 1, fixes 0 min in 0, remerges 0 min in 0, pushes 0 min in 0');
  });

  it('leaves a card whose catch-up still runs to a later batch, so no card is merged by two jobs at once', async () => {
    cards = [card(5), card(6), card(7), card(8)];
    const merging = { id: 'merge---x', stage: 'merge' as const, issue: null, pid: 1, startedAt: '', log: '' };
    const catching = { id: 'catch-up-5-x', stage: 'catch-up' as const, issue: 5, pid: 2, startedAt: '', log: '' };
    updateState(`${home}/state.json`, (state) => ({ ...state, jobs: [merging, catching], approvedResolving: {} }));
    await merge(fakeCtx());
    expect(readState(`${home}/state.json`).jobs.find((job) => job.stage === 'merge')?.batch).toEqual([6, 7, 8]);
    expect(calls.filter((call) => call.startsWith('merge '))).toEqual(['merge factory/issue-6', 'merge factory/issue-7', 'merge factory/issue-8']);
  });

  it('merges every waiting card exactly once across jobs while catch-ups run between them', async () => {
    cards = [card(5), card(6), card(7), card(8), card(9)];
    const merging = { id: 'merge---x', stage: 'merge' as const, issue: null, pid: 1, startedAt: '', log: '' };
    const mergedOnce: string[] = [];
    for (let round = 0; round < 3 && cards.length > 0; round++) {
      calls = [];
      updateState(`${home}/state.json`, (state) => ({ ...state, jobs: [merging, ...(round === 1 ? [{ id: 'c', stage: 'catch-up' as const, issue: 8, pid: 2, startedAt: '', log: '' }] : [])] }));
      await merge(fakeCtx());
      const taken = readState(`${home}/state.json`).jobs.find((job) => job.stage === 'merge')?.batch ?? [];
      mergedOnce.push(...calls.filter((call) => call.startsWith('merge factory/')));
      cards = cards.filter((c) => !taken.includes(c.issue));
    }
    expect(mergedOnce.sort()).toEqual(['merge factory/issue-5', 'merge factory/issue-6', 'merge factory/issue-7', 'merge factory/issue-8', 'merge factory/issue-9']);
  });

  it('does nothing when no card waits', async () => {
    cards = [];
    await merge(fakeCtx());
    expect(calls).toEqual([]);
  });
});

describe('kept merge work', () => {
  const clone = () => join(home, 'work', 'merge-queue');
  const landing = () => readState(`${home}/state.json`).landings.merge;
  const saveTranscript = (id: string) => {
    mkdirSync(join(home, 'sessions', 'merge', 'project'), { recursive: true });
    appendFileSync(join(home, 'sessions', 'merge', 'project', `${id}.jsonl`), '{}\n');
  };

  async function failOnce(): Promise<string> {
    shellFailures = Array(9).fill('FAIL a.test.ts');
    costs = [3, 3];
    await expect(merge(fakeCtx(5))).rejects.toThrow(BudgetError);
    appendFileSync(join(clone(), 'uncommitted-fix.ts'), 'fix');
    const session = landing()!.session;
    saveTranscript(session);
    calls = [];
    runs = [];
    shellFailures = [];
    costs = [];
    return session;
  }

  it('keeps the clone, the session and the spend of a batch whose job failed', async () => {
    await failOnce();
    expect(landing()).toMatchObject({ into: 'dev', cards: [5, 6], spentUsd: 6, merged: true, sources: [{ branch: 'factory/issue-5', sha: 'factory/issue-5-tip' }, { branch: 'factory/issue-6', sha: 'factory/issue-6-tip' }] });
    expect(landing()!.merges.map((row) => row.issue)).toEqual([5, 6]);
    expect(existsSync(clone())).toBe(true);
  });

  it('resumes the kept batch in its clone and session, with no new clone or merge, and closes it once pushed', async () => {
    const session = await failOnce();
    updateState(`${home}/state.json`, (state) => ({ ...state, landings: { merge: { ...state.landings.merge!, spentUsd: 0 } } }));
    shellFailures = ['FAIL a.test.ts'];
    costs = [1];
    await merge(fakeCtx(5));
    expect(calls.filter((call) => /^(clone|merge |agent|checks|push)/.test(call))).toEqual(['merge dev', 'checks', 'agent', 'checks', 'push head1 dev']);
    expect(runs[0]!.session).toMatchObject({ id: session, resume: true });
    expect(runs[0]!.prompt).toMatch(/^An earlier job on this same work stopped before it pushed/);
    expect(comments.filter((text) => text.includes('merged into dev')).map((text) => text.split(' ')[0])).toEqual(['5', '6']);
    expect(landing()).toBeUndefined();
    expect(existsSync(clone())).toBe(false);
  });

  it('merges the base into a resumed clone only once it holds no uncommitted change, before its first checks', async () => {
    await failOnce();
    updateState(`${home}/state.json`, (state) => ({ ...state, landings: { merge: { ...state.landings.merge!, spentUsd: 0 } } }));
    changed = ['game/src/sim/world.ts'];
    dirty = [' M game/src/fix.ts', ' M game/src/fix.ts', '', ''];
    costs = [1];
    await merge(fakeCtx(5));
    expect(calls.filter((call) => /^(merge |agent|checks|push)/.test(call))).toEqual(['agent', 'merge dev', 'checks', 'push head1 dev']);
    expect(runs[0]!.prompt).toContain('changes that are not committed');
  });

  it('keeps conflict spend out of the batch budget when a failed job is charged', async () => {
    merges = { 'factory/issue-5': [{ commit: 'c5', conflicts: ['game/src/a.ts'] }] };
    costs = [30, 2];
    shellFailures = ['FAIL a.test.ts'];
    const ctx = fakeCtx(5);
    ctx.repo.push = async () => { throw new Error('GitHub is down'); };
    ctx.repo.isMerged = async () => true;
    await expect(merge(ctx)).rejects.toThrow('GitHub is down');
    updateState(`${home}/state.json`, (state) => ({ ...state, landings: { merge: { ...state.landings.merge!, job: 'merge-job' } } }));
    const { chargeJobSpend } = await import('../landing-work');
    chargeJobSpend(`${home}/state.json`, { id: 'merge-job', stage: 'merge' }, [{ model: 'sonnet', costUsd: 30, minutes: 1 }, { model: 'sonnet', costUsd: 2, minutes: 1 }]);
    expect(landing()).toMatchObject({ spentUsd: 2, jobUsd: 32 });
  });

  it('does not run the suite again on a head a fix round left unchanged after the base merged into a resumed clone', async () => {
    await failOnce();
    updateState(`${home}/state.json`, (state) => ({ ...state, landings: { merge: { ...state.landings.merge!, spentUsd: 0 } } }));
    changed = ['game/src/sim/world.ts'];
    merges = { dev: [{ commit: 'd1', conflicts: [] }] };
    failingSuites = 1;
    costs = [1, 1];
    const ctx = fakeCtx(5);
    let head = 'kept';
    const merging = ctx.repo.mergeBranchIntoWork;
    ctx.repo.mergeBranchIntoWork = async (dir, branch, message) => {
      const merged = await merging(dir, branch, message);
      if (merged.commit !== null) head = 'base-merged';
      return merged;
    };
    const agent = ctx.container.agent;
    let rounds = 0;
    ctx.container.agent = async (run) => {
      if (++rounds === 2) head = 'fixed';
      return agent(run);
    };
    ctx.repo.workHead = async () => head;
    await merge(ctx);
    expect(calls.filter((call) => call.startsWith('suite'))).toHaveLength(2);
    expect(calls.filter((call) => call === 'agent')).toHaveLength(2);
  });

  it('counts the fix rounds of earlier jobs against the budget of the batch', async () => {
    await failOnce();
    shellFailures = Array(9).fill('FAIL a.test.ts');
    await expect(merge(fakeCtx(5))).rejects.toThrow(/\$6\.00 of its \$5 budget/);
    expect(runs).toEqual([]);
    expect(existsSync(join(clone(), 'uncommitted-fix.ts'))).toBe(true);
  });

  it('moves the kept clone to the backups and starts fresh when a card branch moved', async () => {
    const session = await failOnce();
    updateState(`${home}/state.json`, (state) => ({ ...state, landings: { merge: { ...state.landings.merge!, sources: [{ branch: 'factory/issue-5', sha: 'older' }, state.landings.merge!.sources[1]!] } } }));
    await merge(fakeCtx(5));
    expect(calls.filter((call) => /^(clone|merge )/.test(call))).toEqual(['clone dev dev', 'merge factory/issue-5', 'merge factory/issue-6']);
    const backups = readdirSync(join(home, 'clone-backups'));
    expect(backups).toEqual(['merge-2026-09-30T10-00-00.000Z']);
    expect(existsSync(join(home, 'clone-backups', backups[0]!, 'uncommitted-fix.ts'))).toBe(true);
    expect(existsSync(join(home, 'transcripts', session))).toBe(true);
  });

  it('offers the kept batch first while all its cards wait, even when older cards wait too', async () => {
    await failOnce();
    updateState(`${home}/state.json`, (state) => ({ ...state, landings: { merge: { ...state.landings.merge!, cards: [6], sources: [state.landings.merge!.sources[1]!] } } }));
    cards = [card(5), card(6)];
    await merge(fakeCtx(5));
    expect(comments.filter((text) => text.includes('merged into dev')).map((text) => text.split(' ')[0])).toEqual(['6']);
  });
});
