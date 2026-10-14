import { describe, expect, it } from 'vitest';
import { askedAt, isAnswered } from './questions';
import { FACTORY_MARK, QUESTIONS_HEADING } from './types';

const T0 = '2026-10-01T00:00:00Z';
const person = (login: string, body: string) => ({ login, body, createdAt: T0, byFactory: false });
const asked = { login: 'bot', body: `${QUESTIONS_HEADING}\n\n@anna\n\n1. What?\n\n${FACTORY_MARK}`, createdAt: T0, byFactory: true };
const marked = { login: 'bot', body: `Triage passed.\n\n${FACTORY_MARK}`, createdAt: T0, byFactory: true };

describe('isAnswered', () => {
  it('is false when nothing follows the questions', () => {
    expect(isAnswered([person('anna', 'first'), asked])).toBe(false);
  });

  it('is true when the author replies', () => {
    expect(isAnswered([asked, person('anna', 'Like this')])).toBe(true);
  });

  it('is true when anyone replies', () => {
    expect(isAnswered([asked, person('stranger', 'I think so')])).toBe(true);
  });

  it('ignores factory comments after the questions', () => {
    expect(isAnswered([asked, marked])).toBe(false);
  });

  it('ignores replies before the last questions', () => {
    expect(isAnswered([person('anna', 'old'), asked, marked, asked])).toBe(false);
    expect(isAnswered([asked, person('anna', 'old'), asked])).toBe(false);
  });

  it('is false when the factory never asked', () => {
    expect(isAnswered([person('anna', 'hello'), marked])).toBe(false);
  });

  it('does not take a member quoting the heading for the factory', () => {
    expect(isAnswered([person('anna', QUESTIONS_HEADING)])).toBe(false);
  });

  it('does not take a stranger copying the heading and the mark for the factory', () => {
    expect(isAnswered([person('stranger', `${QUESTIONS_HEADING}\n\n${FACTORY_MARK}`)])).toBe(false);
    expect(isAnswered([asked, person('stranger', `${QUESTIONS_HEADING}\n\n${FACTORY_MARK}`)])).toBe(true);
  });
});

describe('askedAt', () => {
  it('gives the time of the last questions', () => {
    const later = { ...asked, createdAt: '2026-10-02T00:00:00Z' };
    expect(askedAt([asked, person('anna', 'old'), later])).toBe('2026-10-02T00:00:00Z');
  });

  it('is null when the factory never asked', () => {
    expect(askedAt([person('anna', QUESTIONS_HEADING)])).toBeNull();
  });
});
