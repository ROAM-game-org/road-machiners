import { dist, lerp, type Vec } from '../sim/vec';

export function along(points: readonly Vec[], step: number): Vec[] {
  const out: Vec[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const n = Math.max(1, Math.ceil(dist(points[i - 1], points[i]) / step));
    for (let k = 1; k <= n; k++) out.push({ x: lerp(points[i - 1].x, points[i].x, k / n), y: lerp(points[i - 1].y, points[i].y, k / n) });
  }
  return out;
}
