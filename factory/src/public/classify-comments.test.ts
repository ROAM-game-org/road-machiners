import { describe, expect, it } from 'vitest';
import { classifyComments } from './classify-comments';
import { TransientFilterError, type Classify, type Decision, type FilterInput } from './decision';
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

  it('lists the known work that shares words with the message and its context first, then the newest, and keeps the issue the filter picks', async () => {
    const f = publicFake();
    f.store.addProposal(564, 'Landmark directions\nTowns give directions by landmarks you can see.', f.clock.now);
    f.store.addProposal(568, 'Faction reputation\nTowns remember what you did.', f.clock.now);
    f.store.addProposal(570, 'Cargo insurance\nPay to cover lost cargo.', f.clock.now);
    f.store.addComment({ issue: null, source: 'telegram', sourceId: 'c:1', postChat: CHANNEL, postMessageId: null, author: 'Ann', sender: '1', text: 'I meant the directions should name landmarks', at: f.clock.now.toISOString(), context: 'Landmark directions' });
    const seen: FilterInput[] = [];
    await classifyComments(f.ctx, f.store, filterOf(async (input) => { seen.push(input); return { ...(await ACCEPT(input)), kind: 'feedback', work: 0, language: 'ru' }; }));
    expect(seen[0]).toMatchObject({ source: 'message', context: 'Landmark directions' });
    expect(seen[0]!.work![0]).toBe('#564 Landmark directions: Towns give directions by landmarks you can see.');
    expect(seen[0]!.work!.map((work) => work.split(' ')[0])).toEqual(['#564', '#570', '#568']);
    const [stored] = f.store.recentChat(1);
    expect([stored!.kind, stored!.workIssue, stored!.language]).toEqual(['feedback', 564, 'ru']);
  });

  it('keeps no known work for chatter, a rejected message, or a pick of none, and never lists the comment thread itself', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch\nPull the truck out of mud.', f.clock.now);
    f.store.addProposal(8, 'Winch upgrade\nA stronger winch.', f.clock.now);
    addFrom(f, '1', 'winch thanks');
    addFrom(f, '2', 'winch spam');
    addFrom(f, '3', 'winch idea');
    const seen: FilterInput[] = [];
    const decide: Record<string, Partial<Decision>> = { 'winch thanks': { kind: 'chatter', work: 0 }, 'winch spam': { verdict: 'reject', work: 0 }, 'winch idea': { kind: 'feature' } };
    await classifyComments(f.ctx, f.store, filterOf(async (input) => { seen.push(input); return { ...(await ACCEPT(input)), ...decide[input.text] }; }));
    expect(seen.map((input) => input.work)).toEqual([['#8 Winch upgrade: A stronger winch.'], ['#8 Winch upgrade: A stronger winch.'], ['#8 Winch upgrade: A stronger winch.']]);
    expect(f.store.recentChat(3).map((comment) => comment.workIssue)).toEqual([null, null, null]);
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

  it('keeps a comment rejected at once when the filter fails for good', async () => {
    const f = publicFake();
    addFrom(f, '1', 'ann 1');
    await classifyComments(f.ctx, f.store, filterOf(async () => { throw new Error('The filter call failed with status 401.'); }));
    expect(f.store.unclassifiedComments(10)).toEqual([]);
    expect(f.store.comment(1)?.kind).toBe('rejected');
  });
});
