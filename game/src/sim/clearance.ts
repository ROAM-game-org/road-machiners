import { PHYSICS } from '../data/physics';
import { unitBody, unitsOf } from './body';
import { trailUnits } from './rig';
import { boxDistance } from './mapgen';
import { nearCliff, dynamicBlockers, staticSet, terrainNav } from './nav/layer';
import type { Blocker } from './nav/buckets';
import type { Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export type Footprint = { offsets: number[]; r: number };

export type Mover = { id: string; pos: Vec; vel: Vec; r: number };

export type Clearance = { touches(at: Vec, heading: number, bend: number | undefined): boolean; meetsMoving(at: Vec, heading: number, bend: number | undefined, seconds: number, movers: Mover[]): boolean };

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
  return trailUnits(chassisId, { x: at.x, y: at.y, heading, ...(bend === undefined ? {} : { bend }) }).flatMap((p) => {
    const { offsets, r } = prints[p.unit];
    const cos = Math.cos(p.heading);
    const sin = Math.sin(p.heading);
    return offsets.map((o) => ({ c: { x: p.pos.x + cos * o, y: p.pos.y + sin * o }, r }));
  });
}

export function clearanceFor(world: World, v: Vehicle, extra: Blocker[]): Clearance {
  const prints = unitsOf(v.chassisId).map((u) => footprintOf(v.chassisId, u.index));
  const solid = staticSet(world.obstacles, world.terrain).solidBuckets;
  const moving = dynamicBlockers(world.obstacles, world.terrain, extra);
  const nav = terrainNav(world.terrain);
  return {
    touches(at, heading, bend) {
      for (const { c, r } of bodyCircles(v.chassisId, prints, at, heading, bend)) {
        const reach = r + PHYSICS.driver.clearMargin;
        if (nearCliff(nav, c.x, c.y, r) || hitsAny(solid.alongSegment(c, c, reach), c, reach) || hitsAny(moving, c, reach)) return true;
      }
      return false;
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

function hitsAny(blockers: Blocker[], c: Vec, reach: number): boolean {
  return blockers.some((b) => hits(b, c, reach));
}

function hits(b: Blocker, c: Vec, reach: number): boolean {
  if (dist(b.pos, c) >= b.r + reach) return false;
  return b.prop ? b.prop.boxes.some((box) => boxDistance(box, c) < reach) : true;
}
