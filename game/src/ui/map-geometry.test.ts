import { describe, expect, it } from 'vitest';
import { discFrame, pinToRim, toPx, toTile, wholeFrame } from './map-geometry';

const NW = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

describe('map geometry', () => {
  it('puts the centre in the middle and north-west up', () => {
    const f = discFrame({ x: 100, y: 100 }, NW, 50, 90);
    expect(toPx(f, { x: 100, y: 100 })).toEqual({ x: 90, y: 90 });
    const up = toPx(f, { x: 80, y: 80 });
    expect(up.x).toBeCloseTo(90);
    expect(up.y).toBeLessThan(90);
    const right = toPx(f, { x: 120, y: 80 });
    expect(right.x).toBeGreaterThan(90);
    expect(right.y).toBeCloseTo(90);
  });

  it('inverts the transform when picking', () => {
    const f = wholeFrame(600, NW, 180);
    const at = toPx(f, { x: 123, y: 456 });
    const back = toTile(f, at.x, at.y);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });

  it('fits the whole region as a diamond inside the frame', () => {
    const f = wholeFrame(600, NW, 180);
    for (const corner of [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 0, y: 600 }, { x: 600, y: 600 }]) {
      const at = toPx(f, corner);
      expect(at.x).toBeGreaterThanOrEqual(-0.001);
      expect(at.x).toBeLessThanOrEqual(360.001);
      expect(at.y).toBeGreaterThanOrEqual(-0.001);
      expect(at.y).toBeLessThanOrEqual(360.001);
    }
  });

  it('pins a far site on the rim in its direction', () => {
    const f = discFrame({ x: 100, y: 100 }, NW, 50, 90);
    const far = { x: 100 + 400, y: 100 - 400 };
    const pinned = pinToRim(f, far);
    expect(pinned.pinned).toBe(true);
    expect(Math.hypot(pinned.x - 90, pinned.y - 90)).toBeCloseTo(84);
    const direct = toPx(f, far);
    expect(Math.sign(pinned.x - 90)).toBe(Math.sign(direct.x - 90));
    expect(Math.sign(pinned.y - 90)).toBe(Math.sign(direct.y - 90));
    expect(pinToRim(f, { x: 110, y: 100 }).pinned).toBe(false);
  });
});
