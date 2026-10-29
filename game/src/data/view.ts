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
    plain: { pebbles: 0.5, scrub: 0.5, cactus: 1 },
    mountains: { pebbles: 1.1, scrub: 0.175, cactus: 0.5 },
    farmBelt: { pebbles: 0.125, scrub: 1.25, cactus: 0 },
    swamp: { pebbles: 0.025, scrub: 0.35, cactus: 0 },
    desert: { pebbles: 0.5, scrub: 0.4, cactus: 1 },
    crash: { pebbles: 0.8, scrub: 0.15, cactus: 0 },
  },
  glassFlats: { share: { pebbles: 0.1, scrub: 0.1, cactus: 0.2 }, fadeOut: 1.6 },
  patch: { frequency: 1 / 14, depth: 0.8, pebbleSeed: 31, scrubSeed: 57 },
};

export const DEFAULT_ZOOM = 1.15;
