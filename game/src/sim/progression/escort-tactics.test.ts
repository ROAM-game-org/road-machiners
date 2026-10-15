import { describe, expect, it } from 'vitest';
import { bestTruck, keepsPace, savesFor } from './escort-tactics';

describe('bestTruck', () => {
  const offers = [{ id: 'a', value: 300, price: 90 }, { id: 'b', value: 500, price: 200 }, { id: 'c', value: 900, price: 700 }];

  it('buys the most valuable truck the budget pays', () => {
    expect(bestTruck(offers, 100, 250)).toBe('b');
  });

  it('buys nothing worse or equal to the current truck', () => {
    expect(bestTruck(offers, 500, 250)).toBeNull();
  });

  it('buys nothing it cannot pay', () => {
    expect(bestTruck(offers, 100, 50)).toBeNull();
  });
});

describe('keepsPace', () => {
  it('needs a top speed at the hauler top speed or better', () => {
    expect(keepsPace(6, 6)).toBe(true);
    expect(keepsPace(5.9, 6)).toBe(false);
  });
});

describe('savesFor', () => {
  const offers = [{ id: 'a', value: 300, price: 90 }, { id: 'b', value: 500, price: 200 }, { id: 'c', value: 900, price: 700 }];

  it('saves for a better truck that the next pay can reach', () => {
    expect(savesFor(offers, 100, 150, 60)).toBe(true);
  });

  it('does not save for a truck out of reach, one it can buy now, or one no better than its own', () => {
    expect(savesFor(offers, 100, 150, 20)).toBe(false);
    expect(savesFor(offers, 100, 250, 60)).toBe(false);
    expect(savesFor(offers, 900, 150, 60)).toBe(false);
  });
});
