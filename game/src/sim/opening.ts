
import { RULES } from '../data/rules';
import { OPENING, type Opening, type StartKit } from '../data/start';
import { makePart } from './factory';
import { playerVehicle } from './damage';
import { goodsCount, isMounted, mountedParts } from './grid';
import { engineNeedsPatch } from './repair';
import { canReachSalvage, emptyHidden, hasSalvage } from './salvage';
import type { Obstacle, SalvageStock, Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { OPENING_WRECK_RADIUS, openingWreckSpot } from './start-pose';
import { setStartHp } from './wear';

export const OPENING_WRECK_ID = 'opening-wreck';

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

export type OpeningStep = 'wreck' | 'search' | 'loot' | 'patch' | 'install';
export type OpeningState = { stock: SalvageStock | null; step: OpeningStep | null };

export const cageMounted = (w: World): boolean => mountedParts(playerVehicle(w)).some((p) => p.defId === 'cage');

const holdsLooseCage = (w: World): boolean => {
  const me = playerVehicle(w);
  return me.items.some((it) => it.kind === 'part' && it.part.defId === 'cage' && !isMounted(me.chassisId, it));
};

export function openingStep(w: World): OpeningStep | null {
  return openingState(w).step;
}

export function openingState(w: World): OpeningState {
  const stock = openingStockOf(w);
  if (!stock) return { stock, step: null };
  return { stock, step: w.player.scavenged.includes(stock.id) ? stepAfterSearch(w, stock) : stepBeforeSearch(w, stock) };
}

export function openingOver(w: World): boolean {
  const { stock, step } = openingState(w);
  return step === null || (stock !== null && dist(playerVehicle(w).pos, stock.pos) >= OPENING.leaveDistance);
}

function stepBeforeSearch(w: World, stock: SalvageStock): OpeningStep | null {
  if (!hasSalvage(stock)) return null;
  return canReachSalvage(playerVehicle(w), stock) ? 'search' : 'wreck';
}

function stepAfterSearch(w: World, stock: SalvageStock): OpeningStep | null {
  if (hasSalvage(stock) && canReachSalvage(playerVehicle(w), stock)) return 'loot';
  if (patchDue(w)) return 'patch';
  return installDue(w) ? 'install' : null;
}

const patchDue = (w: World): boolean => engineNeedsPatch(w, playerVehicle(w)) && (goodsCount(playerVehicle(w)).parts ?? 0) > 0;

const installDue = (w: World): boolean => holdsLooseCage(w) && !cageMounted(w);
