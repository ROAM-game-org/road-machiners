import { TIME } from '../data/time';
import { ObstacleBuckets, type Blocker } from './nav/buckets';
import { ObstacleCache } from './nav/obstacle-cache';
import { isBreakable, isDriveObstacle, obstacleReach, propReach } from './mapgen';
import type { Obstacle, World } from './types';
import { dist, segmentDist, type Vec } from './vec';

export type PropIndexKind = 'sight' | 'shade' | 'breakable' | 'drive';

type Slot = Blocker & { at: number };

const SIGHT_BLOCKING: Obstacle['kind'][] = ['rock', 'wreck', 'building', 'landmark'];

const MEMBERS: Record<PropIndexKind, { has: (o: Obstacle) => boolean; radius: (o: Obstacle) => number }> = {
  sight: { has: (o) => SIGHT_BLOCKING.includes(o.kind), radius: propReach },
  shade: { has: (o) => TIME.obstacleShade[o.kind] !== undefined, radius: (o) => o.r },
  breakable: { has: isBreakable, radius: propReach },
  drive: { has: isDriveObstacle, radius: obstacleReach },
};

class Entry {
  private readonly built: Partial<Record<PropIndexKind, ObstacleBuckets<Slot>>> = {};

  constructor(private readonly size: number) {}

  buckets(kind: PropIndexKind, obstacles: readonly Obstacle[]): ObstacleBuckets<Slot> {
    const hit = this.built[kind];
    if (hit) return hit;
    const { has, radius } = MEMBERS[kind];
    const slots: Slot[] = [];
    obstacles.forEach((o, at) => {
      if (has(o)) slots.push({ pos: o.pos, r: radius(o), at });
    });
    return (this.built[kind] = new ObstacleBuckets(slots, this.size));
  }
}

const entries = new ObstacleCache<Entry>(4);

function entryFor(world: World): Entry {
  return entries.get(world.obstacles, world.size, () => new Entry(world.size));
}

export function propsAlong(world: World, kind: PropIndexKind, a: Vec, b: Vec, reach: number): Obstacle[] {
  return propSlotsAlong(world, kind, a, b, reach).map((at) => world.obstacles[at]);
}

export function propSlotsAlong(world: World, kind: PropIndexKind, a: Vec, b: Vec, reach: number): number[] {
  const slots = entryFor(world).buckets(kind, world.obstacles).alongSegment(a, b, reach);
  return slots.filter((s) => segmentDist(s.pos, a, b) <= s.r + reach).map((s) => s.at);
}

export function propsAround(world: World, kind: PropIndexKind, center: Vec, radius: number): Obstacle[] {
  const slots = entryFor(world).buckets(kind, world.obstacles).alongSegment(center, center, radius);
  const near = slots.filter((s) => dist(center, s.pos) <= s.r + radius).map((s) => s.at);
  return near.sort((a, b) => a - b).map((at) => world.obstacles[at]);
}

export function shadeCastersAround(world: World, center: Vec, radius: number): Obstacle[] {
  return propsAround(world, 'shade', center, radius + TIME.shadeReach);
}
