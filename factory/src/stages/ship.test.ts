import { stepScript } from '../activity';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPublished } from '../sourcemaps';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { Card, IssueMerge, ReleaseState } from '../types';
import { CLONE_SHA, ROOT, fake, issueMerge, reset, type Fake } from './test-fakes';

vi.mock('../deploy', () => ({ deployDev: async () => 'https://play.test/dev/' }));
const { ship } = await import('./ship');

const TRUCKS = issueMerge(3, 'faster trucks');
const LATER = issueMerge(7, 'later horn');
const candidateOf = (features: IssueMerge[]): NonNullable<ReleaseState['candidate']> => ({ sha: 'abc1234', features });
const RELEASE: ReleaseState = { issue: 11, day: '2026-09-29', postId: 42, removed: [], candidate: candidateOf([TRUCKS]), playtest: { seed: 1, runs: 0, lastStart: null, passed: candidateOf([TRUCKS]), fixes: null, blocked: null, decision: null, work: null } };
const done = (issue: number, labels: string[] = []): Card => ({ itemId: `i${issue}`, issue, column: 'Done', labels });

beforeEach(() => {
  reset();
  writeState(fake().ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE, devMerges: [TRUCKS, LATER], pendingShip: 'Ann', builds: { '11': 'rc', '3': 'aaa1111' } });
  const out = join(ROOT, 'work', 'release-candidate', 'game', '.factory');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'screenshot.png'), 'png');
  writeFileSync(join(out, 'release.json'), JSON.stringify([{ issue: 3, text: 'Trucks are faster.' }]));
});

function shippable(): Fake {
  const f = fake();
  Object.assign(f.ctx.cfg, { itchTarget: 'u/g', butlerKey: 'secret' });
  f.cards = [{ itemId: 'i11', issue: 11, column: 'Approval', labels: ['release'] }, done(12, ['maintenance'])];
  return f;
}

