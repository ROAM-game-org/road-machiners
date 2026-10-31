import { PHYSICS } from '../data/physics';
import { unitBody, unitsOf } from './body';
import { followPose, trailUnits } from './rig';
import { boxDistance } from './mapgen';
import { nearCliff, dynamicBlockers, staticSet, terrainNav } from './nav/layer';
import type { Blocker } from './nav/buckets';
import type { Pose, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export type Footprint = { offsets: number[]; r: number };

export type Mover = { id: string; pos: Vec; vel: Vec; r: number };

export type Clearance = { touches(at: Vec, heading: number, bend: number | undefined): boolean; depth(at: Vec, heading: number, bend: number | undefined): number; worsensFrom(at: Vec, heading: number, bend: number | undefined): (to: Vec, heading: number, bend: number | undefined) => boolean; meetsMoving(at: Vec, heading: number, bend: number | undefined, seconds: number, movers: Mover[]): boolean; follow(prev: Pose, next: Pose): Pose };

const footprints = new Map<string, Footprint>();

export function footprintOf(chassisId: string, unit: number): Footprint {
  const key = `${chassisId}|${unit}`;
  const cached = footprints.get(key);
  if (cached) return cached;
  const { half } = unitBody(chassisId, unit);
  if (!(half.x > 0) || !(half.z > 0)) throw new Error(`Chassis ${chassisId} has a body with no length or width`);
  const length = half.x / PHYSICS.metersPerTile;
  const width = half.z / PHYSICS.metersPerTile;
  const n = Math.max(1, Math.ceil(length / width));
  const step = (2 * length) / n;
  const made = { offsets: Array.from({ length: n }, (_, i) => -length + step * (i + 0.5)), r: Math.hypot(width, step / 2) };
  footprints.set(key, made);
  return made;
}

type Circle = { c: Vec; r: number };

function bodyCircles(chassisId: string, prints: readonly Footprint[], at: Vec, heading: number, bend: number | undefined): Circle[] {
  if (prints.length === 1) return circlesOf(prints[0], at, heading);
  return trailUnits(chassisId, { x: at.x, y: at.y, heading, ...(bend === undefined ? {} : { bend }) }).flatMap((p) => {
    return circlesOf(prints[p.unit], p.pos, p.heading);
  });
}

function circlesOf({ offsets, r }: Footprint, at: Vec, heading: number): Circle[] {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  return offsets.map((o) => ({ c: { x: at.x + cos * o, y: at.y + sin * o }, r }));
}

export function clearanceFor(world: World, v: Vehicle, extra: Blocker[]): Clearance {
  const prints = unitsOf(v.chassisId).map((u) => footprintOf(v.chassisId, u.index));
  const solid = staticSet(world.obstacles, world.terrain).solidBuckets;
  const moving = dynamicBlockers(world.obstacles, world.terrain, extra);
  const nav = terrainNav(world.terrain);
  function depth(at: Vec, heading: number, bend: number | undefined): number {
    if (![at.x, at.y, heading].every(Number.isFinite)) throw new Error('Clearance depth asked at a non-finite pose');
    let deepest = 0;
    for (const { c, r } of bodyCircles(v.chassisId, prints, at, heading, bend)) {
      const reach = r + PHYSICS.driver.clearMargin;
      for (const b of solid.alongSegment(c, c, reach)) deepest = Math.max(deepest, overlap(b, c, reach));
      for (const b of moving) deepest = Math.max(deepest, overlap(b, c, reach));
    }
    return deepest;
  }
  function nearsCliff(at: Vec, heading: number, bend: number | undefined): boolean {
    return bodyCircles(v.chassisId, prints, at, heading, bend).some(({ c, r }) => nearCliff(nav, c.x, c.y, r));
  }
  return {
    touches: (at, heading, bend) => depth(at, heading, bend) > 0 || nearsCliff(at, heading, bend),
    depth,
    follow: (prev, next) => followPose(v.chassisId, prev, next),
    worsensFrom(at, heading, bend) {
      const limit = Math.max(0, depth(at, heading, bend)) + PHYSICS.driver.roomSlack;
      const startCliff = nearsCliff(at, heading, bend);
      return (to, facing, toBend) => depth(to, facing, toBend) > limit || (!startCliff && nearsCliff(to, facing, toBend));
    },
    meetsMoving(at, heading, bend, seconds, movers) {
      const circles = bodyCircles(v.chassisId, prints, at, heading, bend);
      for (const m of movers) {
        if (![m.pos.x, m.pos.y, m.vel.x, m.vel.y].every(Number.isFinite)) throw new Error(`Mover ${m.id} has a non-finite position or velocity`);
        const there = { x: m.pos.x + m.vel.x * seconds, y: m.pos.y + m.vel.y * seconds };
        for (const { c, r } of circles) {
          if (dist(there, c) < m.r + r + PHYSICS.driver.clearMargin + PHYSICS.driver.moverSpread * seconds) return true;
        }
      }
      return false;
    },
  };
}

function overlap(b: Blocker, c: Vec, reach: number): number {
  const gap = dist(b.pos, c);
  if (gap >= b.r + reach) return 0;
  if (!b.prop) return b.r + reach - gap;
  return b.prop.boxes.reduce((deepest, box) => Math.max(deepest, reach - boxDistance(box, c)), 0);
}
