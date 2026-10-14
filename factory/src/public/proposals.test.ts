import { describe, expect, it } from 'vitest';
import { readState, updateState } from '../state';
import { CHANNEL, publicFake } from './public-fakes';
import { MESSAGE_LIMIT } from '../telegram';
import { longestProposalText, postProposal, proposalText } from './proposals';

const HOUR_MS = 3_600_000;

function unlabeledAndOpen() {
  const f = publicFake();
  f.store.addProposal(7, 'Unlabeled one', new Date('2026-10-14T08:00:00Z'));
  f.store.addProposal(8, 'Open one', new Date('2026-10-14T09:00:00Z'));
  return f;
}

describe('postProposal', () => {
  it('posts the oldest proposal with pitch, links, bundle links and the vote line, and marks it posted', async () => {
    const f = publicFake();
    updateState(f.ctx.statePath, (state) => ({ ...state, bundles: { 7: [8, 9] } }));
    f.store.addProposal(7, 'Winch\nPull stuck trucks out of sand.', new Date('2026-10-14T08:00:00Z'));
    f.store.addProposal(12, 'Radio\nTalk to traders.', new Date('2026-10-14T09:00:00Z'));
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    const { chat, text, replyTo } = f.messages[0]!;
    expect(chat).toBe(CHANNEL);
    expect(replyTo).toBeUndefined();
    expect(text).toContain('Winch\nPull stuck trucks out of sand.');
    for (const issue of [7, 8, 9]) expect(text).toContain(`https://github.com/o/r/issues/${issue}`);
    expect(text).toContain('thumbs-up');
    expect(text).toContain('3 votes');
    expect(f.store.proposal(7)?.messageId).toBe(501);
    expect(f.store.proposal(12)?.postedAt).toBeNull();
    expect(readState(f.ctx.statePath).bundles).toEqual({ 7: [8, 9] });
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
      f.store.markProposalPosted(issue, CHANNEL, issue, new Date(f.clock.now.getTime() - hoursAgo * HOUR_MS));
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

  it('closes the proposal of an issue without the voting label unposted, posts the next one, and never reads the issue again', async () => {
    const f = unlabeledAndOpen();
    f.issueLabels[7] = [];
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0]!.text).toContain('Open one');
    expect(f.store.proposal(7)?.postedAt).toBeNull();
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.logs.join('\n')).toContain('7 the issue lost its voting label');
    await postProposal(f.ctx, f.store);
    expect(f.calls.filter((call) => call === 'issue 7')).toHaveLength(1);
  });

  it('closes a proposal whose send fails, reports it once, never retries it and posts the next one on the next tick', async () => {
    const f = publicFake({ proposalsPerDay: 5 });
    f.store.addProposal(7, 'Broken', new Date('2026-10-14T08:00:00Z'));
    f.store.addProposal(8, 'Fine', new Date('2026-10-14T09:00:00Z'));
    const send = f.ctx.telegram.sendMessage;
    let failing = true;
    f.ctx.telegram.sendMessage = async (...args: Parameters<typeof send>) => {
      if (failing) throw new Error('Telegram sendMessage failed: chat not found');
      return send(...args);
    };
    await postProposal(f.ctx, f.store);
    expect(f.store.proposal(7)?.postedAt).toBeNull();
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.store.proposal(8)?.closedAt).toBeNull();
    const failures = readState(f.ctx.statePath).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]!.issue).toBe(7);
    expect(failures[0]!.error).toContain('chat not found');
    failing = false;
    await postProposal(f.ctx, f.store);
    await postProposal(f.ctx, f.store);
    expect(f.messages.map((message) => message.text.split('\n')[0])).toEqual(['Fine']);
    expect(f.calls.filter((call) => call === 'issue 7')).toHaveLength(1);
    expect(readState(f.ctx.statePath).failures).toHaveLength(1);
  });

  it('closes a proposal whose issue read fails, reports it once and never reads it again', async () => {
    const f = publicFake({ proposalsPerDay: 5 });
    f.store.addProposal(7, 'Broken', f.clock.now);
    f.ctx.github.issue = async () => { throw new Error('GitHub down'); };
    await postProposal(f.ctx, f.store);
    await postProposal(f.ctx, f.store);
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(readState(f.ctx.statePath).failures).toHaveLength(1);
    expect(f.messages).toEqual([]);
  });

  it('counts a failed attempt toward the daily cap, so a broken chat stops after the cap', async () => {
    const f = publicFake({ proposalsPerDay: 2 });
    for (const issue of [1, 2, 3, 4]) f.store.addProposal(issue, `P${issue}`, f.clock.now);
    f.ctx.telegram.sendMessage = async () => { throw new Error('chat not found'); };
    for (let tick = 0; tick < 5; tick++) await postProposal(f.ctx, f.store);
    expect(readState(f.ctx.statePath).failures).toHaveLength(2);
    expect(f.store.proposal(3)?.closedAt).toBeNull();
    expect(f.store.proposal(4)?.closedAt).toBeNull();
    f.clock.now = new Date(f.clock.now.getTime() + 25 * HOUR_MS);
    f.ctx.telegram.sendMessage = async () => 900;
    await postProposal(f.ctx, f.store);
    expect(f.store.proposal(3)?.messageId).toBe(900);
  });

  it('does not count a proposal closed for a closed issue or a lost label toward the cap', async () => {
    const f = publicFake({ proposalsPerDay: 1 });
    f.issueState[1] = 'CLOSED';
    f.issueLabels[2] = [];
    for (const issue of [1, 2, 3]) f.store.addProposal(issue, `P${issue}`, f.clock.now);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    expect(f.store.proposal(3)?.messageId).toBe(501);
  });

  it('posts a card put to a vote again after its earlier proposal closed', async () => {
    const f = publicFake({ proposalsPerDay: 5 });
    f.store.addProposal(7, 'First pitch', f.clock.now);
    await postProposal(f.ctx, f.store);
    f.store.closeProposal(7, f.clock.now);
    f.store.addProposal(7, 'Second pitch', f.clock.now);
    await postProposal(f.ctx, f.store);
    expect(f.messages.map((message) => message.text.split('\n')[0])).toEqual(['First pitch', 'Second pitch']);
    expect(f.store.proposal(7)?.messageId).toBe(502);
  });

  it('measures the longest post against the Telegram limit', () => {
    const f = publicFake();
    const pitch = 'x'.repeat(MESSAGE_LIMIT);
    expect(longestProposalText(f.ctx, [7, 8], pitch).length).toBeGreaterThan(MESSAGE_LIMIT);
    expect(longestProposalText(f.ctx, [7], 'short').length).toBeGreaterThanOrEqual(proposalText(f.ctx, 7, 'short', '3/3\n❌ Rejected by committee member').length);
  });
});
