import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type * as Os from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stepScript } from '../activity';
import { EMPTY_STATE, readState, writeState } from '../state';
import { testPoolPin } from '../cpus';
import type { AgentRun, Issue, IssueMerge, Pin, PlaytestState, ReleaseState, ShellKind } from '../types';
import { FIXES_BRANCH, SUITE_BRANCH, auditDir, playtest } from './playtest';
import { SUITE_DOWN_MARK } from './remote-suite';
import { logText } from './playtest-fixtures';
import type { Finding, Review } from './playtest-review';
import { ROOT, fake, issueMerge, reset, type Fake } from './test-fakes';

vi.mock('node:os', async (original) => ({ ...(await original<typeof Os>()), availableParallelism: () => 8 }));

const DAY = '2026-10-07';
const SEED = 20261007;
const PLAYTEST: PlaytestState = { seed: SEED, runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null };
const RELEASE: ReleaseState = { issue: 11, day: DAY, postId: null, candidate: null, removed: [], playtest: PLAYTEST };
const CLONE = join(ROOT, 'work', 'release-playtest');
const HOME = join(CLONE, 'game', '.factory');

const releaseBug: Finding = { id: 'F1', severity: 'important', title: 'Raiders chase forever', evidence: 'turns 300 to 900, v12', cause: 'release', why: 'the raid goal of #12 never ends', known: null, fixed: false, numbers: null };
const oldBug: Finding = { id: 'F2', severity: 'important', title: 'Escorts to a territory never end', evidence: 'v722 from 1259', cause: 'old', why: 'the baseline log has the same unpaid escort at 1300', known: null, fixed: false, numbers: null };
const review = (over: Partial<Review> = {}): string => JSON.stringify({
  verdict: 'clean', summary: 'A full run.', drama: 'A raid at turn 300.', observations: ['trade at turn 20'], suspected: [], limitations: ['far mode'],
  findings: [], fixes: [], explanations: { death: null, quiet: null }, blocker: null, ...over,
});
const fixed = (commit: string): Turn => ({ review: review({ verdict: 'fixed', findings: [releaseBug], fixes: ['end the raid goal after a lost target'] }), commit });
const clean: Turn = { review: review(), report: '## Run\nAll good.' };

type Turn = { review?: string; report?: string; commit?: string; tidy?: boolean };
type Run = {
  f: Fake; shells: { clone: string; script: string; env: Record<string, string>; mounts: Record<string, string>; pin?: Pin }[]; prompts: string[]; sessions: AgentRun['session'][];
  devTip: string; cloneHead: string; turns: Turn[]; checkFailures: number; dirty: string; passedAncestor: boolean; onMain: string[]; changed: string[]; suites: string[]; failingSuites: string[]; replaced: string[];
};

const harnessRuns = (run: Run) => run.shells.filter((shell) => shell.script.includes('progression:playthrough'));
const checkRuns = (run: Run) => run.shells.filter((shell) => shell.script.includes('mkdir -p tmp'));
const POOLS = { cpuLight: 0.125, cpuImplement: 0.375, cpuTest: 0.5, vitestWorkersImplement: 2, vitestWorkersTest: 4 };

