import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import { fakeGpu } from '../../test/fake-gpu';
import { PixelReadback, READBACK_MATCH, probePattern, readbackMatches } from './pixelReadback';

const RENDERER = {} as THREE.WebGLRenderer;

function noise(length: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = 12345;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe('readbackMatches', () => {
  it('is 1 for the same bytes', () => {
    const drawn = probePattern(8);
    expect(readbackMatches(drawn, drawn.slice())).toBe(1);
  });

  it('is far below the threshold for noise', () => {
    const drawn = probePattern(8);
    expect(readbackMatches(drawn, noise(drawn.length))).toBeLessThan(READBACK_MATCH);
  });

  it('stays honest when one pixel in a hundred changes', () => {
    const drawn = probePattern(16);
    const read = drawn.slice();
    read[0] ^= 0xff;
    read[1] ^= 0xff;
    read[2] ^= 0xff;
    expect(readbackMatches(drawn, read)).toBeGreaterThanOrEqual(READBACK_MATCH);
  });

  it('rejects arrays of different length', () => {
    expect(() => readbackMatches(new Uint8Array(4), new Uint8Array(8))).toThrow();
  });
});

describe('probePattern', () => {
  it('holds four flat colors, all opaque', () => {
    const pattern = probePattern(8);
    const colors = new Set<string>();
    for (let i = 0; i < pattern.length; i += 4) {
      expect(pattern[i + 3]).toBe(255);
      colors.add(`${pattern[i]},${pattern[i + 1]},${pattern[i + 2]}`);
    }
    expect(colors.size).toBe(4);
  });
});

describe('PixelReadback', () => {
  it('says false while the context is lost and decides nothing', () => {
    const gpu = fakeGpu();
    const web = vi.fn((_renderer: THREE.WebGLRenderer) => true);
    const readback = new PixelReadback(RENDERER, gpu, web, () => true);
    gpu.blackout();
    expect(readback.honest()).toBe(false);
    expect(web).not.toHaveBeenCalled();
    gpu.recover();
    expect(readback.honest()).toBe(true);
  });

  it('keeps its verdict for the session', () => {
    const web = vi.fn((_renderer: THREE.WebGLRenderer) => true);
    const readback = new PixelReadback(RENDERER, fakeGpu(), web, () => true);
    readback.honest();
    readback.honest();
    expect(web).toHaveBeenCalledTimes(1);
  });

  it('refuses when either check fails and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readback = new PixelReadback(RENDERER, fakeGpu(), () => false, () => true);
    expect(readback.honest()).toBe(false);
    expect(readback.honest()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('refuses when only the 2D check fails', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(new PixelReadback(RENDERER, fakeGpu(), () => true, () => false).honest()).toBe(false);
  });

  it('does not warn for an honest browser', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new PixelReadback(RENDERER, fakeGpu(), () => true, () => true).honest();
    expect(warn).not.toHaveBeenCalled();
  });
});
