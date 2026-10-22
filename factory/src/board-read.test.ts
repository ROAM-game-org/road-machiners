import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_CFG, boardFake, boardItem, type BoardItem, type Fault } from './board-fakes';
import { applyControl } from './control';
import { runCtl } from './ctl';
import { BoardReadError, GithubError, ghClient } from './github';
import { holdCard } from './hold';
import { EMPTY_STATE, writeState } from './state';
import { evaluateSchedule, readReleaseGate, tick } from './tick';
import type { Ctx, FactoryConfig, FactoryState, ReleaseState } from './types';

const ROOT = resolve('tmp/factory-board-read-test');
const statePath = join(ROOT, 'state.json');
const NOW = new Date('2026-10-22T19:05:00Z');
const SCHEDULE = { releaseDays: 7, wasteReviewDays: 7, maxJobsPerCard: 2, triageWorkers: 3, designWorkers: 11, implementWorkers: 3, verifyWorkers: 1, testWorkers: 1 };
const CHASSIS = Array.from({ length: 11 }, (_, i) => 892 + i);
const RELEASE: ReleaseState = { issue: 843, branch: 'release/2026-10-20', day: '2026-10-20', postId: null, removed: [], tasks: [844, 845], merges: [], candidateSha: null, playtest: { seed: 1, runs: 0, passed: null, blocked: null, notes: [] } };

function bigBoard(): BoardItem[] {
  const filler = Array.from({ length: 172 }, (_, i) => boardItem(100 + i, 'Done'));
  return [...filler, boardItem(843, 'Approval', ['release']), boardItem(844, 'Done', ['release-task']), boardItem(845, 'Done', ['release-task']), ...CHASSIS.map((issue) => boardItem(issue, 'Design'))];
}

const noWait = async () => {};
const waits: number[] = [];
const recordWait = async (ms: number) => { waits.push(ms); };

function ctxFor(fake: ReturnType<typeof boardFake>): Ctx {
  const cfg = { ...BOARD_CFG, home: ROOT, committeeBootstrapTelegram: '11', committeeBootstrapGithub: 'boss', committeeChat: '-5', tokenPrices: {}, minFreeGb: 0, replyRouteMinutes: 60 } as FactoryConfig;
  return { cfg, statePath, now: () => NOW, log: () => undefined, run: fake.run, github: ghClient(fake.run, cfg, noWait), telegram: {}, repo: {} } as unknown as Ctx;
}

const seed = (patch: Partial<FactoryState> = {}) => writeState(statePath, { ...structuredClone(EMPTY_STATE), lastRelease: NOW.toISOString(), ...patch });

let out: string[];
beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
  seed();
  waits.length = 0;
  out = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => void out.push(line));
});
afterEach(() => vi.restoreAllMocks());

describe('board read', () => {
  it('reads more than 100 items across three pages', async () => {
    const items = Array.from({ length: 250 }, (_, i) => boardItem(i + 1, i % 2 ? 'Design' : 'Done'));
    const fake = boardFake(items);
    const cards = await ghClient(fake.run, BOARD_CFG, recordWait).cards();
    expect(cards.map((card) => card.issue)).toEqual(items.map((item) => item.issue));
    expect(fake.reads()).toBe(1);
    expect(fake.calls.filter((args) => args.join(' ').includes('items(first: 100')).map((args) => args.find((arg) => arg.startsWith('cursor=')) ?? 'first')).toEqual(['first', 'cursor=C100', 'cursor=C200']);
    expect(fake.probes()).toBe(0);
    expect(waits).toEqual([]);
  });

  it('keeps cards of other repos and items with no status out, and still counts them', async () => {
    const fake = boardFake([boardItem(1), { issue: 2, column: 'Design', repo: 'x/y' }, boardItem(3, 'Testing')]);
    const cards = await ghClient(fake.run, BOARD_CFG, recordWait).cards();
    expect(cards.map((card) => card.issue)).toEqual([1, 3]);
    expect(fake.reads()).toBe(1);
  });

  const FAULTS: Fault[] = ['zero-first', 'zero-nodes-first', 'zero-later', 'empty-later', 'short-later', 'null-node'];
  it.each(FAULTS)('reads the board again after a %s page and returns the whole board', async (fault) => {
    const fake = boardFake(bigBoard(), { faults: [fault, fault] });
    const cards = await ghClient(fake.run, BOARD_CFG, recordWait).cards();
    expect(cards).toHaveLength(186);
    expect(cards.filter((card) => card.column === 'Design').map((card) => card.issue)).toEqual(CHASSIS);
    expect(fake.reads()).toBe(3);
    expect(waits).toEqual([15000, 30000]);
  });

  it('reads an empty first page again even when the second read of the count agrees with it', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'zero-first'], probeLies: true });
    const cards = await ghClient(fake.run, BOARD_CFG, recordWait).cards();
    expect(cards).toHaveLength(186);
    expect(fake.reads()).toBe(3);
    expect(fake.probes()).toBe(2);
  });

  it('fails with a BoardReadError when every read stays incomplete, and returns no partial board', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'empty-later', 'short-later', 'zero-later'] });
    const read = ghClient(fake.run, BOARD_CFG, recordWait).cards();
    await expect(read).rejects.toBeInstanceOf(BoardReadError);
    await expect(read).rejects.toBeInstanceOf(GithubError);
    await expect(read).rejects.toThrow('stayed incomplete after 4 reads');
    expect(fake.reads()).toBe(4);
    expect(waits).toEqual([15000, 30000, 60000]);
  });

  it('returns an empty board only after every read and its second read find it empty', async () => {
    const fake = boardFake([]);
    await expect(ghClient(fake.run, BOARD_CFG, recordWait).cards()).resolves.toEqual([]);
    expect(fake.reads()).toBe(4);
    expect(fake.probes()).toBe(4);
  });
});

