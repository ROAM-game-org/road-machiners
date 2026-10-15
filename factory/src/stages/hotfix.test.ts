import { appendFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evidenceFor, recordEvidence, type Step } from '../check-evidence';
import { readLedger } from '../ledger';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { MergeStep, Resolution } from '../types';
import { fake, reset, type Fake } from './test-fakes';

vi.mock('../deploy', () => ({ deployDev: async () => 'https://play.test/dev/' }));
const { IntegrationFailure, shipHotfix } = await import('./hotfix');
const { currentToolchain } = await import('./integration');

type Round = { main: string; hotfix: string; merged: string; sameGame?: boolean; conflict?: boolean; lands?: boolean; hotfixFiles?: string[]; mainFiles?: string[] };
type Landed = { steps: MergeStep[]; resolutions: Resolution[]; expected: Record<string, string> };

const FULL: Step[] = ['typecheck', 'suite', 'playtest', 'build'];
const SUITE_LINE = '[test-cache] ran 2, skipped 224, uncacheable 0\n';

beforeEach(() => {
  reset();
  writeState(fake().ctx.statePath, structuredClone(EMPTY_STATE));
});

function hotfixable() {
  const f = fake();
  Object.assign(f.ctx.cfg, { itchTarget: 'u/g', butlerKey: 'secret', cpuLight: 0.1, cpuImplement: 0.1, cpuTest: 0.1 });
  return f;
}

function integrating(f: Fake, rounds: Round[], failing = false) {
  let landings = 0;
  let fetches = 0;
  const round = () => rounds[Math.min(landings, rounds.length - 1)]!;
  const checks: string[] = [];
  const landed: Landed[] = [];
  Object.assign(f.ctx.repo, {
    fetchFromWork: async () => (++fetches % 2 === 1 ? round().main : round().merged),
    mergeBranchIntoWork: async (_dir: string, _branch: string, message?: string) => (message !== undefined && round().conflict ? { commit: 'x', conflicts: ['game/src/truck.ts'] } : { commit: null, conflicts: [] }),
    parentsOf: async () => [round().main, round().hotfix],
    treeOf: async (ref: string) => (round().sameGame && ref === round().merged ? `tree-${round().hotfix}` : `tree-${ref}`),
    changedFiles: async (base: string) => (base === round().main ? round().hotfixFiles : round().mainFiles) ?? [],
    merge: async (steps: MergeStep[], resolutions: Resolution[] = [], expected: Record<string, string> = {}) => {
      const lands = round().lands !== false;
      landings++;
      if (lands) landed.push({ steps, resolutions, expected });
      return lands;
    },
  });
  f.ctx.container.shell = async (_clone: string, script: string, log: string) => {
    if (!script.includes('[checks]')) return;
    checks.push(script);
    if (failing) throw new Error('Error: expected 2 to be 3');
    appendFileSync(log, SUITE_LINE);
  };
  return { checks, landed };
}

function passed(f: Fake, commit: string, toolchain = currentToolchain(f.ctx), ran: Step[] = FULL) {
  recordEvidence(f.ctx.cfg.home, { tree: `tree-${commit}`, commit, toolchain, ran, reused: [], by: 'testing', issue: 7, at: f.ctx.now().toISOString() }, f.ctx.now());
}

const comment = (f: Fake) => f.calls.find((call) => call.startsWith('comment Approved by'))!;

