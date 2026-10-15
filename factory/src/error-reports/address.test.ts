import { describe, expect, it } from 'vitest';
import { limitKeyOf } from './address';
import { Rejected } from './report';

describe('limitKeyOf', () => {
  it('keeps an IPv4 address as itself', () => {
    expect(limitKeyOf('1.2.3.4')).toBe('1.2.3.4');
  });

  it('counts an IPv4-mapped IPv6 address as its IPv4 address', () => {
    expect(limitKeyOf('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(limitKeyOf('::ffff:0102:0304')).toBe('1.2.3.4');
  });

  it('shares one key across a /64', () => {
    expect(limitKeyOf('2001:db8:0:0:1::1')).toBe(limitKeyOf('2001:db8::2'));
    expect(limitKeyOf('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(limitKeyOf('2001:0DB8:0000:0000:ffff:ffff:ffff:ffff')).toBe(limitKeyOf('2001:db8::1'));
  });

  it('gives different /64 prefixes different keys', () => {
    expect(limitKeyOf('2001:db8:0:1::1')).not.toBe(limitKeyOf('2001:db8:0:2::1'));
    expect(limitKeyOf('2001:db8:1::1')).not.toBe(limitKeyOf('2001:db8::1'));
  });

  it('expands the loopback and the unspecified forms', () => {
    expect(limitKeyOf('::1')).toBe('0:0:0:0::/64');
    expect(limitKeyOf('::')).toBe('0:0:0:0::/64');
  });

  it('ignores a zone id', () => {
    expect(limitKeyOf('fe80::1%eth0')).toBe(limitKeyOf('fe80::2'));
  });

  it('rejects an address that is neither IPv4 nor IPv6', () => {
    for (const bad of ['unknown', '1.2.3', '2001:db8::g', '1.2.3.4:80', 'x'.repeat(40)]) {
      expect(() => limitKeyOf(bad)).toThrow(Rejected);
    }
  });
});
