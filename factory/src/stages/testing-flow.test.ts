import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type * as Os from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pngBytes } from '../photo-fixtures';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { AgentRun, Ctx, Pin } from '../types';
import { BudgetError } from './checkpoint';
import { testPoolPin } from '../cpus';

const POOLS = { cpuLight: 0.125, cpuImplement: 0.375, cpuTest: 0.5, vitestWorkersImplement: 2, vitestWorkersTest: 4 };

vi.mock('node:os', async (original) => ({ ...(await original<typeof Os>()), availableParallelism: () => 8 }));
vi.mock('../deploy', () => ({ checkScope: () => undefined, publishBuild: (_ctx: unknown, _clone: string, scope: string) => `https://play.test/${scope}/`, recordBuild: () => undefined }));
const { runStage: runPost, publishAndPost, approvalCaption, errorLines, timeoutOnly } = await import('./checks');
const { requeueApproved } = await import('./kept-approval');
const { SuiteNotGreenError } = await import('./card-suite');
const { runStage: runVerify, taskText } = await import('./verify');
const { runStage: runHarden } = await import('./harden');

let home = '';
let calls: string[] = [];
let commentBodies: string[] = [];
let priorComments: { login: string; body: string; createdAt: string; byFactory: boolean }[] = [];
let shellScripts: string[] = [];
let shellPins: (Pin | undefined)[] = [];
let photoButtons: unknown;
let albums: { path: string; caption: string }[][] = [];
let albumFails = false;
let openPr: string | null = null;
let labels: string[] = [];
let bases: string[] = [];
let conflicts: string[] = [];
let merged = true;
let approvedKept = true;
let kept: string | null = null;
let changed: string[] = [];
let runs: AgentRun[] = [];
let suites: string[] = [];
let failingSuites = 0;
let green = new Set<string>();
let head = 'abc123';
let baseFailures: { failed: { file: string; test: string | null }[]; unfinished: string[]; unhandledErrors: number } | null = null;

