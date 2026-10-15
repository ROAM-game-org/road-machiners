import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendLedger } from './ledger';
import { openStore } from './public/store';
import { EMPTY_STATE, readState, writeState } from './state';
import { ROOT, fake, reset, type Fake } from './stages/test-fakes';

vi.mock('./control', async (importOriginal) => ({
  DROP_QUEUES: (await importOriginal<{ DROP_QUEUES: readonly string[] }>()).DROP_QUEUES,
  resolveActor: (_ctx: unknown, by: string, gated: boolean) => {
    if (by === 'hermes' && gated) throw new Error('hermes cannot order this');
    if (by !== 'hermes' && by !== 'ann') throw new Error(`unknown actor ${by}`);
    return by;
  },
  isGated: (_ctx: unknown, command: { action: string }) => command.action === 'ship',
  writeControl: (home: string, command: unknown, now: Date) => {
    mkdirSync(join(home, 'inbox'), { recursive: true });
    const path = join(home, 'inbox', `${now.getTime()}-control.json`);
    writeFileSync(path, JSON.stringify({ kind: 'control', ...(command as object) }));
    return path;
  },
}));
const repairs: unknown[] = [];
vi.mock('./repair-clone', () => ({ repairClone: async (_ctx: unknown, order: unknown) => { repairs.push(order); return ['repaired']; } }));
const { runCtl } = await import('./ctl');

let out: string[];
beforeEach(() => {
  reset();
  out = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => void out.push(line));
});
afterEach(() => vi.restoreAllMocks());

const run = (f: Fake, ...args: string[]) => runCtl(f.ctx, args);
const inbox = () => (existsSync(join(ROOT, 'inbox')) ? readdirSync(join(ROOT, 'inbox')) : []);
const stored = () => JSON.parse(readFileSync(join(ROOT, 'inbox', inbox()[0]), 'utf8'));

describe('argument errors', () => {
  it('rejects an unknown command and points to help', async () => {
    await expect(run(fake(), 'dance')).rejects.toThrow('factory help');
    await expect(runCtl(fake().ctx, [])).rejects.toThrow('factory help');
  });

  it('rejects a bad issue number and a bad position', async () => {
    await expect(run(fake(), 'move', 'x', 'design', '--by', 'ann', '--reason', 'r')).rejects.toThrow('not an issue number');
    await expect(run(fake(), 'move', '5', 'limbo', '--by', 'ann', '--reason', 'r')).rejects.toThrow('Unknown position');
    await expect(run(fake(), 'drop', 'bin', '5', '--by', 'ann', '--reason', 'r')).rejects.toThrow('Unknown queue');
    expect(inbox()).toEqual([]);
  });

  it('needs --by and --reason on every write command', async () => {
    await expect(run(fake(), 'move', '5', 'design', '--reason', 'r')).rejects.toThrow('Missing --by');
    await expect(run(fake(), 'move', '5', 'design', '--by', 'ann')).rejects.toThrow('Missing --reason');
    await expect(run(fake(), 'move', '5', 'design', '--by', 'ann', '--reason')).rejects.toThrow('Missing --reason');
    expect(inbox()).toEqual([]);
  });

  it('refuses an unknown actor and a gated order from hermes before writing', async () => {
    await expect(run(fake(), 'cut', '--by', 'bob', '--reason', 'r')).rejects.toThrow('unknown actor');
    await expect(run(fake(), 'ship', '--by', 'hermes', '--reason', 'r')).rejects.toThrow('cannot order');
    expect(inbox()).toEqual([]);
  });
});

describe('write commands', () => {
  it('leaves one inbox file and says it applies on the next tick', async () => {
    await run(fake(), 'move', '5', 'design', '--reason', 'gate failed on load', '--by', 'hermes');
    expect(stored()).toEqual({ kind: 'control', action: 'move', issue: 5, to: 'design', by: 'hermes', reason: 'gate failed on load' });
    expect(out[0]).toContain('next tick');
  });

  it.each([
    [['merge', '5'], { action: 'merge', issue: 5 }],
    [['ship'], { action: 'ship' }],
    [['cut'], { action: 'cut' }],
    [['remove', '5'], { action: 'remove', issue: 5 }],
    [['drop', 'approval', '5'], { action: 'drop', queue: 'approval', id: 5 }],
    [['drop', 'ship'], { action: 'drop', queue: 'ship', id: null }],
    [['merge-change', '9'], { action: 'merge-change', id: 9 }],
    [['pause-card', '5'], { action: 'hold', issue: 5 }],
    [['resume-card', '5'], { action: 'unhold', issue: 5 }],
  ])('%j writes %j', async (args, action) => {
    await run(fake(), ...args, '--by', 'ann', '--reason', 'because');
    expect(stored()).toEqual({ kind: 'control', ...action, by: 'ann', reason: 'because' });
  });
});

