import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pngBytes } from '../photo-fixtures';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { IssueMerge, ReleaseState } from '../types';
import { changelogText, readChanges } from './release-common';
import { ROOT, fake, issueMerge, reset, type Fake } from './test-fakes';

const SHOT = pngBytes(0).toString('latin1');
const deployed: string[] = [];
vi.mock('../deploy', () => ({
  buildAndDeploy: async (_ctx: unknown, _clone: string, scope: string, _log: string, reports: string | null) => { deployed.push(`${scope} reports ${reports}`); return `https://play.test/${scope}/`; },
  recordBuild: (_statePath: string, issue: number, name: string) => { deployed.push(`record ${issue} ${name}`); },
}));
const { candidate, candidateCaption } = await import('./candidate');

const TRUCKS = issueMerge(3, 'faster trucks');
const HORN = issueMerge(5, 'louder horn');
const passing = (features: IssueMerge[], sha = 'abc1234'): ReleaseState['playtest']['passed'] => ({ sha, features });
const holds = (f: Fake, features: IssueMerge[]): void => { writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, playtest: { ...RELEASE.playtest, passed: passing(features) } } }); };
const RELEASE: ReleaseState = { issue: 11, day: '2026-09-29', postId: null, removed: [], candidate: null, playtest: { seed: 1, runs: 0, lastStart: null, passed: passing([TRUCKS, HORN]), fixes: null, blocked: null, decision: null, work: null } };
const CHANGES = JSON.stringify([{ issue: 3, text: 'Trucks are faster.' }, { issue: 5, text: 'The horn is louder.' }]);
const ONLY_TRUCKS = JSON.stringify([{ issue: 3, text: 'Trucks are faster.' }]);

beforeEach(() => {
  reset();
  deployed.length = 0;
  writeState(fake().ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE });
});

