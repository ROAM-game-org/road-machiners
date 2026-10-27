import { DESCENT_PATH } from '../data/terrain';
import { clamp, dist, type Vec } from '../sim/vec';

export type PathFrame = { along: number; across: number; dir: Vec };

const CUMULATIVE = DESCENT_PATH.reduce<number[]>((sums, p, k) => [...sums, k === 0 ? 0 : sums[k - 1] + dist(DESCENT_PATH[k - 1], p)], []);

export const DESCENT_LENGTH = CUMULATIVE[CUMULATIVE.length - 1];

export type TileBox = { x0: number; x1: number; y0: number; y1: number };

export function descentBox(upTo: number, reach: number, size: number): TileBox {
  const points = DESCENT_PATH.filter((_, k) => k === 0 || CUMULATIVE[k - 1] < upTo);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const clampTo = (v: number): number => clamp(v, 0, size);
  return { x0: clampTo(Math.floor(Math.min(...xs) - reach)), x1: clampTo(Math.ceil(Math.max(...xs) + reach)), y0: clampTo(Math.floor(Math.min(...ys) - reach)), y1: clampTo(Math.ceil(Math.max(...ys) + reach)) };
}

export function descentFrame(p: Vec): PathFrame {
  let best = { gap: Infinity, frame: segmentFrame(p, 0).frame };
  for (let k = 0; k + 1 < DESCENT_PATH.length; k++) {
    const found = segmentFrame(p, k);
    if (found.gap < best.gap) best = found;
  }
  return best.frame;
}

function segmentFrame(p: Vec, k: number): { gap: number; frame: PathFrame } {
  const a = DESCENT_PATH[k];
  const b = DESCENT_PATH[k + 1];
  const length = dist(a, b);
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const t = (p.x - a.x) * dir.x + (p.y - a.y) * dir.y;
  const foot = clamp(t, 0, length);
  const across = (p.x - a.x) * dir.y - (p.y - a.y) * dir.x;
  return { gap: dist(p, { x: a.x + dir.x * foot, y: a.y + dir.y * foot }), frame: { along: CUMULATIVE[k] + t, across, dir } };
}
