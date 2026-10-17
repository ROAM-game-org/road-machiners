import { REGION } from '../data/region';
import { START_KITS, type Opening } from '../data/start';
import { dist, type Vec } from './vec';

export const OPENING_WRECK_RADIUS = 0.7;

export function startPose(): { pos: Vec; heading: number } {
  const { road, distance, offset } = REGION.playerStart;
  const points = REGION.roads[road];
  let left = distance;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = dist(a, b);
    if (left > length) {
      left -= length;
      continue;
    }
    const along = Math.atan2(b.y - a.y, b.x - a.x);
    const t = left / length;
    return {
      pos: { x: a.x + (b.x - a.x) * t - Math.sin(along) * offset, y: a.y + (b.y - a.y) * t + Math.cos(along) * offset },
      heading: along - Math.PI / 2,
    };
  }
  throw new Error(`Player start lies ${distance} tiles along road ${road}, past its end`);
}

export function openingWreckSpot(opening: Opening, start: { pos: Vec; heading: number }): Vec {
  const { ahead, side } = opening.wreck;
  const cos = Math.cos(start.heading);
  const sin = Math.sin(start.heading);
  return { x: start.pos.x + cos * ahead - sin * side, y: start.pos.y + sin * ahead + cos * side };
}

export function reservedGround(): { pos: Vec; r: number }[] {
  return Object.values(START_KITS).flatMap((kit) => {
    const start = kit.intro?.pose ?? startPose();
    const wreck = kit.opening ? [{ pos: openingWreckSpot(kit.opening, start), r: OPENING_WRECK_RADIUS }] : [];
    return [...wreck, ...(kit.intro?.farm ?? []).map((p) => ({ pos: p.pos, r: p.r }))];
  });
}
