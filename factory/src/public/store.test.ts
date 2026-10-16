import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openStore, PublicStore, storePath } from './store';

const CHANNEL = '-100channel';
const GROUP = '-100group';
const UP = ['👍'];
const DOWN = ['👎'];
const now = new Date('2026-10-14T10:00:00Z');

function postedStore() {
  const store = openStore(mkdtempSync(join(tmpdir(), 'public-store-')));
  store.addProposal(7, 'Add a winch', now);
  store.beginProposalPost(7, now);
  store.markProposalPosted(7, CHANNEL, 100, 'footer', now);
  return store;
}

describe('public store', () => {
  it('applies an update id once', () => {
    const store = postedStore();
    const event = { updateId: 1, kind: 'reaction-count' as const, chat: CHANNEL, messageId: 100, counts: { '👍': 3 } };
    expect(store.applyEvent(event)).toBe(true);
    expect(store.applyEvent({ ...event, counts: { '👍': 9 } })).toBe(false);
    expect(store.tally(7, UP, DOWN)).toEqual({ up: 3, down: 0 });
  });

  it('counts channel votes from the latest count', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 3, '👎': 2 } });
    store.applyEvent({ updateId: 2, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 5 } });
    expect(store.tally(7, UP, DOWN)).toEqual({ up: 5, down: 0 });
    store.applyEvent({ updateId: 3, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 1, '👎': 4 } });
    expect(store.tally(7, UP, DOWN)).toEqual({ up: 1, down: 4 });
  });

  it('counts group votes per user with their current reaction, on each side', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'a', emoji: ['👍'] });
    store.applyEvent({ updateId: 2, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'b', emoji: ['👍'] });
    store.applyEvent({ updateId: 3, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'b', emoji: [] });
    store.applyEvent({ updateId: 4, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'c', emoji: ['🔥'] });
    store.applyEvent({ updateId: 5, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'd', emoji: ['👎'] });
    store.applyEvent({ updateId: 6, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'e', emoji: ['👍'] });
    store.applyEvent({ updateId: 7, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'e', emoji: ['👎'] });
    expect(store.tally(7, UP, DOWN)).toEqual({ up: 1, down: 2 });
  });

  it('counts a user once per side however often their reaction update repeats', () => {
    const store = postedStore();
    const event = { updateId: 1, kind: 'reaction' as const, chat: CHANNEL, messageId: 100, user: 'a', emoji: ['👍'] };
    store.applyEvent(event);
    expect(store.applyEvent(event)).toBe(false);
    store.applyEvent({ ...event, updateId: 2 });
    expect(store.tally(7, UP, DOWN)).toEqual({ up: 1, down: 0 });
  });

  it('keeps the footer shown on the post, and drops the old shown vote column of an older store', () => {
    const home = mkdtempSync(join(tmpdir(), 'public-store-'));
    openStore(home).close();
    const db = new DatabaseSync(storePath(home));
    db.exec('alter table proposals drop column shown_footer; alter table proposals add column shown_votes integer');
    db.prepare("insert into proposals (issue, pitch, created_at, chat, message_id, posted_at, shown_votes) values (7, 'Winch', ?, ?, 100, ?, 2)").run(now.toISOString(), CHANNEL, now.toISOString());
    const store = new PublicStore(db);
    const columns = db.prepare('pragma table_info(proposals)').all().map((column) => String(column.name));
    expect(columns).toContain('shown_footer');
    expect(columns).not.toContain('shown_votes');
    expect(store.shownFooter(7)).toBeNull();
    store.setShownFooter(7, '1 👍');
    expect(store.shownFooter(7)).toBe('1 👍');
    expect(postedStore().shownFooter(7)).toBe('footer');
  });

  it('opens a fresh proposal when a card is put to a vote after its proposal closed, with no votes carried over', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'a', emoji: ['👍'] });
    store.applyEvent({ updateId: 2, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 4 } });
    store.setShownFooter(7, '4');
    store.closeProposal(7, now);
    const later = new Date('2026-10-15T10:00:00Z');
    store.addProposal(7, 'Add a better winch', later);
    expect(store.proposal(7)).toEqual({ issue: 7, pitch: 'Add a better winch', chat: null, messageId: null, postedAt: null, closedAt: null });
    expect(store.unpostedProposals().map((proposal) => proposal.issue)).toEqual([7]);
    expect(store.openProposals()).toEqual([]);
    expect(store.shownFooter(7)).toBeNull();
    store.markProposalPosted(7, CHANNEL, 200, 'footer', later);
    expect(store.tally(7, UP, DOWN)).toEqual({ up: 0, down: 0 });
    expect(store.votersWith(7, UP)).toEqual([]);
  });

  it('keeps an open posted proposal when its card is put to a vote again', () => {
    const store = postedStore();
    store.addProposal(7, 'Another pitch', now);
    expect(store.proposal(7)).toMatchObject({ pitch: 'Add a winch', messageId: 100, closedAt: null });
  });

  it('maps a discussion comment to its issue through the automatic forward', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'forward', chat: GROUP, messageId: 55, channelChat: CHANNEL, channelMessageId: 100 });
    store.applyEvent({ updateId: 2, kind: 'comment', chat: GROUP, messageId: 56, threadId: 55, author: 'Ann', sender: '1', text: 'Yes please', at: now.toISOString() });
    store.applyEvent({ updateId: 3, kind: 'comment', chat: GROUP, messageId: 57, threadId: 999, author: 'Bob', sender: '2', text: 'Off topic', at: now.toISOString() });
    expect(store.unclassifiedComments(100).map((c) => [c.issue, c.text])).toEqual([[7, 'Yes please']]);
  });

  it('drops a comment on a closed post only once the filter finds it about its thread, so an unrelated report is still filed', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    const add = (id: string, text: string) => store.addComment({ issue: 7, source: 'telegram', sourceId: id, postChat: CHANNEL, postMessageId: 200, author: 'Ann', sender: '1', text, at: now.toISOString(), messageId: 1 });
    add('c1', 'Stalls');
    add('c2', 'Add a minimap');
    store.closeBuildPosts(7);
    expect(store.dropCommentsOnClosedPosts(now)).toBe(0);
    const [about, other] = store.unclassifiedComments(100);
    store.classify(about!.id, 'bug', 'patch', now, 'parent');
    store.classify(other!.id, 'feature', 'none', now, 'other');
    expect(store.dropCommentsOnClosedPosts(now)).toBe(1);
    expect(store.unsentComments()).toEqual([]);
    expect(store.pendingRoutes()).toEqual([]);
    expect(store.toFile().map((c) => c.text)).toEqual(['Add a minimap']);
    expect(store.toReply()).toEqual([]);
  });

  it('keeps a standalone chat message and a game report when posts close, so they are still filed and answered', () => {
    const store = postedStore();
    store.addComment({ issue: null, source: 'telegram', sourceId: 'c1', postChat: GROUP, postMessageId: null, author: 'Ann', sender: '1', text: '@bot add maps', at: now.toISOString(), messageId: 1 });
    store.addComment({ issue: 7, source: 'game', sourceId: 'report:1', postChat: null, postMessageId: null, author: 'Player', text: 'Stalls', at: now.toISOString() });
    store.closeProposal(7, now);
    expect(store.dropCommentsOnClosedPosts(now)).toBe(0);
    expect(store.unclassifiedComments(100).map((c) => c.text)).toEqual(['@bot add maps', 'Stalls']);
  });

  it('maps a reply to a player comment to the issue and post of that comment', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 201, threadId: 200, author: 'Ann', sender: '1', text: 'It crashes', at: now.toISOString() });
    store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 202, threadId: 201, author: 'Bob', sender: '2', text: 'Same here on the bridge', at: now.toISOString() });
    store.applyEvent({ updateId: 3, kind: 'comment', chat: CHANNEL, messageId: 203, threadId: 202, author: 'Cid', sender: '3', text: 'Me too', at: now.toISOString() });
    for (const comment of store.unclassifiedComments(100)) store.classify(comment.id, 'bug', 'patch', now);
    expect(store.pendingRoutes().map((c) => [c.issue, c.text])).toEqual([[7, 'It crashes'], [7, 'Same here on the bridge'], [7, 'Me too']]);
  });

  it('routes only comments on the open build post', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 201, threadId: 200, author: 'Ann', sender: '1', text: 'It crashes', at: now.toISOString() });
    store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 101, threadId: 100, author: 'Bob', sender: '2', text: 'Crash on proposal', at: now.toISOString() });
    for (const comment of store.unclassifiedComments(100)) store.classify(comment.id, 'bug', 'patch', now);
    expect(store.pendingRoutes().map((c) => c.text)).toEqual(['It crashes']);
    store.addBuildPost(7, 'def', CHANNEL, 300, now);
    expect(store.pendingRoutes()).toEqual([]);
  });

  it('keeps rejected comments out of digests and routes', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 201, threadId: 200, author: 'Ann', sender: '1', text: 'spam', at: now.toISOString() });
    const [comment] = store.unclassifiedComments(100);
    store.classify(comment.id, 'rejected', 'patch', now);
    expect(store.unsentComments()).toEqual([]);
    expect(store.pendingRoutes()).toEqual([]);
  });

  it('counts posted proposals in a window', () => {
    const store = postedStore();
    expect(store.proposalPostAttemptsSince(new Date(now.getTime() - 1000))).toBe(1);
    expect(store.proposalPostAttemptsSince(new Date(now.getTime() + 1000))).toBe(0);
    expect(store.unpostedProposals()).toEqual([]);
  });

  it('keeps the earlier post attempt when a closed proposal is put to a vote again', () => {
    const store = postedStore();
    store.closeProposal(7, now);
    store.addProposal(7, 'Add a winch again', now);
    expect(store.proposalPostAttemptsSince(new Date(now.getTime() - 1000))).toBe(1);
    store.beginProposalPost(7, now);
    expect(store.proposalPostAttemptsSince(new Date(now.getTime() - 1000))).toBe(2);
    store.closeProposal(7, now);
    expect(store.proposalPostAttemptsSince(new Date(now.getTime() - 1000))).toBe(1);
  });

  it('seeds post attempts from the proposals of a database made before the attempts table', () => {
    const home = mkdtempSync(join(tmpdir(), 'public-store-'));
    mkdirSync(join(home, 'public'));
    const db = new DatabaseSync(storePath(home));
    db.exec('create table proposals (issue integer primary key, pitch text not null, created_at text not null, chat text, message_id integer, discussion_chat text, discussion_id integer, posted_at text, channel_counts text, closed_at text)');
    db.exec('create table comments (id integer primary key autoincrement, issue integer not null, source text not null, source_id text not null unique, post_chat text, post_message_id integer, author text not null, text text not null, at text not null, kind text, route text, classified_at text, sent_at text, routed_at text)');
    db.prepare('insert into proposals (issue, pitch, created_at, chat, message_id, posted_at) values (7, ?, ?, ?, 100, ?)').run('Winch', now.toISOString(), CHANNEL, now.toISOString());
    db.prepare('insert into proposals (issue, pitch, created_at) values (8, ?, ?)').run('Radio', now.toISOString());
    db.close();
    const store = openStore(home);
    expect(store.proposalPostAttemptsSince(new Date(now.getTime() - 1000))).toBe(1);
    expect(store.unsentComments()).toEqual([]);
    store.close();
    expect(openStore(home).proposalPostAttemptsSince(new Date(now.getTime() - 1000))).toBe(1);
  });

  it('takes hits per address up to the limit of a fixed UTC hour', () => {
    const store = postedStore();
    const late = new Date('2026-10-14T10:59:30Z');
    expect(store.takeHit('1.2.3.4', now, 2)).toEqual({ taken: true });
    expect(store.takeHit('1.2.3.4', now, 2)).toEqual({ taken: true });
    expect(store.takeHit('1.2.3.4', late, 2)).toEqual({ taken: false, resetAt: new Date('2026-10-14T11:00:00Z') });
    expect(store.takeHit('5.6.7.8', late, 2)).toEqual({ taken: true });
    expect(store.takeHit('1.2.3.4', new Date('2026-10-14T11:00:00Z'), 2)).toEqual({ taken: true });
  });

  it('counts no refused hit, so retries never grow the count', () => {
    const store = postedStore();
    store.takeHit('1.2.3.4', now, 1);
    for (let i = 0; i < 9; i++) store.takeHit('1.2.3.4', now, 1);
    expect(store.takeHit('1.2.3.4', now, 2)).toEqual({ taken: true });
    expect(store.takeHit('1.2.3.4', now, 2)).toEqual({ taken: false, resetAt: new Date('2026-10-14T11:00:00Z') });
  });

  it('gives back at most the limit of hits an hour for one address', () => {
    const store = postedStore();
    const taken = { taken: true };
    const refused = { taken: false, resetAt: new Date('2026-10-14T11:00:00Z') };
    for (let i = 0; i < 2; i++) store.takeHit('1.2.3.4', now, 2);
    for (let i = 0; i < 3; i++) store.returnHit('1.2.3.4', now, 2);
    expect([1, 2, 3].map(() => store.takeHit('1.2.3.4', now, 2))).toEqual([taken, taken, refused]);
    store.returnHit('1.2.3.4', now, 2);
    expect(store.takeHit('1.2.3.4', now, 2)).toEqual(refused);
  });

  it('gives back no hit below zero and none of another address', () => {
    const store = postedStore();
    store.takeHit('1.2.3.4', now, 1);
    store.returnHit('5.6.7.8', now, 1);
    expect(store.takeHit('1.2.3.4', now, 1).taken).toBe(false);
    expect(store.takeHit('5.6.7.8', now, 1).taken).toBe(true);
    expect(store.takeHit('5.6.7.8', now, 1).taken).toBe(false);
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
    const base = { kind: 'comment' as const, chat: GROUP, author: 'Ann', sender: '42', at: now.toISOString() };
    store.applyEvent({ ...base, updateId: 1, messageId: 60, threadId: 999, text: 'Committee chat reply' });
    store.applyEvent({ ...base, updateId: 2, messageId: 61, threadId: null, text: '@bot add a minimap', addressed: true, standalone: true });
    expect(store.unclassifiedComments(100).map((c) => [c.issue, c.text, c.addressed])).toEqual([[null, '@bot add a minimap', true]]);
  });

  it('keeps off-topic and chatter comments out of the parent digest and routes, and files only off-topic bugs and features', () => {
    const store = postedStore();
    store.addBuildPost(7, 'abc', CHANNEL, 200, now);
    const texts = ['On topic', 'Off topic', 'Chatter', 'Standalone'];
    texts.forEach((text, index) => store.applyEvent({ updateId: index + 1, kind: 'comment', chat: CHANNEL, messageId: 201 + index, threadId: index === 3 ? null : 200, author: 'Ann', sender: '42', text, at: now.toISOString(), standalone: true }));
    const [onTopic, offTopic, chatter, standalone] = store.unclassifiedComments(100);
    store.classify(onTopic!.id, 'bug', 'patch', now, 'parent');
    store.classify(offTopic!.id, 'feature', 'redesign', now, 'other');
    store.classify(chatter!.id, 'chatter', 'none', now, 'parent');
    store.classify(standalone!.id, 'bug', 'none', now, 'other');
    expect(store.unsentComments().map((c) => c.text)).toEqual(['On topic']);
    expect(store.pendingRoutes().map((c) => c.text)).toEqual(['On topic']);
    expect(store.toFile().map((c) => c.text)).toEqual(['Off topic', 'Standalone']);
    expect(store.toReply().map((c) => c.text)).toEqual(['On topic', 'Chatter']);
  });

  it('finds an earlier filed issue by the normalized text and frees a comment for its reply once claimed', () => {
    const store = postedStore();
    const add = (id: number, text: string) => store.applyEvent({ updateId: id, kind: 'comment', chat: GROUP, messageId: id, threadId: null, author: 'Ann', sender: '42', text, at: now.toISOString(), standalone: true });
    add(1, 'Add a MINIMAP!');
    add(2, '@roam_bot add a minimap');
    for (const comment of store.unclassifiedComments(100)) store.classify(comment.id, 'feature', 'none', now, 'other');
    const [first, second] = store.toFile();
    expect(store.claimFiling(first!.id, first!.text, now)).toBeNull();
    store.setFiled(first!.id, 571);
    expect(store.claimFiling(second!.id, second!.text, now)).toBe(571);
    expect(store.toFile()).toEqual([]);
    expect(store.toReply().map((c) => [c.text, c.filedIssue])).toEqual([['Add a MINIMAP!', 571], ['@roam_bot add a minimap', null]]);
  });

  it('never matches texts that keep no letters or digits', () => {
    const store = postedStore();
    for (const [id, text] of [[1, '🔥🔥'], [2, '🚚!!']] as const) store.applyEvent({ updateId: id, kind: 'comment', chat: GROUP, messageId: id, threadId: null, author: 'Ann', sender: '42', text, at: now.toISOString(), standalone: true });
    for (const comment of store.unclassifiedComments(100)) store.classify(comment.id, 'feature', 'none', now, 'other');
    const [first, second] = store.toFile();
    store.claimFiling(first!.id, first!.text, now);
    store.setFiled(first!.id, 571);
    expect(store.claimFiling(second!.id, second!.text, now)).toBeNull();
  });

  it('maps a reply to the bot reply of a counted comment to that comment thread', () => {
    const store = postedStore();
    store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 101, threadId: 100, author: 'Ann', sender: '42', text: 'Cheaper please', at: now.toISOString() });
    const [comment] = store.unclassifiedComments(100);
    store.setReplyId(comment!.id, 150);
    store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 151, threadId: 150, author: 'Ann', sender: '42', text: 'Thanks, and lighter too', at: now.toISOString() });
    expect(store.unclassifiedComments(100).map((c) => [c.issue, c.text])).toEqual([[7, 'Cheaper please'], [7, 'Thanks, and lighter too']]);
  });

  it('moves a store of main with sender ids and dropped comments into the new table, and keeps both', () => {
    const home = mkdtempSync(join(tmpdir(), 'public-store-'));
    openStore(home).close();
    const db = new DatabaseSync(storePath(home));
    db.exec('drop table comments');
    db.exec('create table comments (id integer primary key autoincrement, issue integer not null, source text not null, source_id text not null unique, post_chat text, post_message_id integer, author text not null, text text not null, at text not null, kind text, route text, classified_at text, sent_at text, routed_at text, dropped_at text, sender text)');
    const add = db.prepare("insert into comments (issue, source, source_id, post_chat, post_message_id, author, text, at, sender, dropped_at) values (7, 'telegram', ?, 'c', 100, 'Ann', ?, ?, '42', ?)");
    add.run('c:1', 'Waiting', now.toISOString(), null);
    add.run('c:2', 'Dropped', now.toISOString(), now.toISOString());
    db.close();
    const store = openStore(home);
    expect(store.unclassifiedComments(100).map((c) => [c.text, c.sender, c.issue])).toEqual([['Waiting', '42', 7]]);
    store.classify(store.unclassifiedComments(100)[0]!.id, 'feature', 'none', now);
    expect(store.unsentComments().map((c) => c.text)).toEqual(['Waiting']);
    expect(store.toFile()).toEqual([]);
    expect(store.toReply()).toEqual([]);
    store.close();
    const columns = new DatabaseSync(storePath(home)).prepare('pragma table_info(comments)').all().map((column) => String(column.name));
    expect(columns).not.toContain('topic');
    expect(openStore(home).unclassifiedComments(100)).toEqual([]);
  });

  it('lists each proposal and each issue filed from the chat once as known work, with the proposal text first', () => {
    const store = openStore(mkdtempSync(join(tmpdir(), 'public-store-')));
    store.addProposal(564, 'Landmark directions\n\nTowns give directions by landmarks.\nMore.', now);
    const add = (sourceId: string, text: string) => store.addComment({ issue: null, source: 'telegram', sourceId, postChat: 'c', postMessageId: null, author: 'Ann', text, at: now.toISOString(), messageId: 1 })!;
    store.setFiled(add('c:1', 'Add   boats\nplease'), 601);
    store.setFiled(add('c:2', 'Boats again'), 601);
    store.setFiled(add('c:3', 'Same as the proposal'), 564);
    expect(store.knownWork()).toEqual([{ issue: 564, text: 'Landmark directions: Towns give directions by landmarks.' }, { issue: 601, text: 'Add boats please' }]);
    store.close();
  });

  it('adds the context, known work, language and link columns to a store of main and keeps its comments', () => {
    const home = mkdtempSync(join(tmpdir(), 'public-store-'));
    openStore(home).close();
    const db = new DatabaseSync(storePath(home));
    for (const column of ['context', 'work_issue', 'language', 'linked']) db.exec(`alter table comments drop column ${column}`);
    db.prepare("insert into comments (issue, source, source_id, post_chat, post_message_id, author, text, at, message_id) values (null, 'telegram', 'c:1', 'c', null, 'Ann', 'Hi', ?, 1)").run(now.toISOString());
    db.close();
    const store = openStore(home);
    expect(store.unclassifiedComments(100).map((c) => [c.text, c.context, c.workIssue, c.language, c.linked])).toEqual([['Hi', null, null, null, false]]);
    store.close();
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
