import { describe, expect, it } from 'vitest';
import { stretchCrossesBox, type PosedBox } from './mapgen';
import type { Vec } from './vec';

function boxLocal(box: PosedBox, p: Vec): Vec {
  const dx = p.x - box.center.x;
  const dy = p.y - box.center.y;
  return { x: dx * box.axis.x + dy * box.axis.y, y: dy * box.axis.x - dx * box.axis.y };
}

function referenceStretch(box: PosedBox, a: Vec, b: Vec, t0: number, t1: number): boolean {
  const p = boxLocal(box, a);
  const q = boxLocal(box, b);
  for (const [from, to, half] of [[p.x, q.x, box.half.x], [p.y, q.y, box.half.y]]) {
    const d = to - from;
    if (d === 0) {
      if (Math.abs(from) > half) return false;
      continue;
    }
    const ta = (-half - from) / d;
    const tb = (half - from) / d;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  return t0 <= t1;
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomBox(next: () => number, turned: boolean): PosedBox {
  const yaw = turned ? next() * Math.PI * 2 : 0;
  return {
    center: { x: next() * 10, y: next() * 10 },
    axis: { x: Math.cos(yaw), y: Math.sin(yaw) },
    half: { x: 0.25 + next() * 2, y: 0.25 + next() * 2 },
    z0: 0,
    z1: 1,
  };
}

function randomPoint(next: () => number): Vec {
  return { x: next() * 14 - 2, y: next() * 14 - 2 };
}

describe('stretchCrossesBox', () => {
  it('matches the reference on random turned boxes and random segments', () => {
    const next = lcg(7);
    for (let i = 0; i < 4000; i++) {
      const box = randomBox(next, true);
      const a = randomPoint(next);
      const b = randomPoint(next);
      const t0 = next() < 0.5 ? 0 : next() * 0.5;
      const t1 = next() < 0.5 ? 1 : 0.5 + next() * 0.5;
      expect(stretchCrossesBox(box, a, b, t0, t1)).toBe(referenceStretch(box, a, b, t0, t1));
    }
  });

  it('matches the reference when a segment runs along a box axis', () => {
    const next = lcg(11);
    for (let i = 0; i < 2000; i++) {
      const box = randomBox(next, false);
      const a = randomPoint(next);
      const sideways = next() < 0.5;
      const b = sideways ? { x: randomPoint(next).x, y: a.y } : { x: a.x, y: randomPoint(next).y };
      expect(stretchCrossesBox(box, a, b, 0, 1)).toBe(referenceStretch(box, a, b, 0, 1));
    }
  });

  it('matches the reference when a segment starts on a box edge or corner', () => {
    const next = lcg(13);
    for (let i = 0; i < 2000; i++) {
      const box = randomBox(next, false);
      const sx = next() < 0.5 ? -1 : 1;
      const sy = next() < 0.5 ? -1 : 1;
      const edge = { x: box.center.x + sx * box.half.x, y: box.center.y + (next() < 0.5 ? sy * box.half.y : 0) };
      const b = randomPoint(next);
      expect(stretchCrossesBox(box, edge, b, 0, 1)).toBe(referenceStretch(box, edge, b, 0, 1));
      expect(stretchCrossesBox(box, b, edge, 0, 1)).toBe(referenceStretch(box, b, edge, 0, 1));
    }
  });

  it('matches the reference for a point segment', () => {
    const next = lcg(17);
    for (let i = 0; i < 500; i++) {
      const box = randomBox(next, true);
      const a = randomPoint(next);
      expect(stretchCrossesBox(box, a, a, 0, 1)).toBe(referenceStretch(box, a, a, 0, 1));
    }
  });
});
