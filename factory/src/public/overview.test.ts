import { describe, expect, it } from 'vitest';
import { updateState } from '../state';
import { publicRows } from './overview';
import { CHANNEL, publicFake } from './public-fakes';

describe('publicRows', () => {
  it('lists unposted and open proposals with votes and posted time, and open build posts', () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch\nPulls.', f.clock.now);
    f.store.markProposalPosted(7, CHANNEL, 100, f.clock.now);
    f.store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts: { '👍': 2 } });
    f.store.addProposal(8, 'Radio\nTalks.', f.clock.now);
    f.store.addProposal(9, 'Done\nPassed.', f.clock.now);
    f.store.markProposalPosted(9, CHANNEL, 101, f.clock.now);
    f.store.closeProposal(9, f.clock.now);
    f.store.addBuildPost(9, 'abc1234', CHANNEL, 300, f.clock.now);
    updateState(f.ctx.statePath, (state) => ({ ...state, approvalPosts: { 50: 9 } }));
    expect(publicRows(f.ctx, f.store)).toEqual([
      '#8 proposal not posted yet: Radio',
      '#7 proposal posted 2026-10-14T10:00:00.000Z, 2 of 3 votes: Winch',
      '#9 open build post abc1234 posted 2026-10-14T10:00:00.000Z',
    ]);
  });
});
