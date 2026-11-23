import { describe, expect, it } from 'vitest';
import { inQueue } from './models';

describe('inQueue', () => {
  it('never runs more than the width at once and handles every item once', async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await inQueue([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
