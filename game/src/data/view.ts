import type { ZoneKind } from './terrain';

export const VIEW = {
  screenUp: { x: -1, y: -1 },
  rise: 0.816,
};

export type ScatterShare = { pebbles: number; scrub: number; cactus: number };

export const SCATTER: {
  regions: Record<ZoneKind | 'plain', ScatterShare>;
  block: number;
  patch: { frequency: number; depth: number; pebbleSeed: number; scrubSeed: number };
} = {
  block: 4,
  regions: {
    plain: { pebbles: 1, scrub: 1, cactus: 1 },
    mountains: { pebbles: 2.2, scrub: 0.35, cactus: 0.5 },
    farmBelt: { pebbles: 0.25, scrub: 2.5, cactus: 0 },
    swamp: { pebbles: 0.05, scrub: 0.7, cactus: 0 },
    desert: { pebbles: 0.5, scrub: 1, cactus: 1 },
    crash: { pebbles: 1.6, scrub: 0.3, cactus: 0 },
  },
  patch: { frequency: 1 / 14, depth: 0.8, pebbleSeed: 31, scrubSeed: 57 },
};