describe('candidate', () => {
  it('runs the release candidate agent on Opus', async () => {
    const f = fake();
    f.ctx.cfg = { ...f.ctx.cfg, designModel: 'opus', buildModel: 'sonnet' };
    f.agentWrites = { 'release.json': CHANGES, 'screenshot.png': SHOT };
    const original = f.ctx.container.agent;
    const models: string[] = [];
    f.ctx.container.agent = async (run) => { models.push(run.model); return original(run); };
    await candidate(f.ctx, 11);
    expect(models).toEqual(['opus']);
  });

  it('checks the frame rate in its playtest on a GPU host, unlike issue checks', async () => {
    const f = fake();
    f.ctx.cfg = { ...f.ctx.cfg, gpu: true };
    f.agentWrites = { 'release.json': CHANGES, 'screenshot.png': SHOT };
    const scripts: string[] = [];
    f.ctx.container.shell = async (_kind, _dir, script) => { scripts.push(script); };
    await candidate(f.ctx, 11);
    expect(scripts[0]).toContain('  env -u TEST_TIMEOUTS npm run playtest || status=$?');
    expect(scripts[0]).not.toContain('--no-fps-gate');
  });

  it('posts one photo with a Ship button, stores the post id and puts the whole changelog in a reply to it', async () => {
    const f = fake();
    f.agentWrites = { 'release.json': CHANGES, 'screenshot.png': SHOT };
    await candidate(f.ctx, 11);
    expect(f.calls.filter((call) => !call.startsWith('comment'))).toEqual(['fetch', 'replace abc1234 factory/candidate', 'fetch', 'prepare factory/candidate', 'shell', 'agent', 'pr factory/candidate main Release 2026-09-29', 'photo committee', 'message committee 42 - [#3] Trucks are faster.\n- [#5] The horn is louder.']);
    expect(deployed).toEqual(['rc reports candidate', 'record 11 rc']);
    expect(f.calls.find((call) => call.startsWith('comment'))).toContain('- [#5] The horn is louder.');
    const photo = f.photos[0];
    expect(photo.buttons).toEqual([[{ text: 'Ship', data: 'factory:ship:11' }]]);
    expect(photo.caption).toContain('Play: https://play.test/rc/');
    expect(photo.caption).toContain('2 changes, listed in the message under this post.');
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: 42, candidate: { sha: 'abc1234', features: [TRUCKS, HORN] } });
  });

  it('builds the commit the playtest passed, never a branch head', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, playtest: { ...RELEASE.playtest, passed: passing([TRUCKS, HORN], 'pass999') } } });
    f.ctx.repo.headHash = async () => 'moved00';
    f.agentWrites = { 'release.json': CHANGES, 'screenshot.png': SHOT };
    await candidate(f.ctx, 11);
    expect(f.calls).toContain('replace pass999 factory/candidate');
    expect(readState(f.ctx.statePath).release?.candidate?.sha).toBe('pass999');
  });

  it('refuses to build when the playtest passed nothing, and builds nothing', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, playtest: { ...RELEASE.playtest, passed: null } } });
    await expect(candidate(f.ctx, 11)).rejects.toThrow('has passed no commit');
    expect(f.calls.filter((call) => call.startsWith('prepare') || call === 'shell' || call === 'agent')).toEqual([]);
    expect(deployed).toEqual([]);
    expect(f.photos).toEqual([]);
  });

  it('refuses a pass that holds a removed feature', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, removed: [5] } });
    await expect(candidate(f.ctx, 11)).rejects.toThrow('has passed no commit');
    expect(deployed).toEqual([]);
  });

  it('does not post when a newer pass landed during the build, so the tick builds the newer one', async () => {
    const f = fake();
    holds(f, [TRUCKS]);
    f.agentWrites = { 'release.json': ONLY_TRUCKS, 'screenshot.png': SHOT };
    const original = f.ctx.container.agent;
    f.ctx.container.agent = async (run) => {
      const output = await original(run);
      writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, playtest: { ...RELEASE.playtest, passed: passing([TRUCKS], 'newer00') } } });
      return output;
    };
    await candidate(f.ctx, 11);
    expect(f.photos).toEqual([]);
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: null, candidate: null });
  });

  it('does not post when a ship was ordered during the build', async () => {
    const f = fake();
    holds(f, [TRUCKS]);
    f.agentWrites = { 'release.json': ONLY_TRUCKS, 'screenshot.png': SHOT };
    const original = f.ctx.container.agent;
    f.ctx.container.agent = async (run) => {
      const output = await original(run);
      writeState(f.ctx.statePath, { ...readState(f.ctx.statePath), pendingShip: 'Ann' });
      return output;
    };
    await candidate(f.ctx, 11);
    expect(f.photos).toEqual([]);
  });

  it('replaces a posted candidate with the newer pass', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: { ...RELEASE, postId: 30, candidate: { sha: 'old0001', features: [TRUCKS] } } });
    f.agentWrites = { 'release.json': CHANGES, 'screenshot.png': SHOT };
    await candidate(f.ctx, 11);
    expect(readState(f.ctx.statePath).release).toMatchObject({ postId: 42, candidate: { sha: 'abc1234' } });
  });

  it('lists the issues bundled into a change under it, so the changelog sums up the bundle in one line', async () => {
    const f = fake();
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), release: RELEASE, bundles: { '3': [8, 9] } });
    f.agentWrites = { 'release.json': CHANGES, 'screenshot.png': SHOT };
    await candidate(f.ctx, 11);
    const input = readFileSync(join(ROOT, 'work', 'release-candidate', 'game', '.factory', 'changelog.md'), 'utf8');
    expect(input).toBe('#3 faster trucks\n  bundled: #8 T\n  bundled: #9 T\n#5 louder horn\n');
  });

  it('opens the pull request to main when none is open', async () => {
    const f = fake();
    holds(f, [TRUCKS]);
    f.agentWrites = { 'release.json': ONLY_TRUCKS, 'screenshot.png': SHOT };
    await candidate(f.ctx, 11);
    expect(f.calls).toContain('pr factory/candidate main Release 2026-09-29');
    expect(f.photos[0].caption).toContain('PR: http://pr');
  });

  it('refuses an issue that is not the tracking issue and posts nothing', async () => {
    const f = fake();
    await expect(candidate(f.ctx, 12)).rejects.toThrow('not the tracking issue');
    expect(f.photos).toEqual([]);
  });

  it('throws when no release is open', async () => {
    const f = fake();
    writeState(f.ctx.statePath, structuredClone(EMPTY_STATE));
    await expect(candidate(f.ctx, 11)).rejects.toThrow('No release is open');
  });

  it('throws when the agent wrote no notes, before it builds anything', async () => {
    const f = fake();
    f.agentWrites = { 'screenshot.png': SHOT };
    await expect(candidate(f.ctx, 11)).rejects.toThrow('no .factory/release.json');
    expect(deployed).toEqual([]);
  });

  it('throws when the changelog misses a change, before it builds or posts anything', async () => {
    const f = fake();
    f.agentWrites = { 'release.json': ONLY_TRUCKS, 'screenshot.png': SHOT };
    await expect(candidate(f.ctx, 11)).rejects.toThrow('release.json names #3, but the release holds #3, #5');
    expect(deployed).toEqual([]);
    expect(f.photos).toEqual([]);
  });
});

