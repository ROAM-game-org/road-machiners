import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OVERLAP_FILE, checkOverlaps, comparableTitle, nominate, overlapDue, previewOverlaps, type CardWork, type MergedCommit } from './overlap';
import { EMPTY_STATE, readState, writeState } from './state';
import { HOTFIX_LABEL, RELEASE_LABEL, type BranchCommit, type Card, type Ctx, type FactoryState, type OverlapState } from './types';

const NOW = new Date('2026-10-15T12:00:00Z');
const hoursAgo = (hours: number): string => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const card = (issue: number, column: Card['column'] = 'Testing', labels: string[] = []): Card => ({ itemId: `i${issue}`, issue, column, labels });
const commit = (hash: string, subject: string, files: string[], branch: MergedCommit['branch'] = 'main'): MergedCommit => ({ hash, subject, files, branch });
const work = (issue: number, title: string, files: string[]): CardWork => ({ issue, title, files });
const checked = (over: Partial<OverlapState> = {}): OverlapState => ({ at: hoursAgo(25), main: 'main0', dev: 'dev0', reported: [], error: null, ...over });

const SOUND_FIX = commit('aaaaaaa111', 'Hotfix #539: Error: sound decode failed: EncodingError', ['game/src/audio/decode.ts', 'game/src/audio/decode.test.ts']);

describe('nominate', () => {
  it('pairs a card with a merge that changed the same game files, and names them', () => {
    const found = nominate([work(516, 'Sounds stop in Safari', ['game/src/audio/decode.ts', 'game/src/ui/menu.ts'])], [SOUND_FIX]);
    expect(found).toEqual([expect.objectContaining({ issue: 516, commit: 'aaaaaaa', branch: 'main', why: 'shares game/src/audio/decode.ts', key: '516:aaaaaaa' })]);
  });

  it('pairs a card with no branch yet when its title matches the issue the merge names, ignoring numbers and punctuation', () => {
    const found = nominate([work(549, 'error: Sound decode failed - EncodingError (2)', [])], [SOUND_FIX]);
    expect(found.map((item) => item.why)).toEqual(['has the same title']);
  });

  it('keeps distinct reports apart: another file, another error and the merged issue itself', () => {
    const works = [
      work(520, 'Error: model base_carrier.glb failed to load', ['game/src/models/load.ts']),
      work(575, 'Sound decode fails in Firefox', ['game/src/audio/firefox.ts']),
      work(539, 'Error: sound decode failed: EncodingError', ['game/src/audio/decode.ts']),
    ];
    expect(nominate(works, [SOUND_FIX])).toEqual([]);
  });

  it('ignores the factory task files and the lock file both branches touch', () => {
    const tasks = commit('bbbbbbb', 'Merge issue #600: Tow fee', ['game/.factory-tasks/issue-600.md', 'game/package-lock.json', 'game/docs/tasks/x.md']);
    expect(nominate([work(601, 'Ram damage', ['game/.factory-tasks/issue-601.md', 'game/package-lock.json', 'game/docs/tasks/x.md'])], [tasks])).toEqual([]);
  });

  it('compares titles on letters alone', () => {
    expect(comparableTitle('Error: maps/icarus.bin failed (3 tries)!')).toBe('error maps icarus bin failed tries');
  });
});

describe('overlapDue', () => {
  const heads = { main: 'main1', dev: 'dev0' };

  it('records a baseline on the first check, so nothing merged before the deploy is nominated', () => {
    expect(overlapDue(EMPTY_STATE.overlap, heads, NOW, 24)).toBe('baseline');
  });

  it('waits until the period passed, even when main moved', () => {
    expect(overlapDue(checked({ at: hoursAgo(23) }), heads, NOW, 24)).toBe('wait');
  });

  it('scans a due period only when main or dev moved', () => {
    expect(overlapDue(checked(), heads, NOW, 24)).toBe('scan');
    expect(overlapDue(checked(), { main: 'main0', dev: 'dev0' }, NOW, 24)).toBe('unchanged');
  });
});

type Fake = { ctx: Ctx; home: string; calls: string[]; logs: string[] };

function fake(state: Partial<FactoryState>, merged: Record<string, BranchCommit[]>, branches: Record<number, string[]>, titles: Record<number, string>, failOn: string | null = null): Fake {
  const home = mkdtempSync(join(tmpdir(), 'overlap-'));
  const statePath = join(home, 'state.json');
  writeState(statePath, { ...structuredClone(EMPTY_STATE), ...state });
  const f: Fake = { ctx: {} as Ctx, home, calls: [], logs: [] };
  const repo = {
    fetch: async () => void f.calls.push('fetch'),
    headHash: async (branch: string) => {
      if (branch === 'main') return 'main1';
      if (branch === 'dev') return 'dev1';
      const issue = Number(branch.replace('factory/issue-', ''));
      if (!(issue in branches)) throw new Error(`unknown revision ${branch}`);
      return 'card';
    },
    newCommits: async (from: string, to: string) => {
      f.calls.push(`log ${from}..${to}`);
      if (failOn === to) throw new Error(`fatal: bad revision ${from}\nmore`);
      return merged[to] ?? [];
    },
    changedFiles: async (base: string, branch: string) => {
      f.calls.push(`files ${base}...${branch}`);
      return branches[Number(branch.replace('factory/issue-', ''))];
    },
  };
  const github = { issue: async (issue: number) => ({ number: issue, title: titles[issue] }) };
  f.ctx = { cfg: { home, overlapCheckHours: 24 }, statePath, repo, github, now: () => NOW, log: (_stage: string, _issue: number | null, msg: string) => f.logs.push(msg) } as unknown as Ctx;
  return f;
}

