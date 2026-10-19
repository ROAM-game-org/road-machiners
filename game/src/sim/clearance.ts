import { PHYSICS } from '../data/physics';
import { bodyOf } from './body';
import { boxDistance } from './mapgen';
import { nearCliff, dynamicBlockers, staticSet, terrainNav } from './nav/layer';
import type { Blocker } from './nav/buckets';
import type { Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export type Footprint = { offsets: number[]; r: number };

export type Mover = { id: string; pos: Vec; vel: Vec; r: number };

export type Clearance = { touches(at: Vec, heading: number): boolean; meetsMoving(at: Vec, heading: number, seconds: number, movers: Mover[]): boolean };

const footprints = new Map<string, Footprint>();

export function footprintOf(chassisId: string): Footprint {
  const cached = footprints.get(chassisId);
  if (cached) return cached;
  const { half } = bodyOf(chassisId);
  if (!(half.x > 0) || !(half.z > 0)) throw new Error(`Chassis ${chassisId} has a body with no length or width`);
  const length = half.x / PHYSICS.metersPerTile;
  const width = half.z / PHYSICS.metersPerTile;
  const n = Math.max(1, Math.ceil(length / width));
  const step = (2 * length) / n;
  const made = { offsets: Array.from({ length: n }, (_, i) => -length + step * (i + 0.5)), r: Math.hypot(width, step / 2) };
  footprints.set(chassisId, made);
  return made;
}

export function clearanceFor(world: World, v: Vehicle, extra: Blocker[]): Clearance {
  const { offsets, r } = footprintOf(v.chassisId);
  const reach = r + PHYSICS.driver.clearMargin;
  const solid = staticSet(world.obstacles, world.terrain).solidBuckets;
  const moving = dynamicBlockers(world.obstacles, world.terrain, extra);
  const nav = terrainNav(world.terrain);
  return {
    touches(at, heading) {
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      for (const o of offsets) {
        const c = { x: at.x + cos * o, y: at.y + sin * o };
        if (nearCliff(nav, c.x, c.y, r) || hitsAny(solid.alongSegment(c, c, reach), c, reach) || hitsAny(moving, c, reach)) return true;
      }
      return false;
    },
    meetsMoving(at, heading, seconds, movers) {
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      for (const m of movers) {
        if (![m.pos.x, m.pos.y, m.vel.x, m.vel.y].every(Number.isFinite)) throw new Error(`Mover ${m.id} has a non-finite position or velocity`);
        const there = { x: m.pos.x + m.vel.x * seconds, y: m.pos.y + m.vel.y * seconds };
        for (const o of offsets) {
          if (dist(there, { x: at.x + cos * o, y: at.y + sin * o }) < m.r + reach + PHYSICS.driver.moverSpread * seconds) return true;
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
