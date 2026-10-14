import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../types';
import { bestTruck, keepsPace, pickTarget, underFire } from './escort-tactics';

const hauler = { x: 100, y: 100 };

describe('pickTarget', () => {
  it('picks the foe nearest the hauler', () => {
    const foes = [{ id: 'a', pos: { x: 120, y: 100 } }, { id: 'b', pos: { x: 105, y: 100 } }];
    expect(pickTarget(foes, hauler, null)).toBe('b');
  });

  it('keeps the current target while it lives and stays in reach', () => {
    const foes = [{ id: 'a', pos: { x: 120, y: 100 } }, { id: 'b', pos: { x: 105, y: 100 } }];
    expect(pickTarget(foes, hauler, 'a')).toBe('a');
  });

  it('drops a current target out of reach or gone', () => {
    const foes = [{ id: 'a', pos: { x: 300, y: 100 } }, { id: 'b', pos: { x: 105, y: 100 } }];
    expect(pickTarget(foes, hauler, 'a')).toBe('b');
    expect(pickTarget(foes, hauler, 'gone')).toBe('b');
  });

  it('picks nothing when no foe is in reach', () => {
    expect(pickTarget([{ id: 'a', pos: { x: 500, y: 0 } }], hauler, null)).toBeNull();
  });
});

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

describe('underFire', () => {
  const shot = (shooter: string, target: string) => ({ t: 'shot', shooter, target }) as unknown as GameEvent;

  it('is true when a truck shot the player truck last turn, seen or not', () => {
    expect(underFire([shot('foe', 'me')], 'me')).toBe(true);
  });

  it('is false for shots at other trucks and for no shots', () => {
    expect(underFire([shot('foe', 'hauler')], 'me')).toBe(false);
    expect(underFire([], 'me')).toBe(false);
  });
});
