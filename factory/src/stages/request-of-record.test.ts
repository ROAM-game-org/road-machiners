import { describe, expect, it } from 'vitest';
import { requestOfRecord } from './request-of-record';

describe('requestOfRecord', () => {
  it('keeps Hermes text alone when the factory recorded no member words', () => {
    expect(requestOfRecord(undefined, 'notes')).toBe('notes');
    expect(requestOfRecord([], 'notes')).toBe('notes');
  });

  it('quotes each member message as written, oldest first, above the Hermes notes', () => {
    const words = [{ messageId: 1, at: 'a', text: 'Queue opus\n\nto analyze' }, { messageId: 2, at: 'b', text: 'yes' }];
    expect(requestOfRecord(words, 'notes')).toBe([
      "The member's own words, as the factory recorded their messages in the committee chat, oldest first. They rule.",
      '> Queue opus\n>\n> to analyze\n\n> yes',
      "Hermes's notes. They are Hermes's reading of the words above, and rank below them.",
      'notes',
    ].join('\n\n'));
  });
});
