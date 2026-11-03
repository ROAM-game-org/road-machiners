import { describe, expect, it } from 'vitest';
import { bestTruck } from './escort-tactics';

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
