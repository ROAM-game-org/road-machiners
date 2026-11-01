import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { solidPng } from '../media-fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeState, readState, EMPTY_STATE } from '../state';
import { BaseMovedError, MergeConflictError, type CheckedBuild, type Column, type Ctx, type KeptApproval, type MergeStep } from '../types';

vi.mock('../deploy', () => ({ deployDev: async () => 'https://play.test/dev/' }));
const { approve, closeCard, deny, routeFeedback } = await import('./approval');
const { readLedger } = await import('../ledger');

let home = '';
let calls: string[] = [];
let column: Column = 'Approval';
let openPr: string | null = null;
let labels: string[] = [];

beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-approval-');
  calls = [];
  column = 'Approval';
  openPr = null;
  labels = [];
  writeState(`${home}/state.json`, { ...EMPTY_STATE, approvalPosts: { 100: 7, 101: 7, 200: 8 }, pendingApprovals: { 7: 'bob' }, builds: { 7: 'aaa1111', 8: 'bbb2222' } });
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  telegramFiles = {};
  downloads = [];
});

let telegramFiles: Record<string, Buffer> = {};
let downloads: string[] = [];

function fakeCtx(): Ctx {
  const record = (name: string) => async (...args: unknown[]) => { calls.push(`${name} ${args.join(' ')}`); };
  const fake = {
    cfg: { home, committeeChat: 'chat', publicChannel: 'public', publicUrl: 'https://play.test', itchTarget: 'u/g', butlerKey: 'key', errorMapDays: 14 },
    statePath: `${home}/state.json`,
    now: () => new Date('2026-09-30T10:00:00Z'),
    log: () => undefined,
    run: async (cmd: string, args: string[]) => { calls.push(`run ${cmd} ${args[0]}`); return { code: 0, stdout: cmd === 'git' ? 'abc1234'.padEnd(40, '0') : '', stderr: '' }; },
    github: {
      cards: async () => [{ itemId: 'x', issue: 7, column, labels: [] }],
      issue: async () => ({ number: 7, title: 'Big horn', body: '', labels, createdAt: '', state: 'OPEN' }),
      comment: record('comment'), addLabel: record('addLabel'), removeLabel: record('removeLabel'), pullRequestFor: async () => openPr, closePullRequest: record('closePullRequest'), close: record('close'), move: record('move'),
      createRelease: record('release'),
    },
    telegram: {
      sendMessage: record('message'),
      downloadFile: async (fileId: string) => {
        downloads.push(fileId);
        const data = telegramFiles[fileId];
        if (data === undefined) throw new Error('Telegram getFile failed: Bad Request: wrong file_id or the file is temporarily unavailable');
        return data;
      },
    },
    container: { shell: record('shell') },
    repo: {
      fetch: record('fetch'), headHash: async () => 'abc1234',
      prepareWorkClone: async (...args: unknown[]) => {
        calls.push(`prepare ${args.join(' ')}`);
        mkdirSync(`${String(args[2])}/game/dist`, { recursive: true });
        writeFileSync(`${String(args[2])}/game/dist/index.js.map`, '{}');
      },
      merge: async (steps: MergeStep[], _resolutions: unknown, checked?: CheckedBuild) => { if (checked) calls.push(`checked ${checked.branch} ${checked.build} ${checked.base}`); for (const step of steps) calls.push(`merge ${step.branch} ${step.into} ${step.message}`); calls.push(`push ${steps.map((step) => step.into).join(' ')}`); },
    },
  };
  return fake as unknown as Ctx;
}

