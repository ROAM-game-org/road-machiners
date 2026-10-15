import type { Vec } from '../sim/vec';

export type MapFrame = { center: Vec; up: Vec; scale: number; half: number };
export type MapPoint = { x: number; y: number; pinned: boolean };

const RIM_INSET = 6;

function rightOf(up: Vec): Vec {
  return { x: -up.y, y: up.x };
}

export function discFrame(center: Vec, up: Vec, reach: number, half: number): MapFrame {
  return { center, up, scale: half / reach, half };
}

export function wholeFrame(size: number, up: Vec, half: number): MapFrame {
  return { center: { x: size / 2, y: size / 2 }, up, scale: (2 * half) / (size * Math.SQRT2), half };
}

export function toPx(f: MapFrame, p: Vec): { x: number; y: number } {
  const right = rightOf(f.up);
  const dx = p.x - f.center.x;
  const dy = p.y - f.center.y;
  return {
    x: f.half + f.scale * (dx * right.x + dy * right.y),
    y: f.half - f.scale * (dx * f.up.x + dy * f.up.y),
  };
}

export function toTile(f: MapFrame, px: number, py: number): Vec {
  const right = rightOf(f.up);
  const u = (px - f.half) / f.scale;
  const v = (f.half - py) / f.scale;
  return { x: f.center.x + u * right.x + v * f.up.x, y: f.center.y + u * right.y + v * f.up.y };
}

export function pinToRim(f: MapFrame, p: Vec): MapPoint {
  const at = toPx(f, p);
  const dx = at.x - f.half;
  const dy = at.y - f.half;
  const radius = f.half - RIM_INSET;
  const gap = Math.hypot(dx, dy);
  if (gap <= radius) return { ...at, pinned: false };
  return { x: f.half + (dx / gap) * radius, y: f.half + (dy / gap) * radius, pinned: true };
}

export function canvasTransform(f: MapFrame): [number, number, number, number, number, number] {
  const right = rightOf(f.up);
  return [
    f.scale * right.x,
    -f.scale * f.up.x,
    f.scale * right.y,
    -f.scale * f.up.y,
    f.half - f.scale * (f.center.x * right.x + f.center.y * right.y),
    f.half + f.scale * (f.center.x * f.up.x + f.center.y * f.up.y),
  ];
}
