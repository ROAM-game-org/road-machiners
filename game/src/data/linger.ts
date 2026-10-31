import type { TraitId } from './npcs';
import { TIME } from './time';

export type LingerReason = 'watchSunset' | 'restShade' | 'tendGrave';

export const LINGER_REASONS: readonly LingerReason[] = ['watchSunset', 'restShade', 'tendGrave'];

export const LINGER = {
  windows: {
    watchSunset: { from: TIME.sunset - 1, to: TIME.sunset },
    restShade: { from: 11, to: 15 },
    tendGrave: { from: 6, to: 10 },
  } as Record<LingerReason, { from: number; to: number }>,
  maxTurns: { watchSunset: 20, restShade: 40, tendGrave: 25 } as Record<LingerReason, number>,
  searchRadius: { watchSunset: 20, restShade: 16, tendGrave: 24 } as Record<LingerReason, number>,
  sunsetStep: 2,
  sunsetRise: 1,
  sunsetRoadReach: 8,
  graveGap: 2.5,
  spotTries: 4,
  barredTraits: ['raider', 'lawman', 'cultist', 'marshal', 'guard', 'supplier', 'merc'] as readonly TraitId[],
  holderWeight: 4,
};
