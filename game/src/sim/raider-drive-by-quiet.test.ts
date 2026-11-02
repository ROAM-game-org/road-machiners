import { describe, expect, it } from 'vitest';
import { count, runs, SEEDS, summary } from '../test/drive-by-scene';

const FIRST = SEEDS.slice(0, 4);

describe.each([['by day', false], ['at night', true]])('drive-by %s on the real map', (_label, night) => {
  it('never engages an empty trader', () => {
    const results = runs('empty', night, undefined, FIRST);
    expect(count(results, (r) => r.engaged || r.feud), summary(results, FIRST)).toBe(0);
  });

  it('changes no goal for prey parked beyond hearing and sight', () => {
    const results = runs('parked', night, 30, FIRST);
    expect(count(results, (r) => r.goalsChanged), summary(results, FIRST)).toBe(0);
  });
});
