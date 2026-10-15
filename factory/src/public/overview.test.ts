import { describe, expect, it } from 'vitest';
import { updateState } from '../state';
import { publicRows } from './overview';
import { CHANNEL, publicFake } from './public-fakes';

describe('publicRows', () => {
  it('lists unposted and open proposals with votes and posted time, and open build posts', () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch\nPulls.', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
    f.store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 2 } });
    f.store.addProposal(8, 'Radio\nTalks.', f.clock.now);
    f.store.addProposal(9, 'Done\nPassed.', f.clock.now);
    f.store.markProposalPosted(9, CHANNEL, 101, 'footer', f.clock.now);
    f.store.closeProposal(9, f.clock.now);
    f.store.addBuildPost(9, 'abc1234', CHANNEL, 300, f.clock.now);
    updateState(f.ctx.statePath, (state) => ({ ...state, approvalPosts: { 50: 9 } }));
    expect(publicRows(f.ctx, f.store)).toEqual([
      '#8 proposal not posted yet: Radio',
      '#7 proposal posted 2026-10-14T10:00:00.000Z, 2 👍, 0 👎, net +2 of 3: Winch',
      '#9 open build post abc1234 posted 2026-10-14T10:00:00.000Z',
    ]);
  });

  it('lists the latest classified chat messages with where they went and whether they got a reply', () => {
    const f = publicFake();
    f.store.addComment({ issue: 568, source: 'telegram', sourceId: 'c:169', postChat: CHANNEL, postMessageId: 100, author: 'Ann', text: 'minimap', at: 'T1', messageId: 169 });
    f.store.addComment({ issue: null, source: 'telegram', sourceId: 'c:170', postChat: CHANNEL, postMessageId: null, author: 'Bob', text: 'hi', at: 'T2', messageId: 170 });
    const [offTopic, standalone] = f.store.unclassifiedComments(100);
    f.store.classify(offTopic!.id, 'feature', 'none', f.clock.now, 'other');
    f.store.classify(standalone!.id, 'chatter', 'none', f.clock.now, 'other');
    f.store.setFiled(offTopic!.id, 571);
    f.store.setReplyId(offTopic!.id, 700);
    expect(publicRows(f.ctx, f.store)).toEqual([
      'chat message 170 T2: chatter, no thread, no reply',
      'chat message 169 T1: feature, off-topic under #568, filed as #571, replied 700',
    ]);
  });
});
