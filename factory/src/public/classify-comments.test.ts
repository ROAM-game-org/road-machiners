import { describe, expect, it } from 'vitest';
import { classifyComments } from './classify-comments';
import type { Classify } from './decision';
import { CHANNEL, filterOf, publicFake } from './public-fakes';

const ACCEPT: Classify = async () => ({ verdict: 'accept', intent: 'sincere', sincere: 0.9, kind: 'bug', route: 'none', relevance: 'parent', topic: 'none' });

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
});
