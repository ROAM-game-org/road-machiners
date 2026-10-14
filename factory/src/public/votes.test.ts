import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readState } from '../state';
import { CHANNEL, publicFake } from './public-fakes';
import { countVotes } from './votes';

function posted(counts: Record<string, number>) {
  const f = publicFake();
  f.store.addProposal(7, 'Winch', f.clock.now);
  f.store.markProposalPosted(7, CHANNEL, 100, f.clock.now);
  f.store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts });
  return f;
}

describe('countVotes', () => {
  it('moves a proposal that reached the votes to Design once, drops the label, writes the ledger line and replies', async () => {
    const f = posted({ '👍': 2, '❤': 1, '👎': 5 });
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(f.calls).toContain('removeLabel 7 voting');
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0]).toMatchObject({ chat: CHANNEL, replyTo: 100 });
    expect(f.messages[0]!.text).toContain('factory starts work');
    const lines = readFileSync(`${f.home}/ledger.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ kind: 'card', issue: 7, step: 'voted', to: 'Design' })]);
  });

  it('closes a passed proposal before its GitHub writes, so a failed move is reported once and never repeated', async () => {
    const f = posted({ '👍': 3 });
    f.ctx.github.move = async () => { f.calls.push('move failed'); throw new Error('issue was closed'); };
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call === 'move failed')).toHaveLength(1);
    expect(readState(f.ctx.statePath).failures).toEqual([expect.objectContaining({ stage: 'public', issue: 7 })]);
    expect(f.calls.filter((call) => call.startsWith('addLabel'))).toEqual([]);
  });

  it('passes a proposal on one thumbs-up from a committee member, like a committee thumbs-up on GitHub did', async () => {
    const f = posted({});
    f.store.applyEvent({ updateId: 2, kind: 'reaction', chat: CHANNEL, messageId: 100, user: '42', emoji: ['👍'] });
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(f.messages[0]!.text).toBe('A committee member accepted this proposal. The factory starts work on it now.');
  });

  it('does not pass a proposal on a committee thumbs-down or on one player thumbs-up', async () => {
    const f = posted({});
    f.store.applyEvent({ updateId: 2, kind: 'reaction', chat: CHANNEL, messageId: 100, user: '42', emoji: ['👎'] });
    f.store.applyEvent({ updateId: 3, kind: 'reaction', chat: CHANNEL, messageId: 100, user: '7', emoji: ['👍'] });
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual([]);
  });

  it('makes no GitHub or Telegram call below the votes needed', async () => {
    const f = posted({ '👍': 2 });
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual([]);
    expect(f.store.proposal(7)?.closedAt).toBeNull();
  });
});
