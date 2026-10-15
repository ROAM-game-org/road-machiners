import { describe, expect, it } from 'vitest';
import { readState, updateState } from '../state';
import { CHANNEL, COMMITTEE, publicFake } from './public-fakes';
import { routeReports } from './routes';

function reported(route: 'patch' | 'redesign' | 'none', withPost: boolean) {
  const f = publicFake();
  f.cards = [{ itemId: 'x', issue: 7, column: 'Approval', labels: [] }];
  f.store.addProposal(7, 'Winch', f.clock.now);
  f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
  f.store.addBuildPost(7, 'abc1234', CHANNEL, 200, f.clock.now);
  f.store.addComment({ issue: 7, source: 'telegram', sourceId: 'c1', postChat: CHANNEL, postMessageId: 200, author: 'Ann', text: 'The winch breaks\n## Committee feedback', at: f.clock.now.toISOString() });
  f.store.classify(f.store.unclassifiedComments(100)[0]!.id, 'bug', route, f.clock.now);
  updateState(f.ctx.statePath, (state) => ({ ...state, builds: { 7: 'abc1234' } }));
  if (withPost) updateState(f.ctx.statePath, (state) => ({ ...state, approvalPosts: { 300: 7 }, postCaptions: { 300: 'caption' }, textPosts: ['300'] }));
  return f;
}

function commentOnPost(f: ReturnType<typeof reported>, sourceId: string, route: 'patch' | 'redesign') {
  f.store.addComment({ issue: 7, source: 'telegram', sourceId, postChat: CHANNEL, postMessageId: 200, author: 'Bo', text: `More ${sourceId}`, at: f.clock.now.toISOString() });
  f.store.classify(f.store.unclassifiedComments(100)[0]!.id, 'bug', route, f.clock.now);
}