beforeEach(() => {
  suites = [];
  failingSuites = 0;
  green = new Set();
  head = 'abc123';
  baseFailures = null;
  albums = [];
  albumFails = false;
  conflicts = [];
  merged = true;
  approvedKept = true;
  kept = null;
  changed = ['game/src/sim/far.ts'];
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-testing-');
  calls = [];
  commentBodies = [];
  priorComments = [];
  shellScripts = [];
  shellPins = [];
  openPr = null;
  labels = [];
  bases = [];
  runs = [];
  writeState(`${home}/state.json`, { ...structuredClone(EMPTY_STATE), release: { issue: 20, day: '2026-09-29', postId: null, removed: [], candidate: null, playtest: { seed: 1, runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null } } });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const TIMEOUT_FAILURE = ' FAIL  src/phys/drive.test.ts > climbs a hill\nError: Test timed out in 30000ms.\nIf this is a long-running test, pass a timeout value.';
const result = (cost: number) => `${JSON.stringify({ type: 'result', total_cost_usd: cost, duration_ms: 1000 })}\n`;
const out = (run: AgentRun) => `${run.clone}/${run.dir}/.factory`;
const APPROVAL = JSON.stringify({ description: 'A loud horn.', howToTry: 'Press H.' });

function fakeCtx(agent: (run: AgentRun, index: number) => void, shellFailures: string[] = [], budget = 10): Ctx {
  const failures = [...shellFailures];
  const fake = {
    cfg: { home, designModel: 'opus', buildModel: 'sonnet', repo: 'o/r', committeeChat: 'chat', gpu: false, testingBudgetUsd: budget, hardeningBudgetUsd: budget, publicUrl: 'https://play.test', suiteStartMinutes: 15, suitePollSeconds: 0, ...POOLS },
    log: () => undefined,
    statePath: `${home}/state.json`,
    now: () => new Date('2026-09-30T10:00:00Z'),
    github: {
      issue: async () => ({ number: 7, title: 'Big horn', body: '', labels, createdAt: '', state: 'OPEN' }),
      move: async (issue: number, column: string) => { calls.push(`move ${issue} ${column}`); },
      comment: async (issue: number, body: string) => { calls.push(`comment ${issue}`); commentBodies.push(body); },
      comments: async () => priorComments,
      pullRequestFor: async () => openPr,
      openPullRequest: async (branch: string, base: string, title: string, body: string) => { calls.push(`openPullRequest ${branch} ${base} ${title} | ${body}`); return 'https://github.com/o/r/pull/50'; },
      dispatchSuite: async (sha: string) => suites.push(sha),
      suitePassed: async (sha: string) => green.has(sha),
      suiteFailures: async () => baseFailures,
      suiteRun: async () => {
        const failed = failingSuites-- > 0;
        if (!failed) green.add(suites.at(-1)!);
        return { done: true, started: true, passed: !failed, testsFailed: failed, conclusion: failed ? 'failure' : 'success', url: 'https://github.com/o/r/actions/runs/1' };
      },
      suiteLog: async () => 'FAIL src/sim/far.test.ts > drives far',
    },
    telegram: {
      sendPhoto: async (chat: string, path: string, caption: string, buttons?: unknown) => { calls.push(`photo ${chat} ${path} ${caption}`); photoButtons = buttons; return 100; },
      sendMessage: async (chat: string, text: string, replyTo?: number) => { calls.push(`message ${replyTo} ${text}`); return 101; },
      sendPhotos: async (_chat: string, photos: { path: string; caption: string }[], replyTo?: number) => {
        calls.push(`album ${photos.length} ${replyTo}`);
        albums.push(photos);
        if (albumFails) throw new Error('Telegram sendMediaGroup failed: boom');
        return photos.map((_, i) => 110 + i);
      },
      editCaption: async (_chat: string, id: number, caption: string) => { calls.push(`editCaption ${id} ${caption}`); },
      sendButtons: async (chat: string, text: string, buttons: unknown) => { calls.push(`buttons ${chat} ${text}`); photoButtons = buttons; return 120; },
    },
    container: {
      agent: async (run: AgentRun): Promise<string> => {
        calls.push('agent');
        runs.push(run);
        if (run.session) {
          mkdirSync(join(run.session.dir, 'project'), { recursive: true });
          writeFileSync(join(run.session.dir, 'project', `${run.session.id}.jsonl`), '');
        }
        agent(run, runs.length - 1);
        return result(1);
      },
      shell: async (_kind: string, _dir: string, script: string, _log: string, _env?: Record<string, string>, _mounts?: Record<string, string>, _limit?: number, pin?: Pin) => {
        shellScripts.push(script);
        shellPins.push(pin);
        calls.push('checks');
        const failure = failures.shift();
        if (failure !== undefined) throw new Error(failure);
      },
    },
    repo: {
      prepareWorkClone: async (_b: string, base: string, dir: string) => { bases.push(`prepare ${base}`); mkdirSync(dir, { recursive: true }); },
      readFile: async (branch: string, path: string) => {
        if (branch !== 'dev') throw new Error(`readFile from ${branch}`);
        if (path === 'game/docs/architecture/principles.md') return '## 3. Hot code uses an index\n';
        throw new Error(`no file ${path}`);
      },
      fetchFromWork: async () => 'w1',
      untrackFactoryFiles: async () => [],
      push: async (commit: string, branch: string) => { calls.push(`push ${commit} ${branch}`); },
      diff: async () => '',
      headHash: async () => head,
      fullHash: async (commit: string) => commit,
      fetch: async () => undefined,
      catchUpBase: async (_dir: string, base: string) => { bases.push(`merge ${base}`); return kept === null ? { commit: 'base0001', conflicts, kept } : { commit: null, conflicts: [], kept }; },
      mergeBranchIntoWork: async () => ({ commit: null, conflicts: [] }),
      isMerged: async (older: string) => (older === 'aaa1111' ? approvedKept : merged),
      foreignCommits: async () => 0,
      changedFiles: async () => changed,
      ownHeads: async () => ['abc123', 'aaa1111'],
    },
  };
  return fake as unknown as Ctx;
}

function posts(run: AgentRun): void {
  writeFileSync(`${out(run)}/approval.json`, APPROVAL);
  writeFileSync(`${out(run)}/screenshot.png`, pngBytes(0));
}

describe('testing in one job', () => {
  it('plays, runs the build-only checkpoint, opens the pull request, posts and moves to Approval', async () => {
    await runVerify(fakeCtx(posts), 7);
    expect(calls.filter((call) => call === 'agent')).toHaveLength(1);
    expect(shellScripts).toHaveLength(1);
    expect(shellScripts[0]).toContain('npm ci');
    expect(shellScripts[0]).toContain('npm run build');
    expect(shellScripts[0]).not.toContain('npm run typecheck');
    expect(shellScripts[0]).not.toContain('npm run playtest');
    expect(shellScripts[0]).not.toContain('test:cached');
    expect(shellPins).toEqual([undefined]);
    expect(calls.find((call) => call.startsWith('openPullRequest'))).toContain('openPullRequest factory/issue-7 dev #7 Big horn | Closes #7.');
    const photo = calls.find((call) => call.startsWith('photo')) ?? '';
    expect(photo).toContain('#7 Big horn\n\nPlay: https://play.test/abc123/');
    expect(photo).toContain('How to try: Press H.');
    expect(photoButtons).toEqual([[{ text: 'Approve', data: 'factory:approve:7' }, { text: 'Deny', data: 'factory:deny:7' }]]);
    expect(readState(`${home}/state.json`).approvalPosts).toEqual({ 100: 7 });
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('runs the full suite on the pushed head of a normal card beside its build', async () => {
    await runVerify(fakeCtx(posts), 7);
    expect(suites).toEqual(['abc123']);
    expect(green.has('abc123')).toBe(true);
  });

  it('hands a suite failure of a normal card back to the same session, and posts after the fix', async () => {
    failingSuites = 1;
    await runVerify(fakeCtx(posts), 7);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(runs[1]!.prompt).toContain('FAIL src/sim/far.test.ts > drives far');
    expect(suites).toEqual(['abc123', 'abc123']);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('posts a card whose only failing tests also fail on the base, and records the head', async () => {
    failingSuites = 2;
    baseFailures = { failed: [{ file: 'src/sim/far.test.ts', test: 'drives far' }], unfinished: [], unhandledErrors: 0 };
    await runVerify(fakeCtx(posts), 7);
    expect(runs).toHaveLength(1);
    expect(calls.at(-1)).toBe('move 7 Approval');
    expect(readState(`${home}/state.json`).suiteCleared).toEqual({ 7: 'abc123' });
  });

  it('sends only the tests the base does not fail back to the session', async () => {
    failingSuites = 2;
    baseFailures = { failed: [{ file: 'src/sim/far.test.ts', test: 'drives far' }], unfinished: [], unhandledErrors: 0 };
    const ctx = fakeCtx(posts);
    const github = ctx.github as unknown as { suiteFailures: () => Promise<unknown> };
    let reads = 0;
    github.suiteFailures = async () => (reads++ === 0
      ? { failed: [{ file: 'src/sim/far.test.ts', test: 'drives far' }, { file: 'src/sim/new.test.ts', test: 'breaks' }], unfinished: [], unhandledErrors: 0 }
      : baseFailures);
    await runVerify(ctx, 7);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.prompt).toContain('Fix these, which fail only here: src/sim/new.test.ts > breaks');
  });

  it('runs the testing agent on the build model', async () => {
    labels = ['implementation-opus'];
    await runVerify(fakeCtx(posts), 7);
    expect(runs[0]!.model).toBe('sonnet');
  });

  it('hands a failed checkpoint back to the same session, then posts', async () => {
    await runVerify(fakeCtx(posts, ['npm run typecheck failed: TS2304']), 7);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(runs[1]!.prompt).toContain("The factory's checks of your pushed branch failed");
    expect(runs[1]!.prompt).toContain('TS2304');
    expect(shellScripts).toHaveLength(2);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('keeps fixing past any round count while the budget lasts', async () => {
    const failures = ['typecheck failed', 'playtest failed', 'build failed', 'typecheck failed'];
    await runVerify(fakeCtx(posts, failures), 7);
    expect(runs).toHaveLength(5);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('stops for Hermes with a BudgetError once the session spent the budget, and posts nothing', async () => {
    await expect(runVerify(fakeCtx(posts, Array(9).fill('typecheck failed'), 3), 7)).rejects.toThrow(BudgetError);
    expect(runs).toHaveLength(3);
    expect(calls.some((call) => call.startsWith('photo') || call.startsWith('buttons'))).toBe(false);
  });

  it('treats a missing approval as a checkpoint failure the session fixes', async () => {
    await runVerify(fakeCtx((run, index) => { if (index > 0) posts(run); }), 7);
    expect(runs[1]!.prompt).toContain('wrote no .factory/approval.json');
    expect(shellScripts).toHaveLength(1);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('reruns checks that only timed out with no agent round, and fails for the load after three', async () => {
    await runVerify(fakeCtx(posts, [TIMEOUT_FAILURE]), 7);
    expect(runs).toHaveLength(1);
    expect(shellScripts).toHaveLength(2);
    await expect(runVerify(fakeCtx(posts, [TIMEOUT_FAILURE, TIMEOUT_FAILURE, TIMEOUT_FAILURE]), 8)).rejects.toThrow('timed out 3 times');
  });

  it('sends the card to Design with the reason when the plan is wrong, and runs no checks', async () => {
    await runVerify(fakeCtx((run) => writeFileSync(`${out(run)}/needs-redesign.md`, 'The issue wants a ramp, the plan builds stairs.')), 7);
    expect(commentBodies.at(-1)).toContain('The issue wants a ramp');
    expect(calls.at(-1)).toBe('move 7 Design');
    expect(shellScripts).toEqual([]);
  });

  it('fails the stage when the agent asks the committee', async () => {
    await expect(runVerify(fakeCtx((run) => writeFileSync(`${out(run)}/needs-committee.md`, 'A major save bump.')), 7)).rejects.toThrow('committee decision');
  });

  it('hands an unfinished base merge back to the same session, then posts', async () => {
    merged = false;
    await runVerify(fakeCtx((run, index) => { posts(run); if (index > 0) merged = true; }), 7);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(runs[1]!.prompt).toContain('merge of dev at base000 into factory/issue-7 is unfinished');
    expect(runs[1]!.prompt).toContain('git commit --no-edit');
    expect(shellScripts).toHaveLength(1);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('stops with a BudgetError when the merge stays unfinished past the budget', async () => {
    merged = false;
    await expect(runVerify(fakeCtx(posts, [], 3), 7)).rejects.toThrow(BudgetError);
  });

  it('merges dev first and lists conflicts for the agent', async () => {
    conflicts = ['game/src/a.ts'];
    await runVerify(fakeCtx(posts), 7);
    expect(bases).toContain('merge dev');
  });

  it('writes the conflicts of a base merge it resumed for the agent', async () => {
    conflicts = ['game/src/a.ts'];
    await runVerify(fakeCtx((run) => { expect(readFileSync(`${out(run)}/merge-conflicts.md`, 'utf8')).toBe('- game/src/a.ts\n'); posts(run); }), 7);
  });

  it('tells the agent when the clone kept an old base and does not check for a base merge', async () => {
    kept = 'uncommitted changes in f.txt';
    merged = false;
    await runVerify(fakeCtx(posts), 7);
    expect(runs[0]!.prompt).toContain('uncommitted changes in f.txt');
  });

  it('works on dev for a maintenance card, with a release open', async () => {
    labels = ['maintenance'];
    await runVerify(fakeCtx(posts), 7);
    expect(bases).toContain('merge dev');
    expect(bases.some((base) => base.includes('release/'))).toBe(false);
  });

  it('hardens a hotfix and then tests it in one session, with the full suite and the ship button', async () => {
    labels = ['hotfix', 'bug'];
    await runVerify(fakeCtx((run, index) => { if (index === 1) posts(run); }), 7);
    expect(runs[0]!.prompt).toContain('This is the hardening stage');
    expect(runs[0]!.prompt).toContain('Read `../docs/incident-log.md`');
    expect(runs[1]!.prompt).toContain('This is the testing stage');
    expect(runs[1]!.prompt).toContain('Read `../docs/incident-log.md`');
    expect(runs[1]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(shellScripts[0]).not.toContain('test:cached');
    expect(shellScripts[0]).toContain('npm run playtest -- --no-fps-gate');
    expect(suites).toEqual(['abc123']);
    expect(shellPins).toEqual([testPoolPin(POOLS)]);
    expect(photoButtons).toEqual([[{ text: 'Approve and ship to players', data: 'factory:approve:7' }, { text: 'Deny', data: 'factory:deny:7' }]]);
  });

  it('hands a hotfix suite failure on GitHub Actions back to the same session, and posts once a new run passes', async () => {
    labels = ['hotfix', 'bug'];
    failingSuites = 1;
    await runVerify(fakeCtx((run, index) => { if (index === 1) posts(run); }), 7);
    expect(runs).toHaveLength(3);
    expect(runs[2]!.prompt).toContain('FAIL src/sim/far.test.ts > drives far');
    expect(runs[2]!.session?.resume).toBe(true);
    expect(suites).toEqual(['abc123', 'abc123']);
    expect(calls.some((call) => call.startsWith('photo'))).toBe(true);
  });

  describe('a hotfix whose approval is kept after main moved', () => {
    const approval = { by: 'bob', at: '2026-09-30T09:00:00.000Z', build: 'aaa1111', checked: ['aaa1111'], reason: 'main moved to ccc3333 after the checks ran on aaa1111, so they no longer count.' };
    const keep = () => writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), keptApprovals: { 7: approval } });
    const shown = () => calls.filter((call) => /^(photo|buttons|message|album)/.test(call));

    beforeEach(() => {
      labels = ['hotfix', 'bug'];
      keep();
    });

    it('runs one integration round, the full checks on the pushed commit, and queues the approval again with no post', async () => {
      await runVerify(fakeCtx(posts), 7);
      expect(runs).toHaveLength(1);
      expect(runs[0]!.prompt).toContain('This is the integration round of a hotfix');
      expect(runs[0]!.prompt).toContain('bob played build aaa1111');
      expect(runs[0]!.prompt).toContain(approval.reason);
      expect(suites).toEqual(['abc123']);
      expect(shown()).toEqual([]);
      expect(calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Approval']);
      expect(commentBodies.at(-1)).toBe('The full checks passed on abc123, which merges newer main into the approved build aaa1111. The approval by bob still holds, so it ships next with no new post.');
      const state = readState(`${home}/state.json`);
      expect(state.pendingApprovals).toEqual({ 7: 'bob' });
      expect(state.builds).toEqual({ 7: 'abc123' });
      expect(state.keptApprovals[7]?.checked).toEqual(['aaa1111', 'abc123']);
      expect(state.approvalPosts).toEqual({});
    });

    it('runs the suite on the new head even when the approved build before the main merge was green', async () => {
      green.add('aaa1111');
      await runVerify(fakeCtx(posts), 7);
      expect(suites).toEqual(['abc123']);
      expect(calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Approval']);
    });

    it('takes a failed check back into the same session and still ships nothing until the checks pass', async () => {
      await runVerify(fakeCtx(posts, ['typecheck failed']), 7);
      expect(runs).toHaveLength(2);
      expect(runs[1]!.session?.resume).toBe(true);
      expect(shellScripts).toHaveLength(2);
      expect(readState(`${home}/state.json`).pendingApprovals).toEqual({ 7: 'bob' });
    });

    it('keeps the approval and queues nothing when the checks never pass', async () => {
      await expect(runVerify(fakeCtx(posts, Array(9).fill('typecheck failed'), 3), 7)).rejects.toThrow(BudgetError);
      const state = readState(`${home}/state.json`);
      expect(state.pendingApprovals).toEqual({});
      expect(state.keptApprovals[7]?.checked).toEqual(['aaa1111']);
      expect(shown()).toEqual([]);
    });

    it('drops the approval with the agent\'s reason and posts the build for a new one when the merge changes what was approved', async () => {
      await runVerify(fakeCtx((run) => { posts(run); writeFileSync(`${out(run)}/intent-changed.md`, 'Main removed the horn the fix tunes.\n'); }), 7);
      expect(commentBodies).toContain('The approval by bob of build aaa1111 no longer holds: the merge with newer main changes what was approved. Main removed the horn the fix tunes. The changed build needs a new approval, so it gets a new post.');
      const state = readState(`${home}/state.json`);
      expect(state.keptApprovals).toEqual({});
      expect(state.pendingApprovals).toEqual({});
      expect(photoButtons).toEqual([[{ text: 'Approve and ship to players', data: 'factory:approve:7' }, { text: 'Deny', data: 'factory:deny:7' }]]);
    });

    it('drops the approval when a fix round must change the approved behavior to pass the checks', async () => {
      await runVerify(fakeCtx((run, index) => { posts(run); if (index === 1) writeFileSync(`${out(run)}/intent-changed.md`, 'The fix had to slow the horn.\n'); }, ['typecheck failed']), 7);
      expect(runs[1]!.prompt).toContain('Keep the behavior the committee approved.');
      expect(commentBodies.some((body) => body.includes('no longer holds: the merge with newer main changes what was approved. The fix had to slow the horn.'))).toBe(true);
      expect(readState(`${home}/state.json`).pendingApprovals).toEqual({});
      expect(shown().some((call) => call.startsWith('photo'))).toBe(true);
    });

    it('drops the approval and posts when the card lost its hotfix label meanwhile', async () => {
      labels = ['bug'];
      await runVerify(fakeCtx(posts), 7);
      expect(commentBodies.some((body) => body.includes('no longer holds: the card is no hotfix any more'))).toBe(true);
      expect(readState(`${home}/state.json`).pendingApprovals).toEqual({});
      expect(shown().some((call) => call.startsWith('photo'))).toBe(true);
    });

    it('drops the approval and runs the normal rounds when the branch no longer holds the approved build', async () => {
      approvedKept = false;
      await runVerify(fakeCtx((run, index) => { if (index === 1) posts(run); }), 7);
      expect(commentBodies[0]).toContain('no longer holds: factory/issue-7 no longer contains the approved build');
      expect(runs[0]!.prompt).toContain('This is the hardening stage');
      expect(readState(`${home}/state.json`).keptApprovals).toEqual({});
      expect(shown().some((call) => call.startsWith('photo'))).toBe(true);
    });
  });

  it('posts a docs change with no agent and only a build', async () => {
    changed = ['docs/guide.md'];
    await runVerify(fakeCtx(posts), 7);
    expect(runs).toEqual([]);
    expect(suites).toEqual([]);
    expect(shellScripts[0]).not.toContain('playtest');
    expect(calls.find((call) => call.startsWith('buttons'))).toContain('Docs only, the game does not change: docs/guide.md');
  });

  it('counts a wiki page as code', async () => {
    changed = ['game/docs/wiki/items.md'];
    await runVerify(fakeCtx(posts), 7);
    expect(runs).toHaveLength(1);
  });

  it('posts a text approval with a warning when there is no screenshot', async () => {
    await runVerify(fakeCtx((run) => writeFileSync(`${out(run)}/approval.json`, APPROVAL)), 7);
    const text = calls.find((call) => call.startsWith('buttons')) ?? '';
    expect(text).toContain('No screenshot. Judge it by playing.');
    expect(commentBodies.find((body) => body.startsWith('Ready for approval'))).toContain('wrote no .factory/screenshot.png');
    expect(readState(`${home}/state.json`).textPosts).toEqual(['120']);
  });

  it('sends the other images as one reply album in manifest order', async () => {
    await runVerify(fakeCtx((run) => {
      posts(run);
      for (const i of [1, 2]) writeFileSync(`${out(run)}/view${i}.png`, pngBytes(i));
      writeFileSync(`${out(run)}/evidence.json`, JSON.stringify({ images: [{ file: 'view2.png', description: 'Two' }, { file: 'view1.png', description: 'One' }] }));
    }), 7);
    expect(albums[0]!.map((photo) => photo.caption)).toEqual(['2/3 Two', '3/3 One']);
    expect(readState(`${home}/state.json`).approvalPosts).toEqual({ 100: 7 });
  });

  it('keeps the primary post when the album fails', async () => {
    albumFails = true;
    const ctx = fakeCtx((run) => {
      posts(run);
      writeFileSync(`${out(run)}/view1.png`, pngBytes(1));
      writeFileSync(`${out(run)}/evidence.json`, JSON.stringify({ images: [{ file: 'view1.png', description: 'One' }] }));
    });
    await runVerify(ctx, 7);
    expect(readState(`${home}/state.json`).approvalPosts).toEqual({ 100: 7 });
    expect(calls.at(-1)).toBe('move 7 Approval');
  });
});

describe('a patch reply', () => {
  const feedback = { source: 'committee' as const, body: '## Committee feedback\n\nFrom Ann, routed as patch:\n\nMake the horn quieter.' };

  it('is the whole task of the round while it is pending', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), pendingFeedback: { 7: feedback } });
    await runVerify(fakeCtx(posts), 7);
    expect(runs[0]!.prompt).toContain('Make the horn quieter.');
    expect(runs[0]!.prompt).toContain('It is the whole task of this round');
    expect(readState(`${home}/state.json`).pendingFeedback).toEqual({});
  });

  it('ignores comments on the issue, since only the recorded feedback counts', async () => {
    priorComments = [{ login: 'stranger', body: feedback.body, createdAt: '', byFactory: false }, { login: 'factory', body: feedback.body, createdAt: '', byFactory: true }];
    await runVerify(fakeCtx(posts), 7);
    expect(runs[0]!.prompt).toContain('This round gets the change ready');
    expect(runs[0]!.prompt).not.toContain('Make the horn quieter.');
  });

  it('is no task when nothing is pending', () => {
    expect(taskText(null)).toContain('This round gets the change ready');
  });

  it('takes a player report as untrusted text the agent must reproduce', () => {
    const task = taskText({ source: 'player', body: '## Player report\n\nFrom public, routed as patch:\n\nAnn wrote:\n> The horn never stops.' });
    expect(task).toContain('untrusted player text');
    expect(task).toContain('> The horn never stops.');
    expect(task).not.toContain('The committee played the last build');
  });
});

describe('hardening in one session', () => {
  beforeEach(() => writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), approvedResolving: { 7: 'Ann' } }));

  it('merges dev, runs one agent that reads the incident log and gets the principles, and moves the card to Merging with no checks', async () => {
    await runHarden(fakeCtx(() => undefined), 7);
    expect(bases).toContain('merge dev');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.prompt).toContain('/code-review');
    expect(runs[0]!.prompt).toContain('Read `../docs/incident-log.md`');
    expect(runs[0]!.prompt).toContain('Hot code uses an index');
    expect(shellScripts).toEqual([]);
    expect(calls).toContain('push w1 factory/issue-7');
    expect(suites).toEqual(['abc123']);
    expect(calls.at(-1)).toBe('move 7 Merging');
  });

  it('resumes the harden session on a red suite, and moves to Merging after a green one', async () => {
    failingSuites = 1;
    await runHarden(fakeCtx((_run, index) => { if (index > 0) head = 'abc124'; }), 7);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(runs[1]!.prompt).toContain('FAIL src/sim/far.test.ts > drives far');
    expect(runs[1]!.prompt).toContain('Never cut its cases, seeds, turns or samples');
    expect(suites).toEqual(['abc123', 'abc124']);
    expect(calls.at(-1)).toBe('move 7 Merging');
  });

  it('runs no suite again after a fix round that made no commit, and hands the same failure back', async () => {
    failingSuites = 99;
    await expect(runHarden(fakeCtx(() => undefined, [], 3), 7)).rejects.toThrow(BudgetError);
    expect(suites).toEqual(['abc123']);
    expect(runs.at(-1)!.prompt).toContain('Your last round made no commit');
  });

  it('stops with a BudgetError when the suite stays red past the hardening budget, and does not move the card', async () => {
    failingSuites = 99;
    await expect(runHarden(fakeCtx(() => undefined, [], 3), 7)).rejects.toThrow(BudgetError);
    expect(calls).not.toContain('move 7 Merging');
  });

  it('runs no suite when the pushed head already has a green status', async () => {
    green.add('abc123');
    await runHarden(fakeCtx(() => undefined), 7);
    expect(suites).toEqual([]);
    expect(calls.at(-1)).toBe('move 7 Merging');
  });

  it('runs no suite for a docs change', async () => {
    changed = ['docs/guide.md'];
    await runHarden(fakeCtx(() => undefined), 7);
    expect(suites).toEqual([]);
  });

  it('resumes an open base merge and gives its conflicts to the agent', async () => {
    conflicts = ['game/src/a.ts'];
    await runHarden(fakeCtx((run) => { expect(readFileSync(`${out(run)}/merge-conflicts.md`, 'utf8')).toBe('- game/src/a.ts\n'); }), 7);
    expect(runs).toHaveLength(1);
    expect(calls.at(-1)).toBe('move 7 Merging');
  });

  it('tells the agent when the clone kept an old base and does not check for a base merge', async () => {
    kept = 'uncommitted changes in f.txt';
    merged = false;
    await runHarden(fakeCtx(() => undefined), 7);
    expect(runs[0]!.prompt).toContain('uncommitted changes in f.txt');
    expect(calls.at(-1)).toBe('move 7 Merging');
  });

  it('runs no agent for a docs change', async () => {
    changed = ['docs/guide.md'];
    await runHarden(fakeCtx(() => undefined), 7);
    expect(runs).toEqual([]);
    expect(calls.at(-1)).toBe('move 7 Merging');
  });

  it('sends an unfinished base merge back to the same session once', async () => {
    merged = false;
    await runHarden(fakeCtx((_run, index) => { if (index > 0) merged = true; }), 7);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.session).toEqual({ ...runs[0]!.session, resume: true });
    expect(runs[1]!.prompt).toContain('git commit --no-edit');
    expect(calls.at(-1)).toBe('move 7 Merging');
  });

  it('fails when the merge stays unfinished after the second round', async () => {
    merged = false;
    await expect(runHarden(fakeCtx(() => undefined), 7)).rejects.toThrow('is unfinished');
    expect(runs).toHaveLength(2);
  });
});

describe('the green suite before Approval', () => {
  const approval = { description: 'A loud horn.', howToTry: 'Press H.' };
  const kept = { by: 'bob', at: '2026-09-30T09:00:00.000Z', build: 'aaa1111', checked: ['aaa1111'], reason: null };

  it('publishAndPost refuses a build with no green status and posts nothing', async () => {
    await expect(publishAndPost(fakeCtx(() => undefined), 7, approval, home, 'dev', 'abc123', false)).rejects.toThrow(SuiteNotGreenError);
    expect(calls.some((call) => call.startsWith('photo') || call.startsWith('buttons') || call.startsWith('move'))).toBe(false);
  });

  it('publishAndPost posts a build whose head has a green status', async () => {
    green.add('abc123');
    await publishAndPost(fakeCtx(() => undefined), 7, approval, home, 'dev', 'abc123', false);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('publishAndPost posts a docs-only build with no status', async () => {
    changed = ['docs/guide.md'];
    await publishAndPost(fakeCtx(() => undefined), 7, approval, home, 'dev', 'abc123', false);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('requeueApproved refuses a build with no green status and queues nothing', async () => {
    await expect(requeueApproved(fakeCtx(() => undefined), 7, kept, 'abc123')).rejects.toThrow(SuiteNotGreenError);
    expect(readState(`${home}/state.json`).pendingApprovals).toEqual({});
  });
});

describe('a post with no checks', () => {
  it('builds once and runs the suite, posts with the no-testing notice and default text, and clears the mark', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), postOnly: [7] });
    await runPost(fakeCtx(() => undefined), 7);
    expect(suites).toEqual(['abc123']);
    expect(runs).toEqual([]);
    expect(shellScripts[0]).not.toContain('playtest');
    const text = calls.find((call) => call.startsWith('buttons')) ?? '';
    expect(text).toContain('No testing agent played this build. Only the full suite and the build ran.');
    expect(text).toContain('The pull request shows what changed.');
    expect(readState(`${home}/state.json`).postOnly).toEqual([]);
    expect(calls.at(-1)).toBe('move 7 Approval');
  });

  it('refuses a card that waits for no post', async () => {
    await expect(runPost(fakeCtx(() => undefined), 7)).rejects.toThrow('not waiting for a post');
  });

  it('throws on a failed build and keeps the mark', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), postOnly: [7] });
    await expect(runPost(fakeCtx(() => undefined, ['build failed']), 7)).rejects.toThrow('The build failed');
    expect(readState(`${home}/state.json`).postOnly).toEqual([7]);
  });

  it('throws on a failed suite and keeps the mark', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), postOnly: [7] });
    failingSuites = 1;
    await expect(runPost(fakeCtx(() => undefined), 7)).rejects.toThrow('The full suite failed');
    expect(readState(`${home}/state.json`).postOnly).toEqual([7]);
  });
});

