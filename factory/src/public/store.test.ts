import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openStore } from './store';

const CHANNEL = '-100channel';
const GROUP = '-100group';
const THUMBS = ['👍'];
const now = new Date('2026-10-14T10:00:00Z');

function postedStore() {
  const store = openStore(mkdtempSync(join(tmpdir(), 'public-store-')));
  store.addProposal(7, 'Add a winch', now);
  store.markProposalPosted(7, CHANNEL, 100, now);
  return store;
}

describe('public store', () => {
  it('applies an update id once', () => {
    const store = postedStore();
    const event = { updateId: 1, kind: 'reaction-count' as const, chat: CHANNEL, messageId: 100, counts: { '👍': 3 } };
    expect(store.applyEvent(event)).toBe(true);
    expect(store.applyEvent({ ...event, counts: { '👍': 9 } })).toBe(false);
    expect(store.votes(7, THUMBS)).toBe(3);
  });

  it('counts channel votes from the latest count', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 3, '👎': 2 } });
    store.applyEvent({ updateId: 2, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 5 } });
    expect(store.votes(7, THUMBS)).toBe(5);
  });

  it('counts group votes per user with their current reaction', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'a', emoji: ['👍'] });
    store.applyEvent({ updateId: 2, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'b', emoji: ['👍'] });
    store.applyEvent({ updateId: 3, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'b', emoji: [] });
    store.applyEvent({ updateId: 4, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'c', emoji: ['🔥'] });
    expect(store.votes(7, THUMBS)).toBe(1);
  });

  it('opens a fresh proposal when a card is put to a vote after its proposal closed, with no votes carried over', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'a', emoji: ['👍'] });
    store.applyEvent({ updateId: 2, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 4 } });
    store.setShownVotes(7, 4);
    store.closeProposal(7, now);
    const later = new Date('2026-10-15T10:00:00Z');
    store.addProposal(7, 'Add a better winch', later);
    expect(store.proposal(7)).toEqual({ issue: 7, pitch: 'Add a better winch', chat: null, messageId: null, postedAt: null, closedAt: null });
    expect(store.unpostedProposals().map((proposal) => proposal.issue)).toEqual([7]);
    expect(store.openProposals()).toEqual([]);
    expect(store.shownVotes(7)).toBeNull();
    store.markProposalPosted(7, CHANNEL, 200, later);
    expect(store.votes(7, THUMBS)).toBe(0);
    expect(store.votersWith(7, THUMBS)).toEqual([]);
  });

  it('keeps an open posted proposal when its card is put to a vote again', () => {
    const store = postedStore();
    store.addProposal(7, 'Another pitch', now);
    expect(store.proposal(7)).toMatchObject({ pitch: 'Add a winch', messageId: 100, closedAt: null });
  });

  it('maps a discussion comment to its issue through the automatic forward', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'forward', chat: GROUP, messageId: 55, channelChat: CHANNEL, channelMessageId: 100 });
    store.applyEvent({ updateId: 2, kind: 'comment', chat: GROUP, messageId: 56, threadId: 55, author: 'Ann', text: 'Yes please', at: now.toISOString() });
    store.applyEvent({ updateId: 3, kind: 'comment', chat: GROUP, messageId: 57, threadId: 999, author: 'Bob', text: 'Off topic', at: now.toISOString() });
    expect(store.unclassifiedComments().map((c) => [c.issue, c.text])).toEqual([[7, 'Yes please']]);
  });

  it('maps a reply to a player comment to the issue and post of that comment', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 201, threadId: 200, author: 'Ann', text: 'It crashes', at: now.toISOString() });
    store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 202, threadId: 201, author: 'Bob', text: 'Same here on the bridge', at: now.toISOString() });
    store.applyEvent({ updateId: 3, kind: 'comment', chat: CHANNEL, messageId: 203, threadId: 202, author: 'Cid', text: 'Me too', at: now.toISOString() });
    for (const comment of store.unclassifiedComments()) store.classify(comment.id, 'bug', 'patch', now);
    expect(store.pendingRoutes().map((c) => [c.issue, c.text])).toEqual([[7, 'It crashes'], [7, 'Same here on the bridge'], [7, 'Me too']]);
  });

  it('routes only comments on the open build post', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 201, threadId: 200, author: 'Ann', text: 'It crashes', at: now.toISOString() });
    store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 101, threadId: 100, author: 'Bob', text: 'Crash on proposal', at: now.toISOString() });
    for (const comment of store.unclassifiedComments()) store.classify(comment.id, 'bug', 'patch', now);
    expect(store.pendingRoutes().map((c) => c.text)).toEqual(['It crashes']);
    store.addBuildPost(7, 'def', CHANNEL, 300, now);
    expect(store.pendingRoutes()).toEqual([]);
  });

  it('keeps rejected comments out of digests and routes', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 201, threadId: 200, author: 'Ann', text: 'spam', at: now.toISOString() });
    const [comment] = store.unclassifiedComments();
    store.classify(comment.id, 'rejected', 'patch', now);
    expect(store.unsentComments()).toEqual([]);
    expect(store.pendingRoutes()).toEqual([]);
  });

  it('counts posted proposals in a window', () => {
    const store = postedStore();
    expect(store.proposalsPostedSince(new Date(now.getTime() - 1000))).toBe(1);
    expect(store.proposalsPostedSince(new Date(now.getTime() + 1000))).toBe(0);
    expect(store.unpostedProposals()).toEqual([]);
  });

  it('counts hits per address and hour', () => {
    const store = postedStore();
    expect(store.countHit('1.2.3.4', now)).toBe(1);
    expect(store.countHit('1.2.3.4', now)).toBe(2);
    expect(store.countHit('1.2.3.4', new Date(now.getTime() + 3_600_000))).toBe(1);
  });

  it('survives a reopen', () => {
    const home = mkdtempSync(join(tmpdir(), 'public-store-'));
    const first = openStore(home);
    first.addProposal(7, 'Add a winch', now);
    first.close();
    expect(openStore(home).unpostedProposals().map((p) => p.issue)).toEqual([7]);
  });
});