describe('approve', () => {
  it('moves an approved preview to Hardening under the approver, keeps its build, with no merge and no chat post', async () => {
    await approve(fakeCtx(), 7, 'bob');
    expect(calls).toEqual([
      'comment 7 Approved by bob in the committee chat. Hardening runs now. Then the factory checks it merged with dev and merges it by itself, with no new post.',
      'move 7 Hardening',
    ]);
    const state = readState(`${home}/state.json`);
    expect(state.approvedResolving).toEqual({ 7: 'bob' });
    expect(state.approvalPosts).toEqual({ 200: 8 });
    expect(state.pendingApprovals).toEqual({});
    expect(state.builds).toEqual({ 7: 'aaa1111', 8: 'bbb2222' });
  });

  it('ships a hotfix from main to itch.io, brings main into dev, leaves the open release and its candidate alone, closes the issue and tells only the committee', async () => {
    labels = ['bug', 'hotfix'];
    writeState(`${home}/state.json`, { ...EMPTY_STATE, release: { issue: 20, day: '2026-09-29', postId: 300, removed: [], candidate: null, playtest: { seed: 1, runs: 0, lastStart: null, passed: null, fixes: null, blocked: null, decision: null, work: null } }, pendingShip: 'ann', pendingApprovals: { 7: 'bob' }, builds: { 7: 'aaa1111' } });
    await approve(fakeCtx(), 7, 'bob');
    const changelog = 'ROAM hotfix 2026-09-30\n\nFixed: #7 Big horn';
    expect(calls.filter((call) => !call.startsWith('prepare') && !call.startsWith('shell'))).toEqual([
      'fetch ',
      'checked factory/issue-7 aaa1111 main',
      'merge factory/issue-7 main Hotfix #7: Big horn',
      'merge main dev Merge main into dev after hotfix #7',
      'push main dev',
      'run git rev-parse',
      'run butler push',
      `release hotfix-2026-09-30-issue-7 main ROAM hotfix 2026-09-30 ${changelog}`,
      'comment 7 Approved by bob in the committee chat and shipped as a hotfix. It is on main and itch.io.',
      'close 7 completed',
      'move 7 Done',
      'message chat Hotfix #7 Big horn is on main and itch.io.',
    ]);
    const state = readState(`${home}/state.json`);
    expect(state.release?.postId).toBe(300);
    expect(state.pendingShip).toBe('ann');
    expect(state.pendingApprovals).toEqual({});
    expect(state.pendingIncidents).toEqual([7]);
    expect(state.keptApprovals).toEqual({});
  });

  it('keeps a hotfix approval when main moved with no conflict, and sends it to Testing with no chat post', async () => {
    labels = ['bug', 'hotfix'];
    const ctx = fakeCtx();
    ctx.repo.merge = async () => { throw new BaseMovedError('factory/issue-7', 'aaa1111', 'main moved to ccc3333 after the checks ran on aaa1111, so they no longer count.'); };
    await approve(ctx, 7, 'bob');
    expect(calls.filter((call) => !call.startsWith('fetch'))).toEqual([
      'comment 7 The approval by bob of build aaa1111 still holds. main moved to ccc3333 after the checks ran on aaa1111, so they no longer count. Testing merges main, keeps both sides and runs the full checks on the result. It ships with no new post, unless the merge changes what was approved.',
      'move 7 Testing',
    ]);
    const state = readState(`${home}/state.json`);
    expect(state.keptApprovals).toEqual({ 7: { by: 'bob', at: '2026-09-30T10:00:00.000Z', build: 'aaa1111', checked: ['aaa1111'], reason: 'main moved to ccc3333 after the checks ran on aaa1111, so they no longer count.' } });
    expect(state.approvalPosts).toEqual({ 200: 8 });
    expect(state.pendingApprovals).toEqual({});
    expect(state.builds).toEqual({ 8: 'bbb2222' });
    expect(readLedger(home, new Date(0)).filter((entry) => entry.kind === 'card')).toEqual([{ kind: 'card', issue: 7, step: 'base-moved', to: 'Testing', at: '2026-09-30T10:00:00.000Z', flow: 'hotfix' }]);
  });

  it('keeps a hotfix approval when the branch conflicts with main', async () => {
    labels = ['bug', 'hotfix'];
    const ctx = fakeCtx();
    ctx.repo.merge = async ([step]: MergeStep[]) => { throw new MergeConflictError(step, ['game/src/a.ts'], 'boom', 'b1', 's1'); };
    await approve(ctx, 7, 'bob');
    expect(calls.filter((call) => call.startsWith('comment') || call.startsWith('move') || call.startsWith('message'))).toEqual([
      'comment 7 The approval by bob of build aaa1111 still holds. main moved on, and the branch conflicts with it in game/src/a.ts. Testing merges main, keeps both sides and runs the full checks on the result. It ships with no new post, unless the merge changes what was approved.',
      'move 7 Testing',
    ]);
    expect(readState(`${home}/state.json`).keptApprovals[7]?.by).toBe('bob');
  });

  it('ships the integrated build under the kept approval and names both builds', async () => {
    labels = ['bug', 'hotfix'];
    const kept: KeptApproval = { by: 'bob', at: '2026-09-30T09:00:00.000Z', build: 'aaa1111', checked: ['aaa1111', 'ddd4444'], reason: 'main moved' };
    writeState(`${home}/state.json`, { ...EMPTY_STATE, pendingApprovals: { 7: 'bob' }, builds: { 7: 'ddd4444' }, keptApprovals: { 7: kept } });
    await approve(fakeCtx(), 7, 'bob');
    expect(calls).toContain('checked factory/issue-7 ddd4444 main');
    expect(calls).toContain('comment 7 Approved by bob in the committee chat and shipped as a hotfix. It is on main and itch.io. The approval was of build aaa1111. The shipped build ddd4444 merges newer main into it, and the full checks passed on it.');
    expect(readState(`${home}/state.json`).keptApprovals).toEqual({});
  });

  it('keeps the approval through another move of main during the second checks, and sends the card back to Testing again', async () => {
    labels = ['bug', 'hotfix'];
    const kept: KeptApproval = { by: 'bob', at: '2026-09-30T09:00:00.000Z', build: 'aaa1111', checked: ['aaa1111', 'ddd4444'], reason: 'main moved' };
    writeState(`${home}/state.json`, { ...EMPTY_STATE, pendingApprovals: { 7: 'bob' }, builds: { 7: 'ddd4444' }, keptApprovals: { 7: kept } });
    const ctx = fakeCtx();
    ctx.repo.merge = async () => { throw new BaseMovedError('factory/issue-7', 'ddd4444', 'main moved again.'); };
    await approve(ctx, 7, 'bob');
    expect(calls).toContain('move 7 Testing');
    expect(calls.some((call) => call.startsWith('message') || call.startsWith('release'))).toBe(false);
    expect(readState(`${home}/state.json`).keptApprovals[7]).toEqual({ ...kept, reason: 'main moved again.' });
  });

  it('takes a new member approval of a newly posted build as a new kept approval', async () => {
    labels = ['bug', 'hotfix'];
    const old: KeptApproval = { by: 'ann', at: '2026-09-29T09:00:00.000Z', build: 'aaa1111', checked: ['aaa1111'], reason: null };
    writeState(`${home}/state.json`, { ...EMPTY_STATE, pendingApprovals: { 7: 'bob' }, builds: { 7: 'eee5555' }, keptApprovals: { 7: old } });
    const ctx = fakeCtx();
    ctx.repo.merge = async () => { throw new BaseMovedError('factory/issue-7', 'eee5555', 'main moved.'); };
    await approve(ctx, 7, 'bob');
    expect(readState(`${home}/state.json`).keptApprovals[7]).toEqual({ by: 'bob', at: '2026-09-30T10:00:00.000Z', build: 'eee5555', checked: ['eee5555'], reason: 'main moved.' });
  });

  it('refuses a hotfix with no published build before any git call', async () => {
    labels = ['hotfix'];
    writeState(`${home}/state.json`, { ...EMPTY_STATE, pendingApprovals: { 7: 'bob' } });
    await expect(approve(fakeCtx(), 7, 'bob')).rejects.toThrow('no published build');
    expect(calls).toEqual([]);
  });

  it('keeps the approval when shipping fails for another reason, so a retry ships without a new press', async () => {
    labels = ['hotfix'];
    const ctx = fakeCtx();
    ctx.repo.merge = async () => { throw new Error('GitHub is down'); };
    await expect(approve(ctx, 7, 'bob')).rejects.toThrow('GitHub is down');
    expect(readState(`${home}/state.json`).keptApprovals[7]?.checked).toEqual(['aaa1111']);
  });

  it('refuses a hotfix without itch.io keys before any git call', async () => {
    labels = ['hotfix'];
    const ctx = fakeCtx();
    ctx.cfg.butlerKey = null;
    await expect(approve(ctx, 7, 'bob')).rejects.toThrow('BUTLER_API_KEY');
    expect(calls).toEqual([]);
  });

  it('throws when the card is not in Approval', async () => {
    column = 'Testing';
    await expect(approve(fakeCtx(), 7, 'bob')).rejects.toThrow('not in Approval');
    expect(calls).toEqual([]);
  });
});