function setup(state: Partial<ReleaseState> = {}, start = 'abc1234', merges: IssueMerge[] = []): Run {
  const f = fake();
  f.ctx.cfg = { ...f.ctx.cfg, designModel: 'opus', playtestTurns: 100, playtestRuns: 3, playtestReviewRepairs: 2, gpu: true, suiteStartMinutes: 15, suitePollSeconds: 0, ...POOLS };
  writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), pendingPlaytest: 'now', devMerges: merges, release: { ...RELEASE, ...state, playtest: { ...RELEASE.playtest, ...state.playtest } } });
  const run: Run = {
    f, shells: [], prompts: [], sessions: [], devTip: start, cloneHead: start, turns: [], checkFailures: 0, dirty: '', passedAncestor: true, onMain: [],
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
  f.ctx.repo.headHash = async (name: string) => (name === 'dev' ? run.devTip : name);
  f.ctx.repo.forkPoint = async () => 'main001';
  f.ctx.repo.fetchFromWork = async () => run.cloneHead;
  f.ctx.repo.isMerged = async (commit: string, into: string) => (into === 'main' ? run.onMain.includes(commit) : run.passedAncestor);
  f.ctx.repo.changedFiles = async () => run.changed;
  f.ctx.repo.changedInWork = async () => run.changed;
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
    if (turn.tidy) run.dirty = '';
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
const keptClone = (): string => join(ROOT, 'clone-backups', readdirSync(join(ROOT, 'clone-backups')).find((name) => name.startsWith('playtest-'))!);

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
    expect(run.f.calls).toContain(`prepare dev`);
    expect(readFileSync(join(HOME, 'playtest', 'baseline.jsonl'), 'utf8')).toContain('"sha":"main001"');
    expect(run.prompts[0]).toContain(`seed ${SEED}, 100 turns`);
    expect(run.prompts[0]).toContain('commit abc1234');
    expect(run.prompts[0]).toContain('main001');
    expect(readFileSync(join(HOME, 'open-bugs.md'), 'utf8')).toContain('- #40 Old raider loop');
    expect(checkRuns(run)).toEqual([]);
    expect(pushes(run.f)).toEqual([]);
    expect(release(run.f).playtest).toMatchObject({ runs: 1, passed: { sha: 'abc1234', features: [] }, blocked: null });
    expect(comments(run.f)).toEqual([expect.stringContaining('Release playtest: clean after 1 plays. Seed 20261007, 100 turns, from commit abc1234 to abc1234.\nThe candidate builds from abc1234.')]);
    expect(comments(run.f)[0]).toContain('All good.');
  });

  it('writes the features of the release with their issue text for the agent', async () => {
    const run = setup({}, 'abc1234', [issueMerge(5, 'Salvage chain'), issueMerge(6, 'Hauler chassis')]);
    run.turns = [{ review: review() }];
    await playtest(run.f.ctx, 11);
    const text = readFileSync(join(HOME, 'release-features.md'), 'utf8');
    expect(text).toContain('#5 Salvage chain');
    expect(text).toContain('#6 Hauler chassis');
  });

  it('leaves out a dev merge that main already holds, so a change shipped by hand is never listed again', async () => {
    const shipped = issueMerge(5, 'Salvage chain');
    const run = setup({}, 'abc1234', [shipped, issueMerge(6, 'Hauler chassis')]);
    run.onMain = [shipped.sha];
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(release(run.f).playtest.passed?.features.map((merge) => merge.issue)).toEqual([6]);
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

  it('dispatches the full sha of the release head, though the release tracks it abbreviated', async () => {
    const run = setup();
    run.turns = [clean];
    run.f.ctx.repo.fullHash = async (commit: string) => commit.padEnd(40, 'f');
    await playtest(run.f.ctx, 11);
    expect(run.suites).toEqual(['abc1234'.padEnd(40, 'f')]);
    expect(run.suites[0]).toMatch(/^abc1234[0-9a-f]{33}$/);
  });

  it('gives a failed release suite to the agent after the first play, then checks its fix on GitHub Actions', async () => {
    const run = setup();
    run.failingSuites = ['abc1234'];
    run.turns = [clean, { commit: 'fix0001' }, clean];
    await playtest(run.f.ctx, 11);
    expect(run.prompts[1]).toContain('The factory checks failed on abc1234');
    expect(readFileSync(join(HOME, 'check-failure.md'), 'utf8')).toContain('FAIL src/sim/raid.test.ts at abc1234');
    expect(run.suites).toEqual(['abc1234', 'fix0001']);
    expect(run.replaced).toEqual([`fix0001 ${SUITE_BRANCH}`, `fix0001 ${FIXES_BRANCH}`]);
    expect(run.replaced.filter((entry) => entry.endsWith(FIXES_BRANCH))).toEqual([`fix0001 ${FIXES_BRANCH}`]);
    expect(release(run.f).playtest.fixes).toBe('fix0001');
    expect(release(run.f).playtest).toMatchObject({ runs: 2, passed: { sha: 'fix0001', features: [] } });
  });

  it('fails as a machine failure when the suite cannot run on GitHub Actions', async () => {
    const run = setup();
    run.turns = [clean];
    run.f.ctx.github.dispatchSuite = async () => { throw new Error('HTTP 503'); };
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow(SUITE_DOWN_MARK);
    expect(release(run.f).playtest.passed).toBeNull();
  });

  it('plays the last commit the release passed as the baseline once it has one', async () => {
    const run = setup({ playtest: { ...RELEASE.playtest, runs: 3, passed: { sha: 'old0001', features: [] } } });
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(harnessRuns(run)[1].script).toContain('--sha old0001');
    expect(run.f.calls).toContain(`run -C ${join(ROOT, 'work', 'release-baseline')} checkout --quiet --detach old0001`);
    expect(run.prompts[0]).toContain('old0001, the last commit a playtest passed');
  });

  it('replays the seed on the fixes in the same session, checks them, pushes the reviewed commit and passes it', async () => {
    const run = setup();
    run.turns = [fixed('fix0001'), clean];
    await playtest(run.f.ctx, 11);
    expect(harnessRuns(run).map((shell) => /--sha (\S+)/.exec(shell.script)?.[1])).toEqual(['abc1234', 'main001', 'fix0001']);
    expect(run.prompts[1]).toContain('commit fix0001');
    expect(run.prompts[1]).toContain('`.factory/playtest.json` has exactly this shape.');
    expect(run.sessions[0]).toMatchObject({ resume: false });
    expect(run.sessions[1]).toEqual({ ...run.sessions[0], resume: true });
    expect(checkRuns(run)).toHaveLength(1);
    expect(checkRuns(run)[0]).toMatchObject({ clone: CLONE, env: { BUILD_SCOPE: 'fix0001', TEST_STALL_MINUTES: '15' }, pin: testPoolPin(POOLS) });
    expect(checkRuns(run)[0].script).toContain('npm run playtest -- --no-fps-gate');
    expect(checkRuns(run)[0].script).not.toContain('test:cached');
    expect(run.suites).toEqual(['abc1234', 'fix0001']);
    expect(run.replaced).toEqual([`fix0001 ${SUITE_BRANCH}`, `fix0001 ${FIXES_BRANCH}`]);
    expect(run.replaced.filter((entry) => entry.endsWith(FIXES_BRANCH))).toEqual([`fix0001 ${FIXES_BRANCH}`]);
    expect(release(run.f).playtest.fixes).toBe('fix0001');
    expect(run.f.created).toEqual([]);
    expect(release(run.f).playtest).toMatchObject({ runs: 2, passed: { sha: 'fix0001', features: [] }, blocked: null });
    expect(comments(run.f)[0]).toContain('- play 1 at abc1234: 1 fixes to replay. Fixes: end the raid goal after a lost target');
    expect(comments(run.f)[0]).toContain('- play 2 at fix0001: clean');
    expect(comments(run.f)[0]).toContain('The factory checks passed on the fixes. They are on ' + FIXES_BRANCH + ', and the merge job lands them on dev. The candidate builds from fix0001.');
  });

  it('passes a replay whose review keeps the fixed release finding marked fixed, and blocks a first play that marks one fixed', async () => {
    const run = setup();
    run.turns = [fixed('fix0001'), { review: review({ findings: [{ ...releaseBug, fixed: true }] }) }];
    await playtest(run.f.ctx, 11);
    expect(release(run.f).playtest).toMatchObject({ runs: 2, passed: { sha: 'fix0001', features: [] }, blocked: null });
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
    expect(release(run.f).playtest.passed?.sha).toBe('abc1234');
    expect(comments(run.f)[0]).toContain('Old bugs opened: #11');
  });

  it('opens a dev bug with the numbers for a balance finding of either cause, passes the release and lists the numbers in the report', async () => {
    const run = setup();
    const shift: Finding = { id: 'F5', severity: 'balance', title: 'Raid survival fell', evidence: 'raids at turns 300 to 900', cause: 'release', why: 'the raid goal of #12 changed', known: null, fixed: false, numbers: { head: 'survived 31 of 50 raids', baseline: 'survived 44 of 50 raids' } };
    run.turns = [{ review: review({ findings: [shift, { ...shift, id: 'F6', title: 'Known shift', known: 41 }] }) }];
    await playtest(run.f.ctx, 11);
    expect(run.f.created).toEqual([{ title: 'Raid survival fell', body: expect.stringContaining('On the head abc1234: survived 31 of 50 raids\nOn the baseline main001: survived 44 of 50 raids'), labels: ['bug'] }]);
    expect(release(run.f).playtest.passed?.sha).toBe('abc1234');
    expect(comments(run.f)[0]).toContain('Raid survival fell: head survived 31 of 50 raids. Baseline survived 44 of 50 raids.');
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
    expect(run.replaced.filter((entry) => entry.endsWith(FIXES_BRANCH))).toEqual([`fix0002 ${FIXES_BRANCH}`]);
    expect(release(run.f).playtest.fixes).toBe('fix0002');
    expect(release(run.f).playtest).toMatchObject({ runs: 3, passed: { sha: 'fix0002', features: [] } });
  });

  it('sends uncommitted changes back to the agent instead of checking them', async () => {
    const run = setup();
    run.dirty = ' M game/src/a.ts';
    run.turns = [fixed('fix0001'), clean, { commit: 'fix0001' }];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('the agent committed no fix for them');
    expect(readFileSync(join(keptClone(), 'game', '.factory', 'check-failure.md'), 'utf8')).toContain('not committed');
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

  it('never merges main into dev, so main waits for the ship', async () => {
    const run = setup();
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(run.f.calls.some((call) => call.startsWith('merge'))).toBe(false);
    expect(release(run.f).playtest).toMatchObject({ passed: { sha: 'abc1234', features: [] } });
  });

  it('blocks the release and fails on a blocked verdict, with the report on the tracking issue', async () => {
    const run = setup();
    run.turns = [{ review: review({ verdict: 'blocked', blocker: 'Should raiders give up at night? A design call.' }) }];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('Release playtest blocked: Should raiders give up at night?');
    expect(release(run.f).playtest.blocked).toEqual({ sha: 'abc1234', reason: 'Should raiders give up at night? A design call.' });
    expect(run.f.created).toEqual([]);
    expect(comments(run.f)[0]).toContain('The release is blocked');
  });

  it('logs the minutes of the release and the baseline seed runs, so a slow run shows in the playtest log', async () => {
    const run = setup();
    let clock = Date.parse('2026-10-30T18:48:00Z');
    run.f.ctx.now = () => new Date(clock);
    const shell = run.f.ctx.container.shell;
    run.f.ctx.container.shell = async (kind: ShellKind, clone: string, script: string, log: string) => {
      await shell(kind, clone, script, log);
      if (script.includes('Playing the release seed')) clock += 56 * 60_000;
    };
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(run.f.logs).toContain('playtest 11 Playing the release seed at abc1234 took 56 minutes with npm ci');
    expect(run.f.logs.some((line) => /^playtest 11 Playing the baseline seed at main001 took \d+ minutes with npm ci$/.test(line))).toBe(true);
  });

  it('logs the minutes of a seed run that failed, since the slowest runs are the ones that hit a limit', async () => {
    const run = setup();
    run.f.ctx.container.shell = async () => { throw new Error('the checks timed out'); };
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('the checks timed out');
    expect(run.f.logs).toContain('playtest 11 Playing the release seed at abc1234 failed 0 minutes with npm ci');
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

  it('refuses a blocked playtest, and fixes that dev does not hold yet, and plays nothing', async () => {
    const blocked = setup({ playtest: { ...RELEASE.playtest, blocked: { sha: 'abc1234', reason: 'r' } } });
    await expect(playtest(blocked.f.ctx, 11)).rejects.toThrow('blocked at abc1234');
    const waiting = setup({ playtest: { ...RELEASE.playtest, fixes: 'fix0009' } });
    waiting.passedAncestor = false;
    await expect(playtest(waiting.f.ctx, 11)).rejects.toThrow('The playtest fixes at fix0009 are not on dev yet');
    expect([...blocked.shells, ...waiting.shells]).toEqual([]);
  });

  it('spends the play and fails when the harness or the agent wrote nothing', async () => {
    const harness = setup();
    harness.f.ctx.container.shell = async () => undefined;
    await expect(playtest(harness.f.ctx, 11)).rejects.toThrow('wrote no playtest log at');
    expect(release(harness.f).playtest.runs).toBe(1);
    const agent = setup();
    await expect(playtest(agent.f.ctx, 11)).rejects.toThrow('still breaks its rules after 2 repairs:\nThe playtest agent wrote no .factory/playtest.json');
    expect(agent.prompts).toHaveLength(3);
    expect(release(agent.f).playtest).toMatchObject({ runs: 1, passed: null });
  });

  it('counts plays per job, so plays of earlier jobs never read as spent plays of this one', async () => {
    const run = setup({ playtest: { ...RELEASE.playtest, runs: 3 } });
    run.turns = [fixed('fix0001'), clean];
    await playtest(run.f.ctx, 11);
    expect(run.prompts[0]).toContain('This is play 1 of at most 3 in this job.');
    expect(run.prompts[1]).toContain('This is play 2 of at most 3 in this job.');
    const history = readFileSync(join(HOME, 'playtest-history.md'), 'utf8');
    expect(history).toContain('# Plays of earlier jobs on this release\nTheir run numbers count across the release. They count toward no play limit of this job.\n- run 1: no record');
    expect(release(run.f).playtest).toMatchObject({ runs: 5, passed: { sha: 'fix0001', features: [] } });
  });

  it('writes the review rules with the baseline for the agent to read again before it writes the review', async () => {
    const run = setup();
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    const rules = readFileSync(join(HOME, 'playtest-review.md'), 'utf8');
    expect(rules).toContain('`git diff main001...HEAD`');
    expect(rules).toContain('"severity": "important" | "minor"');
    expect(run.prompts[0]).toContain(rules.trim());
    expect(run.prompts[0]).toContain('Read `.factory/playtest-review.md` again right before you write `.factory/playtest.json`');
  });

  it('sends a review that breaks its rules back to the same session with every error and the rules, and plays nothing again', async () => {
    const run = setup();
    const broken = review({ findings: [{ ...releaseBug, severity: 'medium' as 'minor', fixed: 'abc' as unknown as boolean }], fixes: [{ commit: 'x' } as unknown as string] });
    run.turns = [{ review: broken }, clean];
    const onDisk: string[] = [];
    const agent = run.f.ctx.container.agent;
    run.f.ctx.container.agent = async (agentRun: AgentRun) => {
      if (agentRun.prompt.includes('could not read')) onDisk.push(readFileSync(join(HOME, 'playtest.json'), 'utf8'));
      return agent(agentRun);
    };
    await playtest(run.f.ctx, 11);
    expect(run.prompts).toHaveLength(2);
    expect(run.prompts[1]).toContain('- The fixes list holds an item that is not a string\n- Finding F1 has severity medium, not important, minor or balance\n- Finding F1 has fixed abc, not true or false');
    expect(run.prompts[1]).toContain('Never pick `minor`, `balance` or `old` only to make the file read.');
    expect(run.prompts[1]).toContain(readFileSync(join(HOME, 'playtest-review.md'), 'utf8').trim());
    expect(onDisk).toEqual([broken]);
    expect(run.sessions[1]).toEqual({ ...run.sessions[0], resume: true });
    expect(harnessRuns(run)).toHaveLength(2);
    expect(release(run.f).playtest).toMatchObject({ runs: 1, passed: { sha: 'abc1234', features: [] }, blocked: null });
  });

  it('fails with every error left when the review still breaks its rules after the repairs, and spends no other play', async () => {
    const run = setup();
    run.turns = [{ review: review({ findings: [{ ...releaseBug, severity: 'medium' as 'minor', cause: 'both' as 'old' }] }) }, {}, {}];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('The playtest review still breaks its rules after 2 repairs:\nFinding F1 has severity medium, not important, minor or balance\nFinding F1 has cause both, not release or old');
    expect(run.prompts).toHaveLength(3);
    expect(harnessRuns(run)).toHaveLength(2);
    expect(release(run.f).playtest).toMatchObject({ runs: 1, passed: null });
  });

  it('refuses an issue that is not the tracking issue', async () => {
    const run = setup();
    await expect(playtest(run.f.ctx, 12)).rejects.toThrow('not the tracking issue');
  });
  it('plays a new head after a pass in full', async () => {
    const run = setup({ playtest: { ...RELEASE.playtest, runs: 6, passed: { sha: 'old0001', features: [] } } });
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(run.suites).toEqual(['abc1234']);
    expect(harnessRuns(run)).toHaveLength(2);
    expect(release(run.f).playtest).toMatchObject({ runs: 7, passed: { sha: 'abc1234', features: [] } });
  });
});

const WORK = { start: 'abc1234', baseline: 'main001', features: [issueMerge(5, 'Salvage chain')], session: 'sess-1', plays: 1 };
const keptPlaytest = { ...PLAYTEST, runs: 2, lastStart: { sha: 'abc1234', at: '2026-10-06T10:00:00.000Z' }, work: WORK };

function keepClone(run: Run, transcript = true): void {
  mkdirSync(join(HOME, 'playtest'), { recursive: true });
  writeFileSync(join(HOME, 'playtest', 'baseline.jsonl'), 'baseline from the first play');
  if (!transcript) return;
  mkdirSync(join(ROOT, 'sessions', 'playtest', 'project'), { recursive: true });
  writeFileSync(join(ROOT, 'sessions', 'playtest', 'project', 'sess-1.jsonl'), '{}');
  run.f.calls.length = 0;
}

describe('playtest on the dev tip with kept work', () => {
  it('starts on the dev tip, stores the start, the baseline and the features it contains, and clears the order', async () => {
    const merges = [issueMerge(5, 'Salvage chain'), issueMerge(6, 'Hauler chassis', { reverted: ['rev1'] })];
    const run = setup({ removed: [7] }, 'abc1234', [...merges, issueMerge(7, 'Removed card')]);
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    const state = readState(run.f.ctx.statePath);
    expect(state.pendingPlaytest).toBeNull();
    expect(state.release?.playtest).toMatchObject({ lastStart: { sha: 'abc1234', at: run.f.ctx.now().toISOString() }, passed: { sha: 'abc1234', features: [merges[0]] }, fixes: null, work: null, decision: null });
    expect(run.f.calls).toContain('run -C ' + CLONE + ' checkout --quiet -B ' + FIXES_BRANCH + ' abc1234');
    expect(run.replaced).toEqual([]);
  });

  it('keeps the features out of a start that does not contain them', async () => {
    const run = setup({}, 'abc1234', [issueMerge(5, 'Salvage chain')]);
    run.passedAncestor = false;
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(release(run.f).playtest.passed).toEqual({ sha: 'abc1234', features: [] });
  });

  it('keeps the clone and the record when the job dies, and the next job resumes both without a new play of the first kind', async () => {
    const first = setup({}, 'abc1234', [WORK.features[0]]);
    first.f.ctx.container.shell = async (_kind: ShellKind, clone: string, script: string) => {
      if (script.includes('progression:playthrough')) {
        const log = join(clone, 'game', '.factory', 'playtest', 'log.jsonl');
        mkdirSync(join(log, '..'), { recursive: true });
        writeFileSync(log, logText({}, { seed: SEED, turns: 100, sha: /--sha (\S+)/.exec(script)?.[1] ?? '' }));
      }
    };
    first.f.ctx.container.agent = async () => { throw new Error('the container died'); };
    await expect(playtest(first.f.ctx, 11)).rejects.toThrow('the container died');
    const died = release(first.f).playtest;
    expect(died.work).toMatchObject({ start: 'abc1234', baseline: 'main001', plays: 1, features: [WORK.features[0]] });
    expect(existsSync(CLONE)).toBe(true);
    const sessionId = died.work!.session;

    const second = setup({ playtest: died }, 'def5678', [WORK.features[0]]);
    second.f.ctx.container.shell = first.f.ctx.container.shell;
    second.cloneHead = 'abc1234';
    second.f.calls.length = 0;
    second.turns = [{}, clean];
    await playtest(second.f.ctx, 11);
    expect(second.f.calls.some((call) => call.startsWith('prepare'))).toBe(false);
    expect(second.sessions.map((session) => session?.id)).toEqual([sessionId, sessionId]);
    expect(second.prompts[0]).toContain('You are back in your own session');
    expect(second.prompts[1]).toContain('This is play 2 of at most 3 in this job.');
    expect(release(second.f).playtest).toMatchObject({ runs: 2, passed: { sha: 'abc1234', features: [WORK.features[0]] }, work: null });
  });

  it('resumes the clone, its outputs and its session, and plays the head only', async () => {
    const run = setup({ playtest: keptPlaytest }, 'abc1234');
    run.devTip = 'def5678';
    keepClone(run);
    run.turns = [{}, clean];
    await playtest(run.f.ctx, 11);
    expect(run.f.calls.some((call) => call.startsWith('prepare'))).toBe(false);
    expect(run.sessions[0]).toMatchObject({ id: 'sess-1', resume: true });
    expect(run.prompts[0]).toContain('1 of at most 3 plays are spent');
    expect(run.prompts[0]).toContain('This job plays 2 more.');
    expect(harnessRuns(run).map((shell) => /--sha (\S+)/.exec(shell.script)?.[1])).toEqual(['abc1234']);
    expect(readFileSync(join(HOME, 'playtest', 'baseline.jsonl'), 'utf8')).toBe('baseline from the first play');
    expect(readFileSync(join(HOME, 'release-features.md'), 'utf8')).toContain('#5 Salvage chain');
    expect(release(run.f).playtest).toMatchObject({ lastStart: keptPlaytest.lastStart, passed: { sha: 'abc1234', features: WORK.features }, work: null });
    expect(existsSync(join(ROOT, 'sessions', 'playtest'))).toBe(false);
  });

  it('counts plays across the resumed jobs, so the last play of the record can only pass or block', async () => {
    const run = setup({ playtest: { ...keptPlaytest, work: { ...WORK, plays: 2 } } }, 'abc1234');
    keepClone(run);
    run.turns = [{}, fixed('fix0001')];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('The last play left fixes that no play checked');
    expect(harnessRuns(run)).toHaveLength(1);
    expect(run.prompts[1]).toContain('This is play 3 of at most 3 in this job.');
    expect(run.replaced).toEqual([]);
  });

  it('blocks at once when the earlier jobs spent every play, and plays nothing', async () => {
    const run = setup({ playtest: { ...keptPlaytest, work: { ...WORK, plays: 3 } } }, 'abc1234');
    keepClone(run);
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('spent all 3 plays and died before the end');
    expect(run.shells).toEqual([]);
    expect(run.prompts).toEqual([]);
    expect(release(run.f).playtest).toMatchObject({ blocked: { sha: 'abc1234' }, work: null });
  });

  it('hands the dirty clone to the agent first and refuses to play a tree that is still dirty', async () => {
    const run = setup({ playtest: keptPlaytest }, 'abc1234');
    keepClone(run);
    run.dirty = ' M game/src/half.ts';
    run.turns = [{ tidy: true }, clean];
    await playtest(run.f.ctx, 11);
    expect(run.prompts[0]).toContain(' M game/src/half.ts');
    const stuck = setup({ playtest: keptPlaytest }, 'abc1234');
    keepClone(stuck);
    stuck.dirty = ' M game/src/half.ts';
    stuck.turns = [{}];
    await expect(playtest(stuck.f.ctx, 11)).rejects.toThrow('left uncommitted changes in the resumed playtest clone');
    expect(harnessRuns(stuck)).toEqual([]);
    expect(release(stuck.f).playtest.work).toEqual(WORK);
  });

  it('moves a kept clone of another baseline to the clone backups and starts a fresh record and session', async () => {
    const run = setup({ playtest: { ...keptPlaytest, work: { ...WORK, baseline: 'older00' } } }, 'abc1234');
    keepClone(run);
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    expect(readdirSync(join(ROOT, 'clone-backups')).some((name) => name.startsWith('playtest-'))).toBe(true);
    expect(run.f.calls.some((call) => call.startsWith('prepare'))).toBe(true);
    expect(run.sessions[0]).toMatchObject({ resume: false });
    expect(run.sessions[0]!.id).not.toBe('sess-1');
    expect(harnessRuns(run)).toHaveLength(2);
  });

  it('sets a blocked clone aside with its commits and drops the record and the session', async () => {
    const run = setup();
    run.turns = [{ review: review({ verdict: 'blocked', blocker: 'a design call' }) }];
    await expect(playtest(run.f.ctx, 11)).rejects.toThrow('Release playtest blocked');
    expect(release(run.f).playtest.work).toBeNull();
    expect(existsSync(CLONE)).toBe(false);
    expect(readdirSync(join(ROOT, 'clone-backups')).some((name) => name.startsWith('playtest-'))).toBe(true);
  });

  it('shows the agent only the newest decision with its author', async () => {
    const decision = { by: 'Boris', at: '2026-10-07T09:00:00.000Z', text: 'Raiders may chase at night.' };
    const run = setup({ playtest: { ...PLAYTEST, decision } });
    run.turns = [clean];
    await playtest(run.f.ctx, 11);
    const history = readFileSync(join(HOME, 'playtest-history.md'), 'utf8');
    expect(history).toContain('# Decision for this playtest\nWritten by Boris at 2026-10-07T09:00:00.000Z:\nRaiders may chase at night.');
    expect(history).not.toContain('Decisions of the committee');
    expect(release(run.f).playtest.decision).toBeNull();
  });
});
