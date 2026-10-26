import HUNTING_SPOTS_FILE from '../data/hunting-spots.json';
import { atlasOf, type AtlasKey } from './atlas';
import type { HuntingSpotsBake } from './hunting-spots-bake';
import type { World } from './types';

const HUNTING_SPOTS = HUNTING_SPOTS_FILE as { mapHash: string } & HuntingSpotsBake;
const NONE: HuntingSpotsBake = { spots: [], samples: [] };

export function huntingSpots(map: { hash: string; terrain: { atlas: AtlasKey } }): HuntingSpotsBake {
  if (!atlasOf(map.terrain).oldSpots) return NONE;
  if (HUNTING_SPOTS.mapHash !== map.hash) throw new Error(`Hunting spots were baked for map ${HUNTING_SPOTS.mapHash}, not ${map.hash}. Run npm run old-spots.`);
  return HUNTING_SPOTS;
}

export function worldHuntingSpots(world: World): HuntingSpotsBake {
  return huntingSpots({ hash: world.mapHash, terrain: world.terrain });
}