describe('a project list that omits open items but counts only what it lists', () => {
  const OMITTED = [...CHASSIS, 905];

  it('adds every open issue card the list omits, with its own status', async () => {
    const fake = boardFake([...bigBoard(), boardItem(905, 'Triage')], { omittedFromList: OMITTED });
    const cards = await ghClient(fake.run, BOARD_CFG, recordWait).cards();
    expect(cards).toHaveLength(187);
    expect(cards.filter((card) => OMITTED.includes(card.issue)).map((card) => [card.issue, card.column])).toEqual([...CHASSIS.map((issue) => [issue, 'Design']), [905, 'Triage']]);
    expect(fake.reads()).toBe(1);
    expect(fake.openReads()).toBe(1);
    expect(waits).toEqual([]);
  });

  it('the scheduler starts design on every omitted chassis card', async () => {
    const cards = await ctxFor(boardFake(bigBoard(), { omittedFromList: CHASSIS })).github.cards();
    const picks = evaluateSchedule({ ...structuredClone(EMPTY_STATE), lastRelease: NOW.toISOString(), devBuild: 'dev0001' }, cards, NOW, SCHEDULE).picks;
    expect(picks.filter((pick) => pick.stage === 'design').map((pick) => pick.issue)).toEqual(CHASSIS);
  });

  it('factory cards lists the omitted cards', async () => {
    await runCtl(ctxFor(boardFake(bigBoard(), { omittedFromList: CHASSIS })), ['cards']);
    for (const issue of CHASSIS) expect(out.some((line) => line.startsWith(`#${issue} `) && line.includes('Design'))).toBe(true);
  });

  it('fails rather than return a board when the open issue read stays incomplete', async () => {
    const fake = boardFake(bigBoard(), { openIssuesShort: true });
    await expect(ghClient(fake.run, BOARD_CFG, recordWait).cards()).rejects.toBeInstanceOf(BoardReadError);
    expect(fake.openReads()).toBe(4);
  });
});

describe('one card', () => {
  it('reads one card from its issue, with no board read', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'zero-first', 'zero-first', 'zero-first'] });
    const card = await ghClient(fake.run, BOARD_CFG, recordWait).card(892);
    expect(card).toMatchObject({ itemId: 'I892', issue: 892, column: 'Design' });
    expect(fake.reads()).toBe(0);
  });

  it('finds a card its issue does not list through a whole board read', async () => {
    const fake = boardFake(bigBoard(), { faults: ['empty-later'], hiddenFromIssue: [900] });
    const card = await ghClient(fake.run, BOARD_CFG, recordWait).card(900);
    expect(card).toMatchObject({ itemId: 'I900', column: 'Design' });
    expect(fake.reads()).toBe(2);
  });

  it('is off the board only when its issue and a whole board read agree', async () => {
    const fake = boardFake(bigBoard());
    await expect(ghClient(fake.run, BOARD_CFG, recordWait).card(999)).resolves.toBeNull();
    expect(fake.issueReads()).toBe(1);
    expect(fake.reads()).toBe(1);
  });

  it('fails rather than call a card off the board when the board read stays incomplete', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'zero-first', 'zero-first', 'zero-first'], hiddenFromIssue: [999] });
    await expect(ghClient(fake.run, BOARD_CFG, recordWait).card(999)).rejects.toBeInstanceOf(BoardReadError);
  });

  it('move sets the status of a card the board list hides', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'zero-first', 'zero-first', 'zero-first'] });
    await ghClient(fake.run, BOARD_CFG, recordWait).move(895, 'Implementation');
    expect(fake.moves()).toHaveLength(1);
    expect(fake.moves()[0]).toEqual(expect.arrayContaining(['item=I895', 'option=id-Implementation']));
  });

  it('move of an issue off the board fails and edits nothing', async () => {
    const fake = boardFake(bigBoard());
    await expect(ghClient(fake.run, BOARD_CFG, recordWait).move(999, 'Design')).rejects.toThrow('Issue 999 is not on the board');
    expect(fake.moves()).toEqual([]);
  });
});