describe('routeFeedback', () => {
  it('redesign comments with the route, moves to Design, drops the posts and the queued approval', async () => {
    expect(await routeFeedback(fakeCtx(), 7, 'bob', 'Make it louder', 'redesign', 100)).toBe(true);
    expect(calls).toEqual(['comment 7 ## Committee feedback\n\nFrom bob, routed as redesign:\n\nMake it louder', 'move 7 Design']);
    const state = readState(`${home}/state.json`);
    expect(state.approvalPosts).toEqual({ 200: 8 });
    expect(state.builds).toEqual({ 8: 'bbb2222' });
    expect(state.pendingApprovals).toEqual({});
  });

  it('a patch of a hotfix with a kept approval drops that approval and says why', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), keptApprovals: { 7: { by: 'ann', at: 'a', build: 'aaa1111', checked: ['aaa1111'], reason: null } } });
    await routeFeedback(fakeCtx(), 7, 'bob', 'Louder horn', 'patch', 100);
    expect(calls.at(-1)).toBe('comment 7 The approval by ann of build aaa1111 no longer holds: bob sent it back as a patch, which changes what was approved. The changed build needs a new approval, so it gets a new post.');
    expect(readState(`${home}/state.json`).keptApprovals).toEqual({});
  });

  it('patch moves the card to Testing, whose session reads the reply, and drops the posts', async () => {
    await routeFeedback(fakeCtx(), 7, 'bob', 'Louder horn', 'patch', 100);
    expect(calls).toEqual(['comment 7 ## Committee feedback\n\nFrom bob, routed as patch:\n\nLouder horn', 'move 7 Testing']);
    expect(readState(`${home}/state.json`).approvalPosts).toEqual({ 200: 8 });
  });

  it('writes the player heading for a player source', async () => {
    await routeFeedback(fakeCtx(), 7, 'public', 'It breaks', 'patch', 100, 'player');
    expect(calls).toEqual(['comment 7 ## Player report\n\nFrom public, routed as patch:\n\nIt breaks', 'move 7 Testing']);
  });

  it('records the comment body and its source as the pending feedback of a patch or redesign, and none for an answer', async () => {
    await routeFeedback(fakeCtx(), 7, 'bob', 'q', 'answer', 100);
    expect(readState(`${home}/state.json`).pendingFeedback).toEqual({});
    await routeFeedback(fakeCtx(), 7, 'bob', 'Louder horn', 'patch', 100);
    expect(readState(`${home}/state.json`).pendingFeedback).toEqual({ 7: { source: 'committee', body: '## Committee feedback\n\nFrom bob, routed as patch:\n\nLouder horn' } });
    await routeFeedback(fakeCtx(), 7, 'public', 'It breaks', 'redesign', 100, 'player');
    expect(readState(`${home}/state.json`).pendingFeedback[7]).toEqual({ source: 'player', body: '## Player report\n\nFrom public, routed as redesign:\n\nIt breaks' });
  });

  it('queues the issue for the incident job on a committee patch or redesign', async () => {
    await routeFeedback(fakeCtx(), 7, 'bob', 'Louder horn', 'patch', 100);
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([7]);
    await routeFeedback(fakeCtx(), 7, 'bob', 'Make it louder', 'redesign', 100);
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([7, 7]);
  });

  it('queues nothing for a player route or an answer', async () => {
    await routeFeedback(fakeCtx(), 7, 'public', 'It breaks', 'patch', 100, 'player');
    await routeFeedback(fakeCtx(), 7, 'public', 'It breaks', 'redesign', 100, 'player');
    await routeFeedback(fakeCtx(), 7, 'bob', 'q', 'answer', 100);
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([]);
  });

  it('answer only comments, and keeps the card, its posts and its queued approval', async () => {
    expect(await routeFeedback(fakeCtx(), 7, 'bob', 'Is there a top-down atlas?', 'answer', 100)).toBe(false);
    expect(calls).toEqual(['comment 7 ## Committee question\n\nFrom bob, routed as answer:\n\nIs there a top-down atlas?']);
    const state = readState(`${home}/state.json`);
    expect(state.approvalPosts).toEqual({ 100: 7, 101: 7, 200: 8 });
    expect(state.pendingApprovals).toEqual({ 7: 'bob' });
  });

  it('records every route in the ledger', async () => {
    await routeFeedback(fakeCtx(), 7, 'bob', 'q', 'answer', 100);
    await routeFeedback(fakeCtx(), 7, 'bob', 'p', 'patch', 100);
    expect(readLedger(home, new Date(0))).toEqual([
      { kind: 'route', issue: 7, route: 'answer', by: 'bob', at: '2026-09-30T10:00:00.000Z' },
      { kind: 'route', issue: 7, route: 'patch', by: 'bob', at: '2026-09-30T10:00:00.000Z' },
      { kind: 'card', issue: 7, step: 'patch', to: 'Testing', at: '2026-09-30T10:00:00.000Z' },
    ]);
  });

  it('drops a reply still waiting for Hermes once the card leaves Approval', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), unroutedReplies: { 5: { issue: 7, postId: 100, text: 'x', at: 'a' }, 6: { issue: 8, postId: 200, text: 'y', at: 'a' } } });
    await approve(fakeCtx(), 7, 'bob');
    expect(readState(`${home}/state.json`).unroutedReplies).toEqual({ 6: { issue: 8, postId: 200, text: 'y', at: 'a' } });
  });

  it('a patch takes the Telegram images of its post into the issue media and lists only their type, size and hash', async () => {
    const png = solidPng(4, 3, [1, 2, 3]);
    mkdirSync(`${home}/inbox/media/post-100`, { recursive: true });
    writeFileSync(`${home}/inbox/media/post-100/5-1.png`, png);
    writeFileSync(`${home}/inbox/media/post-100/5-2.skipped`, 'the file is no longer in the cache');
    await routeFeedback(fakeCtx(), 7, 'bob', 'Delete the middle dot', 'patch', 100);
    const sha = createHash('sha256').update(png).digest('hex');
    expect(calls[0]).toBe(`comment 7 ## Committee feedback\n\nFrom bob, routed as patch:\n\nDelete the middle dot\n\nThe reply came with 2 file(s) in Telegram. They stay private: the agent sees them in its media folder, and they are not posted here.\n- png, 4x3, ${png.length} bytes, sha256 ${sha}\n- not available: the chat bot could not keep it: the file is no longer in the cache`);
    expect(readFileSync(`${home}/media/issue-7/committee/${sha.slice(0, 16)}.png`)).toEqual(png);
    expect(existsSync(`${home}/inbox/media/post-100`)).toBe(false);
  });

  it('a patch Hermes routes from a text-and-image reply downloads the exact image the plugin noted, and posts no pixels or caption', async () => {
    const photo = solidPng(6, 4, [200, 10, 10]);
    telegramFiles = { 'AgACphoto': photo };
    const caption = 'Nice! Make pictures 25% smaller and apply some postprocessing so they look like photos';
    mkdirSync(`${home}/inbox/media/post-100`, { recursive: true });
    writeFileSync(`${home}/inbox/media/post-100/3527-1.telegram`, JSON.stringify({ fileId: 'AgACphoto', bytes: photo.length, by: '389', byName: 'Dr. Boris', text: caption }));
    await routeFeedback(fakeCtx(), 7, 'Dr. Boris', `${caption}\n\nHermes notes\nShrink the pictures.`, 'patch', 100);
    const sha = createHash('sha256').update(photo).digest('hex');
    expect(downloads).toEqual(['AgACphoto']);
    expect(calls[0]).toBe(`comment 7 ## Committee feedback\n\nFrom Dr. Boris, routed as patch:\n\n${caption}\n\nHermes notes\nShrink the pictures.\n\nThe reply came with 1 file(s) in Telegram. They stay private: the agent sees them in its media folder, and they are not posted here.\n- png, 6x4, ${photo.length} bytes, sha256 ${sha}`);
    expect(calls[0]).not.toContain('AgACphoto');
    expect(readFileSync(`${home}/media/issue-7/committee/${sha.slice(0, 16)}.png`)).toEqual(photo);
    const [entry] = JSON.parse(readFileSync(`${home}/media/issue-7/committee.json`, 'utf8')) as { source: string; status: string }[];
    expect(entry).toMatchObject({ status: 'ok', source: `committee reply in Telegram by Dr. Boris, who wrote with it: ${JSON.stringify(caption)}` });
    expect(existsSync(`${home}/inbox/media/post-100`)).toBe(false);
  });

  it('a patch whose Telegram image will not download still queues, and says the image is not available', async () => {
    mkdirSync(`${home}/inbox/media/post-100`, { recursive: true });
    writeFileSync(`${home}/inbox/media/post-100/3527-1.telegram`, JSON.stringify({ fileId: 'AgACgone', bytes: 1000, by: '389', byName: 'Dr. Boris', text: 'This but with closed cabin' }));
    await routeFeedback(fakeCtx(), 7, 'Dr. Boris', 'This but with closed cabin please', 'patch', 100);
    expect(downloads).toEqual(['AgACgone', 'AgACgone']);
    expect(calls[0]).toContain('\n- not available: Telegram did not give it after two tries: Telegram getFile failed: Bad Request: wrong file_id or the file is temporarily unavailable');
    expect(calls).toContain('move 7 Testing');
    expect(JSON.parse(readFileSync(`${home}/media/issue-7/committee.json`, 'utf8'))).toEqual([expect.objectContaining({ url: 'telegram:post-100-3527-1', status: 'failed' })]);
  });

  it('an answer leaves the Telegram images for a later route, and approve drops them', async () => {
    mkdirSync(`${home}/inbox/media/post-101`, { recursive: true });
    writeFileSync(`${home}/inbox/media/post-101/5-1.png`, solidPng(1, 1, [0, 0, 0]));
    await routeFeedback(fakeCtx(), 7, 'bob', 'q', 'answer', 101);
    expect(calls[0]).toBe('comment 7 ## Committee question\n\nFrom bob, routed as answer:\n\nq');
    expect(existsSync(`${home}/inbox/media/post-101/5-1.png`)).toBe(true);
    await approve(fakeCtx(), 7, 'bob');
    expect(existsSync(`${home}/inbox/media/post-101`)).toBe(false);
  });

  it('throws when the card is not in Approval', async () => {
    column = 'Design';
    await expect(routeFeedback(fakeCtx(), 7, 'bob', 'p', 'patch', 100)).rejects.toThrow('not in Approval');
    expect(calls).toEqual([]);
  });
});

