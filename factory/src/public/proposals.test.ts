import { describe, expect, it } from 'vitest';
import { readState, updateState } from '../state';
import { CHANNEL, publicFake } from './public-fakes';
import { postProposal, proposalText } from './proposals';

const HOUR_MS = 3_600_000;

describe('postProposal', () => {
  it('posts the oldest proposal under a bold Proposal heading with pitch, links, bundle links and the vote rule, and marks it posted', async () => {
    const f = publicFake();
    updateState(f.ctx.statePath, (state) => ({ ...state, bundles: { 7: [8, 9] } }));
    f.store.addProposal(7, 'Winch\n\nPull stuck trucks out of sand.', new Date('2026-10-14T08:00:00Z'));
    f.store.addProposal(12, 'Radio\n\nTalk to traders.', new Date('2026-10-14T09:00:00Z'));
    await postProposal(f.ctx, f.store);
    expect(f.calls).toEqual(['issue 7', 'sendHtml']);
    const { chat, text } = f.messages[0]!;
    expect(chat).toBe(CHANNEL);
    expect(text).toBe([
      '<b>Proposal: Winch</b>',
      'Pull stuck trucks out of sand.',
      [7, 8, 9].map((issue) => `https://github.com/o/r/issues/${issue}`).join('\n'),
      'Needs 3 more 👍 than 👎 to pass. Current: 0 👍, 0 👎, net 0/3',
    ].join('\n\n'));
    expect(f.store.proposal(7)?.messageId).toBe(501);
    expect(f.store.shownFooter(7)).toBe('Needs 3 more 👍 than 👎 to pass. Current: 0 👍, 0 👎, net 0/3');
    expect(f.store.proposal(12)?.postedAt).toBeNull();
    expect(readState(f.ctx.statePath).bundles).toEqual({ 7: [8, 9] });
  });

  it('escapes the title and pitch, so player text cannot add markup', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Tow <b>& winch</b>\n\nPulls <a href="x">trucks</a> & cars > 3 t.', f.clock.now);
    await postProposal(f.ctx, f.store);
    const text = f.messages[0]!.text;
    expect(text.split('\n\n').slice(0, 2)).toEqual(['<b>Proposal: Tow &lt;b&gt;&amp; winch&lt;/b&gt;</b>', 'Pulls &lt;a href="x"&gt;trucks&lt;/a&gt; &amp; cars &gt; 3 t.']);
    expect(text.match(/<[^>]*>/g)).toEqual(['<b>', '</b>']);
  });

  it('shortens a pitch too long for one message, so the post and its later edits fit', async () => {
    const f = publicFake();
    f.store.addProposal(7, `Winch\n\n${'Tow & pull. '.repeat(500)}`, f.clock.now);
    await postProposal(f.ctx, f.store);
    const text = f.messages[0]!.text;
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toMatch(/^<b>Proposal: Winch<\/b>\n\nTow &amp; pull\./);
    expect(text).not.toMatch(/&(?!amp;|lt;|gt;)/);
    expect(text).toContain('…\n\nhttps://github.com/o/r/issues/7\n\nNeeds 3 more 👍 than 👎 to pass.');
    const concluded = proposalText(f.ctx, 7, f.store.proposal(7)!.pitch, 'Needs 3 more 👍 than 👎 to pass. Current: 120 👍, 3 👎, net +117/3\n❌ Rejected by committee member');
    expect(concluded.length).toBeLessThanOrEqual(4096);
    expect(concluded).toMatch(/❌ Rejected by committee member$/);
  });

  it('uses the configured emoji in the rule and stops when a vote side names none', async () => {
    const f = publicFake({ voteEmoji: '🔥 👍', minVotes: 5 });
    f.store.addProposal(7, 'Winch', f.clock.now);
    await postProposal(f.ctx, f.store);
    expect(f.messages[0]!.text).toBe('<b>Proposal: Winch</b>\n\nhttps://github.com/o/r/issues/7\n\nNeeds 5 more 🔥 than 👎 to pass. Current: 0 🔥, 0 👎, net 0/5');
    const g = publicFake({ vetoEmoji: ' ' });
    g.store.addProposal(7, 'Winch', g.clock.now);
    await expect(postProposal(g.ctx, g.store)).rejects.toThrow('FACTORY_VETO_EMOJI names no emoji');
  });

  it('posts one proposal per tick', async () => {
    const f = publicFake({ proposalsPerDay: 5 });
    f.store.addProposal(7, 'A', f.clock.now);
    f.store.addProposal(8, 'B', f.clock.now);
    await postProposal(f.ctx, f.store);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(2);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(2);
  });

  it('posts nothing at the cap of the last 24 hours and posts again once the oldest post leaves the window', async () => {
    const f = publicFake({ proposalsPerDay: 2 });
    for (const [issue, hoursAgo] of [[1, 23], [2, 5]] as const) {
      f.store.addProposal(issue, 'old', f.clock.now);
      f.store.markProposalPosted(issue, CHANNEL, issue, 'footer', new Date(f.clock.now.getTime() - hoursAgo * HOUR_MS));
    }
    f.store.addProposal(3, 'waiting', f.clock.now);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toEqual([]);
    expect(f.calls).toEqual([]);
    f.clock.now = new Date(f.clock.now.getTime() + 2 * HOUR_MS);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
  });

  it('closes the proposal of a closed issue unposted, posts the next open one, and never reads the closed issue again', async () => {
    const f = publicFake();
    f.issueState[7] = 'CLOSED';
    f.store.addProposal(7, 'Closed one', new Date('2026-10-14T08:00:00Z'));
    f.store.addProposal(8, 'Open one', new Date('2026-10-14T09:00:00Z'));
    await postProposal(f.ctx, f.store);
    expect(f.messages[0]!.text).toContain('Open one');
    expect(f.store.proposal(7)?.postedAt).toBeNull();
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.logs.join('\n')).toContain('7 the issue is closed');
    await postProposal(f.ctx, f.store);
    expect(f.calls.filter((call) => call === 'issue 7')).toHaveLength(1);
  });
});
