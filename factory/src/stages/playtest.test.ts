import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type * as Os from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stepScript } from '../activity';
import { EMPTY_STATE, newPlaytest, readState, writeState } from '../state';
import { testPoolPin } from '../cpus';
import type { AgentRun, Issue, Pin, ReleaseState, ShellKind } from '../types';
import { SUITE_BRANCH, auditDir, playtest } from './playtest';
import { SUITE_DOWN_MARK } from './remote-suite';
import { logText } from './playtest-fixtures';
import type { Finding, Review } from './playtest-review';
import { ROOT, fake, issueMerge, reset, type Fake } from './test-fakes';

vi.mock('node:os', async (original) => ({ ...(await original<typeof Os>()), availableParallelism: () => 8 }));

const DAY = '2026-10-07';
const SEED = 20261007;
const BRANCH = `release/${DAY}`;
const RELEASE: ReleaseState = { issue: 11, branch: BRANCH, day: DAY, postId: null, candidateSha: null, removed: [], tasks: [], merges: [], playtest: newPlaytest(DAY) };
const CLONE = join(ROOT, 'work', 'release-playtest');
const HOME = join(CLONE, 'game', '.factory');

const releaseBug: Finding = { id: 'F1', severity: 'important', title: 'Raiders chase forever', evidence: 'turns 300 to 900, v12', cause: 'release', why: 'the raid goal of #12 never ends', known: null, fixed: false };
const oldBug: Finding = { id: 'F2', severity: 'important', title: 'Escorts to a territory never end', evidence: 'v722 from 1259', cause: 'old', why: 'the baseline log has the same unpaid escort at 1300', known: null, fixed: false };
const review = (over: Partial<Review> = {}): string => JSON.stringify({
  verdict: 'clean', summary: 'A full run.', drama: 'A raid at turn 300.', observations: ['trade at turn 20'], suspected: [], limitations: ['far mode'],
  findings: [], fixes: [], explanations: { death: null, quiet: null }, blocker: null, ...over,
});
const fixed = (commit: string): Turn => ({ review: review({ verdict: 'fixed', findings: [releaseBug], fixes: ['end the raid goal after a lost target'] }), commit });
const clean: Turn = { review: review(), report: '## Run\nAll good.' };

type Turn = { review?: string; report?: string; commit?: string };
type Run = {
  f: Fake; shells: { clone: string; script: string; env: Record<string, string>; mounts: Record<string, string>; pin?: Pin }[]; prompts: string[]; sessions: AgentRun['session'][];
  releaseHead: string; cloneHead: string; turns: Turn[]; checkFailures: number; dirty: string; pushFails: boolean; mainMerged: boolean;
  passedAncestor: boolean; changed: string[]; suites: string[]; failingSuites: string[]; replaced: string[];
};

const harnessRuns = (run: Run) => run.shells.filter((shell) => shell.script.includes('progression:playthrough'));
const checkRuns = (run: Run) => run.shells.filter((shell) => shell.script.includes('mkdir -p tmp'));
const POOLS = { cpuLight: 0.125, cpuImplement: 0.375, cpuTest: 0.5, vitestWorkersImplement: 2, vitestWorkersTest: 4 };

