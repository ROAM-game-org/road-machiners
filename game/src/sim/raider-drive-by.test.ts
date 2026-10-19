import { describe, expect, it } from 'vitest';
import { count, runs, summary } from '../test/drive-by-scene';

describe.each([['by day', false], ['at night', true]])('drive-by %s on the real map', (_label, night) => {
  const minTrader = night ? 3 : 5;
  const minPlayer = night ? 5 : 6;

  it(`engages a trader carrying six electronics in at least ${minTrader} of 8 seeds`, () => {
    const results = runs('trader', night);
    expect(count(results, (r) => r.engaged), summary(results)).toBeGreaterThanOrEqual(minTrader);
  });

  it('engages the start-kit player or records why it let them pass', () => {
    const results = runs('player', night);
    expect(count(results, (r) => r.engaged || r.passed.length > 0), summary(results)).toBeGreaterThanOrEqual(minPlayer);
    if (night) expect(count(results, (r) => r.engaged), summary(results)).toBeGreaterThanOrEqual(1);
  });

  it('flees or passes with outgunned from prey that outguns it', () => {
    const results = runs('brute', night);
    const wary = count(results, (r) => r.fled || r.passed.includes('outgunned'));
    expect(count(results, (r) => r.engaged), summary(results)).toBeLessThanOrEqual(3);
    expect(wary, summary(results)).toBeGreaterThanOrEqual(night ? 1 : 4);
  });
});
