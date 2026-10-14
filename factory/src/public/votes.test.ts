import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readState } from '../state';
import { CHANNEL, publicFake } from './public-fakes';
import { postProposal } from './proposals';
import { countVotes } from './votes';

function posted(counts: Record<string, number> | null) {
  const f = publicFake();
  f.store.addProposal(7, 'Winch', f.clock.now);
  f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
  if (counts) f.store.applyEvent({ updateId: 1, kind: 'reaction-count', chat: CHANNEL, messageId: 100, counts });
  return f;
}

const react = (f: ReturnType<typeof posted>, updateId: number, user: string, emoji: string[]) =>
  f.store.applyEvent({ updateId, kind: 'reaction', chat: CHANNEL, messageId: 100, user, emoji });

const footer = (edit: string): string => edit.split('\n\n').at(-1)!;

describe('countVotes', () => {
  it('moves a proposal whose 👍 lead its 👎 by the votes needed to Design once, drops the label, writes the ledger line and adds the conclusion to the post', async () => {
    const f = posted({ '👍': 4, '❤': 1, '👎': 2 });
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(f.calls).toContain('removeLabel 7 voting');
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.messages).toEqual([]);
    expect(f.edits).toHaveLength(1);
    expect(f.edits[0]).toMatch(/^100 <b>Proposal: Winch<\/b>/);
    expect(footer(f.edits[0]!)).toBe('Needs 3 more 👍 than 👎 to pass. Current: 5 👍, 2 👎, net +3/3\n✅ Accepted with net +3');
    const lines = readFileSync(`${f.home}/ledger.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ kind: 'card', issue: 7, step: 'voted', to: 'Design' })]);
  });

  it('keeps a proposal open while its 👎 hold the net score below the votes needed', async () => {
    const f = posted({ '👍': 4, '👎': 2 });
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual([]);
    expect(f.store.proposal(7)?.closedAt).toBeNull();
    expect(f.edits.map(footer)).toEqual(['Needs 3 more 👍 than 👎 to pass. Current: 4 👍, 2 👎, net +2/3']);
  });

  it('updates the footer when a vote is added, switched or removed, shows a negative net, and ignores a repeated update', async () => {
    const f = posted(null);
    f.store.setShownFooter(7, 'Needs 3 more 👍 than 👎 to pass. Current: 0 👍, 0 👎, net 0/3');
    await countVotes(f.ctx, f.store);
    expect(f.edits).toEqual([]);
    react(f, 2, '7', ['👎']);
    await countVotes(f.ctx, f.store);
    react(f, 2, '7', ['👍']);
    await countVotes(f.ctx, f.store);
    react(f, 3, '8', ['👍']);
    await countVotes(f.ctx, f.store);
    react(f, 4, '7', ['👍']);
    await countVotes(f.ctx, f.store);
    react(f, 5, '8', []);
    await countVotes(f.ctx, f.store);
    react(f, 6, '9', ['🔥']);
    await countVotes(f.ctx, f.store);
    expect(f.edits.map(footer)).toEqual([
      'Needs 3 more 👍 than 👎 to pass. Current: 0 👍, 1 👎, net -1/3',
      'Needs 3 more 👍 than 👎 to pass. Current: 1 👍, 1 👎, net 0/3',
      'Needs 3 more 👍 than 👎 to pass. Current: 2 👍, 0 👎, net +2/3',
      'Needs 3 more 👍 than 👎 to pass. Current: 1 👍, 0 👎, net +1/3',
    ]);
    expect(f.calls).toEqual([]);
  });

  it('makes no edit right after posting, since the post already shows the count', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch\n\nPull trucks out.', f.clock.now);
    await postProposal(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.messages).toHaveLength(1);
    expect(f.edits).toEqual([]);
  });

  it('redraws an open proposal posted under the old rule once, in the new format, from its stored votes', async () => {
    const f = posted(null);
    react(f, 2, '7', ['👍']);
    react(f, 3, '8', ['👎']);
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.edits).toHaveLength(1);
    expect(f.edits[0]).toMatch(/^100 <b>Proposal: Winch<\/b>/);
    expect(footer(f.edits[0]!)).toBe('Needs 3 more 👍 than 👎 to pass. Current: 1 👍, 1 👎, net 0/3');
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

  it('never undoes an accepted proposal when its score falls later', async () => {
    const f = posted(null);
    for (const [updateId, user] of [[2, '7'], [3, '8'], [4, '9']] as const) react(f, updateId, user, ['👍']);
    await countVotes(f.ctx, f.store);
    react(f, 5, '7', ['👎']);
    react(f, 6, '8', []);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(f.edits.map(footer)).toEqual(['Needs 3 more 👍 than 👎 to pass. Current: 3 👍, 0 👎, net +3/3\n✅ Accepted with net +3']);
  });

  it('passes a proposal on one thumbs-up from a committee member, even with a negative net score', async () => {
    const f = posted(null);
    react(f, 2, '7', ['👎']);
    react(f, 3, '8', ['👎']);
    react(f, 4, '42', ['👍']);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(footer(f.edits[0]!)).toBe('Needs 3 more 👍 than 👎 to pass. Current: 1 👍, 2 👎, net -1/3\n✅ Accepted by committee member');
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
    expect(f.edits.map(footer)).toEqual(['Needs 3 more 👍 than 👎 to pass. Current: 5 👍, 0 👎, net +5/3\n❌ Rejected by committee member']);
    const lines = readFileSync(`${f.home}/ledger.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ kind: 'card', issue: 7, step: 'denied', to: 'Done' })]);
  });

  it('counts a player thumbs-down against the proposal and never rejects on it', async () => {
    const f = posted(null);
    for (const [updateId, user] of [[2, '7'], [3, '8'], [4, '9'], [5, '10']] as const) react(f, updateId, user, ['👍']);
    react(f, 6, '11', ['👎']);
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual(['removeLabel 7 voting', 'move 7 Design']);
    expect(footer(f.edits[0]!)).toBe('Needs 3 more 👍 than 👎 to pass. Current: 4 👍, 1 👎, net +3/3\n✅ Accepted with net +3');
  });
});