function setup(state: Partial<ReleaseState> = {}, start = 'abc1234'): Run {
  const f = fake();
  f.ctx.cfg = { ...f.ctx.cfg, designModel: 'opus', playtestTurns: 100, playtestRuns: 3, gpu: true, suiteStartMinutes: 15, suitePollSeconds: 0, ...POOLS };
  writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, ...state, playtest: { ...RELEASE.playtest, ...state.playtest } } });
  const run: Run = {
    f, shells: [], prompts: [], sessions: [], releaseHead: start, cloneHead: start, turns: [], checkFailures: 0, dirty: '', pushFails: false, mainMerged: true, passedAncestor: true,
    changed: ['game/src/sim/raid.ts'], suites: [], failingSuites: [], replaced: [],
  };
  f.ctx.github.comments = async () => [];
  f.ctx.github.dispatchSuite = async (sha: string) => run.suites.push(sha);
  f.ctx.github.suiteRun = async (id: number) => {
    const failed = run.failingSuites.includes(run.suites[id - 1]!);
    return { done: true, started: true, passed: !failed, testsFailed: failed, conclusion: failed ? 'failure' : 'success', url: `https://github.com/o/r/actions/runs/${id}` };
  };
  f.ctx.github.suiteLog = async (id: number) => `FAIL src/sim/raid.test.ts at ${run.suites[id - 1]}`;
  f.ctx.repo.replaceBranch = async (commit: string, branch: string) => { run.replaced.push(`${commit} ${branch}`); };
  f.ctx.run = async (_cmd: string, args: string[]) => {
    f.calls.push(`run ${args.join(' ')}`);
    if (args.includes('rev-parse')) return { code: 0, stdout: `${start}0123456789abcdef\n`, stderr: '' };
    return { code: 0, stdout: args.includes('status') ? run.dirty : '', stderr: '' };
  };
  f.ctx.repo.headHash = async (name: string) => (name === BRANCH ? run.releaseHead : name);
  f.ctx.repo.forkPoint = async () => 'main001';
  f.ctx.repo.fetchFromWork = async () => run.cloneHead;
  f.ctx.repo.isMerged = async (base: string) => (base === 'main' ? run.mainMerged : run.passedAncestor);
  f.ctx.repo.changedFiles = async () => run.changed;
  f.ctx.repo.changedInWork = async () => run.changed;
  f.ctx.repo.push = async (commit: string, branch: string) => {
    f.calls.push(`push ${commit} ${branch}`);
    if (run.pushFails) {
      run.releaseHead = 'moved01';
      throw new Error('rejected');
    }
    run.releaseHead = commit;
  };
  f.ctx.github.candidates = async () => [{ number: 40, title: 'Old raider loop' } as Issue];
  f.ctx.container.shell = async (kind: ShellKind, clone: string, script: string, _log: string, env: Record<string, string> = {}, mounts: Record<string, string> = {}, _limit?: number, pin?: Pin) => {
    if (kind !== 'checks') throw new Error(`playtest shells are checks, not ${kind}`);
    run.shells.push({ clone, script, env, mounts, ...(pin === undefined ? {} : { pin }) });
    if (script.includes('mkdir -p tmp')) {
      if (run.checkFailures-- > 0) throw new Error('npm test failed');
      return;
    }
    const arg = (name: string) => new RegExp(`--${name} (\\S+)`).exec(script)?.[1] ?? '';
    const log = join(clone, 'game', '.factory', 'playtest', 'log.jsonl');
    mkdirSync(join(log, '..'), { recursive: true });
    writeFileSync(log, logText({}, { seed: Number(arg('seed')), turns: Number(arg('turns')), sha: arg('sha') }));
  };
  f.ctx.container.agent = async (agentRun: AgentRun) => {
    run.prompts.push(agentRun.prompt);
    run.sessions.push(agentRun.session);
    const turn = run.turns.shift() ?? {};
    mkdirSync(HOME, { recursive: true });
    if (turn.review) writeFileSync(join(HOME, 'playtest.json'), turn.review);
    if (turn.report) writeFileSync(join(HOME, 'playtest.md'), turn.report);
    if (turn.commit) run.cloneHead = turn.commit;
    return '';
  };
  return run;
}

const release = (f: Fake): ReleaseState => {
  const open = readState(f.ctx.statePath).release;
  if (!open) throw new Error('no release');
  return open;
};
const comments = (f: Fake): string[] => f.calls.filter((call) => call.startsWith('comment'));
const pushes = (f: Fake): string[] => f.calls.filter((call) => call.startsWith('push'));

beforeEach(reset);

