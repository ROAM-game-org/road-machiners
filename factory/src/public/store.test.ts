import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { openStore, storePath } from './store';

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

  it('keeps a message with an unknown thread only when the plugin marks it standalone', () => {
    const store = postedStore();
    const base = { kind: 'comment' as const, chat: GROUP, author: 'Ann', at: now.toISOString() };
    store.applyEvent({ ...base, updateId: 1, messageId: 60, threadId: 999, text: 'Committee chat reply' });
    store.applyEvent({ ...base, updateId: 2, messageId: 61, threadId: null, text: '@bot add a minimap', user: '42', addressed: true, standalone: true });
    expect(store.unclassifiedComments().map((c) => [c.issue, c.text, c.addressed])).toEqual([[null, '@bot add a minimap', true]]);
  });

  it('keeps off-topic and chatter comments out of the parent digest and routes, and files only off-topic bugs and features', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    const texts = ['On topic', 'Off topic', 'Chatter', 'Standalone'];
    texts.forEach((text, index) => store.applyEvent({ updateId: index + 1, kind: 'comment', chat: CHANNEL, messageId: 201 + index, threadId: index === 3 ? null : 200, author: 'Ann', text, at: now.toISOString(), standalone: true }));
    const [onTopic, offTopic, chatter, standalone] = store.unclassifiedComments();
    store.classify(onTopic!.id, 'bug', 'patch', now, { relevance: 'parent', topic: 'none' });
    store.classify(offTopic!.id, 'feature', 'redesign', now, { relevance: 'other', topic: 'none' });
    store.classify(chatter!.id, 'chatter', 'none', now, { relevance: 'parent', topic: 'none' });
    store.classify(standalone!.id, 'bug', 'none', now, { relevance: 'other', topic: 'none' });
    expect(store.unsentComments().map((c) => c.text)).toEqual(['On topic']);
    expect(store.pendingRoutes().map((c) => c.text)).toEqual(['On topic']);
    expect(store.toFile().map((c) => c.text)).toEqual(['Off topic', 'Standalone']);
    expect(store.toReply().map((c) => c.text)).toEqual(['On topic', 'Chatter']);
  });

  it('finds an earlier filed issue by the normalized text and frees a comment for its reply once claimed', () => {
    const store = postedStore();
    const add = (id: number, text: string) => store.applyEvent({ updateId: id, kind: 'comment', chat: GROUP, messageId: id, threadId: null, author: 'Ann', text, at: now.toISOString(), standalone: true });
    add(1, 'Add a MINIMAP!');
    add(2, '@roam_bot add a minimap');
    for (const comment of store.unclassifiedComments()) store.classify(comment.id, 'feature', 'none', now, { relevance: 'other', topic: 'none' });
    const [first, second] = store.toFile();
    expect(store.claimFiling(first!.id, first!.text, now)).toBeNull();
    store.setFiled(first!.id, 571);
    expect(store.claimFiling(second!.id, second!.text, now)).toBe(571);
    expect(store.toFile()).toEqual([]);
    expect(store.toReply().map((c) => [c.text, c.filedIssue])).toEqual([['Add a MINIMAP!', 571], ['@roam_bot add a minimap', null]]);
  });

  it('maps a reply to the bot reply of a counted comment to that comment thread', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 101, threadId: 100, author: 'Ann', text: 'Cheaper please', at: now.toISOString() });
    const [comment] = store.unclassifiedComments();
    store.setReplyId(comment!.id, 150);
    store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 151, threadId: 150, author: 'Ann', text: 'Thanks, and lighter too', at: now.toISOString() });
    expect(store.unclassifiedComments().map((c) => [c.issue, c.text])).toEqual([[7, 'Cheaper please'], [7, 'Thanks, and lighter too']]);
  });

  it('moves old comments into the new table and never replies to or files them', () => {
    const home = mkdtempSync(join(tmpdir(), 'public-store-'));
    openStore(home).close();
    const db = new DatabaseSync(storePath(home));
    db.exec('drop table comments');
    db.exec('create table comments (id integer primary key autoincrement, issue integer not null, source text not null, source_id text not null unique, post_chat text, post_message_id integer, author text not null, text text not null, at text not null, kind text, route text, classified_at text, sent_at text, routed_at text)');
    db.prepare("insert into comments (issue, source, source_id, post_chat, post_message_id, author, text, at, kind, route, classified_at) values (7, 'telegram', 'c:1', 'c', 100, 'Ann', 'Old', ?, 'feature', 'none', ?)").run(now.toISOString(), now.toISOString());
    db.close();
    const store = openStore(home);
    expect(store.unsentComments().map((c) => c.text)).toEqual(['Old']);
    expect(store.toFile()).toEqual([]);
    expect(store.toReply()).toEqual([]);
    store.addComment({ issue: null, source: 'telegram', sourceId: 'c:2', postChat: 'c', postMessageId: null, author: 'Bob', text: 'New', at: now.toISOString() });
    store.close();
  });
});

