import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readState, updateState } from '../state';
import { CHANNEL, publicFake } from './public-fakes';
import { postProposal } from './proposals';
import { countVotes, reviveVotes } from './votes';

function posted(counts: Record<string, number> | null) {
  const f = publicFake();
  f.store.addProposal(7, 'Winch', f.clock.now);
  f.store.markProposalPosted(7, CHANNEL, 100, 'footer', f.clock.now);
  f.cards = [{ itemId: 'x', issue: 7, column: 'Triage', labels: ['voting'] }];
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
    expect(f.edits[0]).toMatch(/^100 <b>Предложение: Winch<\/b>/);
    expect(footer(f.edits[0]!)).toBe('Нужно на 3 👍 больше, чем 👎. Сейчас: 5 👍, 2 👎, итог +3/3\n✅ Принято с итогом +3');
    const lines = readFileSync(`${f.home}/ledger.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ kind: 'card', issue: 7, step: 'voted', to: 'Design' })]);
  });

  it('keeps a proposal open while its 👎 hold the net score below the votes needed', async () => {
    const f = posted({ '👍': 4, '👎': 2 });
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual([]);
    expect(f.store.proposal(7)?.closedAt).toBeNull();
    expect(f.edits.map(footer)).toEqual(['Нужно на 3 👍 больше, чем 👎. Сейчас: 4 👍, 2 👎, итог +2/3']);
  });

  it('updates the footer when a vote is added, switched or removed, shows a negative net, and ignores a repeated update', async () => {
    const f = posted(null);
    f.store.setShownFooter(7, 'Нужно на 3 👍 больше, чем 👎. Сейчас: 0 👍, 0 👎, итог 0/3');
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
      'Нужно на 3 👍 больше, чем 👎. Сейчас: 0 👍, 1 👎, итог -1/3',
      'Нужно на 3 👍 больше, чем 👎. Сейчас: 1 👍, 1 👎, итог 0/3',
      'Нужно на 3 👍 больше, чем 👎. Сейчас: 2 👍, 0 👎, итог +2/3',
      'Нужно на 3 👍 больше, чем 👎. Сейчас: 1 👍, 0 👎, итог +1/3',
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
    expect(f.edits[0]).toMatch(/^100 <b>Предложение: Winch<\/b>/);
    expect(footer(f.edits[0]!)).toBe('Нужно на 3 👍 больше, чем 👎. Сейчас: 1 👍, 1 👎, итог 0/3');
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

  it('keeps the voting label when the card move fails, so triage does not run again on the card', async () => {
    const f = posted({ '👍': 3 });
    f.ctx.github.move = async () => { throw new Error('GitHub 502'); };
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('removeLabel'))).toEqual([]);
    expect(f.edits).toEqual([]);
  });

  it('removes the voting label only after the card move', async () => {
    const f = posted({ '👍': 3 });
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move') || call.startsWith('removeLabel'))).toEqual(['move 7 Design', 'removeLabel 7 voting']);
  });

  it('removes the voting label last when it rejects a proposal', async () => {
    const f = posted(null);
    react(f, 2, '42', ['👎']);
    await countVotes(f.ctx, f.store);
    expect(f.calls.at(-1)).toBe('removeLabel 7 voting');
    expect(f.calls.indexOf('move 7 Done')).toBeLessThan(f.calls.indexOf('removeLabel 7 voting'));
  });

  it.each([
    ['the issue is closed', (f: ReturnType<typeof posted>) => { f.issueState[7] = 'CLOSED'; }],
    ['the voting label was removed by hand', (f: ReturnType<typeof posted>) => { f.issueLabels[7] = []; }],
    ['the card was moved by hand out of Triage', (f: ReturnType<typeof posted>) => { f.cards = [{ itemId: 'x', issue: 7, column: 'Implementation', labels: ['voting'] }]; }],
    ['the card left the board', (f: ReturnType<typeof posted>) => { f.cards = []; }],
  ])('closes a passed proposal with no GitHub write when %s', async (_name, change) => {
    const f = posted({ '👍': 3 });
    change(f);
    await countVotes(f.ctx, f.store);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => !call.startsWith('issue'))).toEqual([]);
    expect(f.calls.filter((call) => call.startsWith('issue'))).toEqual(['issue 7']);
    expect(f.store.proposal(7)?.closedAt).not.toBeNull();
    expect(f.edits.map(footer)).toEqual(['Нужно на 3 👍 больше, чем 👎. Сейчас: 3 👍, 0 👎, итог +3/3\nЗакрыто']);
    expect(f.logs.join('\n')).toContain('7 the issue is closed');
  });

  it('closes a committee-rejected proposal with no GitHub write when its card left Triage', async () => {
    const f = posted(null);
    f.cards = [{ itemId: 'x', issue: 7, column: 'Done', labels: [] }];
    react(f, 2, '42', ['👎']);
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual(['issue 7']);
    expect(f.edits.map(footer)).toEqual(['Нужно на 3 👍 больше, чем 👎. Сейчас: 0 👍, 1 👎, итог -1/3\nЗакрыто']);
  });

  it('reads the issue and the board only when a proposal concludes, never for a count edit', async () => {
    const f = posted(null);
    react(f, 2, '7', ['👍']);
    let boardReads = 0;
    f.ctx.github.cards = async () => { boardReads += 1; return f.cards; };
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual([]);
    expect(boardReads).toBe(0);
  });

  it('never undoes an accepted proposal when its score falls later', async () => {
    const f = posted(null);
    for (const [updateId, user] of [[2, '7'], [3, '8'], [4, '9']] as const) react(f, updateId, user, ['👍']);
    await countVotes(f.ctx, f.store);
    react(f, 5, '7', ['👎']);
    react(f, 6, '8', []);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(f.edits.map(footer)).toEqual(['Нужно на 3 👍 больше, чем 👎. Сейчас: 3 👍, 0 👎, итог +3/3\n✅ Принято с итогом +3']);
  });

  it('passes a proposal on one thumbs-up from a committee member, even with a negative net score', async () => {
    const f = posted(null);
    react(f, 2, '7', ['👎']);
    react(f, 3, '8', ['👎']);
    react(f, 4, '42', ['👍']);
    await countVotes(f.ctx, f.store);
    expect(f.calls.filter((call) => call.startsWith('move'))).toEqual(['move 7 Design']);
    expect(footer(f.edits[0]!)).toBe('Нужно на 3 👍 больше, чем 👎. Сейчас: 1 👍, 2 👎, итог -1/3\n✅ Принято участником комитета');
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
    expect(f.edits.map(footer)).toEqual(['Нужно на 3 👍 больше, чем 👎. Сейчас: 5 👍, 0 👎, итог +5/3\n❌ Отклонено участником комитета']);
    const lines = readFileSync(`${f.home}/ledger.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ kind: 'card', issue: 7, step: 'denied', to: 'Done' })]);
  });

  it('queues a vetoed proposal for the incident job and queues an accepted one for nothing', async () => {
    const vetoed = posted({ '👍': 5 });
    react(vetoed, 2, '42', ['👎']);
    await countVotes(vetoed.ctx, vetoed.store);
    expect(readState(vetoed.ctx.statePath).pendingIncidents).toEqual([7]);
    const accepted = posted({ '👍': 4 });
    await countVotes(accepted.ctx, accepted.store);
    expect(readState(accepted.ctx.statePath).pendingIncidents).toEqual([]);
  });

  it('counts a player thumbs-down against the proposal and never rejects on it', async () => {
    const f = posted(null);
    for (const [updateId, user] of [[2, '7'], [3, '8'], [4, '9'], [5, '10']] as const) react(f, updateId, user, ['👍']);
    react(f, 6, '11', ['👎']);
    await countVotes(f.ctx, f.store);
    expect(f.calls).toEqual(['issue 7', 'move 7 Design', 'removeLabel 7 voting']);
    expect(footer(f.edits[0]!)).toBe('Нужно на 3 👍 больше, чем 👎. Сейчас: 4 👍, 1 👎, итог +3/3\n✅ Принято с итогом +3');
  });
});

