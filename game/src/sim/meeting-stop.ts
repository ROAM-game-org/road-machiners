
import { chassisDef } from '../data/chassis';
import { RULES } from '../data/rules';
import { isFree } from './spawn';
import { isStockGoal, salvageReach } from './salvage';
import { startComponent } from './nav/astar';
import { CELL, componentOf, navLayer, type NavLayer } from './nav/layer';
import { vehicleStats } from './stats';
import type { NpcActivity, Vehicle, World } from './types';
import type { Vec } from './vec';

function stockRadius(world: World, activity: NpcActivity): number | undefined {
  if (!isStockGoal(activity)) return undefined;
  return world.salvage.find((entry) => entry.id === activity.targetId)?.radius;
}

function towedRadius(world: World, activity: NpcActivity): number | undefined {
  if (!['tow', 'patch', 'meet', 'loot', 'pursue'].includes(activity.kind)) return undefined;
  const towed = world.vehicles.find((entry) => entry.id === activity.targetId);
  return towed && chassisDef(towed.chassisId).radius;
}

export function bodyStop(world: World, vehicle: Vehicle, activity: NpcActivity, destination: Vec, out: number): Vec {
  const stock = stockRadius(world, activity);
  const radius = stock ?? towedRadius(world, activity);
  if (radius === undefined) throw new Error(`Missing activity destination ${activity.targetId}`);
  const angle = Math.atan2(vehicle.pos.y - destination.y, vehicle.pos.x - destination.x);
  return stock === undefined ? meetSpot(world, vehicle, destination, radius + out, angle) : stockSpot(world, vehicle, destination, radius, out, angle);
}

function stockSpot(world: World, vehicle: Vehicle, center: Vec, stockRadius: number, out: number, approach: number): Vec {
  const layer = navLayer(world.terrain, world.obstacles, vehicleStats(world, vehicle).radius);
  const component = startComponent(layer, cellAt(layer, vehicle.pos));
  const farthest = salvageReach(stockRadius);
  for (let reach = stockRadius + out; reach <= farthest; reach += CELL) {
    for (let k = 0; k * RULES.meetStep <= Math.PI; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const spot = pointAround(center, reach, approach + sign * k * RULES.meetStep);
        if (component !== 0 && isOpen(layer, spot, component)) return spot;
      }
    }
  }
  return pointAround(center, stockRadius + out, approach);
}

function isOpen(layer: NavLayer, spot: Vec, component: number): boolean {
  const cell = cellAt(layer, spot);
  return layer.blocked[cell] === 0 && componentOf(layer, cell) === component;
}

function cellAt(layer: NavLayer, p: Vec): number {
  const x = Math.min(Math.max(Math.floor(p.x / CELL), 0), layer.n - 1);
  const y = Math.min(Math.max(Math.floor(p.y / CELL), 0), layer.n - 1);
  return y * layer.n + x;
}

function pointAround(center: Vec, reach: number, angle: number): Vec {
  return { x: center.x + Math.cos(angle) * reach, y: center.y + Math.sin(angle) * reach };
}

function meetSpot(world: World, vehicle: Vehicle, center: Vec, reach: number, approach: number): Vec {
  const radius = vehicleStats(world, vehicle).radius;
  for (let k = 0; k * RULES.meetStep <= Math.PI; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const spot = pointAround(center, reach, approach + sign * k * RULES.meetStep);
      if (isFree(world, spot, radius, vehicle.id)) return spot;
    }
  }
  return pointAround(center, reach, approach);
}