describe('ship', () => {
  it('runs the full suite on GitHub Actions for the merged main before it pushes', async () => {
    const f = shippable();
    const replaced: string[] = [];
    Object.assign(f.ctx.cfg, { suiteStartMinutes: 15, suitePollSeconds: 0 });
    f.ctx.repo.changedInWork = async () => ['game/src/sim/fuel.ts'];
    f.ctx.repo.replaceBranch = async (commit, branch) => { replaced.push(`${commit} ${branch}`); };
    f.ctx.github.dispatchSuite = async (sha) => { f.calls.push(`suite ${sha}`); return 1; };
    f.ctx.github.suiteRun = async () => ({ done: true, started: true, passed: true, testsFailed: false, conclusion: 'success', url: 'https://github.com/o/r/actions/runs/1' });
    await ship(f.ctx, 11, 'Ann');
    expect(replaced).toEqual(['work-head factory/suite-ship-main']);
    expect(f.calls).toContain('suite work-head');
    expect(f.calls.indexOf('suite work-head')).toBeLessThan(f.calls.indexOf('push work-head main'));
  });

  it('merges, builds main in a fresh clone, pushes with butler alone, and leaves the public post to Hermes and a member', async () => {
    const f = shippable();
    const runs: { cmd: string; args: string[]; env?: Record<string, string> }[] = [];
    f.ctx.run = async (cmd, args, opts) => { runs.push({ cmd, args, env: opts?.env }); f.calls.push(`run ${cmd}`); return { code: 0, stdout: cmd === 'git' ? CLONE_SHA : '', stderr: '' }; };
    const shells: { script: string; env?: Record<string, string> }[] = [];
    f.ctx.container.shell = async (kind, clone, script, _log, env) => { shells.push({ script, env }); f.calls.push(`shell ${kind} ${clone}`); };
    await ship(f.ctx, 11, 'Ann');
    const at = (name: string) => f.calls.findIndex((call) => call.startsWith(name));
    expect(at('push work-head main')).toBeLessThan(at('merge main dev'));
    expect(at('push dev')).toBeLessThan(at('run butler'));
    expect(shells.at(-1)).toEqual({ script: stepScript('Building the release', [['npm ci', 'npm ci'], ['build', 'npm run build']]), env: { SAVE_SCOPE: '', ERROR_REPORT_URL: 'https://play.test/errors', ERROR_REPORT_BUILD: 'release', FEEDBACK_URL: 'https://play.test/feedback' } });
    expect(shells[0].env).toMatchObject({ BUILD_SCOPE: 'ship', TEST_STALL_MINUTES: '15' });
    expect(runs).toEqual([
      { cmd: 'git', args: ['rev-parse', 'HEAD'], env: undefined },
      { cmd: 'butler', args: ['push', join(ROOT, 'work', 'release-main', 'game', 'dist'), 'u/g:html5', '--userversion', 'abc1234'], env: { BUTLER_API_KEY: 'secret' } },
    ]);
    expect(existsSync(join(ROOT, 'work', 'release-main', 'game', 'dist', 'assets', 'index.js.map'))).toBe(false);
    expect(existsSync(join(ROOT, 'sourcemaps', CLONE_SHA, 'assets', 'index.js.map'))).toBe(true);
    expect(readPublished(ROOT)).toEqual([{ sha: CLONE_SHA, kind: 'release', publishedAt: '2026-09-29T10:00:00.000Z' }]);
    expect(f.calls.some((call) => / public/.test(call.split(' ').slice(0, 2).join(' ')))).toBe(false);
    const post = readState(f.ctx.statePath).releasePost;
    expect(post).toEqual({ issue: 11, day: '2026-09-29', changelog: '- [#3] Trucks are faster.', screenshot: join(ROOT, 'release-posts', '2026-09-29', 'screenshot.png'), postId: null, draft: null });
    expect(readFileSync(post!.screenshot, 'utf8')).toBe('png');
    expect(f.calls.filter((call) => call.startsWith('message committee'))).toEqual(['message committee - Release 2026-09-29 shipped with 1 changes.']);
  });

  it('fails on a dev merge conflict before the build, the butler push and any public post', async () => {
    const f = shippable();
    const merge = f.ctx.repo.merge;
    f.ctx.repo.merge = async (steps) => { if (steps.some((step) => step.into === 'dev')) throw new Error('merge conflict in dev'); return merge(steps); };
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('merge conflict in dev');
    expect(f.calls.some((call) => call.startsWith('prepare main main') && call.includes('release-main'))).toBe(false);
    expect(f.calls.some((call) => call.startsWith('run butler') || call.includes('public'))).toBe(false);
    expect(readState(f.ctx.statePath).release).not.toBeNull();
  });

  it('closes the tracking issue, clears the release, the rc build and the builds of the shipped features, and tells the committee', async () => {
    const f = shippable();
    await ship(f.ctx, 11, 'Ann');
    expect(f.calls).toContain('close completed');
    expect(f.calls).toContain('move Done');
    expect(f.calls.at(-1)).toBe('message committee - Release 2026-09-29 shipped with 1 changes.');
    const state = readState(f.ctx.statePath);
    expect(state.release).toMatchObject({ issue: 11, day: '2026-09-29', postId: null, candidate: null, removed: [] });
    expect(state.release?.playtest).toMatchObject({ passed: null, lastStart: null, blocked: null });
    expect(state.pendingShip).toBeNull();
    expect(state.lastRelease).toBe('2026-09-29T10:00:00.000Z');
    expect(state.builds).toEqual({});
  });

  it('drops exactly the shipped features from dev merges, and keeps a merge of the same issue that was not shipped', async () => {
    const f = shippable();
    const again = issueMerge(3, 'faster trucks', { sha: 'second3'.padEnd(40, '0') });
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), devMerges: [TRUCKS, LATER, again] });
    await ship(f.ctx, 11, 'Ann');
    expect(readState(f.ctx.statePath).devMerges).toEqual([LATER, again]);
  });

  it('closes only the features of the stored candidate, not other merges on dev', async () => {
    const f = shippable();
    await ship(f.ctx, 11, 'Ann');
    expect(f.calls.filter((call) => call === 'close completed')).toHaveLength(2);
    expect(f.calls.some((call) => call.startsWith('removeLabel 7'))).toBe(false);
  });

  it('merges the candidate commit from the candidate branch, never a release branch', async () => {
    const f = shippable();
    const merged: string[] = [];
    f.ctx.repo.mergeBranchIntoWork = async (_dir, branch) => { merged.push(branch); return { commit: null, conflicts: [] }; };
    await ship(f.ctx, 11, 'Ann');
    expect(merged).toEqual(['factory/candidate']);
    expect(readState(f.ctx.statePath).landings.ship).toBeUndefined();
  });

  it('opens the next release and the two cleanup tasks as plain dev cards labeled maintenance', async () => {
    const f = shippable();
    await ship(f.ctx, 11, 'Ann');
    expect(f.created.map((issue) => issue.labels)).toEqual([['release'], ['maintenance'], ['maintenance']]);
    expect(f.created.map((issue) => issue.title)).toEqual(['Release 2026-09-29', 'Optimize against the speed budget (after release 2026-09-29)', 'Code janitor pass (after release 2026-09-29)']);
    expect(f.calls.filter((call) => call.startsWith('addCard'))).toEqual(['addCard Approval', 'addCard Design', 'addCard Design']);
  });

  it('leaves the release unopened for the next tick when the next release cannot be opened', async () => {
    const f = shippable();
    f.ctx.github.createIssue = async () => { throw new Error('gh down'); };
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('gh down');
    const state = readState(f.ctx.statePath);
    expect(state.release).toBeNull();
    expect(state.releasePost).not.toBeNull();
    expect(state.devMerges).toEqual([LATER]);
    expect(state.pendingCleanup).toBe('2026-09-29');
  });

  it('clears the due cleanup once both cleanup cards are open', async () => {
    const f = shippable();
    await ship(f.ctx, 11, 'Ann');
    expect(readState(f.ctx.statePath).pendingCleanup).toBeNull();
  });

  it('closes each shipped issue and drops its release-candidate label, after the itch push', async () => {
    const f = shippable();
    await ship(f.ctx, 11, 'Ann');
    const at = (name: string) => f.calls.findIndex((call) => call.startsWith(name));
    expect(at('run butler')).toBeLessThan(at('comment Shipped in release 2026-09-29'));
    expect(f.calls).toContain('removeLabel 3 release-candidate');
    expect(f.calls.filter((call) => call === 'close completed')).toHaveLength(2);
  });

  it('ships the stored candidate features when it runs again after the candidate reached main', async () => {
    const f = shippable();
    f.ctx.github.createRelease = async () => { throw new Error('killed'); };
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('killed');
    expect(readState(f.ctx.statePath).release?.candidate?.features).toEqual([TRUCKS]);
    const again = shippable();
    await ship(again.ctx, 11, 'Ann');
    expect(again.calls).toContain('removeLabel 3 release-candidate');
    expect(readState(again.ctx.statePath).release?.candidate).toBeNull();
  });

  it('queues an incident job for each shipped issue labeled bug, and for no other', async () => {
    const f = shippable();
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), release: { ...RELEASE, candidate: candidateOf([TRUCKS, issueMerge(4, 'new horn')]) } });
    writeFileSync(join(ROOT, 'work', 'release-candidate', 'game', '.factory', 'release.json'), JSON.stringify([{ issue: 3, text: 'Trucks are faster.' }, { issue: 4, text: 'A horn.' }]));
    f.ctx.github.issue = async (n: number) => ({ number: n, title: 'T', body: '', labels: n === 3 ? ['bug'] : ['feature-request'], createdAt: '', state: 'OPEN', author: 'a' });
    await ship(f.ctx, 11, 'Ann');
    expect(readState(f.ctx.statePath).pendingIncidents).toEqual([3]);
  });

  it('closes the issues bundled into a shipped lead and queues the lead for an incident when a bundled one is a bug', async () => {
    const f = shippable();
    writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), bundles: { '3': [8, 9], '5': [10] } });
    f.ctx.github.issue = async (n: number) => ({ number: n, title: 'T', body: '', labels: n === 9 ? ['bug'] : ['feature-request'], createdAt: '', state: 'OPEN', author: 'a' });
    await ship(f.ctx, 11, 'Ann');
    expect(f.calls.filter((call) => call === 'comment Shipped in release 2026-09-29. It is on main and itch.io. It shipped as part of #3.')).toHaveLength(2);
    expect(f.calls.filter((call) => call === 'close completed')).toHaveLength(4);
    const state = readState(f.ctx.statePath);
    expect(state.pendingIncidents).toEqual([3]);
    expect(state.bundles).toEqual({ '5': [10] });
  });

  it('publishes a GitHub release of main with the changelog, after the itch push', async () => {
    const f = shippable();
    await ship(f.ctx, 11, 'Ann');
    const at = (name: string) => f.calls.findIndex((call) => call.startsWith(name));
    expect(at('run butler')).toBeLessThan(at('release release-2026-09-29'));
    expect(f.calls).toContain('release release-2026-09-29 main ROAM release 2026-09-29\n- [#3] Trucks are faster.');
  });

  it('has the ship agent resolve a conflict of the release into main, then checks and ships', async () => {
    const f = shippable();
    let open = true;
    f.ctx.repo.mergeBranchIntoWork = async (_dir, branch) => {
      f.calls.push(`mergeWork ${branch}`);
      const result = open ? { commit: 'c0ffee1', conflicts: ['game/src/sim/sun.ts'] } : { commit: null, conflicts: [] };
      open = false;
      return result;
    };
    await ship(f.ctx, 11, 'Ann');
    expect(f.calls.filter((call) => /^(mergeWork|agent|shell .*ship-main|push)/.test(call))).toEqual(['mergeWork factory/candidate', 'agent', 'mergeWork factory/candidate', 'push work-head main', 'push dev']);
    expect(f.agentRuns[0].prompt).toContain('merges branch factory/candidate into it');
    expect(readState(f.ctx.statePath).releasePost).not.toBeNull();
  });

  it('gives failed checks of the merged main to the ship agent and checks its fix again', async () => {
    const f = shippable();
    let fails = 1;
    f.ctx.container.shell = async (_kind, clone) => {
      f.calls.push(`shell ${clone}`);
      if (clone.endsWith('ship-main') && fails-- > 0) throw new Error('tests failed');
    };
    await ship(f.ctx, 11, 'Ann');
    expect(f.agentRuns.map((run) => run.prompt.split('\n')[0])).toEqual(['This is the ship stage of the ROAM factory.']);
    expect(f.calls.filter((call) => call.endsWith('ship-main'))).toHaveLength(2);
    expect(readState(f.ctx.statePath).releasePost).not.toBeNull();
  });

  it('still gives failed checks to the ship agent when resolving the release conflict cost the whole budget', async () => {
    const f = shippable();
    f.ctx.cfg.mergingBudgetUsd = 1;
    let open = true;
    f.ctx.repo.mergeBranchIntoWork = async (_dir, branch) => {
      f.calls.push(`mergeWork ${branch}`);
      const result = open ? { commit: 'c0ffee1', conflicts: ['game/src/sim/sun.ts'] } : { commit: null, conflicts: [] };
      open = false;
      return result;
    };
    let fails = 1;
    f.ctx.container.shell = async (_kind, clone) => {
      f.calls.push(`shell ${clone}`);
      if (clone.endsWith('ship-main') && fails-- > 0) throw new Error('tests failed');
    };
    await ship(f.ctx, 11, 'Ann');
    expect(f.calls.filter((call) => /^(agent|shell .*ship-main|push)/.test(call)).map((call) => call.split(' ')[0])).toEqual(['agent', 'shell', 'agent', 'shell', 'push', 'push']);
    expect(f.agentRuns[1]!.prompt).toContain('tests failed');
  });

  it('fails and ships nothing when the ship agent spent its budget and the checks still fail', async () => {
    const f = shippable();
    f.ctx.cfg.mergingBudgetUsd = 1;
    f.ctx.container.shell = async (_kind, clone) => {
      f.calls.push(`shell ${clone}`);
      if (clone.endsWith('ship-main')) throw new Error('tests failed');
    };
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('budget');
    expect(f.calls.some((call) => call.startsWith('push'))).toBe(false);
    expect(readState(f.ctx.statePath).releasePost).toBeNull();
    expect(readState(f.ctx.statePath).release).not.toBeNull();
  });

  it('keeps the ship clone and session of a failed ship, and the next ship resumes them with no new clone or merge', async () => {
    const f = shippable();
    f.ctx.cfg.mergingBudgetUsd = 1;
    let failing = true;
    f.ctx.container.shell = async (_kind, clone) => {
      f.calls.push(`shell ${clone}`);
      if (clone.endsWith('ship-main') && failing) throw new Error('tests failed');
    };
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('budget');
    const kept = readState(f.ctx.statePath).landings.ship!;
    expect(kept).toMatchObject({ into: 'main', cards: [11], merged: true, sources: [{ branch: 'factory/candidate', sha: 'abc1234' }] });
    f.calls.length = 0;
    failing = false;
    f.ctx.cfg.mergingBudgetUsd = 100;
    await ship(f.ctx, 11, 'Ann');
    expect(f.calls.filter((call) => call === 'prepare main')).toHaveLength(1);
    expect(f.calls.indexOf('prepare main')).toBeGreaterThan(f.calls.indexOf('push work-head main'));
    expect(f.calls.some((call) => call.startsWith('push work-head main'))).toBe(true);
    expect(readState(f.ctx.statePath).landings.ship).toBeUndefined();
  });

  it('stops before it merges anything when the changelog does not match the release', async () => {
    const f = shippable();
    writeFileSync(join(ROOT, 'work', 'release-candidate', 'game', '.factory', 'release.json'), '"Trucks are faster."');
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('release.json is not an array');
    expect(f.calls.some((call) => call.startsWith('merge') || call.startsWith('push'))).toBe(false);
  });

  it('stops before it merges anything when the itch keys are missing', async () => {
    const f = shippable();
    Object.assign(f.ctx.cfg, { itchTarget: null, butlerKey: null });
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('ITCH_TARGET in factory/settings.env and BUTLER_API_KEY');
    expect(f.calls).toEqual([]);
  });

  it('refuses without a Ship from a member (IV1)', async () => {
    const f = shippable();
    await expect(ship(f.ctx, 11, null)).rejects.toThrow('needs a Ship');
    expect(f.calls.some((call) => call.startsWith('merge'))).toBe(false);
  });

  it('refuses while the release has no current post (IV3)', async () => {
    const f = shippable();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, postId: null } });
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('no current candidate post');
    expect(f.calls.some((call) => call.startsWith('merge'))).toBe(false);
  });

  it('refuses when the candidate branch is not at the posted commit, before it merges anything', async () => {
    const f = shippable();
    f.ctx.repo.headHash = async () => 'def5678';
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('factory/candidate is at def5678 on GitHub, not at the candidate abc1234');
    expect(f.calls.some((call) => call.startsWith('merge') || call.startsWith('run butler'))).toBe(false);
  });

  it('does not wait for open cards, since ordinary dev cards are no part of the candidate', async () => {
    const f = shippable();
    f.cards.push({ itemId: 'i13', issue: 13, column: 'Testing', labels: [] });
    await ship(f.ctx, 11, 'Ann');
    expect(readState(f.ctx.statePath).releasePost).not.toBeNull();
  });

  it('refuses when no release is open or another issue is named', async () => {
    const f = shippable();
    await expect(ship(f.ctx, 99, 'Ann')).rejects.toThrow('not the tracking issue');
    writeState(f.ctx.statePath, structuredClone(EMPTY_STATE));
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('No release is open');
  });

  it('posts nothing publicly when butler fails', async () => {
    const f = shippable();
    f.ctx.run = async (cmd) => (cmd === 'butler' ? { code: 1, stdout: '', stderr: 'bad key' } : { code: 0, stdout: CLONE_SHA, stderr: '' });
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('butler push failed');
    expect(f.calls.some((call) => call.startsWith('photo') || call.startsWith('message'))).toBe(false);
    expect(readState(f.ctx.statePath).release).not.toBeNull();
  });

  it('counts the upload as done when itch.io already has this version, so a retry after a later failure finishes', async () => {
    const f = shippable();
    f.ctx.run = async (cmd) => (cmd === 'butler' ? { code: 1, stdout: '', stderr: `itch.io API error (400): /wharf/builds: enforcing unique versions, 1 build(s) already exist with version abc1234` } : { code: 0, stdout: CLONE_SHA, stderr: '' });
    await ship(f.ctx, 11, 'Ann');
    expect(readState(f.ctx.statePath).releasePost).not.toBeNull();
  });

  it('still fails when itch.io has a different version', async () => {
    const f = shippable();
    f.ctx.run = async (cmd) => (cmd === 'butler' ? { code: 1, stdout: '', stderr: 'enforcing unique versions, 1 build(s) already exist with version other99' } : { code: 0, stdout: CLONE_SHA, stderr: '' });
    await expect(ship(f.ctx, 11, 'Ann')).rejects.toThrow('butler push failed');
  });
});
