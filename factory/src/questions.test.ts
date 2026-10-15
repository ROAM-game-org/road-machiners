import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { askedAt, clearAsked, isAnswered, recordAsked } from './questions';
import { EMPTY_STATE, readState, writeState } from './state';

const ASKED = '2026-10-01T00:00:00Z';
const comment = (login: string, createdAt: string, byFactory: boolean) => ({ login, body: 'text', createdAt, byFactory });

describe('isAnswered', () => {
  it('is false when nobody but the factory wrote after the questions', () => {
    expect(isAnswered([], ASKED)).toBe(false);
    expect(isAnswered([comment('bot', '2026-10-02T00:00:00Z', true)], ASKED)).toBe(false);
  });

  it('is true for a comment of anyone but the factory after the questions', () => {
    expect(isAnswered([comment('anna', '2026-10-01T00:05:00Z', false)], ASKED)).toBe(true);
    expect(isAnswered([comment('stranger', '2026-10-01T00:05:00Z', false)], ASKED)).toBe(true);
  });

  it('is false for a human comment from before the questions, whatever its text', () => {
    expect(isAnswered([comment('anna', '2026-09-30T23:59:59Z', false)], ASKED)).toBe(false);
  });

  it('compares instants, not strings', () => {
    expect(isAnswered([comment('anna', '2026-10-01T00:00:00.500Z', false)], ASKED)).toBe(true);
    expect(isAnswered([comment('anna', '2026-10-01T00:00:00.000Z', false)], ASKED)).toBe(false);
  });
});

describe('the ask record', () => {
  let home = '';
  let statePath = '';
  beforeEach(() => {
    mkdirSync('tmp', { recursive: true });
    home = mkdtempSync('tmp/factory-questions-');
    statePath = `${home}/state.json`;
    writeState(statePath, structuredClone(EMPTY_STATE));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('reads the time the writer recorded, and the latest ask replaces an earlier one', () => {
    expect(askedAt(statePath, 5)).toBeNull();
    recordAsked(statePath, 5, ASKED);
    recordAsked(statePath, 6, '2026-10-02T00:00:00Z');
    recordAsked(statePath, 5, '2026-10-03T00:00:00Z');
    expect(askedAt(statePath, 5)).toBe('2026-10-03T00:00:00Z');
    expect(askedAt(statePath, 6)).toBe('2026-10-02T00:00:00Z');
  });

  it('forgets only the issue it clears', () => {
    recordAsked(statePath, 5, ASKED);
    recordAsked(statePath, 6, ASKED);
    clearAsked(statePath, 5);
    expect(readState(statePath).asked).toEqual({ 6: ASKED });
  });
});
