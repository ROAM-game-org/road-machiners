import { describe, expect, it } from 'vitest';
import { classifyComments } from './classify-comments';
import type { Classify } from './decision';
import { CHANNEL, publicFake } from './public-fakes';

const ACCEPT: Classify = async () => ({ verdict: 'accept', intent: 'sincere', sincere: 0.9, kind: 'bug', route: 'none' });

function withComments(count: number, perTick: number) {
  const f = publicFake({ filterPerTick: perTick });
  for (let n = 1; n <= count; n++) {
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: `c${n}`, postChat: CHANNEL, postMessageId: 1, author: 'Ann', text: `comment ${n}`, at: f.clock.now.toISOString() });
  }
  return f;
}

describe('classifyComments', () => {
  it('classifies at most the per tick limit, oldest first, and leaves the rest for the next tick', async () => {
    const f = withComments(5, 2);
    const seen: string[] = [];
    await classifyComments(f.ctx, f.store, async (input) => { seen.push(input.text); return ACCEPT(input); });
    expect(seen).toEqual(['comment 1', 'comment 2']);
    expect(f.store.unclassifiedComments().map((comment) => comment.text)).toEqual(['comment 3', 'comment 4', 'comment 5']);
    await classifyComments(f.ctx, f.store, ACCEPT);
    expect(f.store.unclassifiedComments().map((comment) => comment.text)).toEqual(['comment 5']);
  });

  it('classifies every waiting comment when fewer than the limit wait', async () => {
    const f = withComments(2, 10);
    await classifyComments(f.ctx, f.store, ACCEPT);
    expect(f.store.unclassifiedComments()).toEqual([]);
  });
});
