import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cardDrift } from '../position';
import { EMPTY_STATE, readState, writeState } from '../state';
import type { Card, Ctx, FactoryState, KeptApproval } from '../types';
import { readyToShip, requeueKept } from './kept-approval';

const KEPT: KeptApproval = { by: 'Bob', at: '2026-09-30T09:00:00.000Z', build: 'aaa1111', checked: ['aaa1111', 'ddd4444'], reason: 'main moved' };
const card = (column: Card['column'], labels: string[] = ['hotfix']): Card => ({ itemId: 'i7', issue: 7, column, labels });
const waiting = (patch: Partial<FactoryState> = {}): FactoryState => ({ ...structuredClone(EMPTY_STATE), keptApprovals: { 7: KEPT }, builds: { 7: 'ddd4444' }, ...patch });

let home = '';
beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-kept-');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function ctxWith(state: FactoryState): Ctx {
  writeState(`${home}/state.json`, state);
  return { statePath: `${home}/state.json`, log: () => undefined } as unknown as Ctx;
}

describe('a kept approval after a failed approve job or a restart', () => {
  it('is queued again for a checked build that waits in Approval with no job and no post', () => {
    const ctx = ctxWith(waiting());
    requeueKept(ctx, [card('Approval')]);
    expect(readState(ctx.statePath).pendingApprovals).toEqual({ 7: 'Bob' });
  });

  it('waits while the card is stuck, held, failed, running a job, already queued or in another column', () => {
    const job = { id: 'approve-7', stage: 'approve' as const, issue: 7, pid: 1, startedAt: '', log: '' };
    const failure = { stage: 'approve' as const, issue: 7, error: 'push failed', cause: 'github' as const, log: null, at: '' };
    const hold = { by: 'Ann', reason: 'r', at: '', stage: null };
    expect(readyToShip(waiting(), card('Approval', ['hotfix', 'factory-stuck']))).toBeNull();
    expect(readyToShip(waiting({ held: { 7: hold } }), card('Approval'))).toBeNull();
    expect(readyToShip(waiting({ failures: [failure] }), card('Approval'))).toBeNull();
    expect(readyToShip(waiting({ jobs: [job] }), card('Approval'))).toBeNull();
    expect(readyToShip(waiting({ pendingApprovals: { 7: 'Bob' } }), card('Approval'))).toBeNull();
    expect(readyToShip(waiting(), card('Testing'))).toBeNull();
  });

  it('queues the approval again after a failed approve job on the approved post, once retry clears the failure', () => {
    expect(readyToShip(waiting({ approvalPosts: { 90: 7 } }), card('Approval'))).toEqual(KEPT);
  });

  it('never queues a build its checks did not pass', () => {
    expect(readyToShip(waiting({ builds: { 7: 'eee5555' } }), card('Approval'))).toBeNull();
    expect(readyToShip(waiting({ builds: {} }), card('Approval'))).toBeNull();
    expect(readyToShip(waiting({ keptApprovals: {} }), card('Approval'))).toBeNull();
  });

  it('shows no drift for an Approval card that keeps an approval with no post', () => {
    expect(cardDrift(card('Approval'), waiting())).toEqual([]);
    expect(cardDrift(card('Approval'), waiting({ keptApprovals: {} }))).toEqual(['#7 column Approval but no open post and no approval']);
  });
});
