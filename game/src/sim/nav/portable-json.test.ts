import { describe, expect, it } from 'vitest';
import { portableJson } from './layer';

describe('portableJson', () => {
  it('gives V8 and Firefox floats that differ in the last bit the same text', () => {
    expect(portableJson(153.1012736720371)).toBe(portableJson(153.10127367203708));
    expect(portableJson(0.7071067811865475)).toBe(portableJson(0.7071067811865476));
  });

  it('keeps a change of a millionth or more', () => {
    expect(portableJson(153.1012)).not.toBe(portableJson(153.1022));
    expect(portableJson(0.5)).not.toBe(portableJson(0.500001));
  });

  it('rounds numbers inside nested objects and arrays', () => {
    expect(portableJson({ a: [0.7071067811865476, { b: 153.10127367203708 }] })).toBe(portableJson({ a: [0.7071067811865475, { b: 153.1012736720371 }] }));
    expect(portableJson({ a: [1.0000004, { b: -2.0000006 }] })).toBe('{"a":[1,{"b":-2.000001}]}');
  });

  it('passes strings, booleans and null through', () => {
    expect(portableJson({ s: '0.12345678', t: true, n: null })).toBe('{"s":"0.12345678","t":true,"n":null}');
  });
});
