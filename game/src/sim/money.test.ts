import { describe, expect, it } from 'vitest';
import { chargeM, fairM, payoutM, requireWholeM } from './money';

describe('money rounding', () => {
  it('ignores float noise', () => {
    expect(chargeM(33.33 + 66.67)).toBe(100);
    expect(chargeM(1.67 * 3 - 0.01)).toBe(5);
    expect(payoutM(0.1 + 0.2 + 0.7)).toBe(1);
  });

  it('charges up and pays out down', () => {
    expect(chargeM(1.67)).toBe(2);
    expect(chargeM(5)).toBe(5);
    expect(payoutM(6.33)).toBe(6);
    expect(payoutM(0.99)).toBe(0);
    expect(fairM(6.5)).toBe(7);
    expect(fairM(6.4)).toBe(6);
  });

  it('rounds negative amounts toward their own side', () => {
    expect(chargeM(-1.5)).toBe(-1);
    expect(payoutM(-1.5)).toBe(-2);
    expect(fairM(-6.5)).toBe(-7);
    expect(chargeM(-0.2)).toBe(0);
    expect(Object.is(chargeM(-0.2), 0)).toBe(true);
  });

  it('throws on a non-finite amount', () => {
    expect(() => chargeM(NaN)).toThrow();
    expect(() => payoutM(Infinity)).toThrow();
    expect(() => fairM(NaN)).toThrow();
  });

  it('requires a whole amount', () => {
    expect(() => requireWholeM(3, 'test')).not.toThrow();
    expect(() => requireWholeM(2.5, 'test')).toThrow(/test/);
    expect(() => requireWholeM(NaN, 'test')).toThrow();
  });
});
