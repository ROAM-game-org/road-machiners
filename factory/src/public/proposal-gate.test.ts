import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drainInbox } from '../inbox';
import { readState } from '../state';
import { CHANNEL, COMMITTEE, publicFake } from './public-fakes';
import { postProposal, postProposalGate } from './proposals';
import { openStore } from './store';

const setup = async () => {
  const f = publicFake();
  f.cards = [{ itemId: 'i7', issue: 7, column: 'Triage', labels: ['voting'] }];
  f.store.addProposal(7, 'Winch\n\nPull trucks from sand.', f.clock.now);
  await postProposalGate(f.ctx, f.store);
  mkdirSync(join(f.home, 'inbox'), { recursive: true });
  const postId = Number(Object.keys(readState(f.ctx.statePath).proposalPosts)[0]);
  const send = async (kind: string, text: string | null, messageId = 10, by = '42', action?: string) => {
    writeFileSync(join(f.home, 'inbox', `${messageId}-${kind}.json`), JSON.stringify({ kind, issue: 7, text, by, byName: 'Member', chat: COMMITTEE, messageId, postId, action }));
    await drainInbox(f.ctx);
  };
  return { f, postId, send };
};

describe('committee proposal gate', () => {
  it('posts privately first and opens player voting only after an explicit member YES', async () => {
    const { f, send } = await setup();
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0]?.chat).toBe(COMMITTEE);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    await send('proposal-yes', 'YES');
    await postProposal(f.ctx, f.store);
    expect(f.messages[1]?.chat).toBe(CHANNEL);
    expect(f.comments[0]?.body).toContain('YES');
    await postProposalGate(f.ctx, f.store);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(2);
  });

  it('routes a natural negative reply with exact words to Design and never publishes it', async () => {
    const { f, send } = await setup();
    const words = 'оба предложения хуевые, иди переделывай';
    await send('proposal-reply', words);
    expect(readState(f.ctx.statePath).unroutedReplies['10']?.text).toBe(words);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    await send('proposal-action', null, 10, '42', 'redesign');
    await postProposalGate(f.ctx, f.store);
    await postProposal(f.ctx, f.store);
    expect(f.comments[0]?.body).toContain(words);
    expect(f.calls).toContain('move 7 Design');
    expect(f.calls).toContain('removeLabel 7 voting');
    expect(f.messages).toHaveLength(1);
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
  });

  it('routes a natural affirmative reply to vote permission without another member message', async () => {
    const { f, send } = await setup();
    const words = 'давайте вынесем это на голосование игроков';
    await send('proposal-reply', words);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    await send('proposal-action', null, 10, '42', 'vote');
    await postProposal(f.ctx, f.store);
    expect(f.messages[1]?.chat).toBe(CHANNEL);
    expect(f.comments[0]?.body).toContain(words);
    expect(readState(f.ctx.statePath).unroutedReplies).toEqual({});
  });

  it('records ambiguous feedback while holding player voting', async () => {
    const { f, send } = await setup();
    const words = 'YES, but only after changing it.';
    await send('proposal-reply', words);
    await send('proposal-action', null, 10, '42', 'feedback');
    await postProposal(f.ctx, f.store);
    expect(f.comments[0]?.body).toContain(words);
    expect(f.messages).toHaveLength(1);
  });

  it('keeps rejection private through retries', async () => {
    const { f, send } = await setup();
    await send('proposal-no', 'NO');
    await postProposalGate(f.ctx, f.store);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
  });

  it('rejects a nonmember even if an inbox command names the current post', async () => {
    const { f, send } = await setup();
    await send('proposal-yes', 'YES', 10, '999');
    await postProposal(f.ctx, f.store);
    expect(f.messages.filter((message) => message.chat === CHANNEL)).toHaveLength(0);
  });

  it('does not resend an interrupted committee post', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.beginGate(7, f.clock.now);
    await postProposalGate(f.ctx, f.store);
    await postProposal(f.ctx, f.store);
    expect(f.messages).toHaveLength(0);
  });

  it('keeps permission across a store reopen', async () => {
    const { f, send } = await setup();
    await send('proposal-yes', 'YES');
    f.store.close();
    const reopened = openStore(f.home);
    try {
      await postProposalGate(f.ctx, reopened);
      await postProposal(f.ctx, reopened);
      expect(f.messages.map((message) => message.chat)).toEqual([COMMITTEE, CHANNEL]);
    } finally {
      reopened.close();
    }
  });
});
