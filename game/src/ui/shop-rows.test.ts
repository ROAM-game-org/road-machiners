import { describe, expect, it } from 'vitest';
import { shopDef } from '../data/market';
import { untradedHeld } from './shop-rows';

describe('untradedHeld', () => {
  it('lists held goods the shop does not trade, in goods order', () => {
    expect(untradedHeld('granary', { relics: 2, salt: 0 })).toEqual([['relics', 2]]);
  });

  it('lists nothing for goods the shop trades', () => {
    const traded = shopDef('bowl').goods[0];
    expect(untradedHeld('bowl', { [traded]: 3 })).toEqual([]);
  });
});
