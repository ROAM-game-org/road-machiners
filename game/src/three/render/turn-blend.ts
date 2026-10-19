import type { World } from '../../sim/types';
import type { Vec } from '../../sim/vec';
import type { TurnClock } from './hazards';

export type Drift = { pos: Vec; vel: Vec };

function checkShare(share: number): void {
  if (!Number.isFinite(share) || share < 0 || share > 1) throw new Error(`turn share must be a number from 0 to 1, got ${share}`);
}

export function turnShare(clock: TurnClock | null): number {
  if (!clock || !clock.before) return 1;
  checkShare(clock.progress);
  return clock.progress;
}

export function driftAt(from: Drift, to: Drift, t: number): Vec {
  checkShare(t);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return {
    x: h00 * from.pos.x + h10 * from.vel.x + h01 * to.pos.x + h11 * to.vel.x,
    y: h00 * from.pos.y + h10 * from.vel.y + h01 * to.pos.y + h11 * to.vel.y,
  };
}

export class BeforeTurn<T extends { id: string }> {
  private world: World | null = null;
  private readonly index = new Map<string, T>();

  constructor(private readonly list: (w: World) => readonly T[]) {}

  of(clock: TurnClock | null, id: string): T | undefined {
    const before = clock?.before ?? null;
    if (!before) return undefined;
    if (before !== this.world) {
      this.world = before;
      this.index.clear();
      for (const item of this.list(before)) this.index.set(item.id, item);
    }
    return this.index.get(id);
  }
}
