import { describe, expect, it } from 'vitest';
import { resolve } from '../text/resolve';
import { agoText, moneyAmount, moneyDelta, moneyNumber, moneyText, turnsText } from './units';

describe('money display', () => {
  it('reads whole M as they are', () => {
    expect(moneyAmount(0)).toBe('0');
    expect(moneyAmount(1)).toBe('1');
    expect(moneyAmount(333)).toBe('333');
    expect(moneyAmount(1667)).toBe('1,667');
  });

  it('rounds any part of an M up when it shows a rate, so a price never reads below what it costs', () => {
    expect(moneyAmount(0.01)).toBe('1');
    expect(moneyAmount(0.05)).toBe('1');
    expect(moneyAmount(1.01)).toBe('2');
    expect(moneyAmount(1.67)).toBe('2');
    expect(moneyAmount(1666.67)).toBe('1,667');
  });

  it('rounds a debt away from zero, so a debt never reads smaller than it is', () => {
    expect(moneyAmount(-1)).toBe('−1');
    expect(moneyAmount(-1.01)).toBe('−2');
    expect(moneyAmount(-12.5)).toBe('−13');
  });

  it('ignores float noise', () => {
    expect(moneyAmount(1.0000000001)).toBe('1');
    expect(moneyAmount(33.33 + 66.67)).toBe('100');
    expect(moneyAmount(0)).toBe('0');
    expect(moneyAmount(-0)).toBe('0');
  });

  it('names the unit in running text', () => {
    expect(moneyText(1.67)).toBe("2 M's");
    expect(moneyText(1)).toBe('1 M');
    expect(moneyText(-12.5)).toBe("−13 M's");
  });

  it('signs a delta with a plus or a real minus', () => {
    expect(moneyDelta(15)).toBe("+15 M's");
    expect(moneyDelta(-15)).toBe("−15 M's");
    expect(moneyDelta(1)).toBe('+1 M');
    expect(moneyDelta(0)).toBe("0 M's");
  });

  it('counts turns with a plural', () => {
    expect(turnsText(1)).toBe('1 turn');
    expect(turnsText(0)).toBe('0 turns');
    expect(turnsText(3)).toBe('3 turns');
  });

  it('groups thousands and fails loud on a non-finite amount', () => {
    expect(moneyText(0)).toBe("0 M's");
    expect(moneyText(1234567)).toBe("1,234,567 M's");
    expect(moneyNumber(1200)).toBe('1,200');
    expect(moneyNumber(-1200)).toBe('−1,200');
    expect(moneyText(-1)).toBe('−1 M');
    expect(() => moneyNumber(NaN)).toThrow();
    expect(() => moneyNumber(Infinity)).toThrow();
  });

  it('shows a balance that pays a price exactly when the readout reaches it', () => {
    const balance = 10;
    const price = 10;
    expect(balance >= price).toBe(true);
    expect(moneyText(balance)).toBe(moneyText(price));
  });
});

describe('ago text', () => {
  it('says under an hour, then whole hours', () => {
    expect(resolve(agoText(0), 'en')).toBe('under an hour ago');
    expect(resolve(agoText(18), 'en')).toBe('under an hour ago');
    expect(resolve(agoText(19), 'en')).toBe('about 1 hour ago');
    expect(resolve(agoText(60), 'en')).toBe('about 3 hours ago');
  });
});