describe('hotfix integration with main', () => {
  it('ships a hotfix on an unmoved main with no check run again', async () => {
    const f = hotfixable();
    passed(f, 'h1');
    const { checks, landed } = integrating(f, [{ main: 'm1', hotfix: 'h1', merged: 'h1' }]);
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(checks).toEqual([]);
    expect(landed).toHaveLength(1);
    expect(comment(f)).toContain('No check ran again, since main brought no game change the hotfix lacks');
    expect(comment(f)).toContain('It reuses the passing checks of h1.');
  });

  it('runs no check when main moved only outside the game, as with a factory change, and lands the merge', async () => {
    const f = hotfixable();
    passed(f, 'h1');
    const { checks, landed } = integrating(f, [{ main: 'm2', hotfix: 'h1', merged: 'r1', sameGame: true }]);
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(checks).toEqual([]);
    expect(landed.map((item) => item.resolutions)).toEqual([[{ base: 'm2', source: 'h1', head: 'r1' }]]);
    expect(comment(f)).toContain('No check ran again, since main brought no game change the hotfix lacks, so the merge holds exactly the game code the committee played. It reuses the passing checks of h1.');
  });

  it('runs only the typecheck and the cached suite on a clean merge with a moved main, and lands that exact merge with dev in one push', async () => {
    const f = hotfixable();
    passed(f, 'h1');
    passed(f, 'm2');
    const { checks, landed } = integrating(f, [{ main: 'm2', hotfix: 'h1', merged: 'r1', hotfixFiles: ['game/src/horn.ts'], mainFiles: ['game/src/map.ts'] }]);
    const message = await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain('npm run test:cached');
    expect(checks[0]).toContain('npm run typecheck');
    expect(checks[0]).not.toContain('step "playtest"');
    expect(checks[0]).not.toContain('npm run build');
    expect(landed).toEqual([{
      steps: [{ branch: 'factory/issue-7', into: 'main', message: 'Hotfix #7: Big horn' }, { branch: 'main', into: 'dev', message: 'Merge main into dev after hotfix #7' }],
      resolutions: [{ base: 'm2', source: 'h1', head: 'r1' }],
      expected: { main: 'm2', 'factory/issue-7': 'h1' },
    }]);
    expect(evidenceFor(f.ctx.cfg.home, 'tree-r1', currentToolchain(f.ctx))).toMatchObject({ commit: 'r1', ran: ['typecheck', 'suite'], reused: ['h1', 'm2'], by: 'approve', issue: 7 });
    expect(comment(f)).toContain('On the merge with main, r1, the factory ran the typecheck and the suite (it ran 2 test files and skipped 224 that already passed on the same inputs), since the merge was clean and the hotfix and main changed no file in common. It reuses the passing checks of h1 and m2.');
    expect(message).toContain('It reuses the passing checks of h1 and m2.');
  });

  it('integrates again on the new tip when main moves during the checks, and never lands the merge it checked on the old tip', async () => {
    const f = hotfixable();
    passed(f, 'h1');
    passed(f, 'm2');
    passed(f, 'm3');
    const { checks, landed } = integrating(f, [
      { main: 'm2', hotfix: 'h1', merged: 'r1', lands: false },
      { main: 'm3', hotfix: 'h1', merged: 'r2' },
    ]);
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(checks).toHaveLength(2);
    expect(landed.map((item) => item.resolutions)).toEqual([[{ base: 'm3', source: 'h1', head: 'r2' }]]);
    expect(comment(f)).toContain('On the merge with main, r2,');
    expect(comment(f)).toContain('It reuses the passing checks of h1 and m3.');
  });

  it('runs no check for a merge whose exact code already passed, as when a new main tip holds the same code', async () => {
    const f = hotfixable();
    passed(f, 'h1');
    passed(f, 'm2');
    passed(f, 'r1', currentToolchain(f.ctx), ['typecheck', 'suite']);
    const { checks } = integrating(f, [{ main: 'm2', hotfix: 'h1', merged: 'r1' }]);
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(checks).toEqual([]);
    expect(comment(f)).toContain('No check ran again, since the same merged code passed its checks at r1. It reuses the passing checks of r1.');
  });

  it('has the merge agent resolve a conflict with main, keeps the approval, and adds the playtest to the targeted checks', async () => {
    const f = hotfixable();
    passed(f, 'h1');
    passed(f, 'm2');
    const { checks, landed } = integrating(f, [{ main: 'm2', hotfix: 'h1', merged: 'r1', conflict: true }]);
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(f.agentRuns.map((run) => run.prompt).join('\n')).toContain('game/src/truck.ts');
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain('step "playtest"');
    expect(checks[0]).not.toContain('npm run build');
    expect(landed).toHaveLength(1);
    expect(comment(f)).toContain('the factory ran the typecheck, the suite (it ran 2 test files and skipped 224 that already passed on the same inputs) and the playtest, since the merge conflicted and an agent resolved it.');
  });

  it('fails without landing or recording anything when a check fails on the merge', async () => {
    const f = hotfixable();
    passed(f, 'h1');
    passed(f, 'm2');
    const { landed } = integrating(f, [{ main: 'm2', hotfix: 'h1', merged: 'r1', hotfixFiles: ['game/src/horn.ts'], mainFiles: ['game/src/horn.ts'] }], true);
    const error = await shipHotfix(f.ctx, 7, 'Big horn', 'Ann').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IntegrationFailure);
    expect((error as Error).message).toContain('the typecheck, the suite and the playtest failed on its merge with main m2, which the factory checked since the hotfix and main both changed game/src/horn.ts');
    expect((error as Error).message).toContain('Error: expected 2 to be 3');
    expect(landed).toEqual([]);
    expect(evidenceFor(f.ctx.cfg.home, 'tree-r1', currentToolchain(f.ctx))).toBeNull();
    expect(f.calls.some((call) => call.startsWith('run butler') || call.startsWith('release '))).toBe(false);
  });

  it('runs the full checks and claims no reuse when the evidence was recorded under another toolchain', async () => {
    const f = hotfixable();
    passed(f, 'h1', 'old-toolchain');
    passed(f, 'm2');
    const { checks } = integrating(f, [{ main: 'm2', hotfix: 'h1', merged: 'r1' }]);
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain('npm run build');
    expect(checks[0]).toContain('step "playtest"');
    expect(evidenceFor(f.ctx.cfg.home, 'tree-r1', currentToolchain(f.ctx))?.ran).toEqual(FULL);
    expect(comment(f)).toContain('since no passing checks are on record for h1, so skipping any check cannot be shown safe. It reuses no earlier checks.');
  });
});