describe('readers of a flaky board', () => {
  const FLAKY: Fault[] = ['zero-first', 'empty-later'];

  it('factory cards lists every chassis Design card', async () => {
    await runCtl(ctxFor(boardFake(bigBoard(), { faults: FLAKY })), ['cards']);
    for (const issue of CHASSIS) expect(out.some((line) => line.startsWith(`#${issue} `) && line.includes('Design'))).toBe(true);
    expect(out).toHaveLength(186);
  });

  it('factory card finds a card the board list hides', async () => {
    await runCtl(ctxFor(boardFake(bigBoard(), { faults: ['zero-first', 'zero-first', 'zero-first', 'zero-first'] })), ['card', '892']);
    expect(out.join('\n')).toContain('Design');
  });

  it('factory cards fails rather than print a cut board', async () => {
    await expect(runCtl(ctxFor(boardFake(bigBoard(), { faults: ['empty-later', 'empty-later', 'empty-later', 'empty-later'] })), ['cards'])).rejects.toBeInstanceOf(BoardReadError);
    expect(out).toEqual([]);
  });

  it('the move control moves each chassis Design card and never says it is off the board', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'zero-first', 'zero-first', 'zero-first'] });
    const ctx = ctxFor(fake);
    for (const issue of CHASSIS) {
      await expect(applyControl(ctx, { action: 'move', issue, to: 'design', by: 'hermes', reason: 'chassis remake' })).resolves.toBe('Moved to design.');
    }
    expect(fake.moves().map((args) => args.find((arg) => arg.startsWith('item=')))).toEqual(CHASSIS.map((issue) => `item=I${issue}`));
  });

  it('the move control still refuses an issue that is off the board', async () => {
    const fake = boardFake(bigBoard(), { faults: FLAKY });
    await expect(applyControl(ctxFor(fake), { action: 'move', issue: 999, to: 'design', by: 'hermes', reason: 'r' })).rejects.toThrow('Issue #999 is not on the board.');
    expect(fake.moves()).toEqual([]);
  });

  it('a hold finds a card the board list hides', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'zero-first', 'zero-first', 'zero-first'] });
    await expect(holdCard(ctxFor(fake), 892, 'Ann', 'release tasks first')).resolves.toContain('Held.');
  });

  it('the scheduler starts design on every chassis Design card', async () => {
    const cards = await ctxFor(boardFake(bigBoard(), { faults: FLAKY })).github.cards();
    const picks = evaluateSchedule({ ...structuredClone(EMPTY_STATE), lastRelease: NOW.toISOString(), devBuild: 'dev0001' }, cards, NOW, SCHEDULE).picks;
    expect(picks.filter((pick) => pick.stage === 'design').map((pick) => pick.issue)).toEqual(CHASSIS);
  });

  it('a tick on a board that stays incomplete starts nothing and fails with the board error', async () => {
    const fake = boardFake(bigBoard(), { faults: ['zero-first', 'empty-later', 'zero-later', 'short-later'] });
    await expect(tick(ctxFor(fake), ROOT)).rejects.toBeInstanceOf(BoardReadError);
    expect(fake.moves()).toEqual([]);
  });

  it('the release gate sees the tracking card and its done tasks', async () => {
    const cards = await ctxFor(boardFake(bigBoard(), { faults: FLAKY })).github.cards();
    expect(readReleaseGate({ ...structuredClone(EMPTY_STATE), release: RELEASE }, cards).reason).toBe('playtest');
  });

  it('factory audit reports no missing release card or task', async () => {
    seed({ release: RELEASE });
    await runCtl(ctxFor(boardFake(bigBoard(), { faults: FLAKY })), ['audit']);
    expect(out.filter((line) => /missing|not on the board/.test(line))).toEqual([]);
  });

  it('factory audit fails rather than report false drift when the board read stays incomplete', async () => {
    seed({ release: RELEASE });
    await expect(runCtl(ctxFor(boardFake(bigBoard(), { faults: ['zero-later', 'zero-later', 'zero-later', 'zero-later'] })), ['audit'])).rejects.toBeInstanceOf(BoardReadError);
    expect(out).toEqual([]);
  });
});
