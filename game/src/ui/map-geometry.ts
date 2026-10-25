import { MAP_SCALE_BAR, WORLD_MAP } from '../data/minimap';
import { PHYSICS } from '../data/physics';
import { VIEW } from '../data/view';
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

const UP_LENGTH = Math.hypot(VIEW.screenUp.x, VIEW.screenUp.y);
const UP: Vec = { x: VIEW.screenUp.x / UP_LENGTH, y: VIEW.screenUp.y / UP_LENGTH };
const RIGHT: Vec = { x: -UP.y, y: UP.x };
const TURNED_EXTENT = Math.abs(UP.x) + Math.abs(UP.y);

const along = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

export function fitTileSize(size: number, width: number, height: number): number {
  return requireTileSize(Math.min(width, height) / (size * TURNED_EXTENT));
}

export function fitted(size: number, width: number, height: number, center: Vec): Viewport {
  return clampPan(viewport(center, fitTileSize(size, width, height), width, height), size);
}

export function toPx(v: Viewport, p: Vec): { x: number; y: number } {
  const offset = { x: p.x - v.center.x, y: p.y - v.center.y };
  return { x: v.width / 2 + along(offset, RIGHT) * v.tileSize, y: v.height / 2 - along(offset, UP) * v.tileSize };
}

function tileAt(center: Vec, right: number, up: number): Vec {
  return { x: center.x + RIGHT.x * right + UP.x * up, y: center.y + RIGHT.y * right + UP.y * up };
}

export function toTile(v: Viewport, px: number, py: number): Vec {
  return tileAt(v.center, (px - v.width / 2) / v.tileSize, -(py - v.height / 2) / v.tileSize);
}

function holdsWhole(span: number, tileSize: number, size: number): boolean {
  return span / tileSize >= size * TURNED_EXTENT;
}

function clampTile(value: number, size: number): number {
  return Math.min(size, Math.max(0, value));
}

export function clampPan(v: Viewport, size: number): Viewport {
  const middle = { x: size / 2, y: size / 2 };
  const offset = { x: v.center.x - middle.x, y: v.center.y - middle.y };
  const right = holdsWhole(v.width, v.tileSize, size) ? 0 : along(offset, RIGHT);
  const up = holdsWhole(v.height, v.tileSize, size) ? 0 : along(offset, UP);
  const at = tileAt(middle, right, up);
  return { ...v, center: { x: clampTile(at.x, size), y: clampTile(at.y, size) } };
}

export function zoomAround(v: Viewport, factor: number, px: number, py: number, size: number, maxTileSize: number): Viewport {
  const least = fitTileSize(size, v.width, v.height);
  const tileSize = requireTileSize(Math.min(maxTileSize, Math.max(least, v.tileSize * factor)));
  const held = toTile(v, px, py);
  const center = tileAt(held, -(px - v.width / 2) / tileSize, (py - v.height / 2) / tileSize);
  return clampPan({ ...v, center, tileSize }, size);
}

export function panBy(v: Viewport, dx: number, dy: number, size: number): Viewport {
  return clampPan({ ...v, center: tileAt(v.center, -dx / v.tileSize, dy / v.tileSize) }, size);
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
  const k = v.tileSize;
  return [RIGHT.x * k, -UP.x * k, RIGHT.y * k, -UP.y * k, v.width / 2 - along(v.center, RIGHT) * k, v.height / 2 + along(v.center, UP) * k];
}

export function scaleBarTiles(tileSize: number, width: number): number {
  requireTileSize(tileSize);
  if (!Number.isFinite(width) || width <= 0) throw new Error(`Map width ${width} is not a positive number`);
  const steps = MAP_SCALE_BAR.meters.map((meters) => meters / PHYSICS.metersPerTile);
  const fitting = steps.filter((tiles) => tiles * tileSize <= MAP_SCALE_BAR.widthShare * width);
  return fitting.length > 0 ? fitting[fitting.length - 1] : steps[0];
}

const WHEEL_UNIT_PIXELS = [1, WORLD_MAP.wheelLinePixels, WORLD_MAP.wheelPagePixels];

export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const unit = WHEEL_UNIT_PIXELS[deltaMode];
  if (!Number.isFinite(deltaY) || unit === undefined) throw new Error(`Wheel delta ${deltaY} in mode ${deltaMode} is not usable`);
  const pixels = Math.max(-WORLD_MAP.wheelNotch, Math.min(WORLD_MAP.wheelNotch, deltaY * unit));
  return WORLD_MAP.wheelNotchStep ** (-pixels / WORLD_MAP.wheelNotch);
}
