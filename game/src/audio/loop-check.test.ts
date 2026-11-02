import { describe, expect, it } from 'vitest';
import { alignedLoopEnd, describeFaults, loopFaults } from './loop-check';

const RATE = 48000;
const PERIOD = 0.0435;

function noise(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 0.02;
}

function pulses(seconds: number, shift = 0, period = PERIOD): Float32Array {
  const rand = noise(7);
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const phase = (((i / RATE + shift) % period) + period) % period;
    out[i] = Math.exp(-phase * 120) * Math.sin(2 * Math.PI * 140 * phase) * 0.5 + rand();
  }
  return out;
}

function scaled(samples: Float32Array, from: number, to: number, gain: number) {
  const out = Float32Array.from(samples);
  for (let i = Math.round(from * RATE); i < Math.round(to * RATE); i++) out[i] *= gain;
  return out;
}

describe('loopFaults', () => {
  it('passes a steady pulse train', () => {
    expect(loopFaults(pulses(3), RATE)).toEqual([]);
  });

  it('flags a level hole at its time', () => {
    const faults = loopFaults(scaled(pulses(4), 3.4, 3.85, 10 ** (-5 / 20)), RATE);
    expect(faults).toHaveLength(1);
    expect(faults[0].kind).toBe('hole');
    expect(faults[0].atSeconds).toBeGreaterThan(3.2);
    expect(faults[0].atSeconds).toBeLessThan(3.9);
    expect(faults[0].amount).toBeLessThan(-3);
  });

  it('flags a crossfade into a half-period shifted copy', () => {
    const base = pulses(3);
    const shifted = pulses(3, PERIOD / 2);
    const out = Float32Array.from(base);
    const from = out.length - Math.round(0.25 * RATE);
    for (let i = from; i < out.length; i++) {
      const w = (i - from) / (out.length - from);
      out[i] = base[i] * (1 - w) + shifted[i] * w;
    }
    const faults = loopFaults(out, RATE);
    expect(faults.some((f) => f.kind === 'flam' && f.atSeconds > 2.6)).toBe(true);
  });

  it('passes a loop whose end runs on into its start', () => {
    expect(loopFaults(pulses(PERIOD * 69), RATE).filter((f) => f.kind === 'click')).toEqual([]);
  });

  it('flags a step where the loop wraps around', () => {
    const out = pulses(PERIOD * 69);
    for (let i = 0; i < out.length; i++) out[i] += (0.05 * i) / out.length;
    const faults = loopFaults(out, RATE);
    expect(faults.map((f) => f.kind)).toEqual(['click']);
    expect(faults[0].amount).toBeGreaterThan(1);
  });

  it('throws on a loop shorter than one window', () => {
    expect(() => loopFaults(new Float32Array(100), RATE)).toThrow();
    expect(() => loopFaults(new Float32Array(0), RATE)).toThrow();
  });
});

describe('alignedLoopEnd', () => {
  it('makes the looped length a whole number of periods', () => {
    const samples = pulses(4);
    const start = Math.round(0.5 * RATE);
    const end = alignedLoopEnd(samples, RATE, start, Math.round(3.3 * RATE) + 500);
    const periods = (end - start) / RATE / PERIOD - 0.1 / PERIOD;
    expect(Math.abs(periods - Math.round(periods)) * PERIOD * RATE).toBeLessThan(RATE / 1000 * 1.5);
  });

  it('throws when the search leaves the buffer', () => {
    expect(() => alignedLoopEnd(pulses(1), RATE, 100, 60000)).toThrow();
  });
});

describe('describeFaults', () => {
  it('names the file, the fault, the time and the amount', () => {
    expect(describeFaults('engine-1.ogg', [{ kind: 'hole', atSeconds: 3.4, amount: -4.9 }])).toBe('engine-1.ogg: hole -4.9 dB at 3.40 s');
  });
});
