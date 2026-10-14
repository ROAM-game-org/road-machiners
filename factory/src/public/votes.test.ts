import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readState } from '../state';
import { CHANNEL, publicFake } from './public-fakes';
import { countVotes } from './votes';

function posted(counts: Record<string, number> | null) {
  const f = publicFake();
  f.store.addProposal(7, 'Winch', f.clock.now);
  f.store.markProposalPosted(7, CHANNEL, 100, f.clock.now);
  if (counts) f.store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts });
  return f;
}

const react = (f: ReturnType<typeof posted>, updateId: number, user: string, emoji: string[]) =>
  f.store.applyEvent({ updateId, kind: 'reaction', chat: CHANNEL, messageId: 100, user, emoji });

const footer = (edit: string): string => edit.split('\n\n').at(-1)!;

describe('countVotes', () => {
  it('moves a proposal that reached the votes to Design once, drops the label, writes the ledger line and adds the conclusion to the post', async () => {
    const f = posted({ '👍': 2, '❤': 1, '👎': 5 });
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(f.calls).toContain('removeLabel 7 voting');
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.messages).toEqual([]);
    expect(f.edits).toHaveLength(1);
    expect(f.edits[0]).toMatch(/^100 Winch/);
    expect(footer(f.edits[0]!)).toBe('3/3\n✅ Accepted with 3 votes');
    const lines = readFileSync(`${f.home}/ledger.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ kind: 'card', issue: 7, step: 'voted', to: 'Design' })]);
  });

  it('updates the running count at the bottom of the post only when it changes', async () => {
    const f = posted(null);
    await countVotes(f.ctx, f.store);
    expect(f.edits).toEqual([]);
    react(f, 2, '7', ['👍']);
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    react(f, 3, '8', ['❤']);
    await countVotes(f.ctx, f.store);
    expect(f.edits.map(footer)).toEqual(['1/3', '2/3']);
    expect(f.calls).toEqual([]);
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
    const f = posted(null);
    react(f, 2, '42', ['👍']);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(footer(f.edits[0]!)).toBe('1/3\n✅ Accepted by committee member');
  });

  it('rejects a proposal on one thumbs-down from a committee member, even with enough votes, and closes the issue as not planned', async () => {
    const f = posted({ '👍': 5 });
    react(f, 2, '42', ['👎']);
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.calls).toContain('removeLabel 7 voting');
    expect(f.calls).toContain('addLabel 7 wont-do');
    expect(f.calls).toContain('close 7 not planned');
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Done']);
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.edits.map(footer)).toEqual(['5/3\n❌ Rejected by committee member']);
    const lines = readFileSync(`${f.home}/ledger.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ kind: 'card', issue: 7, step: 'denied', to: 'Done' })]);
  });

  it('counts a player thumbs-down for nothing', async () => {
    const f = posted(null);
    react(f, 2, '7', ['👎']);
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual([]);
    expect(f.store.proposal(7)?.closedAt).toBeNull();
  });

  it('makes no GitHub call below the votes needed', async () => {
    const f = posted({ '👍': 2 });
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual([]);
    expect(f.store.proposal(7)?.closedAt).toBeNull();
  });
});
