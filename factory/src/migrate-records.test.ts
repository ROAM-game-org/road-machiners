import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateRecords } from './migrate-records';
import { EMPTY_STATE, readState, writeState } from './state';
import { fake, reset } from './stages/test-fakes';
import { FEEDBACK_HEADING, NEEDS_INFO_LABEL, PLAYER_REPORT_HEADING, QUESTIONS_HEADING, type Card, type IssueComment } from './types';

beforeEach(reset);

const said = (body: string, createdAt: string, byFactory = true): IssueComment => ({ login: byFactory ? 'factory' : 'ann', body, createdAt, byFactory });
const card = (issue: number, column: Card['column'], labels: string[] = []): Card => ({ itemId: `i${issue}`, issue, column, labels });

function withComments(byIssue: Record<number, IssueComment[]>) {
  const f = fake();
  const read: number[] = [];
  Object.assign(f.ctx.github, { comments: async (issue: number) => { read.push(issue); return byIssue[issue] ?? []; } });
  return { f, read };
}

function saveOldState(path: string): void {
  const { asked: _asked, pendingFeedback: _pendingFeedback, routed: _routed, recordsToFill: _recordsToFill, ...old } = structuredClone(EMPTY_STATE);
  writeFileSync(path, JSON.stringify(old));
}

describe('migrateRecords', () => {
  it('fills the ask time of needs-info cards and the feedback a verify round still owes, from the old comments, once', async () => {
    const { f, read } = withComments({
      4: [said(`${QUESTIONS_HEADING}\n\nfirst`, '2026-10-01T00:00:00Z'), said('answer', '2026-10-02T00:00:00Z', false), said(`${QUESTIONS_HEADING}\n\nsecond`, '2026-10-03T00:00:00Z')],
      5: [said(`${FEEDBACK_HEADING}\n\nold`, '2026-10-01T00:00:00Z'), said('Ready for approval: https://x', '2026-10-02T00:00:00Z'), said(`${PLAYER_REPORT_HEADING}\n\nmake it red`, '2026-10-03T00:00:00Z')],
      6: [said('Triage passed: x\n\nModel routing from triage: trivial, label design-sonnet.', '2026-09-30T00:00:00Z'), said(`${FEEDBACK_HEADING}\n\ndone already`, '2026-10-01T00:00:00Z'), said('Ready for approval: https://x', '2026-10-02T00:00:00Z')],
      7: [said(`${FEEDBACK_HEADING}\n\nRemoved from release`, '2026-10-01T00:00:00Z')],
    });
    f.cards.push(card(4, 'Triage', [NEEDS_INFO_LABEL]), card(5, 'Testing'), card(6, 'Testing'), card(7, 'Design'), card(8, 'Done'));
    saveOldState(f.ctx.statePath);
    expect(readState(f.ctx.statePath).recordsToFill).toEqual(['asked', 'pendingFeedback', 'routed']);
    await migrateRecords(f.ctx);
    const state = readState(f.ctx.statePath);
    expect(state.asked).toEqual({ 4: '2026-10-03T00:00:00Z' });
    expect(state.pendingFeedback).toEqual({ 5: { source: 'player', body: `${PLAYER_REPORT_HEADING}\n\nmake it red` }, 7: { source: 'committee', body: `${FEEDBACK_HEADING}\n\nRemoved from release` } });
    expect(state.routed).toEqual([6]);
    expect(state.recordsToFill).toEqual([]);
    expect(read).toEqual([4, 5, 6, 7]);
    await migrateRecords(f.ctx);
    expect(read).toEqual([4, 5, 6, 7]);
  });

  it('keeps records written since and reads nothing for state that already has them', async () => {
    const { f, read } = withComments({ 4: [said(`${QUESTIONS_HEADING}\n\nq`, '2026-10-01T00:00:00Z')] });
    f.cards.push(card(4, 'Triage', [NEEDS_INFO_LABEL]));
    writeState(f.ctx.statePath, { ...structuredClone(EMPTY_STATE), asked: { 4: '2026-10-09T00:00:00Z' }, recordsToFill: ['asked'] });
    await migrateRecords(f.ctx);
    expect(readState(f.ctx.statePath).asked).toEqual({ 4: '2026-10-09T00:00:00Z' });
    writeState(f.ctx.statePath, structuredClone(EMPTY_STATE));
    await migrateRecords(f.ctx);
    expect(read).toEqual([4]);
  });
});