describe('captions', () => {
  it('fits long notes into the caption limit', () => {
    const caption = approvalCaption('#7 Big horn', 'https://play.test/x/', 'https://github.com/o/r/issues/7', 'https://github.com/o/r/pull/50', { description: 'd'.repeat(900), howToTry: 'h'.repeat(900) }, 'dev');
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain('How to try: h');
  });

  it('says a hotfix approval ships to main and itch.io', () => {
    expect(approvalCaption('#7 Fix', 'u', 'l', 'p', { description: 'd', howToTry: 'h' }, 'main')).toContain('HOTFIX');
  });

  it('tells a timeout-only failure from a real one', () => {
    const seen = (failure: string, timedOut = false) => ({ failure, timedOut, errors: errorLines(failure) });
    expect(timeoutOnly(seen(TIMEOUT_FAILURE))).toBe(true);
    expect(timeoutOnly(seen(`${TIMEOUT_FAILURE}\nError: expected 1 to be 2`))).toBe(false);
    expect(timeoutOnly(seen('typecheck failed'))).toBe(false);
    expect(timeoutOnly(seen(`${TIMEOUT_FAILURE}\nError: [vitest-worker]: Timeout calling "onTaskUpdate"`))).toBe(false);
    const hung = '[checks] 10:00:00 tests and typecheck\n\nthe checks ran past their 45 minute limit, and the factory removed their container.';
    expect(timeoutOnly(seen(hung, true))).toBe(true);
    expect(timeoutOnly(seen(hung))).toBe(false);
    expect(timeoutOnly(seen(` FAIL  src/a.test.ts > adds\nAssertionError: expected 1 to be 2\n${hung}`, true))).toBe(false);
    expect(timeoutOnly(seen(`${TIMEOUT_FAILURE}\n${hung}`, true))).toBe(true);
  });
});
