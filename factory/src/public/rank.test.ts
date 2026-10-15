import { describe, expect, it } from 'vitest';
import { rankByWords } from './rank';

describe('rankByWords', () => {
  const texts = ['Truck Repair: field repair costs scrap', 'Truck Mass: a heavy truck burns more fuel', 'Towns Radio: call a town on the radio'];

  it('ranks the texts that share the rarest words with the query first', () => {
    expect(rankByWords(texts, 'How do I repair the truck?', 5)).toEqual([0, 1]);
  });

  it('finds nothing for a query that shares no word', () => {
    expect(rankByWords(texts, 'When is the next release?', 5)).toEqual([]);
  });

  it('keeps at most the limit', () => {
    expect(rankByWords(texts, 'truck repair radio', 2)).toHaveLength(2);
  });
});