describe('write commands while paused', () => {
  it('still writes the order and says it waits for the pause to lift', async () => {
    const f = fake();
    writeFileSync(join(ROOT, 'paused'), JSON.stringify({ kind: 'factory', note: 'fixing state', by: 'cli', at: '2026-01-01T00:00:00.000Z' }));
    await run(f, 'cut', '--by', 'ann', '--reason', 'r');
    expect(stored()).toMatchObject({ action: 'cut' });
    expect(out.join('\n')).toContain('The factory is paused: fixing state.');
    expect(out.join('\n')).toContain('applies when the pause is lifted');
  });
});

describe('read commands', () => {
  function board(): Fake {
    const f = fake();
    f.cards = [
      { itemId: 'i5', issue: 5, column: 'Design', labels: ['hotfix'] },
      { itemId: 'i6', issue: 6, column: 'Approval', labels: [] },
    ];
    return f;
  }

  it('audit prints nothing on a clean factory', async () => {
    const f = board();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), approvalPosts: { '77': 6 } });
    await run(f, 'audit');
    expect(out).toEqual([]);
  });

  it('audit prints only the drift lines', async () => {
    writeState(fake().ctx.statePath, { ...structuredClone(EMPTY_STATE), postOnly: [5] });
    await run(board(), 'audit');
    expect(out).toEqual(['#5 waits for a post but column Design', '#6 column Approval but no open post and no approval']);
  });

  it('audit skips a card with a running job, and card still shows its drift and the job', async () => {
    const f = board();
    const running = { id: 'j', stage: 'checks' as const, issue: 5, pid: 1, startedAt: '2026-01-01T00:00:00Z', log: 'l' };
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), postOnly: [5], jobs: [running], approvalPosts: { '77': 6 } });
    await run(f, 'audit');
    expect(out).toEqual([]);
    await run(f, 'card', '5');
    expect(out).toContain('drift: #5 waits for a post but column Design');
    expect(out).toContain('note: a checks job is running, so the drift above may pass in seconds');
  });

  it('audit and the other read commands change no store', async () => {
    const f = board();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), postOnly: [5] });
    const before = readFileSync(f.ctx.statePath, 'utf8');
    for (const args of [['audit'], ['cards'], ['card', '5'], ['jobs'], ['queues'], ['release'], ['failures'], ['stuck'], ['help']]) await run(f, ...args);
    expect(readFileSync(f.ctx.statePath, 'utf8')).toBe(before);
    expect(f.calls.filter((call) => /^(comment|move|removeLabel|editIssue)/.test(call))).toEqual([]);
    expect(inbox()).toEqual([]);
  });

  it('cards lists each card with its position', async () => {
    await run(board(), 'cards');
    expect(out).toEqual(['#5 design Design [hotfix]', '#6 approval Approval []']);
  });

  it('card prints one fact per line and its drift', async () => {
    const f = board();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), postOnly: [5], builds: { '5': 'abc1234' } });
    await run(f, 'card', '5');
    expect(out).toContain('position: design');
    expect(out).toContain('labels: hotfix');
    expect(out).toContain('post only: yes');
    expect(out).toContain('build: abc1234');
    expect(out).toContain('drift: #5 waits for a post but column Design');
    await expect(run(f, 'card', '99')).rejects.toThrow('No card');
  });

  it('shows a hold in cards, card, status and audit', async () => {
    const f = board();
    f.ctx.cfg.publicUrl = 'https://play.test';
    f.ctx.fetch = (async () => new Response('{"jobs":[]}')) as unknown as typeof fetch;
    const hold = { by: 'Ann', reason: 'release tasks first', at: '2026-01-01T00:00:00Z', stage: 'design' as const };
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), approvalPosts: { '77': 6 }, held: { '5': hold, '9': hold } });
    await run(f, 'cards');
    expect(out).toContain('#5 design Design [hotfix] held by Ann: release tasks first');
    out.length = 0;
    await run(f, 'card', '5');
    expect(out).toContain('held: by Ann since 2026-01-01T00:00:00Z, stopped design: release tasks first');
    out.length = 0;
    await run(f, 'status');
    expect(JSON.parse(out.join('\n')).held).toEqual([{ issue: 5, ...hold }, { issue: 9, ...hold }]);
    out.length = 0;
    await run(f, 'audit');
    expect(out).toEqual(['#9 held by Ann (release tasks first) but not on the board']);
  });

  it('audit flags a job that runs on a held card, though it skips the card drift of a card with a job', async () => {
    const f = board();
    const hold = { by: 'Ann', reason: 'r', at: 'a', stage: null };
    const job = { id: 'j', stage: 'design' as const, issue: 5, pid: 1, startedAt: 'a', log: 'l' };
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), approvalPosts: { '77': 6 }, held: { '5': hold }, jobs: [job] });
    await run(f, 'audit');
    expect(out).toEqual(['#5 held by Ann (r) but a design job is running']);
  });

  it('stuck and card print the sweep record, failures prints a merge batch, and stuck shows a sweep crash', async () => {
    const f = board();
    const record = { incident: '5:merge:t', stage: 'merge' as const, error: 'timed out after 240 minutes\nmore', cause: 'timeout' as const, log: '/m.log', batch: 10, since: 't', column: 'Merging' as const, kind: 'merge-batch' as const, tries: 1, released: 'r', refused: null };
    const merge = { stage: 'merge' as const, issue: null, error: 'timed out after 240 minutes', cause: 'timeout' as const, log: '/m.log', at: 't', batch: [5, 7] };
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), stuck: { '5': record }, failures: [merge], sweepError: 'boom\nmore' });
    await run(f, 'stuck');
    expect(out).toEqual(['sweep error: boom', '#5 merge-batch in Merging, incident 5:merge:t, tries 1, released r: timed out after 240 minutes (cause timeout, log /m.log)']);
    out.length = 0;
    await run(f, 'card', '5');
    expect(out).toContain('stuck sweep: merge-batch in Merging, incident 5:merge:t, tries 1, released r: timed out after 240 minutes (cause timeout, log /m.log)');
    out.length = 0;
    await run(f, 'failures');
    expect(out).toEqual(['t merge: timed out after 240 minutes (cause timeout, log /m.log) batch #5,#7']);
  });

  it('help lists every command', async () => {
    await run(fake(), 'help');
    for (const name of ['status', 'cards', 'card N', 'jobs', 'queues', 'release', 'failures', 'stuck', 'log N', 'audit', 'public', 'move N', 'merge N', 'ship', 'cut', 'remove N', 'drop', 'merge-change', 'pause-card N', 'resume-card N', 'retry N', 'pause', 'resume', 'repair-clone N']) {
      expect(out.some((line) => line.startsWith(name))).toBe(true);
    }
  });

  it('public prints the proposals and the open build posts, and none when there are none', async () => {
    const f = fake();
    f.ctx.cfg.voteEmoji = '👍';
    f.ctx.cfg.minVotes = 3;
    await run(f, 'public');
    expect(out).toEqual(['none']);
    const store = openStore(ROOT);
    store.addProposal(7, 'Winch\nPulls.', f.ctx.now());
    store.close();
    out = [];
    await run(f, 'public');
    expect(out).toEqual(['#7 proposal not posted yet: Winch']);
  });

  it('status asks the dashboard with the curl agent', async () => {
    const f = fake();
    f.ctx.cfg.publicUrl = 'https://play.test';
    const fetchMock = vi.fn(async () => new Response('{"jobs":[]}'));
    f.ctx.fetch = fetchMock as unknown as typeof fetch;
    await run(f, 'status');
    expect(fetchMock).toHaveBeenCalledWith('https://play.test/factory/api/snapshot', { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0' } });
    expect(out.join('\n')).toContain('"jobs"');
  });

  it('log prints the tail of the newest log that the state and the ledger record for the issue', async () => {
    const f = fake();
    const logs = join(ROOT, 'logs');
    mkdirSync(logs, { recursive: true });
    const file = (name: string, text: string): string => {
      writeFileSync(join(logs, name), text);
      return join(logs, name);
    };
    const done = file('first.log', 'old\n');
    const failed = file('second.log', 'failed\n');
    const running = file('third.log', `${Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n')}\n`);
    file('other.log', 'other\n');
    appendLedger(ROOT, { kind: 'job', id: 'a', stage: 'design', issue: 5, startedAt: '2026-10-01T00:00:00Z', endedAt: '2026-10-01T01:00:00Z', outcome: 'done', log: done, agents: [] });
    appendLedger(ROOT, { kind: 'job', id: 'o', stage: 'design', issue: 6, startedAt: '2026-10-09T00:00:00Z', endedAt: '2026-10-09T01:00:00Z', outcome: 'done', log: join(logs, 'other.log'), agents: [] });
    writeState(join(ROOT, 'state.json'), {
      ...structuredClone(EMPTY_STATE),
      failures: [{ stage: 'implement', issue: 5, error: 'boom', cause: null, log: failed, at: '2026-10-02T00:00:00Z' }],
      jobs: [{ id: 'c', stage: 'verify', issue: 5, pid: 1, startedAt: '2026-10-03T00:00:00Z', log: running }],
    });
    await run(f, 'log', '5');
    expect(out[0]).toContain('third.log');
    expect(out[1]).toContain('line 79');
    expect(out[1]).not.toContain('line 0\n');
    await run(f, 'log', '5', 'implement');
    expect(out[2]).toContain('second.log');
    await run(f, 'log', '5', 'design');
    expect(out[4]).toContain('first.log');
    await expect(run(f, 'log', '7')).rejects.toThrow('No log');
  });

  it('log names a recorded log whose file is gone and reads a ledger line with no log as no record', async () => {
    const f = fake();
    appendLedger(ROOT, { kind: 'job', id: 'a', stage: 'design', issue: 5, startedAt: '2026-10-01T00:00:00Z', endedAt: '2026-10-01T01:00:00Z', outcome: 'done', agents: [] });
    await expect(run(f, 'log', '5')).rejects.toThrow('No log');
    appendLedger(ROOT, { kind: 'job', id: 'b', stage: 'design', issue: 5, startedAt: '2026-10-02T00:00:00Z', endedAt: '2026-10-02T01:00:00Z', outcome: 'done', log: join(ROOT, 'logs', 'gone.log'), agents: [] });
    await expect(run(f, 'log', '5')).rejects.toThrow('the file is gone');
  });
});

