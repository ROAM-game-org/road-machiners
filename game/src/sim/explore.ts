import { EXPLORE } from '../data/npcs';
import { REGION } from '../data/region';
import type { AtlasKey } from './atlas';
import { onBeat } from './npc-decisions';
import { sampleWeighted } from './npc-loadout';
import { ROAD_INDEX } from './road-index';
import { oldSpotPicks, oldStockId } from './salvage';
import { surveySites } from './survey';
import type { Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export type ExplorePlace = { id: string; pos: Vec; roadGap: number };

type ExploreMap = { hash: string; terrain: { atlas: AtlasKey; size: number } };

const placeLists = new Map<string, readonly ExplorePlace[]>();

function roadGapAt(pos: Vec): number {
  const centre = ROAD_INDEX.nearestWithin(pos.x, pos.y, EXPLORE.gapCap + REGION.roadWidth / 2);
  return Math.min(EXPLORE.gapCap, Math.round(Math.max(0, centre - REGION.roadWidth / 2)));
}

function placeAt(id: string, pos: Vec, size: number): ExplorePlace {
  if (pos.x < 0 || pos.y < 0 || pos.x >= size || pos.y >= size) throw new Error(`Explore place ${id} lies off the map`);
  return { id, pos: { ...pos }, roadGap: roadGapAt(pos) };
}

export function explorePlaces(map: ExploreMap): readonly ExplorePlace[] {
  const key = `${map.terrain.atlas}:${map.hash}`;
  let places = placeLists.get(key);
  if (!places) {
    const size = map.terrain.size;
    places = [...oldSpotPicks(map).map((p) => placeAt(oldStockId(p), p.pos, size)), ...surveySites(map).map((s) => placeAt(s.id, s.pos, size))];
    placeLists.set(key, places);
  }
  return places;
}

export function explorePlace(world: World, vehicle: Vehicle): ExplorePlace | null {
  const near = explorePlaces({ hash: world.mapHash, terrain: world.terrain }).filter((p) => {
    const gap = dist(vehicle.pos, p.pos);
    return gap >= EXPLORE.minHop && gap <= EXPLORE.range && onBeat(vehicle, p.pos);
  });
  if (near.length === 0) return null;
  return sampleWeighted(world, near.map((value) => ({ value, weight: Math.min(value.roadGap, EXPLORE.gapCap) + 1 })));
}