describe('playtest', () => {
  it('plays the release head and main where the release branched side by side, has Opus review both logs and passes the head with no push', async () => {
    const run = setup();
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(run.suites).toEqual(['abc1234']);
    expect(harnessRuns(run).map((shell) => [shell.clone, shell.script])).toEqual([
      [CLONE, stepScript('Playing the release seed', [['npm ci', 'npm ci'], ['playtest', `npm run progression:playthrough -- --seed ${SEED} --turns 100 --sha abc1234 --out .factory/playtest/log.jsonl`]])],
      [join(ROOT, 'work', 'release-baseline'), stepScript('Playing the baseline seed', [['npm ci', 'npm ci'], ['playtest', `npm run progression:playthrough -- --seed ${SEED} --turns 100 --sha main001 --out .factory/playtest/log.jsonl`]])],
    ]);
    expect(run.f.calls).toContain(`prepare ${BRANCH}`);
    expect(readFileSync(join(HOME, 'playtest', 'baseline.jsonl'), 'utf8')).toContain('"sha":"main001"');
    expect(run.prompts[0]).toContain(`seed ${SEED}, 100 turns`);
    expect(run.prompts[0]).toContain('commit abc1234');
    expect(run.prompts[0]).toContain('main001');
    expect(readFileSync(join(HOME, 'open-bugs.md'), 'utf8')).toContain('- #40 Old raider loop');
    expect(checkRuns(run)).toEqual([]);
    expect(pushes(run.f)).toEqual([]);
    expect(release(run.f).playtest).toMatchObject({ runs: 1, passed: 'abc1234', blocked: null });
    expect(comments(run.f)).toEqual([expect.stringContaining('Release playtest: clean after 1 plays. Seed 20261007, 100 turns, from commit abc1234 to abc1234.\nThe candidate builds from abc1234.')]);
    expect(comments(run.f)[0]).toContain('All good.');
  });

  it('writes the features of the release with their issue text for the agent', async () => {
    const run = setup({ merges: [issueMerge(5, 'Salvage chain'), issueMerge(6, 'Hauler chassis')] });
    run.turns = [{ review: review() }];
    await playtest(run.f.ctx, 11);
    const text = readFileSync(join(HOME, 'release-features.md'), 'utf8');
    expect(text).toContain('#5 Salvage chain');
    expect(text).toContain('#6 Hauler chassis');
  });

  it('runs the full suite of the release head on GitHub Actions and none on the laptop', async () => {
    const run = setup();
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(run.suites).toEqual(['abc1234']);
    expect(run.replaced).toEqual([]);
    expect(run.shells.some((shell) => shell.script.includes('test:cached'))).toBe(false);
    expect(harnessRuns(run).map((shell) => shell.pin)).toEqual([undefined, undefined]);
  });

  it('gives a failed release suite to the agent after the first play, then checks its fix on GitHub Actions', async () => {
    const run = setup();
    run.failingSuites = ['abc1234'];
    run.turns = [clean, { commit: 'fix0001' }, clean];
    await playtest(run.f.ctx, 11);
    expect(run.prompts[1]).toContain('The factory checks failed on abc1234');
    expect(readFileSync(join(HOME, 'check-failure.md'), 'utf8')).toContain('FAIL src/sim/raid.test.ts at abc1234');
    expect(run.suites).toEqual(['abc1234', 'fix0001']);
    expect(run.replaced).toEqual([`fix0001 ${SUITE_BRANCH}`]);
    expect(pushes(run.f)).toEqual([`push fix0001 ${BRANCH}`]);
    expect(release(run.f).playtest).toMatchObject({ runs: 2, passed: 'fix0001' });
  });

  it('fails as a machine failure when the suite cannot run on GitHub Actions', async () => {
    const run = setup();
    run.turns = [clean];
    run.f.ctx.github.dispatchSuite = async () => { throw new Error('HTTP 503'); };
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow(SUITE_DOWN_MARK);
    expect(release(run.f).playtest.passed).toBeNull();
  });

  it('plays the last commit the release passed as the baseline once it has one', async () => {
    const run = setup({ playtest: { ...RELEASE.playtest, runs: 3, passed: 'old0001' } });
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(harnessRuns(run)[1].script).toContain('--sha old0001');
    expect(run.f.calls).toContain(`run -C ${join(ROOT, 'work', 'release-baseline')} checkout --quiet --detach old0001`);
    expect(run.prompts[0]).toContain('old0001, the last commit this release passed');
  });

  it('replays the seed on the fixes in the same session, checks them, pushes the reviewed commit and passes it', async () => {
    const run = setup();
    run.turns = [fixed('fix0001'), clean];
    await playtest(run.f.ctx, 11);
    expect(harnessRuns(run).map((shell) => /--sha (\S+)/.exec(shell.script)?.[1])).toEqual(['abc1234', 'main001', 'fix0001']);
    expect(run.prompts[1]).toContain('commit fix0001');
    expect(run.sessions[0]).toMatchObject({ resume: false });
    expect(run.sessions[1]).toEqual({ ...run.sessions[0], resume: true });
    expect(checkRuns(run)).toHaveLength(1);
    expect(checkRuns(run)[0]).toMatchObject({ clone: CLONE, env: { BUILD_SCOPE: 'fix0001', TEST_STALL_MINUTES: '15' }, pin: testPoolPin(POOLS) });
    expect(checkRuns(run)[0].script).toContain('npm run playtest -- --no-fps-gate');
    expect(checkRuns(run)[0].script).not.toContain('test:cached');
    expect(run.suites).toEqual(['abc1234', 'fix0001']);
    expect(run.replaced).toEqual([`fix0001 ${SUITE_BRANCH}`]);
    expect(pushes(run.f)).toEqual([`push fix0001 ${BRANCH}`]);
    expect(run.f.created).toEqual([]);
    expect(release(run.f).playtest).toMatchObject({ runs: 2, passed: 'fix0001', blocked: null });
    expect(comments(run.f)[0]).toContain('- play 1 at abc1234: 1 fixes to replay. Fixes: end the raid goal after a lost target');
    expect(comments(run.f)[0]).toContain('- play 2 at fix0001: clean');
    expect(comments(run.f)[0]).toContain('The factory checks passed on the fixes, and they are on the release. The candidate builds from fix0001.');
  });

  it('passes a replay whose review keeps the fixed release finding marked fixed, and blocks a first play that marks one fixed', async () => {
    const run = setup();
    run.turns = [fixed('fix0001'), { review: review({ findings: [{ ...releaseBug, fixed: true }] }) }];
    await playtest(run.f.ctx, 11);
    expect(release(run.f).playtest).toMatchObject({ runs: 2, passed: 'fix0001', blocked: null });
    const first = setup();
    first.turns = [{ review: review({ findings: [{ ...releaseBug, fixed: true }] }) }];
    await expect(playtest(first.f.ctx, 11)).rejects.toThrow('The review marks findings fixed, but no earlier round of this job committed a fix.');
    expect(release(first.f).playtest.passed).toBeNull();
  });

  it('keeps an audit record of each play, the baseline log included', async () => {
    const run = setup();
    run.turns = [fixed('fix0001'), clean];
    await playtest(run.f.ctx, 11);
    const first = auditDir(run.f.ctx, RELEASE, 1);
    for (const name of ['log.jsonl', 'baseline.jsonl', 'playtest-facts.json', 'playtest-baseline-facts.json', 'playtest.json', 'meta.json']) expect(existsSync(join(first, name)), name).toBe(true);
    expect(JSON.parse(readFileSync(join(first, 'meta.json'), 'utf8'))).toMatchObject({ day: DAY, run: 1, seed: SEED, turns: 100, sha: 'abc1234', baseline: 'main001', outcome: 'replay', verdict: 'fixed', bugs: [], ending: 'complete' });
    expect(JSON.parse(readFileSync(join(auditDir(run.f.ctx, RELEASE, 2), 'meta.json'), 'utf8'))).toMatchObject({ run: 2, sha: 'fix0001', outcome: 'clean' });
  });

  it('blocks when the last play still has fixes to replay, pushes nothing and opens no release task', async () => {
    const run = setup();
    run.turns = [fixed('fix0001'), fixed('fix0002'), fixed('fix0003')];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('The last play left fixes that no play checked: end the raid goal after a lost target.');
    expect(harnessRuns(run)).toHaveLength(4);
    expect(pushes(run.f)).toEqual([]);
    expect(run.f.created).toEqual([]);
    expect(release(run.f).playtest).toMatchObject({ runs: 3, passed: null, blocked: { sha: 'fix0002' } });
    expect(comments(run.f)[0]).toContain('Release playtest: blocked after 3 plays');
    expect(comments(run.f)[0]).toContain('Hermes decides with factory retry on this issue.');
  });

  it('opens a bug issue for each important old finding no open issue names, and still passes the release', async () => {
    const run = setup();
    run.turns = [{ review: review({ findings: [oldBug, { ...oldBug, id: 'F3', title: 'Old raider loop', known: 40 }, { ...oldBug, id: 'F4', severity: 'minor' }] }) }];
    await playtest(run.f.ctx, 11);
    expect(run.f.created).toEqual([{ title: 'Escorts to a territory never end', body: expect.stringContaining('The baseline at main001 has it too'), labels: ['bug'] }]);
    expect(run.f.created[0].body).toContain('the baseline log has the same unpaid escort at 1300');
    expect(readFileSync(join(HOME, 'open-bugs.md'), 'utf8')).toContain('- #11 Escorts to a territory never end');
    expect(release(run.f).playtest.passed).toBe('abc1234');
    expect(comments(run.f)[0]).toContain('Old bugs opened: #11');
  });

  it('opens an old bug once, also when a replay lists it again without its new number', async () => {
    const run = setup();
    run.turns = [{ ...fixed('fix0001'), review: review({ verdict: 'fixed', findings: [releaseBug, oldBug], fixes: ['a'] }) }, { review: review({ findings: [oldBug] }) }];
    await playtest(run.f.ctx, 11);
    expect(run.f.created.map((issue) => issue.title)).toEqual(['Escorts to a territory never end']);
  });

  it('gives a failed check to the agent, replays its fix and pushes the commit that passed both', async () => {
    const run = setup();
    run.checkFailures = 1;
    run.turns = [fixed('fix0001'), clean, { commit: 'fix0002' }, clean];
    await playtest(run.f.ctx, 11);
    expect(run.prompts[2]).toContain('The factory checks failed on fix0001');
    expect(existsSync(join(HOME, 'check-failure.md'))).toBe(true);
    expect(harnessRuns(run).map((shell) => /--sha (\S+)/.exec(shell.script)?.[1])).toEqual(['abc1234', 'main001', 'fix0001', 'fix0002']);
    expect(checkRuns(run)).toHaveLength(2);
    expect(pushes(run.f)).toEqual([`push fix0002 ${BRANCH}`]);
    expect(release(run.f).playtest).toMatchObject({ runs: 3, passed: 'fix0002' });
  });

  it('sends uncommitted changes back to the agent instead of checking them', async () => {
    const run = setup();
    run.dirty = ' M game/src/a.ts';
    run.turns = [fixed('fix0001'), clean, { commit: 'fix0001' }];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('the agent committed no fix for them');
    expect(readFileSync(join(HOME, 'check-failure.md'), 'utf8')).toContain('not committed');
    expect(checkRuns(run)).toEqual([]);
    expect(pushes(run.f)).toEqual([]);
  });

  it('fails before any check or push when the fixes touch a path an agent may not push', async () => {
    const run = setup();
    run.changed = ['.github/workflows/x.yml'];
    run.turns = [fixed('fix0001'), clean];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('paths an agent may not push: .github/workflows/x.yml');
    expect(checkRuns(run)).toEqual([]);
    expect(pushes(run.f)).toEqual([]);
    expect(run.replaced).toEqual([]);
    expect(run.suites).toEqual(['abc1234']);
  });

  it('merges the fixes into a release that moved during the job and passes nothing, so the new head plays next', async () => {
    const run = setup();
    run.pushFails = true;
    run.turns = [fixed('fix0001'), clean];
    await playtest(run.f.ctx, 11);
    expect(run.f.calls).toContain(`merge fix0001 ${BRANCH}`);
    expect(release(run.f).playtest).toMatchObject({ passed: null, blocked: null });
    expect(comments(run.f)[0]).toContain('The release moved during the playtest');
  });

  it('never merges main into the release, so main waits for the ship', async () => {
    const run = setup();
    run.mainMerged = false;
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(run.f.calls.some((call) => call.startsWith('merge main'))).toBe(false);
    expect(release(run.f).playtest).toMatchObject({ passed: 'abc1234' });
  });

  it('passes nothing when the release moved during a clean play, so the tick plays the new head', async () => {
    const run = setup();
    run.turns = [clean];
    const agent = run.f.ctx.container.agent;
    run.f.ctx.container.agent = async (agentRun: AgentRun) => {
      run.releaseHead = 'def5678';
      return agent(agentRun);
    };
    await playtest(run.f.ctx, 11);
    expect(release(run.f).playtest).toMatchObject({ runs: 1, passed: null, blocked: null });
    expect(comments(run.f)[0]).toContain('The release moved to def5678 during the playtest');
  });

  it('blocks the release and fails on a blocked verdict, with the report on the tracking issue', async () => {
    const run = setup();
    run.turns = [{ review: review({ verdict: 'blocked', blocker: 'Should raiders give up at night? A design call.' }) }];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('Release playtest blocked: Should raiders give up at night?');
    expect(release(run.f).playtest.blocked).toEqual({ sha: 'abc1234', reason: 'Should raiders give up at night? A design call.' });
    expect(run.f.created).toEqual([]);
    expect(comments(run.f)[0]).toContain('The release is blocked');
  });

  it('blocks a clean verdict of a run that ended in an error', async () => {
    const run = setup();
    const shell = run.f.ctx.container.shell;
    run.f.ctx.container.shell = async (kind: ShellKind, clone: string, script: string, log: string) => {
      await shell(kind, clone, script, log);
      const sha = /--sha (\S+)/.exec(script)?.[1] ?? '';
      writeFileSync(join(clone, 'game', '.factory', 'playtest', 'log.jsonl'), logText({ end: { reason: 'error', message: 'the player truck stalled' } }, { seed: SEED, turns: 100, sha }));
    };
    run.turns = [clean];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('ended in an error at turn 101');
    expect(release(run.f).playtest.passed).toBeNull();
  });

  it('refuses while a release task is open, a recorded one included, or the playtest is blocked, and plays nothing', async () => {
    const open = setup();
    open.f.cards = [{ itemId: 'i', issue: 30, column: 'Testing', labels: ['release-task'] }];
    await expect(playtest(open.f.ctx, 11)).rejects.toThrow('Release tasks are still open: #30');
    const recorded = setup({ tasks: [31] });
    await expect(playtest(recorded.f.ctx, 11)).rejects.toThrow('Release tasks are still open: #31');
    const blocked = setup({ playtest: { ...RELEASE.playtest, blocked: { sha: 'abc1234', reason: 'r' } } });
    await expect(playtest(blocked.f.ctx, 11)).rejects.toThrow('blocked at abc1234');
    expect([...open.shells, ...recorded.shells, ...blocked.shells]).toEqual([]);
  });

  it('spends the play and fails when the harness or the agent wrote nothing', async () => {
    const harness = setup();
    harness.f.ctx.container.shell = async () => undefined;
    await expect(playtest(harness.f.ctx, 11)).rejects.toThrow('wrote no playtest log at');
    expect(release(harness.f).playtest.runs).toBe(1);
    const agent = setup();
    await expect(playtest(agent.f.ctx, 11)).rejects.toThrow('wrote no .factory/playtest.json');
    expect(release(agent.f).playtest).toMatchObject({ runs: 1, passed: null });
  });

  it('plays nothing and spends no play when the clone is not at the release head it read, so the audit never names the wrong commit', async () => {
    const run = setup();
    run.releaseHead = 'def5678';
    await playtest(run.f.ctx, 11);
    expect(run.shells).toEqual([]);
    expect(release(run.f).playtest).toMatchObject({ runs: 0, passed: null, blocked: null });
  });

  it('refuses an issue that is not the tracking issue', async () => {
    const run = setup();
    await expect(playtest(run.f.ctx, 12)).rejects.toThrow('not the tracking issue');
  });
  it('plays a new head after a pass in full', async () => {
    const run = setup({ playtest: { ...RELEASE.playtest, runs: 6, passed: 'old0001' } });
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(run.suites).toEqual(['abc1234']);
    expect(harnessRuns(run)).toHaveLength(2);
    expect(release(run.f).playtest).toMatchObject({ runs: 7, passed: 'abc1234' });
  });
});
