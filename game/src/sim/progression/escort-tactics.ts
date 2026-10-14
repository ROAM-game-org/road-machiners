import { FURY_ROAD } from '../../data/modes';
import type { GameEvent } from '../types';
import type { Vec } from '../vec';
import { dist } from '../vec';

export type FoeView = { id: string; pos: Vec };
export type TruckOffer = { id: string; value: number; price: number };

export const FOCUS_REACH_FROM_HAULER = FURY_ROAD.pacing.near;

export function pickTarget(foes: readonly FoeView[], hauler: Vec, currentId: string | null): string | null {
  const near = foes.filter((f) => dist(f.pos, hauler) <= FOCUS_REACH_FROM_HAULER);
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

export function underFire(lastTurn: readonly GameEvent[], myId: string, seenHostileIds: ReadonlySet<string>): boolean {
  return lastTurn.some((e) => e.t === 'shot' && e.target === myId && seenHostileIds.has(e.shooter));
}
