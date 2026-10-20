import { getResources } from './resources';
import { isKnockedOut } from './defeat';
import { atlasOf } from './atlas';
import type { HazardZone } from './territory';
import type { Vehicle, World } from './types';
import { dist, type Vec } from './vec';

function inside(zone: HazardZone, pos: Vec): boolean {
  return dist(pos, zone.pos) < zone.radius;
}

export function inCore(zone: HazardZone, pos: Vec): boolean {
  return zone.core !== null && dist(pos, zone.pos) < zone.core.radius;
}

export function applyHazards(world: World): void {
  for (const zone of atlasOf(world.terrain).hazards) {
    for (const vehicle of world.vehicles) if (!isKnockedOut(vehicle) && inside(zone, vehicle.pos)) hurt(world, vehicle, zone);
  }
}

function hurt(world: World, vehicle: Vehicle, zone: HazardZone): void {
  const core = inCore(zone, vehicle.pos);
  if (core) burn(world, vehicle, zone);
  else drain(world, vehicle, zone);
  if (vehicle.id === world.player.vehicleId) notePlayer(world, vehicle, zone, core);
}

function drain(world: World, vehicle: Vehicle, zone: HazardZone): void {
  const resources = getResources(world, vehicle);
  resources.health -= Math.max(0, Math.min(zone.healthPerTurn, resources.health - zone.floor));
}

function burn(world: World, vehicle: Vehicle, zone: HazardZone): void {
  const resources = getResources(world, vehicle);
  const burned = Math.min(zone.core!.healthPerTurn, resources.health);
  resources.health -= burned;
  if (burned > 0) world.events.push({ t: 'coreBurn', vehicle: vehicle.id });
}

function notePlayer(world: World, vehicle: Vehicle, zone: HazardZone, core: boolean): void {
  const before = vehicle.trail[0] ?? vehicle.pos;
  if (!inside(zone, before)) world.events.push({ t: 'info', note: { id: 'hazard' } });
  if (core && !inCore(zone, before)) world.events.push({ t: 'info', note: { id: 'core' } });
}
