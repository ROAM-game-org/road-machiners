import type { Vec } from '../vec';
import { dist } from '../vec';

export type FoeView = { id: string; pos: Vec };
export type TruckOffer = { id: string; value: number; price: number };

export const KEEP_TARGET_REACH = 60;

export function pickTarget(foes: readonly FoeView[], hauler: Vec, currentId: string | null, reach: number): string | null {
  const near = foes.filter((f) => dist(f.pos, hauler) <= reach);
  const kept = near.find((f) => f.id === currentId);
  if (kept) return kept.id;
  const nearest = [...near].sort((a, b) => dist(hauler, a.pos) - dist(hauler, b.pos))[0];
  return nearest?.id ?? null;
}

export function bestTruck(offers: readonly TruckOffer[], currentValue: number, budget: number): string | null {
  const better = offers.filter((t) => t.value > currentValue && t.price <= budget);
  return [...better].sort((a, b) => b.value - a.value)[0]?.id ?? null;
}

export function keepsPace(maxSpeed: number, haulerTopSpeed: number): boolean {
  return maxSpeed >= haulerTopSpeed;
}