describe('reviveVotes', () => {
  const voting = (issue: number, column: 'Triage' | 'Design' = 'Triage') => ({ itemId: `i${issue}`, issue, column, labels: ['voting'] });

  it('reopens a proposal that closed before any post attempt, once, and posts it on the next proposal step', async () => {
    const f = publicFake();
    f.store.addProposal(7, 'Winch', f.clock.now);
    f.store.closeProposal(7, f.clock.now);
    f.cards = [voting(7)];
    await reviveVotes(f.ctx, f.cards);
    await reviveVotes(f.ctx, f.cards);
    expect(f.store.proposal(7)?.closedAt).toBeNull();
    expect(f.logs.filter((line) => line.includes('open again'))).toHaveLength(1);
    expect(f.calls).toEqual([]);
    await postProposal(f.ctx, f.store);
    expect(f.store.proposal(7)?.postedAt).not.toBeNull();
  });

  it('removes the voting label of a card with no proposal, so triage runs again', async () => {
    const f = publicFake();
    await reviveVotes(f.ctx, [voting(7)]);
    expect(f.calls).toEqual(['removeLabel 7 voting']);
    expect(f.logs.some((line) => line.startsWith('public 7 ') && line.includes('no proposal'))).toBe(true);
  });

  it('leaves an open, posted or attempted proposal, a card outside Triage and a card with a running job', async () => {
    const f = posted(null);
    f.store.addProposal(8, 'Horn', f.clock.now);
    f.store.addProposal(9, 'Lamp', f.clock.now);
    f.store.beginProposalPost(9, f.clock.now);
    f.store.addProposal(10, 'Tow', f.clock.now);
    f.store.markProposalPosted(10, CHANNEL, 101, 'footer', f.clock.now);
    f.store.closeProposal(10, f.clock.now);
    updateState(f.ctx.statePath, (state) => ({ ...state, jobs: [{ id: 'triage-12-x', stage: 'triage', issue: 12, pid: 1, startedAt: '', log: '' }] }));
    await reviveVotes(f.ctx, [voting(7), voting(8), voting(9), voting(10), voting(11, 'Design'), voting(12)]);
    expect(f.calls).toEqual([]);
    expect(f.store.proposal(9)?.closedAt).not.toBeNull();
    expect(f.store.proposal(10)?.closedAt).not.toBeNull();
    expect(f.logs).toEqual([]);
  });
});