describe('hotfix fan-out', () => {
  it('has an agent resolve a conflict of main into dev, pushes all branches once, and ships', async () => {
    const f = hotfixable();
    f.mergeConflicts = ['main dev'];
    let fetches = 0;
    f.ctx.repo.fetchFromWork = async () => (++fetches % 2 === 1 ? 'main-tip' : 'merged');
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(f.calls.filter((call) => /^(merge|open|agent|close (dev|main|release)|push)/.test(call))).toEqual([
      'merge factory/issue-7 main', 'merge main dev', 'open dev', 'agent', 'close dev',
      'merge factory/issue-7 main', 'merge main dev', 'push main dev',
    ]);
    expect(f.calls.some((call) => call.startsWith('addLabel'))).toBe(false);
  });

  it('ships with a GitHub release and posts nothing to the public channel', async () => {
    const f = hotfixable();
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(f.calls).toContain('release hotfix-2026-09-29-issue-7 main ROAM hotfix 2026-09-29\nROAM hotfix 2026-09-29\n\nFixed: #7 Big horn');
    expect(f.calls.filter((call) => /^(message|photo|album|buttons|document) /.test(call))).toEqual([]);
    expect(readLedger(f.ctx.cfg.home, new Date(0)).filter((entry) => entry.kind === 'post')).toEqual([]);
  });

  it('leaves the open release and its candidate post alone', async () => {
    const f = hotfixable();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { issue: 11, branch: 'release/2026-09-29', day: '2026-09-29', postId: 42, removed: [], tasks: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } } });
    await shipHotfix(f.ctx, 7, 'Big horn', 'Ann');
    expect(f.calls.some((call) => call.includes('release/2026-09-29'))).toBe(false);
    expect(readState(f.ctx.statePath).release?.postId).toBe(42);
  });
});
