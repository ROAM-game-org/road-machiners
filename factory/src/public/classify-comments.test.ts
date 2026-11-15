import { describe, expect, it } from 'vitest';
import { classifyComments } from './classify-comments';
import { readState } from '../state';
import { FilterRefusalError, TransientFilterError, type Classify, type FilterInput } from './decision';
import { CHANNEL, filterOf, publicFake } from './public-fakes';

const ACCEPT: Classify = async () => ({ verdict: 'accept', intent: 'sincere', sincere: 0.9, kind: 'bug', route: 'none', relevance: 'parent' });

function withComments(count: number, perTick: number) {
  const f = publicFake({ filterPerTick: perTick });
  for (let n = 1; n <= count; n++) addFrom(f, '1', `comment ${n}`);
  return f;
}

function addFrom(f: ReturnType<typeof publicFake>, sender: string, text: string) {
  f.store.addComment({ issue: 7, source: 'telegram', sourceId: text, postChat: CHANNEL, postMessageId: 1, author: 'Ann', sender, text, at: f.clock.now.toISOString() });
}

describe('classifyComments', () => {
  it('classifies at most the per tick limit, oldest first, and leaves the rest for the next tick', async () => {
    const f = withComments(5, 2);
    const seen: string[] = [];
    await classifyComments(f.ctx, f.store, filterOf(async (input) => { seen.push(input.text); return ACCEPT(input); }));
    expect(seen).toEqual(['comment 1', 'comment 2']);
    expect(f.store.unclassifiedComments(100).map((comment) => comment.text)).toEqual(['comment 3', 'comment 4', 'comment 5']);
    await classifyComments(f.ctx, f.store, filterOf(ACCEPT));
    expect(f.store.unclassifiedComments(100).map((comment) => comment.text)).toEqual(['comment 5']);
  });

  it('classifies every waiting comment when fewer than the limit wait', async () => {
    const f = withComments(2, 10);
    await classifyComments(f.ctx, f.store, filterOf(ACCEPT));
    expect(f.store.unclassifiedComments(100)).toEqual([]);
  });

  it('takes the senders in turn, so a flood from one sender never holds back the others', async () => {
    const f = publicFake({ filterPerTick: 4 });
    for (let n = 1; n <= 20; n++) addFrom(f, 'spammer', `spam ${n}`);
    addFrom(f, '2', 'bob 1');
    addFrom(f, '2', 'bob 2');
    addFrom(f, '3', 'cid 1');
    const seen: string[] = [];
    await classifyComments(f.ctx, f.store, filterOf(async (input) => { seen.push(input.text); return ACCEPT(input); }));
    expect(seen).toEqual(['spam 1', 'bob 1', 'cid 1', 'spam 2']);
    seen.length = 0;
    await classifyComments(f.ctx, f.store, filterOf(async (input) => { seen.push(input.text); return ACCEPT(input); }));
    expect(seen).toEqual(['spam 3', 'bob 2', 'spam 4', 'spam 5']);
  });

  it('drops a sender past the hourly limit with no filter call, and counts no dropped message', async () => {
    const f = publicFake({ filterPerTick: 10, reportIpPerHour: 2 });
    for (let n = 1; n <= 4; n++) addFrom(f, '1', `ann ${n}`);
    const seen: string[] = [];
    const filter = filterOf(async (input) => { seen.push(input.text); return ACCEPT(input); });
    await classifyComments(f.ctx, f.store, filter);
    expect(seen).toEqual(['ann 1', 'ann 2']);
    f.clock.now = new Date('2026-10-14T11:00:00Z');
    for (let n = 5; n <= 7; n++) addFrom(f, '1', `ann ${n}`);
    await classifyComments(f.ctx, f.store, filter);
    expect(seen).toEqual(['ann 1', 'ann 2', 'ann 5', 'ann 6']);
  });

  it('asks the filter only whether a thread comment is junk, chatter or about its thread, and never routes, links or files from it', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch\nPull the truck out of mud.', f.clock.now);
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: 'c:1', postChat: CHANNEL, postMessageId: 1, author: 'Ann', sender: '1', text: 'redo the winch', at: f.clock.now.toISOString(), context: 'Winch' });
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: `${CHANNEL}:2`, postChat: CHANNEL, postMessageId: 1, author: 'Bo', sender: '2', text: '@bot is the winch done?', at: f.clock.now.toISOString(), messageId: 2, toHermes: true });
    const seen: FilterInput[] = [];
    await classifyComments(f.ctx, f.store, filterOf(async (input) => { seen.push(input); return { ...(await ACCEPT(input)), kind: 'feature', route: 'redesign', work: 0, filing: true }; }));
    expect(seen).toEqual([{ origin: 'chat', source: 'comment', parent: 'Winch', text: 'redo the winch', context: 'Winch', work: [], addressed: false }]);
    const stored = f.store.recentChat(2).filter((comment) => !comment.toHermes);
    expect(stored.map((comment) => [comment.text, comment.kind, comment.route, comment.filedIssue, comment.linked])).toEqual([['redo the winch', 'feature', 'none', null, false]]);
    expect(f.store.playerMessage(CHANNEL, 2)!.classifiedAt).toBeNull();
  });

  it('tries a comment again on the next tick after a transient filter failure, gives its hit back, and keeps it rejected after three', async () => {
    const f = publicFake({ filterPerTick: 10, reportIpPerHour: 1 });
    addFrom(f, '1', 'ann 1');
    const busy = filterOf(async () => { throw new TransientFilterError('The filter call failed with status 529.'); });
    await classifyComments(f.ctx, f.store, busy);
    expect(f.store.unclassifiedComments(10).map((comment) => [comment.text, comment.filterAttempts])).toEqual([['ann 1', 1]]);
    expect(f.calls).toEqual([]);
    await classifyComments(f.ctx, f.store, filterOf(ACCEPT));
    expect(f.store.unclassifiedComments(10)).toEqual([]);
    expect(f.store.comment(1)?.kind).toBe('bug');
    addFrom(f, '2', 'bob 1');
    for (let tick = 0; tick < 3; tick++) await classifyComments(f.ctx, f.store, busy);
    expect(f.store.unclassifiedComments(10)).toEqual([]);
    expect(f.store.comment(2)?.kind).toBe('rejected');
    expect(f.logs.filter((line) => line.includes('stays rejected'))).toHaveLength(1);
  });

  it('keeps a comment rejected with no failure when the filter refuses a text it scores as junk', async () => {
    const f = publicFake();
    addFrom(f, '1', 'ann 1');
    await classifyComments(f.ctx, f.store, filterOf(async () => { throw new FilterRefusalError(['kind'], true); }));
    expect(f.store.unclassifiedComments(10)).toEqual([]);
    expect(f.store.comment(1)?.kind).toBe('rejected');
    expect(readState(f.ctx.statePath).failures).toEqual([]);
    expect(f.logs.filter((line) => line.includes('scores as junk'))).toHaveLength(1);
  });

  it('keeps a comment rejected and records a public failure when the filter refuses any other text', async () => {
    const f = publicFake();
    addFrom(f, '1', 'ann 1');
    await classifyComments(f.ctx, f.store, filterOf(async () => { throw new FilterRefusalError(['kind'], false); }));
    expect(f.store.unclassifiedComments(10)).toEqual([]);
    expect(f.store.comment(1)?.kind).toBe('rejected');
    const failures = readState(f.ctx.statePath).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ stage: 'public', error: expect.stringContaining('refused to answer: kind') });
  });

  it('keeps a comment rejected at once when the filter fails for good', async () => {
    const f = publicFake();
    addFrom(f, '1', 'ann 1');
    await classifyComments(f.ctx, f.store, filterOf(async () => { throw new Error('The filter call failed with status 401.'); }));
    expect(f.store.unclassifiedComments(10)).toEqual([]);
    expect(f.store.comment(1)?.kind).toBe('rejected');
  });
});
