import { ROAD_WATCH } from '../data/npcs';
import { playerVehicle } from './damage';
import { gridSquareOf } from './map-grid';
import { recall } from './memory';
import { isRaider } from './relations';
import type { CallVar, Memory, SightingFact, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

type RaiderSighting = Memory & { fact: SightingFact };

function truckOf(world: World, id: string): Vehicle | null {
  return world.vehicles.find((v) => v.id === id) ?? world.sheltered.find((s) => s.vehicle.id === id)?.vehicle ?? null;
}

function seenRaiders(world: World, teller: Vehicle): RaiderSighting[] {
  return recall(teller, 'sighting').filter((m) => {
    const truck = m.fact.vehicle === world.player.vehicleId ? null : truckOf(world, m.fact.vehicle);
    return truck !== null && isRaider(truck);
  });
}

function nearestTo(from: Vec, sightings: RaiderSighting[]): RaiderSighting | null {
  const gap = (m: RaiderSighting) => dist(from, m.fact.at);
  return sightings.reduce<RaiderSighting | null>((best, m) => {
    if (!best || gap(m) < gap(best) || (gap(m) === gap(best) && m.fact.vehicle < best.fact.vehicle)) return m;
    return best;
  }, null);
}

export function raiderSighting(world: World, teller: Vehicle): Extract<CallVar, { kind: 'raiders' }> {
  const sightings = seenRaiders(world, teller);
  const nearest = nearestTo(playerVehicle(world).pos, sightings);
  if (!nearest) return { kind: 'raiders', seen: null, count: 0 };
  const count = sightings.filter((m) => dist(m.fact.at, nearest.fact.at) <= ROAD_WATCH.groupReach).length;
  const seen = { square: gridSquareOf(nearest.fact.at), turns: world.turn - nearest.turn, heading: nearest.fact.heading };
  return { kind: 'raiders', seen, count };
}
