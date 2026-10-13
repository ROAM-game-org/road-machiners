
import { RULES } from '../data/rules';
import type { Opening, StartKit } from '../data/start';
import { makePart } from './factory';
import { mountedParts } from './grid';
import { emptyHidden } from './salvage';
import type { Obstacle, SalvageStock, Vehicle, World } from './types';
import type { Vec } from './vec';
import { setStartHp } from './wear';

export const OPENING_WRECK_ID = 'opening-wreck';
const OPENING_WRECK_RADIUS = 0.7;

export function openingWreckSpot(opening: Opening, start: { pos: Vec; heading: number }): Vec {
  const { ahead, side } = opening.wreck;
  const cos = Math.cos(start.heading);
  const sin = Math.sin(start.heading);
  return { x: start.pos.x + cos * ahead - sin * side, y: start.pos.y + sin * ahead + cos * side };
}

export function openingObstacles(kit: StartKit, start: { pos: Vec; heading: number }): Obstacle[] {
  const wreck: Obstacle[] = kit.opening ? [{ id: OPENING_WRECK_ID, pos: openingWreckSpot(kit.opening, start), r: OPENING_WRECK_RADIUS, kind: 'wreck' }] : [];
  const farm = (kit.intro?.farm ?? []).map((p): Obstacle => ({ ...p, pos: { ...p.pos }, kind: 'landmark' }));
  return [...wreck, ...farm];
}

export function setUpOpening(world: World, truck: Vehicle, opening: Opening | null): void {
  if (!opening) return;
  const obstacle = world.obstacles.find((o) => o.id === OPENING_WRECK_ID);
  if (!obstacle) throw new Error('The opening wreck was not placed');
  applyCondition(truck, opening.condition);
  world.salvage.push(openingStock(world, opening, obstacle));
}

function openingStock(world: World, opening: Opening, obstacle: Obstacle): SalvageStock {
  return {
    id: obstacle.id,
    pos: { ...obstacle.pos },
    radius: obstacle.r * RULES.wreckRadiusScale,
    goods: { ...opening.stock.goods },
    parts: opening.stock.parts.map((defId) => makePart(world, defId, 0)),
    fuel: 0,
    supplies: 0,
    hidden: emptyHidden(),
  };
}

function applyCondition(v: Vehicle, condition: Record<string, number>): void {
  for (const [defId, share] of Object.entries(condition)) {
    const part = mountedParts(v).find((p) => p.defId === defId);
    if (!part) throw new Error(`Opening condition names ${defId}, which ${v.id} does not mount`);
    setStartHp(part, share);
  }
}

export function openingStockOf(world: World): SalvageStock | null {
  return world.salvage.find((s) => s.id === OPENING_WRECK_ID) ?? null;
}
