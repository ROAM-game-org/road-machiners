import { WORLD_MAP } from '../data/minimap';
import type { Vec } from '../sim/vec';

export type Viewport = { center: Vec; tileSize: number; width: number; height: number };
export type MapPoint = { x: number; y: number; pinned: boolean };

function requireTileSize(tileSize: number): number {
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new Error(`Map tile size ${tileSize} is not a positive number`);
  return tileSize;
}

export function viewport(center: Vec, tileSize: number, width: number, height: number): Viewport {
  return { center, tileSize: requireTileSize(tileSize), width, height };
}

export function fitTileSize(size: number, width: number, height: number): number {
  return requireTileSize(Math.min(width, height) / size);
}

export function fitted(size: number, width: number, height: number, center: Vec): Viewport {
  return clampPan(viewport(center, fitTileSize(size, width, height), width, height), size);
}

export function toPx(v: Viewport, p: Vec): { x: number; y: number } {
  return { x: v.width / 2 + (p.x - v.center.x) * v.tileSize, y: v.height / 2 + (p.y - v.center.y) * v.tileSize };
}

export function toTile(v: Viewport, px: number, py: number): Vec {
  return { x: v.center.x + (px - v.width / 2) / v.tileSize, y: v.center.y + (py - v.height / 2) / v.tileSize };
}

function clampAxis(center: number, span: number, tileSize: number, size: number): number {
  const half = span / 2 / tileSize;
  if (2 * half >= size) return size / 2;
  return Math.min(size - half, Math.max(half, center));
}

export function clampPan(v: Viewport, size: number): Viewport {
  return {
    ...v,
    center: { x: clampAxis(v.center.x, v.width, v.tileSize, size), y: clampAxis(v.center.y, v.height, v.tileSize, size) },
  };
}

export function zoomAround(v: Viewport, factor: number, px: number, py: number, size: number, maxTileSize: number): Viewport {
  const least = fitTileSize(size, v.width, v.height);
  const tileSize = requireTileSize(Math.min(maxTileSize, Math.max(least, v.tileSize * factor)));
  const held = toTile(v, px, py);
  const center = { x: held.x - (px - v.width / 2) / tileSize, y: held.y - (py - v.height / 2) / tileSize };
  return clampPan({ ...v, center, tileSize }, size);
}

export function panBy(v: Viewport, dx: number, dy: number, size: number): Viewport {
  return clampPan({ ...v, center: { x: v.center.x - dx / v.tileSize, y: v.center.y - dy / v.tileSize } }, size);
}

export function pinToEdge(v: Viewport, p: Vec, inset: number): MapPoint {
  const at = toPx(v, p);
  const dx = at.x - v.width / 2;
  const dy = at.y - v.height / 2;
  const reachX = v.width / 2 - inset;
  const reachY = v.height / 2 - inset;
  const over = Math.max(Math.abs(dx) / reachX, Math.abs(dy) / reachY);
  if (over <= 1) return { ...at, pinned: false };
  return { x: v.width / 2 + dx / over, y: v.height / 2 + dy / over, pinned: true };
}

export function canvasTransform(v: Viewport): [number, number, number, number, number, number] {
  return [v.tileSize, 0, 0, v.tileSize, v.width / 2 - v.center.x * v.tileSize, v.height / 2 - v.center.y * v.tileSize];
}

const WHEEL_UNIT_PIXELS = [1, WORLD_MAP.wheelLinePixels, WORLD_MAP.wheelPagePixels];

export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const unit = WHEEL_UNIT_PIXELS[deltaMode];
  if (!Number.isFinite(deltaY) || unit === undefined) throw new Error(`Wheel delta ${deltaY} in mode ${deltaMode} is not usable`);
  const pixels = Math.max(-WORLD_MAP.wheelNotch, Math.min(WORLD_MAP.wheelNotch, deltaY * unit));
  return WORLD_MAP.wheelNotchStep ** (-pixels / WORLD_MAP.wheelNotch);
}
