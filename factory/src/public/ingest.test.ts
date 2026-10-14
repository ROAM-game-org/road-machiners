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

  it('changes nothing for a seen update id, and still deletes the file', async () => {
    const { f, inbox, put } = setup();
    put('a.json', count(5, { '👍': 2 }));
    await ingest(f.ctx, f.store);
    put('b.json', count(5, { '👍': 9 }));
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
    put('3.json', { updateId: 3, kind: 'comment', chat: CHANNEL, messageId: 1, threadId: 2, author: 'ann', text: 12345, at: 'x' });
    put('4.json', { updateId: 4, kind: 'mystery' });
    put('5.json', { updateId: 'five', kind: 'forward' });
    put('6.json', count(6, { '👍': 'many' } as never));
    await ingest(f.ctx, f.store);
    expect(readdirSync(`${inbox}/bad`).sort()).toEqual(['3.json', '4.json', '5.json', '6.json']);
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
    put('1.json', { updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 31, threadId: 100, author: 'ann', text: 'The truck stalls', at: '2026-10-14T10:00:00Z' });
    await ingest(f.ctx, f.store);
    expect(f.store.unclassifiedComments().map((comment) => comment.text)).toEqual(['The truck stalls']);
  });
});
