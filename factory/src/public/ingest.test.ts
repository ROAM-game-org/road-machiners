import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readState } from '../state';
import { CHANNEL, publicFake } from './public-fakes';
import { ingest } from './ingest';

const count = (updateId: number, counts: Record<string, number>) => ({ updateId, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts });

function setup() {
  const f = publicFake();
  f.store.addProposal(7, 'Winch\nPull trucks out.', f.clock.now);
  f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
  const inbox = `${f.home}/public-inbox`;
  mkdirSync(inbox, { recursive: true });
  const put = (name: string, body: unknown) => writeFileSync(`${inbox}/${name}`, typeof body === 'string' ? body : JSON.stringify(body));
  return { f, inbox, put };
}

describe('ingest', () => {
  it('applies each file in name order and deletes it', async () => {
    const { f, inbox, put } = setup();
    put('0000000001.json', count(1, { '👍': 1 }));
    put('0000000002.json', count(2, { '👍': 4 }));
    await ingest(f.ctx, f.store);
    expect(f.store.tally(7, ['👍'], ['👎']).up).toBe(4);
    expect(readdirSync(inbox)).toEqual([]);
  });

  it('applies files by numeric update id, so 999 comes before 1000', async () => {
    const { f, put } = setup();
    put('1000.json', count(1000, { '👍': 1 }));
    put('999.json', count(999, { '👍': 5 }));
    await ingest(f.ctx, f.store);
    expect(f.store.tally(7, ['👍'], ['👎']).up).toBe(1);
  });

  it('moves a file whose name is not an update id plus .json to bad, reports it once and still applies the other votes', async () => {
    const { f, inbox, put } = setup();
    put('latest.json', count(1, { '👍': 1 }));
    put('10.json', count(10, { '👍': 3 }));
    await ingest(f.ctx, f.store);
    expect(existsSync(`${inbox}/bad/latest.json`)).toBe(true);
    expect(existsSync(`${inbox}/latest.json`)).toBe(false);
    expect(f.store.tally(7, ['👍'], ['👎']).up).toBe(3);
    expect(readdirSync(inbox)).toEqual(['bad']);
    const failures = readState(f.ctx.statePath).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]!.error).toContain('latest.json');
    await ingest(f.ctx, f.store);
    expect(readState(f.ctx.statePath).failures).toHaveLength(1);
  });

  it('changes nothing for a seen update id, and still deletes the file', async () => {
    const { f, inbox, put } = setup();
    put('5.json', count(5, { '👍': 2 }));
    await ingest(f.ctx, f.store);
    put('6.json', count(5, { '👍': 9 }));
    await ingest(f.ctx, f.store);
    expect(f.store.tally(7, ['👍'], ['👎']).up).toBe(2);
    expect(readdirSync(inbox)).toEqual([]);
  });

  it('moves a file that is not JSON to bad and records one failure that names the file and not the text', async () => {
    const { f, inbox, put } = setup();
    put('9.json', 'secret player words {');
    put('10.json', count(10, { '👍': 3 }));
    await ingest(f.ctx, f.store);
    expect(existsSync(`${inbox}/bad/9.json`)).toBe(true);
    expect(existsSync(`${inbox}/9.json`)).toBe(false);
    expect(f.store.tally(7, ['👍'], ['👎']).up).toBe(3);
    const failures = readState(f.ctx.statePath).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]!.error).toContain('9.json');
    expect(failures[0]!.error).not.toContain('secret');
  });

  it('moves a file with a bad field to bad and never echoes the value', async () => {
    const { f, inbox, put } = setup();
    put('3.json', { updateId: 3, kind: 'comment', chat: CHANNEL, messageId: 1, threadId: 2, author: 'ann', sender: '1', text: 12345, at: 'x' });
    put('4.json', { updateId: 4, kind: 'mystery' });
    put('5.json', { updateId: 'five', kind: 'forward' });
    put('6.json', count(6, { '👍': 'many' } as never));
    put('7.json', { updateId: 7, kind: 'comment', chat: CHANNEL, messageId: 1, threadId: 100, author: 'ann', text: 'No sender id', at: 'x' });
    await ingest(f.ctx, f.store);
    expect(readdirSync(`${inbox}/bad`).sort()).toEqual(['3.json', '4.json', '5.json', '6.json', '7.json']);
    const errors = readState(f.ctx.statePath).failures.map((failure) => failure.error).join('\n');
    expect(errors).toContain('text');
    expect(errors).not.toContain('12345');
    expect(errors).not.toContain('many');
  });

  it('ignores files that are not json and does nothing without an inbox', async () => {
    const { f, inbox, put } = setup();
    put('note.txt', 'hello');
    await ingest(f.ctx, f.store);
    expect(readdirSync(inbox)).toEqual(['note.txt']);
    const empty = publicFake();
    await ingest(empty.ctx, empty.store);
  });

  it('applies updates in update id order, so a switched reaction keeps the newer vote when the id gains a digit', async () => {
    const { f, put } = setup();
    const reaction = (updateId: number, emoji: string[]) => ({ updateId, kind: 'reaction', chat: CHANNEL, messageId: 100, user: 'a', emoji });
    put('999.json', reaction(999, ['👍']));
    put('1000.json', reaction(1000, ['👎']));
    await ingest(f.ctx, f.store);
    expect(f.store.tally(7, ['👍'], ['👎'])).toEqual({ up: 0, down: 1 });
  });

  it('stores a comment event for a tracked thread', async () => {
    const { f, put } = setup();
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 31, threadId: 100, author: 'ann', sender: '1', text: 'The truck stalls', at: '2026-10-14T10:00:00Z' });
    await ingest(f.ctx, f.store);
    expect(f.store.unclassifiedComments(100).map((comment) => comment.text)).toEqual(['The truck stalls']);
  });

  it('attributes a reply to a build post that replies to the proposal to the issue, and routes it', async () => {
    const { f, put } = setup();
    f.store.addBuildPost(7, 'abc1234', CHANNEL, 200, f.clock.now);
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 31, threadId: 200, author: 'ann', sender: '1', text: 'The truck stalls', at: '2026-10-14T10:00:00Z' });
    await ingest(f.ctx, f.store);
    const [stored] = f.store.unclassifiedComments(100);
    expect(stored!.issue).toBe(7);
    f.store.classify(stored!.id, 'bug', 'patch', f.clock.now);
    expect(f.store.pendingRoutes().map((route) => route.issue)).toEqual([7]);
  });

  it('attributes a reply to a stored player comment to that comment issue', async () => {
    const { f, put } = setup();
    f.store.addBuildPost(7, 'abc1234', CHANNEL, 200, f.clock.now);
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 31, threadId: 200, author: 'ann', sender: '1', text: 'The truck stalls', at: '2026-10-14T10:00:00Z' });
    put('2.json', { updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 32, threadId: 31, author: 'bo', sender: '2', text: 'Same here', at: '2026-10-14T10:01:00Z' });
    await ingest(f.ctx, f.store);
    expect(f.store.unclassifiedComments(100).map((comment) => [comment.issue, comment.text])).toEqual([[7, 'The truck stalls'], [7, 'Same here']]);
  });

  it('stores a standalone chat message with its sender, and reads a file with no reach flags', async () => {
    const { f, put } = setup();
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 32, threadId: null, author: 'ann', sender: '42', text: '@roam_bot how do I vote?', at: '2026-10-14T10:00:00Z', addressed: true, standalone: true });
    put('2.json', { updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 33, threadId: 100, author: 'bob', sender: '7', text: 'Old file', at: '2026-10-14T10:00:00Z' });
    await ingest(f.ctx, f.store);
    expect(f.store.unclassifiedComments(100).map((c) => [c.issue, c.sender, c.addressed, c.messageId])).toEqual([[null, '42', true, 32], [7, '7', false, 33]]);
  });

  it('keeps the replied or quoted text of a chat message as its context, and none when the file has none', async () => {
    const { f, put } = setup();
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 32, threadId: 900, author: 'ann', sender: '42', text: 'I meant landmarks', at: '2026-10-14T10:00:00Z', standalone: true, context: 'Landmark directions' });
    put('2.json', { updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 33, threadId: null, author: 'bob', sender: '7', text: 'Hi', at: '2026-10-14T10:00:00Z', standalone: true });
    await ingest(f.ctx, f.store);
    expect(f.store.unclassifiedComments(100).map((c) => [c.issue, c.context])).toEqual([[null, 'Landmark directions'], [null, null]]);
  });

  it('moves a comment with a context that is not text to bad', async () => {
    const { f, inbox, put } = setup();
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 32, threadId: null, author: 'ann', sender: '1', text: 'x', at: 'x', context: 5 });
    await ingest(f.ctx, f.store);
    expect(readdirSync(`${inbox}/bad`)).toEqual(['1.json']);
  });

  it('moves a comment with a bad sender flag to bad', async () => {
    const { f, inbox, put } = setup();
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 32, threadId: null, author: 'ann', sender: '1', text: 'x', at: 'x', addressed: 'yes' });
    await ingest(f.ctx, f.store);
    expect(readdirSync(`${inbox}/bad`)).toEqual(['1.json']);
  });
});