describe('deny', () => {
  it('comments, labels wont-do, closes as not planned, moves to Done and clears state', async () => {
    await deny(fakeCtx(), 7, 'bob');
    expect(calls).toEqual([
      'comment 7 Denied by bob in the committee chat.',
      'addLabel 7 wont-do',
      'close 7 not planned',
      'move 7 Done',
    ]);
    const state = readState(`${home}/state.json`);
    expect(state.approvalPosts).toEqual({ 200: 8 });
    expect(state.pendingApprovals).toEqual({});
    expect(state.builds).toEqual({ 8: 'bbb2222' });
  });

  it('queues the denied issue for the incident job', async () => {
    await deny(fakeCtx(), 7, 'bob');
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([7]);
  });

  it('queues nothing when a card is dropped', async () => {
    await closeCard(fakeCtx(), 7, 'Dropped.', 'dropped');
    expect(readState(`${home}/state.json`).pendingIncidents).toEqual([]);
  });

  it('drops a kept approval with the card', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), keptApprovals: { 7: { by: 'ann', at: 'a', build: 'aaa1111', checked: ['aaa1111'], reason: null } } });
    await deny(fakeCtx(), 7, 'bob');
    expect(readState(`${home}/state.json`).keptApprovals).toEqual({});
  });

  it('sends each bundled issue back to Triage on its own and forgets the bundle', async () => {
    writeState(`${home}/state.json`, { ...readState(`${home}/state.json`), bundles: { '7': [9], '8': [10] } });
    await deny(fakeCtx(), 7, 'bob');
    expect(calls.slice(-3)).toEqual(['comment 9 #7 was denied, so this issue goes back to triage on its own.', 'removeLabel 9 bundled', 'move 9 Triage']);
    expect(readState(`${home}/state.json`).bundles).toEqual({ '8': [10] });
  });

  it('closes the open pull request with the same comment', async () => {
    openPr = 'https://github.com/o/r/pull/3';
    await deny(fakeCtx(), 7, 'bob');
    expect(calls).toContain('closePullRequest factory/issue-7 Denied by bob in the committee chat.');
  });

  it('throws when the card is not in Approval', async () => {
    column = 'Testing';
    await expect(deny(fakeCtx(), 7, 'bob')).rejects.toThrow('not in Approval');
    expect(calls).toEqual([]);
  });
});

describe('closeCard', () => {
  it('drops a card from any column with the given comment', async () => {
    column = 'Testing';
    await closeCard(fakeCtx(), 7, 'Dropped by Ann: dead end', 'dropped');
    expect(calls).toEqual([
      'comment 7 Dropped by Ann: dead end',
      'addLabel 7 wont-do',
      'close 7 not planned',
      'move 7 Done',
    ]);
    expect(readState(`${home}/state.json`).approvalPosts).toEqual({ 200: 8 });
  });
});