describe('candidate evidence', () => {
  function setup(manifest = JSON.stringify({ images: [{ file: 'screenshot.png', description: 'Faster trucks' }, { file: 'view1.png', description: 'Louder horn' }] })): ReturnType<typeof fake> {
    const f = fake();
    f.agentWrites = { 'release.json': CHANGES, 'screenshot.png': SHOT, 'view1.png': pngBytes(1).toString('latin1'), 'evidence.json': manifest };
    return f;
  }

  it('posts the Ship post alone, then the extra view as a reply to it, then the changelog', async () => {
    const f = setup();
    await candidate(f.ctx, 11);
    expect(f.photos).toHaveLength(1);
    expect(f.photos[0].buttons).toEqual([[{ text: 'Ship', data: 'factory:ship:11' }]]);
    expect(f.albums).toEqual([{ chat: 'committee', paths: [expect.stringContaining('view1.png')], captions: ['2/2 Louder horn'], replyTo: 42 }]);
    const posts = f.calls.filter((call) => /^(photo|album|message)/.test(call));
    expect(posts).toEqual(['photo committee', 'album committee 1 42', expect.stringContaining('message committee 42')]);
    expect(readState(f.ctx.statePath).release?.postId).toBe(42);
  });

  it('posts the one screenshot when the manifest cannot be read', async () => {
    const f = setup('{');
    await candidate(f.ctx, 11);
    expect(f.albums).toEqual([]);
    expect(f.photos).toHaveLength(1);
  });

  it('keeps the Ship post and logs the failure when the album fails', async () => {
    const f = setup();
    f.albumFails = true;
    await candidate(f.ctx, 11);
    expect(readState(f.ctx.statePath).release?.postId).toBe(42);
    expect(f.logs.some((line) => line.includes('the extra images of post 42 did not upload') && line.includes('boom'))).toBe(true);
    expect(f.calls.some((call) => call.startsWith('editCaption 42 Superseded'))).toBe(false);
    expect(f.calls.some((call) => call.startsWith('message committee 42'))).toBe(true);
  });
});

describe('candidateCaption', () => {
  it('fits the Telegram caption limit and points to the changelog under the post', () => {
    const caption = candidateCaption('2026-09-29', 'https://p/rc/', 'https://i', 'https://pr', 33);
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain('33 changes, listed in the message under this post.');
    expect(caption).toContain('Play: https://p/rc/\nPR: https://pr\nIssue: https://i');
    expect(caption.endsWith('33 changes, listed in the message under this post.')).toBe(true);
    for (const tail of ['Ship publishes it', 'remove #N', 'Reply to this post', 'holds the release']) expect(caption).not.toContain(tail);
  });

  it('says so when no change is left', () => {
    expect(candidateCaption('2026-09-29', 'u', 'i', 'p', 0)).toContain('No changes in this candidate.');
  });
});

describe('readChanges', () => {
  const features = [{ issue: 3, title: 'faster trucks' }, { issue: 5, title: 'louder horn' }];

  it('keeps one change per entry in the order written and builds the changelog from them', () => {
    const raw = JSON.stringify([{ issue: 5, text: ' The horn is louder. ' }, { issue: 3, text: 'Trucks are faster.' }]);
    const changes = readChanges(raw, features);
    expect(changes).toEqual([{ issue: 5, text: 'The horn is louder.' }, { issue: 3, text: 'Trucks are faster.' }]);
    expect(changelogText(changes)).toBe('- [#5] The horn is louder.\n- [#3] Trucks are faster.');
  });

  it('refuses a missing file, bad shapes, a missing change and an extra one', () => {
    expect(() => readChanges(null, features)).toThrow('wrote no .factory/release.json');
    expect(() => readChanges('{}', features)).toThrow('not an array');
    expect(() => readChanges('[{"issue":"3","text":"x"}]', features)).toThrow('needs each entry');
    expect(() => readChanges('[{"issue":3,"text":" "}]', features)).toThrow('needs each entry');
    expect(() => readChanges('[3]', features)).toThrow('needs each entry');
    expect(() => readChanges('not json', features)).toThrow();
    expect(() => readChanges(JSON.stringify([{ issue: 3, text: 'a' }, { issue: 5, text: 'b' }, { issue: 9, text: 'c' }]), features)).toThrow('names #3, #5, #9');
  });
});
