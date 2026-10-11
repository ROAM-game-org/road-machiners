import { describe, expect, it } from 'vitest';
import { HIGHWAY } from '../data/modes';
import { highwayLine } from '../sim/highway';
import { paintHighwayWear, PATCH_UNIT } from './highwayWear';

const RES = 4;
const FROM = -8;
const SIZE = (HIGHWAY.size + 16) * RES;
const field = { size: SIZE, res: RES, from: FROM };
const line = highwayLine(4, 1);
const wear = paintHighwayWear(field, line, 4);
const HALF = HIGHWAY.road.asphalt + HIGHWAY.road.paint.bandSpread;

function pixels(): { i: number; x: number; y: number }[] {
  const out: { i: number; x: number; y: number }[] = [];
  for (let i = 0; i < wear.length; i += 4) if (wear[i + 2] < 255) out.push({ i, x: FROM + ((i / 4) % SIZE + 0.5) / RES, y: FROM + (Math.floor(i / 4 / SIZE) + 0.5) / RES });
  return out;
}

const written = pixels();
const nearLine = (x: number, y: number) => Math.min(...line.map((p) => Math.hypot(p.x - x, p.y - y)));

describe('highway wear', () => {
  it('paints the same bytes for the same seed and other bytes for another seed', () => {
    expect(Buffer.compare(paintHighwayWear(field, line, 4), wear)).toBe(0);
    expect(Buffer.compare(paintHighwayWear(field, line, 5), wear)).not.toBe(0);
  });

  it('writes only inside the painted band', () => {
    expect(written.length).toBeGreaterThan(1000);
    for (const p of written.filter((_, k) => k % 97 === 0)) expect(nearLine(p.x, p.y)).toBeLessThanOrEqual(HALF + 2);
  });

  it('draws faded lane marks, sand over the edge and patches or cracks', () => {
    const marks = written.filter((p) => wear[p.i] > 0).length;
    const sand = written.filter((p) => wear[p.i + 1] > 0).length;
    const patched = written.filter((p) => wear[p.i + 3] >= PATCH_UNIT).length;
    expect(marks).toBeGreaterThan(0);
    expect(marks).toBeLessThan(written.length * 0.2);
    expect(sand).toBeGreaterThan(0);
    expect(sand).toBeLessThan(written.length * 0.6);
    expect(patched).toBeGreaterThan(0);
  });

  it('paints the yellow double line only at the center and white lines elsewhere', () => {
    const yellow = written.filter((p) => (wear[p.i] & 15) > 0);
    const white = written.filter((p) => wear[p.i] >> 4 > 0);
    expect(yellow.length).toBeGreaterThan(0);
    expect(white.length).toBeGreaterThan(0);
    expect(Math.max(...yellow.map((p) => Math.abs(wear[p.i + 2] / 254 * HALF)))).toBeLessThan(1);
    expect(Math.min(...white.map((p) => Math.abs(wear[p.i + 2] / 254 * HALF)))).toBeGreaterThan(1.5);
  });
});
