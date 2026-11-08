import type { ZoneKind } from './terrain';

export const VIEW = {
  screenUp: { x: -1, y: -1 },
  rise: 0.816,
};

export type ScatterShare = { pebbles: number; scrub: number; cactus: number };

export const SCATTER: {
  regions: Record<ZoneKind | 'plain', ScatterShare>;
  glassFlats: { share: ScatterShare; fadeOut: number };
  block: number;
  patch: { frequency: number; depth: number; pebbleSeed: number; scrubSeed: number };
} = {
  block: 4,
  regions: {
    plain: { pebbles: 0.25, scrub: 0.25, cactus: 1 },
    mountains: { pebbles: 0.45, scrub: 0.09, cactus: 0.5 },
    farmBelt: { pebbles: 0.06, scrub: 0.6, cactus: 0 },
    swamp: { pebbles: 0.0125, scrub: 0.18, cactus: 0 },
    desert: { pebbles: 0.25, scrub: 0.2, cactus: 1 },
    crash: { pebbles: 0.4, scrub: 0.08, cactus: 0 },
  },
  glassFlats: { share: { pebbles: 0.05, scrub: 0.05, cactus: 0.2 }, fadeOut: 1.6 },
  patch: { frequency: 1 / 14, depth: 0.8, pebbleSeed: 31, scrubSeed: 57 },
};

export const DEFAULT_ZOOM = 1.15;