const pending = (f: Fake): string => (existsSync(join(f.home, OVERLAP_FILE)) ? readFileSync(join(f.home, OVERLAP_FILE), 'utf8') : '');

describe('checkOverlaps', () => {
  const merged = { main: [SOUND_FIX], dev: [{ hash: 'ccccccc222', subject: 'Merge issue #610: Tow fee', files: ['game/src/economy/tow.ts'] }] };
  const branches = { 516: ['game/src/audio/decode.ts'], 575: ['game/src/audio/firefox.ts'], 620: ['game/src/economy/tow.ts'], 630: ['game/src/audio/decode.ts'] };
  const titles = { 516: 'Sounds stop in Safari', 575: 'Sound decode fails in Firefox', 620: 'Tow fee rounding', 630: 'Mute button', 549: 'Error: sound decode failed: EncodingError' };

  it('writes one line per new pair for Hermes, records the heads, and skips approved, release and Done cards', async () => {
    const cards = [card(516), card(575), card(620, 'Design'), card(549, 'Triage'), card(630, 'Approval'), card(631, 'Done'), card(632, 'Approval', [RELEASE_LABEL])];
    const f = fake({ overlap: checked(), pendingApprovals: { '630': 'Ann' } }, merged, branches, titles);
    await checkOverlaps(f.ctx, cards);
    expect(pending(f).trim().split('\n')).toEqual([
      'overlap #516 with aaaaaaa on main: shares game/src/audio/decode.ts',
      'overlap #620 with ccccccc on dev: shares game/src/economy/tow.ts',
      'overlap #549 with aaaaaaa on main: has the same title',
    ]);
    expect(readState(f.ctx.statePath).overlap).toEqual({ at: NOW.toISOString(), main: 'main1', dev: 'dev1', reported: ['516:aaaaaaa', '620:ccccccc', '549:aaaaaaa'], error: null });
    expect(f.calls).toContain('log main0..main');
    expect(f.calls).not.toContain('files dev...factory/issue-630');
  });

  it('reads a hotfix card against main', async () => {
    const f = fake({ overlap: checked() }, merged, branches, titles);
    await checkOverlaps(f.ctx, [card(516, 'Testing', [HOTFIX_LABEL])]);
    expect(f.calls).toContain('files main...factory/issue-516');
  });

  it('nominates a pair once, so a second check after Hermes cleared the file adds nothing for it', async () => {
    const f = fake({ overlap: checked({ reported: ['516:aaaaaaa', '999:aaaaaaa'] }) }, merged, branches, titles);
    await checkOverlaps(f.ctx, [card(516)]);
    expect(pending(f)).toBe('');
    expect(readState(f.ctx.statePath).overlap.reported).toEqual(['516:aaaaaaa']);
  });

  it('does no git or GitHub read while the period runs', async () => {
    const f = fake({ overlap: checked({ at: hoursAgo(2) }) }, merged, branches, titles);
    await checkOverlaps(f.ctx, [card(516)]);
    expect(f.calls).toEqual([]);
    expect(readState(f.ctx.statePath).overlap.at).toBe(hoursAgo(2));
  });

  it('records the first heads as its baseline and nominates nothing', async () => {
    const f = fake({}, merged, branches, titles);
    await checkOverlaps(f.ctx, [card(516)]);
    expect(pending(f)).toBe('');
    expect(f.calls).toEqual([]);
    expect(readState(f.ctx.statePath).overlap).toMatchObject({ main: 'main1', dev: 'dev1', at: NOW.toISOString() });
  });

  it('keeps its old heads and records the error when git fails, so the next tick checks the same commits', async () => {
    const f = fake({ overlap: checked() }, merged, branches, titles, 'dev');
    await checkOverlaps(f.ctx, [card(516)]);
    expect(pending(f)).toBe('');
    expect(readState(f.ctx.statePath).overlap).toEqual(checked({ error: 'fatal: bad revision dev0' }));
  });

  it('previews the nominations as a dry run and writes nothing', async () => {
    const f = fake({ overlap: checked({ reported: ['516:aaaaaaa'] }) }, merged, branches, titles);
    const lines = await previewOverlaps(f.ctx, [card(516), card(575)]);
    expect(lines).toEqual([
      'Commits since main main0 and dev dev0, to main main1 and dev dev1. Nothing is written.',
      'overlap #516 with aaaaaaa on main: shares game/src/audio/decode.ts [reported]',
    ]);
    expect(pending(f)).toBe('');
    expect(readState(f.ctx.statePath).overlap).toEqual(checked({ reported: ['516:aaaaaaa'] }));
  });
});
