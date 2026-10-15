import { describe, expect, it } from 'vitest';
import { count, runs, summary } from '../test/drive-by-scene';

describe.each([['by day', false], ['at night', true]])('drive-by %s on the real map', (_label, night) => {
  it('never engages an empty trader', () => {
    const results = runs('empty', night);
    expect(count(results, (r) => r.engaged || r.feud), summary(results)).toBe(0);
  });

  it('changes no goal for prey parked beyond hearing and sight', () => {
    const results = runs('parked', night, 30);
    expect(count(results, (r) => r.goalsChanged), summary(results)).toBe(0);
  });
});
