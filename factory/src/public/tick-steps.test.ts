import { describe, expect, it } from 'vitest';
import { readState } from '../state';
import type { Classify } from './decision';
import { CHANNEL, filterOf, publicFake, storedComments } from './public-fakes';
import { publicTick } from './tick-steps';

const accept: Classify = async () => ({ verdict: 'accept', intent: 'sincere', sincere: 0.98, kind: 'bug', route: 'none', relevance: 'parent' });

describe('publicTick', () => {
  it('records a failure when a step throws and still runs the later steps', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    f.store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 5 } });
    f.store.addProposal(8, 'Radio', f.clock.now);
    f.ctx.github.issue = async () => { throw new Error('GitHub is down'); };
    await publicTick(f.ctx, filterOf(accept));
    const failures = readState(f.ctx.statePath).failures;
    expect(failures).toHaveLength(2);
    expect(failures.map((failure) => failure.issue).sort()).toEqual([7, 8]);
    for (const failure of failures) expect(failure).toMatchObject({ stage: 'public' });
    expect(failures.every((failure) => failure.error.includes('GitHub is down'))).toBe(true);
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.store.proposal(8)?.closedAt).toBeNull();
  });

  it('filters an untagged thread reply once for its card digest, and never a message that went to Hermes', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: 'a', postChat: CHANNEL, postMessageId: 100, author: 'a', text: 'The winch breaks', at: f.clock.now.toISOString() });
    f.store.applyEvent({ updateId: 1, kind: 'comment', chat: CHANNEL, messageId: 31, threadId: 100, author: 'b', sender: '2', text: 'Same here', at: f.clock.now.toISOString(), toHermes: true, addressed: false });
    f.store.applyEvent({ updateId: 2, kind: 'comment', chat: CHANNEL, messageId: 32, threadId: null, author: 'c', sender: '3', text: 'nice day', at: f.clock.now.toISOString(), toHermes: true, addressed: false });
    const filtered: string[] = [];
    const recording: Classify = async (input) => {
      filtered.push(input.text);
      return accept(input);
    };
    await publicTick(f.ctx, filterOf(recording));
    await publicTick(f.ctx, filterOf(recording));
    expect(filtered).toEqual(['The winch breaks']);
    expect(storedComments(f.store).map((c) => [c.text, c.classifiedAt === null])).toEqual([['The winch breaks', false], ['Same here', true], ['nice day', true]]);
    expect(f.comments.map((comment) => comment.issue)).toEqual([7]);
    expect(f.comments[0]!.body).toContain('The winch breaks');
    expect(readState(f.ctx.statePath).failures).toEqual([]);
  });
});