const RELEASE = { issue: 20, branch: 'release/2026-09-29', day: '2026-09-29', postId: null, candidateSha: null, removed: [], tasks: [], merges: [] };

describe('immediate commands', () => {
  it('retry removes the stuck label and only that card failures', async () => {
    const f = fake();
    const failure = (issue: number) => ({ stage: 'checks' as const, issue, error: 'boom', cause: 'error' as const, log: null, at: '2026-09-29T09:00:00Z' });
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), failures: [failure(5), failure(6)] });
    await run(f, 'retry', '5');
    expect(f.calls).toContain('removeLabel 5 factory-stuck');
    expect(readState(f.ctx.statePath).failures.map((row) => row.issue)).toEqual([6]);
  });

  it('retry of the release tracking card lifts a playtest block and keeps the decision and the play count', async () => {
    const f = fake();
    f.ctx.cfg = { ...f.ctx.cfg, playtestRuns: 4 };
    const playtest = { seed: 1, runs: 4, passed: null, blocked: { sha: 'abc1234', reason: 'taste' }, notes: [] };
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, playtest } });
    await run(f, 'retry', String(RELEASE.issue), 'Raiders', 'may', 'chase', 'at', 'night.');
    expect(f.calls).toContain(`removeLabel ${RELEASE.issue} factory-stuck`);
    expect(readState(f.ctx.statePath).release?.playtest).toEqual({ seed: 1, runs: 4, passed: null, blocked: null, notes: ['Raiders may chase at night.'] });
  });

  it('retry of another card leaves the playtest alone', async () => {
    const f = fake();
    const playtest = { seed: 1, runs: 4, passed: null, blocked: { sha: 'abc1234', reason: 'taste' }, notes: [] };
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, playtest } });
    await run(f, 'retry', '5', 'note');
    expect(readState(f.ctx.statePath).release?.playtest).toEqual(playtest);
  });

  it('pause writes the pause file and resume removes it', async () => {
    const f = fake();
    await run(f, 'pause', 'fixing', 'state');
    expect(JSON.parse(readFileSync(join(ROOT, 'paused'), 'utf8'))).toEqual({ kind: 'factory', note: 'fixing state', by: 'cli', at: f.ctx.now().toISOString() });
    await expect(run(f, 'pause')).rejects.toThrow('needs a reason');
    await run(f, 'resume');
    expect(existsSync(join(ROOT, 'paused'))).toBe(false);
  });

  it('repair-clone passes the card, who, why and --backup-merge to the repair and prints its lines', async () => {
    repairs.length = 0;
    await run(fake(), 'repair-clone', '5', '--by', 'hermes', '--reason', 'merge left it dirty');
    await run(fake(), 'repair-clone', '6', '--backup-merge', '--reason', 'open merge', '--by', 'ann');
    expect(repairs).toEqual([
      { issue: 5, by: 'hermes', reason: 'merge left it dirty', backupMerge: false, refuseUnpushed: false },
      { issue: 6, by: 'ann', reason: 'open merge', backupMerge: true, refuseUnpushed: false },
    ]);
    expect(out).toContain('repaired');
    expect(inbox()).toEqual([]);
  });

  it('repair-clone refuses a missing --by or --reason, an unknown actor and stray arguments before it repairs', async () => {
    repairs.length = 0;
    await expect(run(fake(), 'repair-clone', '5', '--reason', 'r')).rejects.toThrow('Missing --by');
    await expect(run(fake(), 'repair-clone', '5', '--by', 'hermes')).rejects.toThrow('Missing --reason');
    await expect(run(fake(), 'repair-clone', '5', '--by', 'bob', '--reason', 'r')).rejects.toThrow('unknown actor');
    await expect(run(fake(), 'repair-clone', '5', '6', '--by', 'hermes', '--reason', 'r')).rejects.toThrow('Unexpected "6"');
    await expect(run(fake(), 'repair-clone', 'x', '--by', 'hermes', '--reason', 'r')).rejects.toThrow('not an issue number');
    expect(repairs).toEqual([]);
  });

  it('pause --by and --pid write a member record with the process', async () => {
    const f = fake();
    await run(f, 'pause', 'fixing', '#5', '--by', 'hermes', '--pid', '12');
    expect(JSON.parse(readFileSync(join(ROOT, 'paused'), 'utf8'))).toEqual({ kind: 'member', note: 'fixing #5', by: 'hermes', at: f.ctx.now().toISOString(), pid: 12 });
    await run(f, 'pause', 'checks', '--pid', '13');
    expect(JSON.parse(readFileSync(join(ROOT, 'paused'), 'utf8'))).toMatchObject({ kind: 'member', by: 'hermes', pid: 13 });
    await run(f, 'pause', 'by ann', '--by', 'ann');
    const written = JSON.parse(readFileSync(join(ROOT, 'paused'), 'utf8'));
    expect(written).toMatchObject({ kind: 'member', by: 'ann' });
    expect(written).not.toHaveProperty('pid');
    await expect(run(f, 'pause', 'x', '--by', 'bob')).rejects.toThrow('unknown actor');
    await expect(run(f, 'pause', 'x', '--pid', 'soon')).rejects.toThrow('not an issue number');
  });

  it('resume keeps a member pause', async () => {
    writeFileSync(join(ROOT, 'paused'), JSON.stringify({ kind: 'member', note: 'Hermes fixing #5', by: 'Hermes', at: '2026-01-01T00:00:00.000Z', pid: 12 }));
    await expect(run(fake(), 'resume')).rejects.toThrow('This pause was written by a member. Once its reason is gone, delete the pause file.');
    expect(existsSync(join(ROOT, 'paused'))).toBe(true);
  });

  it('resume lifts a usage limit pause', async () => {
    writeFileSync(join(ROOT, 'paused'), JSON.stringify({ kind: 'usage-limit', note: 'limit', by: 'factory', at: '2026-01-01T00:00:00.000Z' }));
    await run(fake(), 'resume');
    expect(existsSync(join(ROOT, 'paused'))).toBe(false);
  });

  it('resume fails loud on a pause file in text', async () => {
    writeFileSync(join(ROOT, 'paused'), 'Hermes fixing #5\n');
    await expect(run(fake(), 'resume')).rejects.toThrow();
    expect(existsSync(join(ROOT, 'paused'))).toBe(true);
  });
});
