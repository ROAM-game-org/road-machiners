import { describe, expect, it } from 'vitest';
import { readState } from '../state';
import type { Classify } from './decision';
import { CHANNEL, filterOf, publicFake } from './public-fakes';
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
    expect(f.store.proposal(8)?.closedAt).not.toBeNull();
  });

  it('rejects only the comment the filter failed on, reports it once and goes on with the rest', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    for (const id of ['a', 'b']) f.store.addComment({ issue: 7, source: 'telegram', sourceId: id, postChat: CHANNEL, postMessageId: 100, author: id, text: id, at: f.clock.now.toISOString() });
    let calls = 0;
    const flaky: Classify = async (input) => {
      calls += 1;
      if (calls === 1) throw new Error('filter down');
      return accept(input);
    };
    await publicTick(f.ctx, filterOf(flaky));
    expect(f.store.unclassifiedComments(100)).toEqual([]);
    expect(f.comments.map((comment) => comment.body)).toEqual([expect.stringContaining('From b, bug')]);
    expect(f.comments[0]!.body).not.toContain('From a');
    expect(readState(f.ctx.statePath).failures).toHaveLength(1);
    expect(f.calls.filter((call) => call.startsWith('addLabel'))).toEqual([]);
    await publicTick(f.ctx, filterOf(flaky));
    expect(calls).toBe(2);
    expect(readState(f.ctx.statePath).failures).toHaveLength(1);
  });

  it('maps a reject verdict to the rejected kind', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    f.store.addComment({ issue: 7, source: 'telegram', sourceId: 'a', postChat: CHANNEL, postMessageId: 100, author: 'a', text: 'spam', at: f.clock.now.toISOString() });
    await publicTick(f.ctx, filterOf(async () => ({ verdict: 'reject', intent: 'spam', sincere: 0.05, kind: 'bug', route: 'none', relevance: 'parent' })));
    expect(f.store.unclassifiedComments(100)).toEqual([]);
    expect(f.store.unsentComments()).toEqual([]);
    expect(f.comments).toEqual([]);
  });
});