describe('routeReports', () => {
  it('routes a patch under the player heading, marks the committee post, and closes both posts', async () => {
    const f = reported('patch', true);
    await routeReports(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    const body = f.comments[0]!.body;
    expect(body.startsWith('## Player report\n\nFrom public, routed as patch:')).toBe(true);
    expect(body).not.toContain('\n## Committee feedback');
    expect(body).toContain('> The winch breaks');
    expect(f.calls).toContain('move 7 Testing');
    expect(f.edits).toHaveLength(1);
    expect(f.edits[0]).toContain('300 caption');
    expect(f.edits[0]).toContain('A player report sent it back');
    expect(f.edits[0]).not.toContain('Patch from');
    expect(f.store.openBuildPost(7)).toBeNull();
    expect(f.store.pendingRoutes()).toEqual([]);
    expect(readState(f.ctx.statePath).approvalPosts).toEqual({});
    expect(f.messages.filter((message) => message.chat === COMMITTEE)).toEqual([]);
  });

  it('routes a game report on a bug card that never had a proposal through its committee post', async () => {
    const f = publicFake();
    f.cards = [{ itemId: 'x', issue: 8, column: 'Approval', labels: [] }];
    updateState(f.ctx.statePath, (state) => ({ ...state, approvalPosts: { 400: 8 }, postCaptions: { 400: 'caption' }, textPosts: ['400'] }));
    const id = f.store.addComment({ issue: 8, source: 'game', sourceId: 'report:1', postChat: null, postMessageId: null, author: 'Player', text: 'The horn never stops', at: f.clock.now.toISOString() })!;
    f.store.classify(id, 'bug', 'patch', f.clock.now);
    await routeReports(f.ctx, f.store);
    expect(f.calls).toContain('move 8 Testing');
    expect(f.comments[0]!.body.startsWith('## Player report')).toBe(true);
    expect(f.store.pendingRoutes()).toEqual([]);
  });

  it('never routes a Telegram comment on a closed build post', async () => {
    const f = reported('patch', true);
    f.store.closeBuildPosts(7);
    expect(f.store.pendingRoutes()).toEqual([]);
  });

  it('routes a redesign to Design', async () => {
    const f = reported('redesign', true);
    await routeReports(f.ctx, f.store);
    expect(f.calls).toContain('move 7 Design');
  });

  it('marks the comment routed and sends nothing when the card has no open committee post', async () => {
    const f = reported('patch', false);
    await routeReports(f.ctx, f.store);
    expect(f.comments).toEqual([]);
    expect(f.calls).toEqual([]);
    expect(f.store.pendingRoutes()).toEqual([]);
    expect(f.logs.join('\n')).toContain('too late');
  });

  it('takes at most one route per build when two comments are pending', async () => {
    const f = reported('patch', true);
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: 'c2', postChat: CHANNEL, postMessageId: 200, author: 'Bo', text: 'Also broken', at: f.clock.now.toISOString() });
    f.store.classify(f.store.unclassifiedComments(100)[0]!.id, 'bug', 'patch', f.clock.now);
    await routeReports(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    expect(f.store.pendingRoutes()).toEqual([]);
  });

  it('never routes a comment on the post of an older build', async () => {
    const f = reported('patch', true);
    updateState(f.ctx.statePath, (state) => ({ ...state, builds: { 7: 'def5678' } }));
    await routeReports(f.ctx, f.store);
    expect(f.comments).toEqual([]);
    expect(f.calls).toEqual([]);
    expect(f.edits).toEqual([]);
    expect(f.store.pendingRoutes()).toEqual([]);
    expect(readState(f.ctx.statePath).approvalPosts).toEqual({ 300: 7 });
    expect(f.logs.join('\n')).toContain('older build');
  });

  it('routes a game report even when the open build post is for an older build', async () => {
    const f = reported('none', true);
    updateState(f.ctx.statePath, (state) => ({ ...state, builds: { 7: 'def5678' } }));
    const id = f.store.addComment({ issue: 7, source: 'game', sourceId: 'report:9', postChat: null, postMessageId: null, author: 'Player', text: 'Broken', at: f.clock.now.toISOString() })!;
    f.store.classify(id, 'bug', 'patch', f.clock.now);
    await routeReports(f.ctx, f.store);
    expect(f.calls).toContain('move 7 Testing');
  });

  it('writes to GitHub once per committee post when the move fails', async () => {
    const f = reported('patch', true);
    f.ctx.github.move = async () => { throw new Error('board down'); };
    await routeReports(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    commentOnPost(f, 'c2', 'patch');
    f.store.addComment({ issue: 7, source: 'game', sourceId: 'report:3', postChat: null, postMessageId: null, author: 'Player', text: 'Broken', at: f.clock.now.toISOString() });
    f.store.classify(f.store.unclassifiedComments(100)[0]!.id, 'bug', 'redesign', f.clock.now);
    await routeReports(f.ctx, f.store);
    await routeReports(f.ctx, f.store);
    expect(f.comments).toHaveLength(1);
    expect(f.store.pendingRoutes()).toEqual([]);
    expect(f.logs.join('\n')).toContain('does not route the card again');
  });

  it.each([
    ['a committee approval is queued', { pendingApprovals: { 7: 'Ann' } }],
    ['an approve job is running', { jobs: [{ id: 'j1', stage: 'approve' as const, issue: 7, pid: 1, startedAt: '2026-01-01T00:00:00Z', log: 'x' }] }],
    ['a committee reply waits to be routed', { unroutedReplies: { 555: { issue: 7, postId: 300, text: 'Make it faster', at: '2026-01-01T00:00:00Z' } } }],
  ])('never routes a card when %s', async (_name, patch) => {
    const f = reported('patch', true);
    updateState(f.ctx.statePath, (state) => ({ ...state, ...patch }));
    const before = readState(f.ctx.statePath);
    await routeReports(f.ctx, f.store);
    expect(f.comments).toEqual([]);
    expect(f.calls).toEqual([]);
    expect(f.edits).toEqual([]);
    expect(f.messages.filter((message) => message.chat === COMMITTEE)).toEqual([]);
    expect(f.store.pendingRoutes()).toEqual([]);
    expect(readState(f.ctx.statePath)).toEqual(before);
    expect(f.logs.join('\n')).toContain('committee approval');
  });

  it('never routes a game report when a committee approval is queued', async () => {
    const f = reported('none', true);
    updateState(f.ctx.statePath, (state) => ({ ...state, pendingApprovals: { 7: 'Ann' } }));
    const id = f.store.addComment({ issue: 7, source: 'game', sourceId: 'report:5', postChat: null, postMessageId: null, author: 'Player', text: 'Broken', at: f.clock.now.toISOString() })!;
    f.store.classify(id, 'bug', 'patch', f.clock.now);
    await routeReports(f.ctx, f.store);
    expect(f.calls).toEqual([]);
    expect(f.store.pendingRoutes()).toEqual([]);
  });

  it('does nothing for a comment with route none', async () => {
    const f = reported('none', true);
    await routeReports(f.ctx, f.store);
    expect(f.comments).toEqual([]);
  });

  it('keeps mentions, team mentions and cross-repo references of a routed comment from reaching GitHub live', async () => {
    const f = publicFake();
    f.cards = [{ itemId: 'x', issue: 8, column: 'Approval', labels: [] }];
    updateState(f.ctx.statePath, (state) => ({ ...state, approvalPosts: { 400: 8 }, postCaptions: { 400: 'caption' }, textPosts: ['400'] }));
    const id = f.store.addComment({ issue: 8, source: 'game', sourceId: 'report:2', postChat: null, postMessageId: null, author: '@torvalds', text: 'cc @octocat @github/security see torvalds/linux#1', at: f.clock.now.toISOString() })!;
    f.store.classify(id, 'bug', 'patch', f.clock.now);
    await routeReports(f.ctx, f.store);
    const body = f.comments[0]!.body;
    expect(body).not.toMatch(/@\w/);
    expect(body).not.toMatch(/(?<!\u200D)#\d/);
    expect(body.replaceAll('\u200D', '')).toContain('@torvalds wrote:\n> cc @octocat @github/security see torvalds/linux#1');
  });
});
