import { describe, expect, it } from 'vitest';
import { rankByWords } from './wiki';

describe('rankByWords', () => {
  const texts = ['Truck Repair A field repair patches a broken part to half its HP.', 'Truck Mass Mass slows the truck on hills.', 'Economy Shops buy goods at half their value.'];

  it('ranks the texts that share the rarest words with the query first', () => {
    expect(rankByWords(texts, 'How do I repair the truck?', 5)).toEqual([0, 1]);
  });

  it('finds nothing for a query that shares no word with the texts', () => {
    expect(rankByWords(texts, 'When is the next release?', 5)).toEqual([]);
  });

  it('keeps at most the limit', () => {
    expect(rankByWords(texts, 'truck repair mass shops', 2)).toHaveLength(2);
  });
});
